# Run the workbench on your machine

The workbench is the part for people, on top of the kernel: the bossmode page, the sign-in, and the MCP server that Claude Code talks to. This walk-through builds it with the page inside, serves it on your laptop, and connects Claude Code to the same process.

At the end you have:

- `fw-workbench`, one binary that takes every verb of `fw` and adds the parts for people.
- Bossmode at `http://localhost:8080/bossmode/`, signed in with a token.
- Claude Code connected to the same process over MCP.

## Before you start

Do [Run the kernel on your machine](kernel-local.md) first. The model, `init`, `doctor`, and `run` work the same way here. You also need Node 22 and npm to build the page. Without them, the binary serves a placeholder page, and the rest of this walk-through still works.

## Build fw-workbench with the page

1. Clone the three repositories into one directory. The workbench builds against the kernel checkout next to it, and it builds the page from the bossmode checkout next to it:

    ```sh
    git clone https://github.com/bdubs00/featherweight-kernel
    git clone https://github.com/bdubs00/featherweight-workbench
    git clone https://github.com/bdubs00/featherweight-bossmode
    cd featherweight-workbench
    ```

2. Build the page, then the binary:

    ```sh
    make page
    make build
    ```

    `make page` runs `npm ci && npm run build` in `../featherweight-bossmode` and copies its `dist` directory into `bossmode/static`. `make build` writes `bin/fw-workbench` with the page inside. To use a page checkout in another place, set `PAGE`, such as `make page PAGE=/src/featherweight-bossmode`.

## Configure and check it

1. Write a starter configuration in the directory of your work. It is the same starter as `fw init`:

    ```sh
    ./bin/fw-workbench init
    ```

2. Set the model, as on the kernel page, and turn bossmode on. Add this block to `fw.yaml`:

    ```yaml
    workbench:
      bossmode:
        enabled: true
    ```

3. Check the setup:

    ```sh
    ./bin/fw-workbench doctor
    ```

    The doctor of the workbench adds lines to the doctor of the kernel: `connections`, `fleet`, `sources`, `duties`, `notify`, `bossmode`, and `manager`. On one process without a fleet, the line `fleet` says `off`, and the duties and the notifications live in the memory of the process. A binary built without `make page` fails the line `bossmode`:

    ```text
    FAIL  bossmode: serves the placeholder page that the binary embeds; set workbench.bossmode.dir (FW_WORKBENCH_BOSSMODE_DIR) to the dist directory of the page, or build the binary with make page; ...
    ```

    The line `manager` also fails until a pool runs a manager. On a laptop, that is expected: the manager runs in a sandbox of a fleet, as [Serve bossmode](../deployment/bossmode.md#the-manager) explains.

## Serve bossmode

1. Start the server with the token of the API:

    ```sh
    export FW_API_TOKEN=secret-token
    ./bin/fw-workbench serve
    ```

2. Open `http://localhost:8080/bossmode/` in a browser. The sign-in screen has the field Access token. Paste `secret-token` and press Continue. The page keeps the token in the session storage of its tab and sends it as a bearer token on every call.

3. Make sure that the server answers from the terminal too:

    ```sh
    curl -s -H "Authorization: Bearer secret-token" http://localhost:8080/v1/bossmode
    ```

    The answer is the data that the page reads, such as `{"manager":null,"placement":"queue","maxMembers":16,...}`.

The listener serves every route of the kernel and the routes of the workbench on top. The main ones:

| Path | What |
|---|---|
| `/bossmode/` | The page, with `workbench.bossmode.enabled` |
| `GET /v1/bossmode`, `GET /v1/bossmode/stream` | The data of the page, and its stream of live events |
| `/mcp` | The MCP server over Streamable HTTP |
| `/ui/signin`, `/ui/callback` | The browser sign-in, with `auth.oidc.clientId` |
| `GET /v1/whoami` | The caller, its role on every agent, and its teams |
| `GET /v1/fleet`, `GET /v1/fleet/runs` | The members of the fleet, and the runs of every member |
| `/v1/bridges`, `/v1/duties`, `/v1/pages` | The bridges, the duties, and the wiki |
| `/ui` | The older page of the workbench |

[HTTP API](../reference/http-api.md) lists every route.

## Connect Claude Code

While `fw-workbench serve` runs, connect Claude Code to its `/mcp` with the same token:

```sh
claude mcp add --transport http fw http://localhost:8080/mcp --header "Authorization: Bearer secret-token"
```

The name you give, `fw`, is the prefix of the tools in Claude Code, so the tool `run` appears as `mcp__fw__run`. Ask Claude Code to call the tool `agents_list`: it lists the profile `default` of your `fw.yaml`.

A desktop client can also start the MCP server as a child process, over standard input and output, with `fw-workbench mcp`. Each call then acts as the user that runs the process, `local:<user>`, which `fw-workbench whoami` prints. That process writes the same ledger as `serve`, so do not run both on one home directory. The second one fails with `another writer owns this root`. Give it its own configuration with `FW_CONFIG`:

```sh
claude mcp add fw-local -e FW_CONFIG=/path/to/other/fw.yaml -- /path/to/featherweight-workbench/bin/fw-workbench mcp
```

[Use a fleet from Claude Code](from-claude-code.md) walks through the tools.

## Sign in with a browser

Pasting a token is the path for a developer. With an OpenID Connect issuer, a person signs in instead. These keys of `auth.oidc` turn the sign-in on:

| Key | Variable | What it does |
|---|---|---|
| `auth.oidc.issuer` | `FW_AUTH_OIDC_ISSUER` | The issuer, an `https` URL |
| `auth.oidc.audience` | `FW_AUTH_OIDC_AUDIENCE` | The audiences that the server accepts |
| `auth.oidc.clientId` | `FW_AUTH_OIDC_CLIENT_ID` | The client id at the issuer. A value turns the sign-in on. |
| `auth.oidc.clientSecret` | `FW_AUTH_OIDC_CLIENT_SECRET` | The name of the variable that holds the client secret. Empty is a public client. |
| `auth.oidc.redirectUrl` | `FW_AUTH_OIDC_REDIRECT_URL` | The callback that the issuer knows. Empty is `/ui/callback` on the public address. |

Add `oidc` to `auth.mode`, so that the token of the sign-in authenticates the calls of the page:

```yaml
auth:
  mode: oidc,token
  oidc:
    issuer: https://idp.example.com
    audience: [fw-dashboard]
    clientId: fw-dashboard
```

Register `/ui/callback` and `/ui/connect/callback` at the issuer. The sign-in screen of bossmode then shows Sign in, which goes to `/ui/signin` and comes back to the page. The flow is the authorization code flow with PKCE. `fw-workbench doctor` checks the discovery document of the issuer on the line `auth oidc`.

## Where to go next

<div class="paths" markdown>

- [Bossmode at a glance <span>The places of the page and what each one is for</span>](../guide/index.md)
- [Use a fleet from Claude Code <span>The MCP tools, one task at a time</span>](from-claude-code.md)
- [A fleet <span>This binary in front of many sandboxes</span>](../deployment/fleet.md)

</div>

## Sources

- `featherweight-workbench/README.md`
- `featherweight-workbench/Makefile`
- `featherweight-workbench/go.mod`
- `featherweight-workbench/cmd/fw-workbench/main.go`
- `featherweight-workbench/cmd/fw-workbench/drivers.go`
- `featherweight-workbench/bossmode/config.go`
- `featherweight-workbench/bossmode/routes.go`
- `featherweight-workbench/bossmode/doctor.go`
- `featherweight-workbench/surface/web/web.go`
- `featherweight-workbench/surface/web/signin.go`
- `featherweight-workbench/surface/mcp/mcp.go`
- `featherweight-workbench/docs/ARCHITECTURE.md`, sections 1.2, 2, 5, and 17
- `featherweight-bossmode/src/ui/Signin.tsx`
- `featherweight-bossmode/package.json`
- `featherweight-kernel/cli/setup.go`
- `featherweight-kernel/examples/fw.yaml`
