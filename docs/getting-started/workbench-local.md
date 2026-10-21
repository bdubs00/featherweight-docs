# Run the workbench on your machine

The workbench is `fw-workbench`, one binary that holds the kernel `fw` and adds the parts that people use. These parts are the page at `/ui`, the browser sign-in, the MCP server, the fleet view, the connections, the pools, and the agent builder. `fw-workbench` takes every verb of `fw`, with the same flags and the same configuration. This page builds it next to the kernel, serves the page, and connects an MCP client over standard input and output.

Read [Run the kernel on your machine](kernel-local.md) first. The model, `fw init`, `fw doctor`, and `fw run` work the same way here.

## Clone both repositories side by side

The workbench builds against the kernel checkout next to it. The `replace` directive in its `go.mod` points the module `github.com/bdubs00/featherweight-kernel` at `../featherweight-kernel`. Clone both into one directory:

```sh
git clone https://github.com/bdubs00/featherweight-kernel
git clone https://github.com/bdubs00/featherweight-workbench
cd featherweight-workbench
make build
```

`make build` writes `bin/fw-workbench`. `make test` runs every test with the race detector. The build needs Go 1.27 or newer and `make`. If the kernel is in another place, change the `replace` directive, and set `KERNEL` for the images. The images read the kernel as a second build context: `make image` builds `fw-workbench:static`, and `make image-toolbox` builds `fw-workbench:toolbox`.

## Serve the page

If you have no configuration, write one with `fw-workbench init`. Then start the server with a model credential and the API token:

```sh
export ANTHROPIC_API_KEY=... FW_API_TOKEN=secret
./bin/fw-workbench serve
```

Open `http://localhost:8080/ui` in a browser and paste the token. The page sends it as a bearer token on every call to `/v1`. The listener serves every route of the kernel and these routes on top:

| Path | What |
|---|---|
| `GET /ui` | the page: the home, the result of a run, the conversation, and the agent builder |
| `GET /ui/signin`, `GET /ui/callback` | the browser sign-in, with `auth.oidc.clientId` |
| `GET /ui/connect/callback` | the end of a connection to a service |
| `/mcp` | the MCP server over Streamable HTTP |
| `GET /v1/whoami` | the caller, its role on every agent it can see, and its teams |
| `PUT /v1/agents/{name}`, `DELETE /v1/agents/{name}` | create, replace, or remove an agent profile |
| `GET /v1/home`, `GET /v1/home/others` | the runs that need you, the runs in progress, and the recent results |
| `GET /v1/runs/{id}/result` | what a run produced and what it needs next |
| `GET /v1/runs/{id}/transcript` | the conversation of a run as chat items, one page at a time |
| `POST /v1/builder` | a run of the agent builder |
| `GET /v1/fleet`, `GET /v1/fleet/runs` | the members and the pools of the fleet, and the runs of every member |
| `GET /v1/connections`, `POST` and `DELETE /v1/connections/{server}` | the connections of the caller to services |
| `GET /v1/usage` | the usage of the runs, deprecated |

Read the home from the terminal to make sure that the server answers:

```sh
curl -s -H "Authorization: Bearer secret" http://localhost:8080/v1/home
```

The README of the workbench lists a shorter table. The routes above come from the code, and both agree on every row they share.

## Serve the MCP server over standard input and output

A desktop client starts the MCP server as a child process and talks to it over standard input and output:

```sh
./bin/fw-workbench mcp
```

The logs go to standard error, because standard output carries the protocol. The verb reads the same `fw.yaml` as `fw-workbench serve`, from `$FW_CONFIG`, `./fw.yaml`, or `$FW_HOME/fw.yaml`. Every call acts as the local principal, `local:<user>`, the user that runs the process. `fw-workbench whoami` prints it. The default `access.admins` entry `local:*` makes that user an admin, so it owns every profile. The kernel binary `fw` has no MCP server, and `fw mcp` says so.

To add the server to Claude Code, give it a name and the command (unverified):

```sh
claude mcp add --transport stdio fw -- /path/to/featherweight-workbench/bin/fw-workbench mcp
```

The tools are the same as over HTTP: `run`, `run_status`, `send`, `approve`, `cancel`, `fork`, `run_budget`, the management tools, and `dashboard`. [Use a fleet from Claude Code](from-claude-code.md) walks through them. Over standard input and output, the server knows no public address of the page. A run that waits for a connection therefore says to connect in the dashboard.

The server signs the retry state of an approval with the secret `FW_MCP_STATE_KEY`. Without it, the server reads or creates a random key in the file `mcp-state.key` under the home directory. One process on one machine needs no setting.

## The dashboard as an MCP App

The tool `dashboard` returns an MCP App: one HTML page that the host renders in a sandbox. The page calls the same management tools through the host and loads its own data. The server advertises the extension `io.modelcontextprotocol/ui`, and only the tool `dashboard` names the page, as the resource `ui://fw/dashboard` with the MIME type `text/html;profile=mcp-app`. A host therefore shows the page once, at the call that opens it.

The argument `view` opens one view: `home`, the default, `run` with `runId`, or `agent` with `agent`. A host without MCP Apps gets the home as text. The management tools then do the same work one call at a time: `whoami`, `agents_list`, `agent_get`, `agent_put`, `agent_delete`, `runs_list`, `run_events`, `run_result`, `run_file`, `agent_builder`, and `capabilities`.

## Sign in with a browser

Pasting a token is the path for a developer. With an OpenID Connect issuer, a person signs in to the page instead. Three keys of `auth.oidc` turn the sign-in on and shape it:

| Key | Variable | Meaning |
|---|---|---|
| `auth.oidc.clientId` | `FW_AUTH_OIDC_CLIENT_ID` | the client id at the issuer. A value turns the sign-in on and adds `/ui/signin` and `/ui/callback`. |
| `auth.oidc.clientSecret` | `FW_AUTH_OIDC_CLIENT_SECRET` | the name of the secret that holds the client secret. Empty is a public client. |
| `auth.oidc.redirectUrl` | `FW_AUTH_OIDC_REDIRECT_URL` | the callback address that the issuer knows. Empty is `/ui/callback` on the public address. |

The sign-in also reads `auth.oidc.issuer`, `auth.oidc.audience`, `auth.oidc.scopes`, `auth.oidc.ca`, and `auth.oidc.insecure`. Add `oidc` to `auth.mode`, for example `oidc,token`, so that the token of the sign-in authenticates the calls of the page. A configuration that cannot work stops the start, for example an issuer without `https` and without `auth.oidc.insecure`.

```yaml
auth:
  mode: oidc,token
  oidc:
    issuer: https://idp.example.com
    audience: [fw-dashboard]
    clientId: fw-dashboard
```

The flow is the authorization code flow with PKCE. The page sends the person to `/ui/signin`. The issuer sends the person back to `/ui/callback`. The page keeps the token in the `sessionStorage` of its tab. No cookie holds the token, and the page gets no refresh token. Register `/ui/callback` and `/ui/connect/callback` at the issuer. `fw-workbench doctor` checks the discovery document of the issuer on the line `auth oidc`.

## Titles

Each run gets a title, such as "Fix checkout retries". The kernel takes the first sentence of the input and makes no call. The workbench asks a model for a title of a few words the first time it shows a run without one. It records the title on the run. The call goes to `compaction.model`, else to the model of the agent. To save that call, set the mode in the block `workbench` of `fw.yaml`, or set `FW_WORKBENCH_TITLES=input`:

```yaml
workbench:
  titles: input   # model, the default, or input: the first sentence of the input, with no call
```

## Next steps

- [Use a fleet from Claude Code](from-claude-code.md) walks through every MCP tool against a running front.
- [Identity](../concepts/identity.md) explains principals, the roles on an agent, the sign-in, and the connections.
- [Profiles, tools, and skills](../concepts/profiles-and-tools.md) explains what `agent_put` and the builder write.
- [The fleet](../concepts/fleet.md) explains what `/v1/fleet` shows once workers join.
- [fw-workbench commands](../reference/fw-workbench-commands.md), [MCP tools](../reference/mcp-tools.md), and [HTTP API](../reference/http-api.md) list every verb, tool, and route.
- [A fleet](../deployment/fleet.md) runs this binary as the front of a fleet on a cluster.
- The design is in the [workbench architecture](../design/workbench-architecture.md): [section 2](../design/workbench-architecture.md#2-routes-for-people) for the routes, [section 3](../design/workbench-architecture.md#3-mcp-server-work-intake) for the MCP server, and [section 5](../design/workbench-architecture.md#5-browser-sign-in) for the sign-in.

## Sources

- `featherweight-workbench/README.md`
- `featherweight-workbench/Makefile`
- `featherweight-workbench/go.mod`
- `featherweight-workbench/cmd/fw-workbench/main.go`
- `featherweight-workbench/cmd/fw-workbench/drivers.go`
- `featherweight-workbench/surface/mcp/mcp.go`
- `featherweight-workbench/surface/mcp/manage.go`
- `featherweight-workbench/surface/mcp/connect.go`
- `featherweight-workbench/surface/web/web.go`
- `featherweight-workbench/surface/web/signin.go`
- `featherweight-workbench/dashboard/dashboard.go`
- `featherweight-workbench/docs/ARCHITECTURE.md`, sections 1, 2, 3, 5, 6.1, and 9
- `featherweight-workbench/examples/agentgateway/README.md`
- `featherweight-kernel/cli/verbs.go`
- `featherweight-kernel/cli/setup.go`
- `featherweight-kernel/examples/fw.yaml`
