# Serve bossmode

Bossmode is the web page where operators run the fleet: they chat with agents, answer decisions, open bridges, and set duties. The workbench serves the page itself. This page says what the deployer sets for the page, the sign-in, the manager, and the limits of the work of the operators.

## Turn the page on

Bossmode is off by default. One key turns it on. The workbench then serves three routes. The page is at `/bossmode/`, the data of the page at `GET /v1/bossmode`, and one stream of live events at `GET /v1/bossmode/stream`:

```yaml
workbench:
  bossmode:
    enabled: true
```

The variable `FW_WORKBENCH_BOSSMODE_ENABLED=on` does the same. Without it, every route of bossmode answers 404.

The page is a separate repository, featherweight-bossmode, that builds to static files with Node 22 and npm. The workbench serves them in one of two ways:

- Embedded in the binary. `make page` in the workbench checkout builds `../featherweight-bossmode` and copies its `dist` directory into `bossmode/static`. `make build` then embeds it. If `PAGE` names a checkout of the page, `make image` and `make image-toolbox` embed it too.
- From a directory. `workbench.bossmode.dir`, or `FW_WORKBENCH_BOSSMODE_DIR`, names the `dist` directory of a build. A directory without `index.html` answers 503.

A binary built without the page serves a placeholder that names both ways, and the doctor line `bossmode` fails on it. `GET /bossmode` answers 301 to `/bossmode/`, and each path without a file extension gets `index.html`, because the page routes in the browser. The files hold no data, so the route needs no credential.

If a gateway sits in front of the workbench, route `/bossmode` to it beside `/ui` and `/v1`. The HTTPRoute of `examples/agentgateway/fleet.yaml` routes `/ui` and `/v1` only, so add the path there.

## Sign-in

The page keeps one token in the session storage of its tab and sends it as a bearer token on every call to `/v1`. A person gets in one of two ways:

- With an access token. The sign-in screen has the field Access token and the key Continue. A developer pastes the static token or a token of the issuer there.
- With the browser sign-in. Set `auth.oidc.clientId`, or `FW_AUTH_OIDC_CLIENT_ID`, and add `oidc` to `auth.mode`, such as `oidc,token`. The screen then shows Sign in, which goes to `/ui/signin` and comes back to the page through `/ui/callback`.

Register `/ui/callback` and `/ui/connect/callback` at the issuer. The audience of the token of the page must be one that the front accepts, `FW_AUTH_OIDC_AUDIENCE`. The front is the workbench in front of the workers of a fleet. If the issuer is down, the token form stays as a way in. See [Run the workbench on your machine](../getting-started/workbench-local.md#sign-in-with-a-browser) for the keys of `auth.oidc`.

## The look and the quick chat

These keys of `workbench.bossmode` shape the page for one deployment. Each has a variable that wins over the file.

| Key | Variable | What it does |
|---|---|---|
| `theme.accent` | `FW_WORKBENCH_BOSSMODE_THEME_ACCENT` | The accent color in hex, quoted in YAML. Empty is `#FF4D00`. |
| `theme.name` | `FW_WORKBENCH_BOSSMODE_THEME_NAME` | The name of the organization, at most 64 characters |
| `theme.logo` | `FW_WORKBENCH_BOSSMODE_THEME_LOGO` | An SVG or a PNG file on the front, at most 256 KB, read once at the start |
| `chat.agent` | `FW_WORKBENCH_BOSSMODE_CHAT_AGENT` | The profile of the quick chat, a conversation of one person with a general assistant |
| `chat.member` | `FW_WORKBENCH_BOSSMODE_CHAT_MEMBER` | The member that runs the quick chat, such as `default/manager-0`. Empty lets the front pick one. |
| `marketplaces` | `FW_WORKBENCH_BOSSMODE_MARKETPLACES` | The catalogs of skills that an admin imports from, each `{name, url}` |

A value that cannot work stops the start and names the key. An example is an accent that is no color. The page reads the result at `GET /v1/bossmode`:

```json
{"manager": {"agent": "manager", "member": "default/manager-0", "run": ""},
 "placement": "queue", "maxMembers": 16,
 "theme": {"accent": "#0A7E8C", "name": "Example Ltd", "logo": ""},
 "templates": [{"name": "agent", "default": true}],
 "chat": {"agent": "chat", "member": "default/manager-0"},
 "routines": true, "packages": false}
```

`templates` comes from `workbench.templates`. With a template, New agent in the Fleet place creates an agent with its own workers. `packages` is true on a front with `workbench.packages` and pools. See [Pools and templates](pools.md).

## The manager

The manager is one more agent that helps the operator run the fleet. It reads the fleet, opens bridges, writes reports into the wiki, and decides what the operator of a bridge delegates to it. It runs on a Task of its own pool, and its tools are the MCP tools of the front. `examples/bossmode/fw.yaml` holds the pool and the profile. To add the manager to a front, copy three parts into its `fw.yaml`:

1. The entry `manager` of `workbench.pools`. Set its model: the example names none, and the front refuses a pool without one.
2. `workbench.bossmode.manager: manager`, the profile name.
3. For the quick chat, `workbench.bossmode.chat.agent: chat`. The same pool runs the profile `chat`.

The pool reaches the front through one entry of `tools.mcp`, named `front`. It sends the static token as its bearer and has `trusted: true`. A trusted entry names the person of the run in each call. The front then reads and acts as that person, and never beyond what the token can do. The `fw` of the pool sets `auth.mode: token` and `access.admins: ["kind:token"]`, because the front reaches the Task with the static token alone.

The profile `manager` asks the operator before each call that starts work or changes a budget. It also asks before it decides an approval, cancels a run, or changes a profile. On a run of a bridge, the manager decides only what the operator of that bridge delegated. See [The manager](../guide/manager.md) and [section 19 of the workbench architecture](../design/workbench-architecture.md#19-the-manager).

!!! note
    `examples/bossmode/fw.yaml` sets the manager, the quick chat, and the theme, but not `enabled`. When you copy it, add `workbench.bossmode.enabled: true`. Without it, the front serves no page.

## Limits for bridges, duties, and notifications

The operators do their work on the page, but a few limits belong to the deployer. A value out of its bounds stops the start and names the key.

| Key | What it does | Default |
|---|---|---|
| `workbench.bridges.placement` | Where the seats of a new bridge run: `queue`, on the pool of each agent, or `spawn`, in child Tasks of the manager | `queue` |
| `workbench.bridges.maxMembers` | The most seats of a bridge, 1 to 64 | `16` |
| `workbench.bridges.maxTurns` | The turns of every run of a bridge together | `1000` |
| `workbench.duties.checkHosts` | The hosts that a check of a duty can reach, as globs. Empty reaches any public address and no private one. | empty |
| `workbench.duties.secrets` | The variables of the front that a duty can send, each `{name, hosts}` | none |
| `workbench.duties.caps.perAgentUSD`, `fleetUSD` | The daily cost caps of the duties | `0`, no cap |
| `workbench.notifications.link` | The address of the page, such as `https://fleet.example.com/bossmode/`, for the link in a notification | none |
| `workbench.notifications.hosts` | The private hosts that a channel can reach | empty |
| `workbench.notifications.email.host` | The SMTP server. With a host, people can pick email. | none |

The bridges also take `maxMessages`, `maxFanoutPerMinute`, and `maxPairMessages`. The notifications also take `ntfy`, `email`, `agent`, and `shared`. Bridges, duties, and notifications need a NATS bus to share their state between replicas. On the bus `mem`, they live in the memory of one process. The duties also need `workbench.fleet.intake`, so a run reaches a queue. See [Bridges and seats](../guide/bridges.md), [Duties](../guide/duties.md), and [section 23.7 of the workbench architecture](../design/workbench-architecture.md#237-configuration).

## Check it

Run the doctor with the configuration of the front. Bossmode adds the line `bossmode`, and the manager adds the line `manager`. This is a front without the embedded page and without the pool of the manager:

```text
FAIL  bossmode: serves the placeholder page that the binary embeds; set workbench.bossmode.dir (FW_WORKBENCH_BOSSMODE_DIR) to the dist directory of the page, or build the binary with make page; the theme has the accent #0A7E8C and the name "Example Ltd"; the manager manager is no profile of fw.agents and the agent of no pool, so the page has no manager; ...
FAIL  manager: no pool of workbench.pools runs the profile manager; add a pool whose agent is manager, as examples/bossmode shows
```

The line `bossmode` also says where the wiki, the faces, the bridges, and the routines live, with their limits. The lines `duties` and `notify` name the hosts and the secrets of the duties and the channels of the notifications.

A process serves at most 64 streams of the page at once, one per tab, and the next one gets 429. A stream ends after 15 minutes, and the page opens a new one, so the front checks the credential again. Two series count the streams on `/metrics`:

| Metric | Type | What it counts |
|---|---|---|
| `fw_bossmode_streams_open` | gauge | The streams of the page that are open now |
| `fw_bossmode_streams_refused_total` | counter | The streams that the front refused, because 64 were open |

The stream sends `: connected` at once and `: keep-alive` after 15 seconds without an event, so a proxy keeps it open. Each replica keeps its own ring of the last 4,096 events, and the replicas relay events on the subject `<workbench.fleet.egress>.bossmode.<kind>`. Allow only the front to publish there.

## Where to go next

<div class="paths" markdown>

- [Bossmode at a glance <span>The places of the page, for the operators</span>](../guide/index.md)
- [Pools and templates <span>The workers of the agents that people create</span>](pools.md)
- [Observability <span>The metrics of the front and the workers</span>](observability.md)

</div>

## Sources

- `featherweight-workbench/README.md`
- `featherweight-workbench/Makefile`
- `featherweight-workbench/Dockerfile`
- `featherweight-workbench/docs/ARCHITECTURE.md`, sections 1.2, 17, 18.13, 19, 22.3, and 23.7
- `featherweight-workbench/bossmode/config.go`
- `featherweight-workbench/bossmode/routes.go`
- `featherweight-workbench/bossmode/doctor.go`
- `featherweight-workbench/bossmode/metrics.go`
- `featherweight-workbench/manager/doctor.go`
- `featherweight-workbench/surface/web/web.go`
- `featherweight-workbench/surface/web/signin.go`
- `featherweight-workbench/examples/bossmode/fw.yaml`
- `featherweight-workbench/examples/bossmode/README.md`
- `featherweight-workbench/examples/agentgateway/fleet.yaml`
- `featherweight-bossmode/src/ui/Signin.tsx`
- `featherweight-bossmode/package.json`
