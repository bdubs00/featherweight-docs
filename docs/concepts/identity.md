# Identity

A principal is the caller that a surface authenticated. This page explains how a request gets a principal and what a principal can do. It also explains how an agent acts for a person, and what a tool process inside the sandbox can read.

The kernel defines the rules and enforces them on every surface. The workbench adds the browser sign-in, the grants of people, and the control-plane authorization. The full rules are in [13. Security](../design/kernel-architecture.md#13-security) of the kernel architecture.

## Who a principal is

A principal has a subject, a name, a kind, an issuer, groups, and scopes. The subject is the stable identity, such as an OIDC `sub` claim or a SPIFFE ID. The name is what a person reads, such as an email address.

| Kind | Who | Comes from |
|---|---|---|
| `user` | a person | an OIDC token |
| `workload` | a service or another agent | a SPIFFE identity |
| `token` | the static bearer token of the process | `auth.mode: token` |
| `local` | the user of the process | stdio, such as `fw agents` on the host |
| `anonymous` | nobody | `auth.mode: none` |

Only a `user` is a person. A workload, the static token, a bus intake, and an anonymous caller have no person. A run that they start therefore cannot connect a service (see [Acting for a person](#acting-for-a-person)).

## How a request gets a principal

`auth.mode` names one authentication mode, or several with commas between them, for example `oidc,spiffe,token`. The surface tries the modes in order, and the first mode that accepts the credential wins. The first mode writes the 401 challenge. The default is `token`, and `none` must be explicit.

| Mode | Credential | Subject | Keys |
|---|---|---|---|
| `token` | the static bearer token from the secret `auth.tokenEnv`, `FW_API_TOKEN` by default | `token` | `FW_API_TOKEN_FILE` names a file that holds the token instead |
| `oidc` | a bearer token from the issuer, checked against its keys, its issuer, its expiry, and the audience | the `sub` claim | `auth.oidc.issuer`, `auth.oidc.audience`, `auth.oidc.nameClaim`, `auth.oidc.groupsClaim`, `auth.oidc.ca`, `auth.oidc.insecure` |
| `spiffe` | a JWT-SVID bearer token, or an X.509-SVID client certificate with `auth.spiffe.x509` | the SPIFFE ID, such as `spiffe://example.org/ns/prod/sa/reviewer` | `auth.spiffe.trustDomain`, `auth.spiffe.bundle`, `auth.spiffe.socket`, `auth.spiffe.audience` |
| `none` | nothing | `anonymous` | none |

The kernel builds `token` and `none` itself. Every other mode comes from a package that registers it with `fw.RegisterAuthn`. The packages `authn/oidc` and `authn/spiffe` are part of the kernel, so a worker verifies the tokens of people itself. The `oidc` driver reads the discovery document of the issuer and refreshes its keys. Its challenge names `/.well-known/oauth-protected-resource`, so an MCP client finds the authorization server and runs the OAuth flow itself. The `spiffe` driver reads the trust bundle from the Workload API at `auth.spiffe.socket`, or from the file or URL in `auth.spiffe.bundle`. The configuration check also accepts the mode names `mtls` and `oauth` for registered drivers.

With `auth.mode: token`, a missing `FW_API_TOKEN` stops the process at start.

!!! warning
    Do not set `auth.mode: none` on a listener that is reachable from outside the cluster. Anyone who reaches the port can start runs and approve tool calls.

### Browser sign-in

The workbench adds a sign-in to the page at `/ui`. A value in `auth.oidc.clientId` turns it on and adds the routes `GET /ui/signin` and `GET /ui/callback`. The sign-in route sends the person to the issuer with the authorization code flow, PKCE with S256, a `state`, and a `nonce`. The cookie `fw_signin` holds the PKCE verifier for ten minutes. It is signed with HMAC-SHA256, HttpOnly, and limited to the path `/ui`. The callback exchanges the code and keeps the token that the `Authn` of the agent accepts. The page stores that token in `sessionStorage["fw.token"]` and sends it as a bearer token to `/v1`. No refresh token reaches the page, and no cookie holds the token.

| Key | Variable | Meaning |
|---|---|---|
| `auth.oidc.clientId` | `FW_AUTH_OIDC_CLIENT_ID` | The client id at the issuer. A value turns the sign-in on. |
| `auth.oidc.clientSecret` | `FW_AUTH_OIDC_CLIENT_SECRET` | The `Secrets` name of the client secret. Empty means a public client. |
| `auth.oidc.redirectUrl` | `FW_AUTH_OIDC_REDIRECT_URL` | The callback address that the issuer knows. Empty is `/ui/callback` on the public address of the page. |

Add `oidc` to `auth.mode`, for example `oidc,token`, so that the token of the sign-in authenticates the calls of the page. To accept ID tokens, put the client id in `auth.oidc.audience`. Every step of the flow is in [5. Browser sign-in](../design/workbench-architecture.md#5-browser-sign-in).

## Roles and ownership

An agent profile carries an `access` block with three lists. An owner manages the profile and can do everything below. An operator starts runs, sends follow-ups, approves, cancels, and changes the budget of a run. A viewer reads runs and their ledgers.

```yaml
agents:
  reviewer:
    access:
      owners: ["alice@example.com"]
      operators: ["group:platform-team"]
      viewers: ["spiffe://example.org/ns/prod/*", "kind:workload"]
```

Each entry names principals in one of five forms.

| Entry | Matches |
|---|---|
| `alice@example.com`, `spiffe://example.org/ns/prod/*` | the subject or the name, as a glob where `*` matches any text |
| `group:platform-team` | a group of the principal, as a glob |
| `kind:workload` | every principal of that kind |
| `issuer:https://idp.example.com` | every principal from that issuer, as a glob |
| `*` | every principal |

The process-wide block `access` holds `admins`, who own every agent, `creators`, who can add agents, and `default`. With `default: open`, which is the default, an agent without an `access` block is open to every authenticated principal as an operator. With `default: closed`, such an agent is reachable by its admins only. When the default is open, an empty `creators` list means the admins and everyone else. When the default is closed, it means the admins. Turn identity on in two steps: set `auth.mode` and `access.admins`, then set `access.default: closed` once every agent names its owners.

!!! warning
    Do not set `access.default: closed` without an entry in `access.admins`. Nobody can then manage the agents until the configuration changes.

A run belongs to whoever started it. The kernel records the principal in `fw.run.queued` and the decider of an approval in `fw.approval.decided`, so every action has a name on it. The one who started a run can always view and operate it. A child run belongs to the one who started its parent, so whoever sees a run sees the whole tree under it. An inline profile on a request never carries an `access` block, so a request cannot grant itself a role.

### What each role can do

The kernel asks the `Authz` plug on every call that carries a principal. The native API, the MCP server, the A2A server, the page, and the verbs therefore decide the same way. A call that carries no principal comes from the process itself, such as a tool that starts a child run, and is trusted.

| Action | Who | Native API | MCP tools |
|---|---|---|---|
| `agent.view` | viewer, operator, owner, admin | `GET /v1/agents` | `agents_list`, `agent_get` |
| `agent.run` | operator, owner, admin | `POST /v1/runs` | `run` |
| `run.view` | viewer, operator, owner, admin, or the one who started the run | `GET /v1/runs/{id}` | `run_status`, `run_events`, `run_result`, `run_file` |
| `run.operate` | operator, owner, admin, or the one who started the run | `POST /v1/runs/{id}/approvals/{approval}`, `PATCH /v1/runs/{id}/budget` | `approve`, `cancel`, `send`, `run_budget` |
| `agent.edit`, `agent.delete` | owner, admin | `PUT /v1/agents/{name}`, `DELETE /v1/agents/{name}` | `agent_put`, `agent_delete` |
| `agent.create` | an entry in `access.creators`. With an empty list and an open default, anyone. | `PUT /v1/agents/{name}` | `agent_put` |
| `admin` | an entry in `access.admins` | every route | every tool |

The default rules refuse a target that another member of the fleet holds, because they do not know the rules of another process. The front of a fleet decides about such a run with its own configuration, or with a control plane (see [The fleet](../concepts/fleet.md)). `fw agents`, `fw whoami`, and `fw doctor` show the state from the command line, and the workbench serves `GET /v1/whoami` and the tool `whoami`.

## Acting for a person

By default, an MCP server entry with `auth.oauth` acts as the agent itself, through one service account with the `client_credentials` grant. Set `auth.oauth.grant: user` on a `tools.mcp` entry, and the entry acts for the person who started the run. Each call then carries a token that the authorization server issued for that person, so the service applies the rights of that person. `tools.mcp[].title` names the service for people, such as `Tickets`.

```yaml
tools:
  mcp:
    - name: tickets
      title: Tickets
      endpoint: https://tickets.example.com/mcp
      auth:
        oauth:
          grant: user
```

The kernel holds one primitive: a tool call that acts for a person pauses until a credential of that person arrives from outside. The kernel keeps no grant, no refresh token, and no OAuth flow. A linked package gives it the tokens of people through `fw.PersonTokens`. The workbench is that package, so this feature needs the workbench. The primitive is in [7.11 Acting for a person](../design/kernel-architecture.md#711-acting-for-a-person), and the flows are in [11. Connections](../design/workbench-architecture.md#11-connections).

### How a call pauses

1. A call needs a token of the person, and the person never connected the service or the service refused the grant. The kernel appends `fw.approval.requested` with `connect`: the server, its title, and the reason, `missing` or `expired`. The run moves to `input-required`.
2. Every surface shows the request. The dashboard shows a card with Connect and Skip. An MCP client gets a URL-mode elicitation with the link `<base>/ui#connect/<server>/<run>`, which holds no secret ([3.4 Connections over MCP](../design/workbench-architecture.md#34-connections-over-mcp)).
3. The page calls `POST /v1/connections/<server>` and sends the browser to the authorization request: the authorization code flow with PKCE, a `state`, the scopes, and the `resource` of the MCP server. The authorization server returns to `GET /ui/connect/callback`. Register that address at the issuer.
4. The workbench exchanges the code, stores the grant, and calls `Agent.Connected`. The kernel allows every pending connect of that person for the services that are now connected, and the paused calls go on.

The answer of the exchange must hold a refresh token, so the workbench asks for the scope `offline_access` unless `auth.oauth.offline` is false. A decision from a surface that allows a connect request is refused, because a click is not a grant. Skip denies the request. The call then fails with a plain message to the model, and the run does not ask again for that service. A call that waits for a connection survives a restart and runs again after it. `GET /v1/connections` lists the services of the caller, `DELETE /v1/connections/{server}` removes a grant, and the MCP tools `connections` and `disconnect` do the same.

An entry without a `clientId` uses the client of the browser sign-in, so one connection covers every such entry. An entry with a `clientId` and `clientSecret` of its own has an authorization server of its own, and the person connects it on its own. `auth.mode` must include `oidc`, because only a person with an OpenID Connect identity can connect.

### The grant store

A grant is the permission that a person gave the workbench at one authorization server: a refresh token with its scopes and its client. The workbench keeps one grant per person, per authorization server, and per client.

| Key | Variable | Meaning | Default |
|---|---|---|---|
| `workbench.grants.store` | `FW_WORKBENCH_GRANTS_STORE` | `file`, `memory`, or a registered driver | `file` |
| `workbench.grants.dir` | `FW_WORKBENCH_GRANTS_DIR` | The directory of the file store | `<home>/grants` |
| `workbench.grants.key` | `FW_WORKBENCH_GRANTS_KEY` | The `Secrets` name of the key that encrypts the file store | `FW_GRANT_KEY` |

The file store keeps one file per grant. The file name is a hash, so no subject or issuer appears in a directory listing. AES-256-GCM encrypts each file. Without the secret `FW_GRANT_KEY`, the store creates a random key in the file `grant.key` with mode 0600. A write goes to a temporary file, which the store syncs and renames over the old file. Keep `FW_GRANT_KEY` in a secret store, apart from the volume of the grants.

The workbench follows four rules with every authorization server, because many servers rotate refresh tokens and revoke a grant whose old token comes back:

1. A grant has one holder, the grant store of one process.
2. One refresh of a grant runs at a time, for all the runs of the person.
3. The workbench stores the new refresh token before it uses the new access token.
4. If the server refuses a grant, the workbench deletes it, and the next call asks the person to connect again.

Access tokens stay in memory until shortly before they expire. A token that the server refused goes at once. When the server keeps refusing the tokens of a person, the grant goes, and the person connects again. The rules and a Keycloak example are in [11.5 Rules that keep a grant alive](../design/workbench-architecture.md#115-rules-that-keep-a-grant-alive).

### The token broker

A grant has one holder, and a Task is the wrong holder. ax saves the volume of a Task on a suspend, and a restore brings back a refresh token that the server already replaced. In a fleet, the front keeps every grant and runs every refresh. Each worker gets the tokens of a person from the front through the kernel package `tokens`.

| Key | Variable | Meaning | Default |
|---|---|---|---|
| `tokens.url` | `FW_TOKENS_URL` | The address of the broker, the front of the workbench. Empty keeps the tokens of people off. | empty |
| `tokens.credential` | `FW_TOKENS_CREDENTIAL` | The `Secrets` name of the bearer token that the worker presents to the broker | `auth.tokenEnv` |
| `tokens.subject` | `FW_TOKENS_SUBJECT` | The bus subject of the notices of the broker | `fw.connections` |

The worker sends `POST /v1/tokens` with the subject of the person, the server, and the id of the run. It presents the static token of the fleet, so the broker sees a member and never a person. The broker refuses a caller of the kind `user`. It finds the run in its fleet records, makes sure that the person started it, and answers with the token and its expiry. The worker keeps the token until shortly before the expiry, and for five minutes at most. A refusal carries one reason: `forbidden`, `unknown-run`, `unknown-service`, `not-connected`, `expired`, `no-fleet`, `invalid-request`, or `error`. `not-connected` and `expired` make the call ask the person to connect. `POST /v1/tokens/reject` drops a token that the service refused, and `POST /v1/tokens/forget` drops the grant.

When a connection ends, the front publishes `fw.connection.connected` on the subject of `tokens.subject`, with the subject of the person and the connected services. Each worker turns it into `Agent.Connected`, and the paused calls of that person go on. When a person disconnects a service, or a service keeps refusing a grant, the front publishes `fw.connection.disconnected`. Each worker then drops every cached token of that person, and the next call asks the broker again. Without the notice, a worker kept acting for the person until its cached token expired.

The rule of the fleet is that no refresh token enters a sandbox. A short-lived access token does, and a suspend or a restore of a Task touches no grant. A worker with `tokens.url` starts no connections of its own, whatever its `tools.mcp` entries say. The front therefore needs the same entries with `grant: user` in its configuration. The broker is in [11.9 The token broker](../design/workbench-architecture.md#119-the-token-broker).

## SPIFFE between agents

An MCP server entry with `auth.spiffe` sends a JWT-SVID of this workload on every request, so one agent calls another with no shared secret. The receiving agent has `spiffe` in its `auth.mode`. The caller becomes a principal of the kind `workload`, with its SPIFFE ID as the subject. The entry takes `auth.spiffe.audience`. The same driver is the TLS provider `spiffe`, which serves the X.509-SVID of the workload and verifies client certificates against the bundle. Without a TLS provider, the listener speaks plain HTTP, which is the right choice behind the atenet router.

## Control-plane authorization

Who can do what is a question of the front, not of a worker. A worker decides with the rules of `access` alone. With `workbench.access.external`, the front hands every authorization decision to a control plane and makes no decision of its own.

| Key | Variable | Meaning | Default |
|---|---|---|---|
| `workbench.access.external.mcp` | `FW_WORKBENCH_ACCESS_EXTERNAL_MCP` | The name of a `tools.mcp` entry. The model never sees its tools. | none |
| `workbench.access.external.tool` | `FW_WORKBENCH_ACCESS_EXTERNAL_TOOL` | The tool on that server | `authorize` |
| `workbench.access.external.bus` | `FW_WORKBENCH_ACCESS_EXTERNAL_BUS` | The bus subject that receives the requests | none |
| `workbench.access.external.timeout` | `FW_WORKBENCH_ACCESS_EXTERNAL_TIMEOUT` | The limit of one request | `5s` |

The block sets exactly one of `mcp` and `bus`, or the process stops at start. With it set, `access.default`, `access.admins`, and `access.creators` do not apply. The access block of each profile travels in each check as data, and the control plane decides whether it counts. The package `access` builds the plug through `fw.WithAuthzFrom`, and the kernel reports the mode `external`. The example `examples/fw.yaml` of the kernel comments an `access.external` key with `FW_ACCESS_EXTERNAL_MCP`, but the kernel has no such key, so the code wins: the key is `workbench.access.external` of the workbench.

Each check names the action, the agent, and its access block. A check on a run adds the run with its state, its principal, and its lineage, the ancestors of a child run. A check about a run of another fleet member carries `member`. The answer holds one decision per check, with `allow`, an optional `reason`, and an optional `ttlMs` for reuse. Zero, the default, means no reuse, so a revocation takes effect at the next request. The control plane decides about a child run from the lineage itself, so the front does not ask again for the ancestors after a refusal.

If the control plane does not answer in time, the front refuses the request with `fw.ErrAuthzUnavailable`. The native API answers 503 with `Retry-After: 5`. The MCP server returns an error result that says that the service did not answer, and a listing reports the outage. A caller therefore tells a refusal, a 403, from a control plane that is down. A control plane that does not answer never opens access. A call from the process itself carries no principal and never asks, so the front keeps reading its sources during an outage. The verbs `whoami`, `agents`, and `doctor` act as the local principal, and the control plane decides for the local user too. The protocol is in [13.5 External decisions](../design/kernel-architecture.md#135-external-decisions) and [12. Control-plane authorization](../design/workbench-architecture.md#12-control-plane-authorization).

## External tool policy

`policy.external` hands every tool-call decision to a control plane, with the same fields as the block above and the default tool `decide`. The control plane answers one verdict, `allow`, `deny`, or `ask`, with an optional reason. `ask` asks the caller for an approval, and the `Authz` of the process authorizes that decision as `run.operate`. The policy of the profile and the rules of the ancestors of a run still apply, and the stricter verdict wins. If the control plane does not answer, the call is denied. An unknown verdict and a server that is down after repeated failures count as no answer. The model reads the reason in the tool result.

Over the bus, the kernel publishes a `fw.decision.requested` event with a reply subject, and a responder publishes `fw.decision.answered` to it. One control plane serves both kinds of decision, because every request carries `kind`, `authz` or `policy`. The kernel hides the decision server from the model, so do not add a second `tools.mcp` entry with the same endpoint. A child in another Task cannot inherit a custom Go policy or `policy.external`, so a remote spawn with one is refused.

## The tool user and the sandbox

A tool process is a process that a tool starts and that a model drives: the shell of `bash`, and a stdio MCP server. It runs untrusted input, because a file that a run reads can hold a prompt injection. Under ax, `fw` runs as root and starts every tool process as the tool user of `tools.user`, `FW_TOOLS_USER` in the environment. The value is a user name or a uid, with an optional `:group` or `:gid`. The default under ax with `fw` as root is `65532`, the user `nonroot` of both images. `none` runs the tools as the user of `fw`.

Root needs `CAP_CHOWN`, `CAP_DAC_OVERRIDE`, `CAP_KILL`, `CAP_SETGID`, and `CAP_SETUID` in its effective set. The gVisor sandbox of Agent Substrate leaves root `CAP_KILL`, `CAP_NET_BIND_SERVICE`, and `CAP_AUDIT_WRITE` only, so a chown fails there, even in `/tmp`. On such a sandbox, an explicit `tools.user` stops the start with an error that names the capabilities. The ax default falls back to the user of `fw`, with a warning that names them. `fw` never falls back without a word, and `fw doctor` names the tool user on the line `tools user`. A Task on Substrate therefore runs its tools as the user of `fw` (see [Platform gaps and patches](../operations/platform-gaps.md)).

With a tool user, the tool process cannot read these things:

- `/workspace/.fw`, which holds the ledger and `fw.yaml`. The same applies to the profile files under `agents`, the memory, the skills under the home, and the markers of the ax boot. The home of `fw` has the mode `0700`.
- The memory of `fw`, its environment in `/proc/<pid>/environ`, and its open files. `fw` also makes its process non-dumpable at start.
- The file of the API token. If the tool user can read that file, `fw` refuses to start.

The tool user owns the files of the workspace. Each directory from a root of the workspace down to a path of `fw` keeps the user of `fw` and gets the mode `1775`. A shell therefore cannot rename or remove `.fw` or the root of the files tool. `tools.files.perRun` is on by default under ax. Each run then starts in an empty directory of its own under `runs`, with the mode `0775`. Every tool process of one Task runs as the same user, so the boundary is the Task and the tool user.

`fw.ToolEnv` builds the environment of a tool process. It leaves out these variables:

- `AX_TASK_YAML` and `AX_WORKSPACES_YAML`, the manifests of ax.
- The credentials that the configuration names, each also with the suffix `_FILE`.
- The names in `FW_BASH_HIDE`.
- Every variable with a secret name, such as `GITHUB_TOKEN` or `DB_PASSWORD`.
- Every variable whose value has the shape of a secret.

`tools.bash.env` adds variables on purpose, but never a value that `fw` resolved through `Secrets`. No secret variable of `fw` therefore reaches a shell.

The egress gateway of the platform can add a credential to each request to a host. That credential reaches every process of the sandbox, because the gateway sees the sandbox and not the process. A shell can then call that host with `curl`, and no rule of the policy asks a person first. For a Task that reads untrusted input, give the profile no shell and no stdio MCP server. Put the write tools on `ask`. Give credentials only to MCP servers that the kernel calls, through `auth.bearer`, `auth.oauth`, or `auth.spiffe`. Keep `spec.debug` off, because the guest services of `ax ssh` carry no authentication. The pattern is in [7.12 Tool processes](../design/kernel-architecture.md#712-tool-processes).

## Redaction

Secrets never enter the ledger. Before each append, the kernel replaces each known secret value, every value that `fw` resolved through `Secrets` of eight characters or more, with `[redacted]`. It also replaces each text with the shape of a key. Such shapes are a private key block, a provider key such as `sk-ant-` or `ghp_`, and a JWT. A bearer token after `Authorization:` and the user information of a URL are shapes too. A secret in the input of a run reaches the model as `[redacted]`. The same middleware runs before an event reaches the log and the egress stream, so no secret reaches the bus. No refresh token, access token, code, or PKCE verifier enters a ledger event, a log line, or an error message. The ledger itself is described in [The ledger](../concepts/ledger.md), and the other guards in [Safeguards](../concepts/safeguards.md).

## Sources

- `featherweight-kernel/README.md`
- `featherweight-kernel/docs/ARCHITECTURE.md`
- `featherweight-kernel/examples/fw.yaml`
- `featherweight-kernel/config/config.go`
- `featherweight-kernel/fw/config.go`
- `featherweight-kernel/fw/surface.go`
- `featherweight-kernel/fw/authz.go`
- `featherweight-kernel/fw/registry.go`
- `featherweight-kernel/fw/connect.go`
- `featherweight-kernel/fw/external.go`
- `featherweight-kernel/fw/tooluser.go`
- `featherweight-kernel/fw/tooluser_unix.go`
- `featherweight-kernel/fw/toolcaps.go`
- `featherweight-kernel/fw/toolcaps_linux.go`
- `featherweight-kernel/fw/toolenv.go`
- `featherweight-kernel/fw/redact.go`
- `featherweight-kernel/ax/config.go`
- `featherweight-kernel/tokens/tokens.go`
- `featherweight-kernel/authn/oidc/oidc.go`
- `featherweight-kernel/authn/spiffe/spiffe.go`
- `featherweight-workbench/README.md`
- `featherweight-workbench/docs/ARCHITECTURE.md`
- `featherweight-workbench/access/config.go`
- `featherweight-workbench/access/authz.go`
- `featherweight-workbench/connections/config.go`
- `featherweight-workbench/connections/store.go`
- `featherweight-workbench/connections/broker.go`
- `featherweight-workbench/connections/connections.go`
- `featherweight-workbench/connections/oauth.go`
- `featherweight-workbench/surface/web/web.go`
- `featherweight-workbench/surface/web/signin.go`
- `featherweight-workbench/surface/web/connect.go`
- `featherweight-workbench/surface/mcp/connect.go`
- `featherweight-workbench/surface/mcp/manage.go`
