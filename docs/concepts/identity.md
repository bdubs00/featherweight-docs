# Identity

Every request and every run carries a name: the person or the service that the server checked. An agent in a sandbox can act as the person who started its run, but the long-lived credentials of that person never enter the sandbox.

<div class="demo" data-demo="token-broker" markdown>

You sign in at the workbench, and the page keeps the token in its tab. You start a run on a worker Task. The model calls a tool that acts for you, so the worker asks the workbench for your token with `POST /v1/tokens`. You have not connected the service, so the run waits. You connect it, and the workbench keeps the grant, a refresh token, in its encrypted store. The worker gets a short-lived access token, makes the call, and the ledger records the call without the token. A disconnect makes every worker drop your cached tokens.

</div>

## Who is calling

A principal is the caller that a surface, such as the HTTP API or the MCP server, authenticated. It has a subject, the stable identity, such as the `sub` claim of an OIDC token. It also has a name for people to read, a kind, an issuer, and its groups.

| Kind | Who | Comes from |
|---|---|---|
| `user` | a person | an OIDC token |
| `workload` | a service or another agent | a SPIFFE identity |
| `token` | the holder of the static bearer token of the process | `auth.mode: token` |
| `local` | the user of the process | standard input and output, such as `fw agents` on the host |
| `anonymous` | nobody | `auth.mode: none` |

Only a `user` is a person. A run that a workload, the static token, a bus job without a person, or an anonymous caller starts therefore cannot act for a person.

`auth.mode` names one mode, or several with commas, such as `oidc,token`. The surface tries them in order, and the first mode that accepts the credential wins. The default is `token`, and a missing `FW_API_TOKEN` then stops the process at start.

| Mode | Credential | Main keys |
|---|---|---|
| `token` | the static bearer token in the secret that `auth.tokenEnv` names, `FW_API_TOKEN` by default | `auth.tokenEnv` |
| `oidc` | a bearer token from the issuer, checked against its keys, issuer, expiry, and audience | `auth.oidc.issuer`, `auth.oidc.audience`, `auth.oidc.nameClaim`, `auth.oidc.groupsClaim` |
| `spiffe` | a JWT-SVID bearer token, or an X.509-SVID client certificate with `auth.spiffe.x509` | `auth.spiffe.trustDomain`, `auth.spiffe.socket`, `auth.spiffe.bundle`, `auth.spiffe.audience` |
| `none` | nothing | none |

!!! warning
    If a listener is reachable from outside the cluster, do not set `auth.mode: none` on it. Anyone who reaches the port can start runs and approve tool calls.

### Signing in from a browser

The workbench adds a sign-in for people. A value in `auth.oidc.clientId` turns it on and adds the routes `GET /ui/signin` and `GET /ui/callback`. The sign-in uses the authorization code flow with PKCE. The page keeps the token in the `sessionStorage` of its tab, under `fw.token`, and sends it as a bearer token to `/v1`. No cookie holds that token, so add `oidc` to `auth.mode` as well.

When the issuer gives a refresh token, the workbench keeps it in the encrypted cookie `fw_refresh`, which only `POST /ui/refresh` reads. The page renews its token one minute before it expires and never sees the refresh token. See [5. Browser sign-in](../design/workbench-architecture.md#5-browser-sign-in).

??? note "Under the hood"
    The kernel builds the modes `token` and `none`. The packages `authn/oidc` and `authn/spiffe` register the other two, so a worker checks the tokens of people itself. The `oidc` challenge names `/.well-known/oauth-protected-resource`, so an MCP client finds the issuer and runs the OAuth flow itself. An MCP server entry with `auth.spiffe` sends the JWT-SVID of its workload, so one agent calls another with no shared secret. See [13.1 Who the caller is](../design/kernel-architecture.md#131-who-the-caller-is).

## What each person can do

An agent profile carries an `access` block with three roles. An owner manages the profile and can do everything below. An operator starts runs, sends follow-ups, decides approvals, cancels, and changes the budget of a run. A viewer reads runs and their ledgers.

```yaml
agents:
  reviewer:
    access:
      owners: ["alice@example.com"]
      operators: ["group:platform-team"]
      viewers: ["kind:workload"]
```

An entry matches the subject or the name as a glob, `group:<name>`, `kind:<kind>`, `issuer:<url>`, or `*` for everyone. The block `access` of the process holds `admins`, who own every agent, `creators`, who can add agents, and `default`. With `default: open`, the default, an agent without an `access` block is open to every authenticated principal as an operator. With `default: closed`, only the admins reach it.

!!! warning
    Before you set `access.default: closed`, put an entry in `access.admins`. Without one, nobody can manage the agents until the configuration changes.

A run belongs to whoever started it. The kernel records that principal in `fw.run.queued` and the decider of each approval in `fw.approval.decided`. The one who started a run can always view and operate it. A child run belongs to the one who started its parent, so whoever sees a run sees its whole tree. An inline profile on a request never carries `access`, so a request cannot grant itself a role.

| Action | Who | Native API | MCP tools |
|---|---|---|---|
| `agent.view` | viewer, operator, owner, admin | `GET /v1/agents` | `agents_list`, `agent_get` |
| `agent.run` | operator, owner, admin | `POST /v1/runs` | `run` |
| `run.view` | viewer and up, or the one who started the run | `GET /v1/runs/{id}` | `run_status`, `run_events`, `run_result`, `run_file` |
| `run.operate` | operator and up, or the one who started the run | `POST /v1/runs/{id}/approvals/{approval}` | `approve`, `cancel`, `send`, `run_budget` |
| `agent.edit`, `agent.delete` | owner, admin | `PUT` and `DELETE /v1/agents/{name}` | `agent_put`, `agent_delete` |
| `agent.create` | an entry of `access.creators` | `PUT /v1/agents/{name}` | `agent_put` |

With `workbench.access.external`, a control plane makes every one of these decisions in place of the workbench. The control plane is an MCP tool or a bus subject. If the control plane does not answer in time, the workbench refuses with 503, and never opens access. See [12. Control-plane authorization](../design/workbench-architecture.md#12-control-plane-authorization).

!!! note
    The example `examples/fw.yaml` of the kernel comments a key `access.external` with `FW_ACCESS_EXTERNAL_MCP`. The kernel has no such key. The code wins: the key is `workbench.access.external` of the workbench.

## Acting for a person

By default, an MCP server entry with `auth.oauth` acts as the agent itself, through one service account. With `auth.oauth.grant: user`, the entry acts for the person who started the run. Each call then carries a token that the service issued to that person, so the service applies the rights of that person.

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

The kernel holds one primitive: a tool call that acts for a person pauses until a credential of that person arrives from outside. The kernel keeps no grant and runs no OAuth flow. The workbench does that, so this feature needs the workbench.

1. A call needs a token of the person, and the person never connected the service, or the service refused the grant. The kernel appends `fw.approval.requested` with `connect`, and the run moves to `input-required`.
2. Bossmode shows a decision card with Deny and a key that names the service, such as Connect Tickets. An MCP client gets a link to the page.
3. The person opens Connections, at `/ui#connections`. Its Connect calls `POST /v1/connections/<server>` and sends the browser to the service to sign in. The service returns to `GET /ui/connect/callback`, and the workbench stores the grant.
4. The kernel allows every pending connect of that person for that service, with the note `connected`, and the paused calls go on.

A click on the key of the card cannot connect a service, because a click is not a grant. Deny skips the service: the call fails with a plain message to the model, and the run does not ask again for that service. `GET /v1/connections` lists the services of the caller, and `DELETE /v1/connections/{server}` removes a grant. [Decisions and activity](../guide/decisions.md#a-connect-request) shows the card and the steps in bossmode.

### The grant store

A grant is the permission that a person gave the workbench at one service: a refresh token with its scopes and its client. The workbench keeps one grant per person, per authorization server, and per client.

| Key | Meaning | Default |
|---|---|---|
| `workbench.grants.store` | `file`, `memory`, or a registered driver | `file` |
| `workbench.grants.dir` | The directory of the file store | `<home>/grants` |
| `workbench.grants.key` | The secret name of the key that encrypts the file store | `FW_GRANT_KEY` |

The file store keeps one file per grant, named by a hash, and encrypts each file with AES-256-GCM. Without the secret `FW_GRANT_KEY`, the store creates a random key in the file `grant.key`. Keep `FW_GRANT_KEY` in a secret store, apart from the volume of the grants.

Many services rotate refresh tokens, and revoke a grant whose old token comes back. The workbench therefore keeps one holder per grant and runs one refresh of a grant at a time. It stores the new refresh token before it uses the new access token. If the service refuses a grant, the workbench deletes it, and the next call asks the person to connect again.

### The token broker

A Task is the wrong holder for a grant. AX saves the volume of a Task on a suspend, and a restore brings back a refresh token that the service already replaced. In a fleet, the workbench therefore keeps every grant. Each worker asks the workbench for an access token at the moment of the call.

| Key | Meaning | Default |
|---|---|---|
| `tokens.url` | The address of the broker, the workbench. Empty turns the tokens of people off. | empty |
| `tokens.credential` | The secret name of the bearer token that the worker shows to the broker | `auth.tokenEnv` |
| `tokens.subject` | The bus subject of the notices of the broker | `fw.connections` |

The worker sends `POST /v1/tokens` with the subject of the person, the server, and the id of the run. It shows the static token of the fleet, so the broker sees a member and never a person. The broker refuses a caller of the kind `user`. The broker finds the run in its fleet records and makes sure that the person started it. It answers with the token and its expiry. The worker keeps the token for five minutes at most.

A refusal carries one reason: `forbidden`, `unknown-run`, `unknown-service`, `not-connected`, `expired`, `no-fleet`, `invalid-request`, or `error`. With `not-connected` or `expired`, the call asks the person to connect. `POST /v1/tokens/reject` drops a token that the service refused, and `POST /v1/tokens/forget` drops the grant.

When a connection ends, the workbench publishes `fw.connection.connected` on `tokens.subject`, and every worker resumes the paused calls of that person. When a person disconnects, the workbench publishes `fw.connection.disconnected`, and every worker drops the cached tokens of that person at once. A worker with `tokens.url` starts no connections of its own, so the workbench needs the same `tools.mcp` entries with `grant: user`. See [11.9 The token broker](../design/workbench-architecture.md#119-the-token-broker).

## What a tool process can read

A tool process is a process that a model drives: the shell of `bash`, or a stdio MCP server. It handles untrusted input, because a file that a run reads can hold a prompt injection. Under AX, `fw` starts each tool process as the tool user of `tools.user`, by default `65532`, the user `nonroot` of the images. That user cannot read the ledger, `fw.yaml`, the memory, the profiles, the environment of `fw`, or the file of the API token.

This needs the capabilities `CAP_CHOWN`, `CAP_DAC_OVERRIDE`, `CAP_KILL`, `CAP_SETGID`, and `CAP_SETUID`. The gVisor sandbox of Agent Substrate does not give root these capabilities. On such a sandbox, the default falls back to the user of `fw`, with a warning that names them. A Task on Substrate therefore runs its tools as the user of `fw` today. `fw doctor` names the tool user on the line `tools user`. See [Platform gaps and patches](../operations/platform-gaps.md).

The environment of a tool process leaves out the manifests of AX and the credentials that the configuration names. It also leaves out every variable with a secret name or a value with the shape of a secret. `tools.bash.env` adds variables on purpose, but never a value that `fw` resolved as a secret.

!!! warning
    If the egress gateway of the platform adds a credential to the requests to a host, every process of the sandbox gets it. A shell can then call that host with `curl`, and no rule of the policy asks a person first. For a Task that reads untrusted input, give the profile no shell and no stdio MCP server. Give credentials only to MCP servers that the kernel calls.

??? note "Under the hood"
    The tool user lives in `fw/tooluser.go` and `fw/toolcaps.go`, and the environment of a tool process in `fw/toolenv.go`. Each directory from a root of the workspace down to a path of `fw` keeps the user of `fw` with the mode `1775`. A shell therefore cannot rename `.fw`. See [7.12 Tool processes](../design/kernel-architecture.md#712-tool-processes).

## Secrets never enter the ledger

Before each append, the kernel replaces every secret in the event with `[redacted]`. The same step runs before an event reaches the log or the bus. [The redaction of secrets](safeguards.md#the-redaction-of-secrets) lists what counts as a secret. Two examples are a known secret value of eight characters or more and a provider key that starts with `sk-ant-`. No refresh token, access token, code, or PKCE verifier enters a ledger event, a log line, or an error message.

## Where to go next

<div class="paths" markdown>

- [Safeguards <span>The policy, the budget, and the other guards of a run</span>](safeguards.md)
- [The fleet <span>The workbench, the workers, and how idle Tasks sleep</span>](fleet.md)

</div>

## Sources

- `featherweight-kernel/docs/ARCHITECTURE.md` (sections 7.11, 7.12, 13)
- `featherweight-kernel/examples/fw.yaml`
- `featherweight-kernel/fw/config.go`
- `featherweight-kernel/fw/surface.go`
- `featherweight-kernel/fw/authz.go`
- `featherweight-kernel/fw/connect.go`
- `featherweight-kernel/fw/tooluser.go`
- `featherweight-kernel/fw/toolcaps.go`
- `featherweight-kernel/fw/toolenv.go`
- `featherweight-kernel/fw/redact.go`
- `featherweight-kernel/ax/config.go`
- `featherweight-kernel/tokens/tokens.go`
- `featherweight-kernel/tools/mcp/person.go`
- `featherweight-workbench/docs/ARCHITECTURE.md` (sections 5, 11, 12)
- `featherweight-workbench/access/config.go`
- `featherweight-workbench/connections/config.go`
- `featherweight-workbench/connections/store.go`
- `featherweight-workbench/connections/broker.go`
- `featherweight-workbench/surface/web/signin.go`
- `featherweight-workbench/surface/web/refresh.go`
- `featherweight-workbench/surface/web/connect.go`
