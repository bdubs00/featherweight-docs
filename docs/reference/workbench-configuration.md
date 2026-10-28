---
wide: true
---

# Workbench configuration

The workbench reads one more block of the configuration file, for the parts that people use: sign-in, bossmode, bridges, duties, the wiki, notifications, and the fleet with its pools. This page lists every key of that block with its default, grouped by what you want to set up.

Every key on this page sits under the top-level key `workbench` of `fw.yaml`, so `fleet.interval` means `workbench.fleet.interval`. Only `fw-workbench` reads the block. The kernel binary `fw` refuses it as an unknown key. The keys of the kernel are on [Configuration](configuration.md). In a fleet, the workbench is called the [front](../glossary.md#d-to-h), because it stands in front of the workers.

## How the block loads

Each part of the workbench reads its own sub-block at the start, and a problem stops the start. A variable in the column Variable wins over the file. A key without a variable is set in the file only.

| Rule | What it means |
|---|---|
| Unknown keys | Only `pools`, `templates`, and `packages` refuse an unknown key. In any other sub-block, an unknown or misspelled key is ignored without a message |
| Durations | Write a duration with a unit, such as `30s` or `0s`. A bare `0` does not decode. The word `off` works only in a `FW_WORKBENCH_FLEET_*` variable |
| Switches | A switch in the file takes `true`, `false`, `on`, or `off` |
| Stores | Bridges, duties, the wiki, faces, playbooks, routines, notifications, and conversations keep their records on the bus. They work only with `bus.driver` `nats` or `mem`. With `mem`, the records live in the memory of one process |

## People and sign-in

| Key | Variable | Meaning | Default |
|---|---|---|---|
| `teams` | `FW_WORKBENCH_TEAMS` | Glob patterns over group names, with `*` and `?`. A group that matches is a team. The variable takes a comma list | `[]`: every group is a team |
| `titles` | `FW_WORKBENCH_TITLES` | `model`: a model writes a short title for a run without one, with `compaction.model` or the model of the agent. Any other value makes no model call | `model` |
| `signin` | `FW_WORKBENCH_SIGNIN` | Turns the browser sign-in on or off. It applies only with `auth.oidc.clientId`. When off, the page asks for a token | on |
| `links` | none | Names and addresses that `whoami` returns. The dashboard page shows `links.metrics` in its account menu | none |
| `access.external.mcp` | `FW_WORKBENCH_ACCESS_EXTERNAL_MCP` | A `tools.mcp` entry that decides every request, as a control plane. The model never sees its tools | none |
| `access.external.tool` | `FW_WORKBENCH_ACCESS_EXTERNAL_TOOL` | The tool on that server | `authorize` |
| `access.external.bus` | `FW_WORKBENCH_ACCESS_EXTERNAL_BUS` | The bus subject that receives the requests, in place of `mcp` | none |
| `access.external.timeout` | `FW_WORKBENCH_ACCESS_EXTERNAL_TIMEOUT` | The limit of one request | `5s` |
| `grants.store` | `FW_WORKBENCH_GRANTS_STORE` | Where the grants of people live: `file`, `memory`, or a registered driver | `file` |
| `grants.dir` | `FW_WORKBENCH_GRANTS_DIR` | The directory of the file store | `<home>/grants` |
| `grants.key` | `FW_WORKBENCH_GRANTS_KEY` | The secrets name of the key that encrypts the file store. If the secret is missing, the store makes a key in `<dir>/grant.key` | `FW_GRANT_KEY` |

Set exactly one of `access.external.mcp` and `access.external.bus`. With either, the control plane decides in place of `access.default`, `access.admins`, and `access.creators`. The `grants` keys apply only with a `tools.mcp` entry of `auth.oauth.grant: user` and an empty `tokens.url`. See [Identity](../concepts/identity.md).

## Bossmode and the manager

See [Serve bossmode](../deployment/bossmode.md) and [The manager](../guide/manager.md).

| Key | Variable | Meaning | Default |
|---|---|---|---|
| `bossmode.enabled` | `FW_WORKBENCH_BOSSMODE_ENABLED` | Serves the page at `/bossmode`, the route `/v1/bossmode`, and the stream | `false` |
| `bossmode.dir` | `FW_WORKBENCH_BOSSMODE_DIR` | The directory of the built page. Without `index.html` there, the page answers 503 | `""`: the copy in the binary |
| `bossmode.manager` | `FW_WORKBENCH_BOSSMODE_MANAGER` | The profile of the manager. A pool must run it | `""`: no manager |
| `bossmode.theme.accent` | `FW_WORKBENCH_BOSSMODE_THEME_ACCENT` | The accent color: `#rgb`, `#rrggbb`, or `#rrggbbaa`. Quote it in YAML | `#FF4D00` |
| `bossmode.theme.name` | `FW_WORKBENCH_BOSSMODE_THEME_NAME` | The name of the organization, one line of at most 64 characters | none |
| `bossmode.theme.logo` | `FW_WORKBENCH_BOSSMODE_THEME_LOGO` | A `.svg` or `.png` file on the front, at most 256 KB. An SVG must pass the sanitizer | none |
| `bossmode.chat.agent` | `FW_WORKBENCH_BOSSMODE_CHAT_AGENT` | The profile of the quick chat | `""`: no quick chat |
| `bossmode.chat.member` | `FW_WORKBENCH_BOSSMODE_CHAT_MEMBER` | The member that runs the quick chat. Needs `chat.agent` | `""`: the front picks |
| `bossmode.marketplaces[]` | `FW_WORKBENCH_BOSSMODE_MARKETPLACES` | Skill marketplaces, each `name` and `url` (a JSON manifest or a repository). The variable takes `name=url,name=url` and replaces the list | none |

The front checks the keys `theme`, `chat`, `marketplaces`, and `manager` at every start, also while the page is off.

## Bridges, the wiki, and routines

A value of `0` takes the default. See [Bridges and seats](../guide/bridges.md), [The wiki](../guide/wiki.md), and [Routines](../guide/routines.md).

| Key | Variable | Meaning | Default |
|---|---|---|---|
| `bridges.placement` | `FW_WORKBENCH_BRIDGES_PLACEMENT` | Where the seats of a new bridge run. `queue`: as jobs on the workers of a pool. `spawn`: in child Tasks of the manager | `queue` |
| `bridges.maxMembers` | `FW_WORKBENCH_BRIDGES_MAX_MEMBERS` | The most seats of one bridge, 1 to 64 | `16` |
| `bridges.maxMessages` | `FW_WORKBENCH_BRIDGES_MAX_MESSAGES` | The default cap on the messages of a bridge, 1 to 100000 | `2000` |
| `bridges.maxFanoutPerMinute` | `FW_WORKBENCH_BRIDGES_MAX_FANOUT_PER_MINUTE` | The default cap on deliveries per minute, 1 to 1000 | `30` |
| `bridges.maxPairMessages` | `FW_WORKBENCH_BRIDGES_MAX_PAIR_MESSAGES` | The default cap on messages between two agents without a person, 1 to 1000 | `6` |
| `bridges.maxTurns` | `FW_WORKBENCH_BRIDGES_MAX_TURNS` | The default cap on the turns of all the runs of a bridge, 1 to 1000000 | `1000` |
| `pages.maxPageBytes` | `FW_WORKBENCH_PAGES_MAX_PAGE_BYTES` | The largest text of one page, at most 524288 | `262144` |
| `pages.maxPages` | `FW_WORKBENCH_PAGES_MAX_PAGES` | The most pages of the wiki, at most 100000 | `10000` |
| `pages.history` | `FW_WORKBENCH_PAGES_HISTORY` | The versions that the wiki keeps of each page, 1 to 64 | `64` |
| `routines.enabled` | `FW_WORKBENCH_ROUTINES_ENABLED` | Turns the routines of the front on or off: the store, the routes, the tools, and the evidence | on |
| `routines.readyAfter` | `FW_WORKBENCH_ROUTINES_READY_AFTER` | The runs that a rehearsing routine must act on before it is ready for a sign-off | `200` |
| `routines.readyAgreement` | `FW_WORKBENCH_ROUTINES_READY_AGREEMENT` | The share of those runs on which the routine must agree with the agent, above 0 and at most 1 | `0.95` |

## Duties, notifications, and sources

No variable sets these keys. See [Duties](../guide/duties.md) and [Decisions and activity](../guide/decisions.md).

| Key | Variable | Meaning | Default |
|---|---|---|---|
| `duties.secrets[].name` | none | A variable of the front that a duty can name | none |
| `duties.secrets[].hosts[]` | none | The host globs to which a check can send that secret | none: no check sends it |
| `duties.checkHosts[]` | none | The host globs that a check can reach | `[]`: any public host, never a private or loopback address |
| `duties.caps.perAgentUSD` | none | A daily cap in US dollars on the duty runs of one agent. `0` is no cap | `0` |
| `duties.caps.fleetUSD` | none | A daily cap in US dollars on all duty runs. `0` is no cap | `0` |
| `notifications.ntfy.server` | none | The ntfy server of a channel that names none | none |
| `notifications.ntfy.hosts[]` | none | The host globs that a person can name as an ntfy server | `[]`: any host |
| `notifications.hosts[]` | none | The private host globs that a channel can reach. A public host needs no entry | none |
| `notifications.link` | none | The base address of the page, for the link in a notification | none: no link |
| `notifications.email.host` | none | The SMTP server, without a port. A value offers the channel kind `email` | none |
| `notifications.email.port` | none | The SMTP port | `587` |
| `notifications.email.from` | none | The sender address. Required with `host` | none |
| `notifications.email.user` | none | The SMTP account. Without it, no login | none |
| `notifications.email.passwordEnv` | none | The variable that holds the password. Required with `user` | none |
| `notifications.email.allow[]` | none | Address globs that a channel can send to, such as `*@example.com` | `[]`: only the address of the person |
| `notifications.agent.enabled` | none | Offers the channel kind `agent`: a run of an agent delivers the message | `false` |
| `notifications.agent.perDay` | none | The runs of the kind `agent` per person and day | `20` |
| `notifications.shared[]` | none | Channels for everyone: `name` (required), `label`, `kind` (`ntfy`, `slack`, `discord`, `teams`, or `webhook`), `urlEnv` (required), and `secretEnv`. A duty names one as `channel:<name>` | none |

### A source

An entry of `sources` turns the events of an outside system into runs, by webhook or by poll. Sources need `fleet.intake` and the bus `nats` or `mem`. At the start, the front also imports each entry once as a duty. See [section 13.2](../design/workbench-architecture.md#132-configuration).

| Key | Variable | Meaning | Default |
|---|---|---|---|
| `sources[].name` | none | 1 to 63 lower-case letters, digits, `-`, or `_` | required |
| `sources[].agent` | none | The profile that runs the events | required |
| `sources[].pool` | none | The pool that runs the agent. Several pools that run one agent need it | the pool of the agent |
| `sources[].auth.mode` | none | A webhook: `bearer`, `hmac`, or `none`. A poll source sets no `auth` | required for a webhook |
| `sources[].auth.secret` | none | The variable that holds the token or the HMAC key | required for `bearer` and `hmac` |
| `sources[].auth.header` | none | The header of the HMAC signature | `X-Signature-256` |
| `sources[].poll.url` | none | An endpoint that answers JSON to a GET. A value makes the entry a poll source | none |
| `sources[].poll.every` | none | The time between two polls, `5s` or more | `1m` |
| `sources[].poll.timeout` | none | The limit of one poll | `30s` |
| `sources[].poll.secret` | none | The variable that holds the credential | none |
| `sources[].poll.header` | none | A header that carries the credential as it is. Needs `poll.secret` | none: `Authorization: Bearer` |
| `sources[].items` | none | A dotted path to the array of events | the body |
| `sources[].input`, `title`, `metadata` | none | Go templates over one event | the event as JSON, no title, none |
| `sources[].key` | none | The template of the key that blocks a duplicate. A key over 512 bytes refuses the event | required |
| `sources[].dedupFor` | none | How long a key blocks a second run, `1m` or more | `168h` |
| `sources[].redrive.maxAttempts` | none | Runs of one event after a dead letter, 2 to 10. Needs `nats` | `3` |
| `sources[].redrive.cooldown` | none | The time from the dead letter to the next run, `1m` or more, and shorter than `dedupFor` | `5m` |
| `sources[].runAs`, `runAsKind` | none | The principal of the runs and its kind, `workload` or `user` | `source:<name>`, `workload` |
| `sources[].locked` | none | The imported duty follows the file at each start and refuses every change | `false` |

## The fleet

If `atespaces` or `egress` has a value, the fleet is on. See [The fleet](../concepts/fleet.md) and [A fleet](../deployment/fleet.md).

| Key | Variable | Meaning | Default |
|---|---|---|---|
| `fleet.name` | `FW_WORKBENCH_FLEET_NAME` | The name of this process in the view, at most 128 characters | `<atespace>/<task>` under ax, else `<host>:<port>` |
| `fleet.interval` | `FW_WORKBENCH_FLEET_INTERVAL` | The time between two reads of the Task list | `30s` |
| `fleet.expire` | `FW_WORKBENCH_FLEET_EXPIRE` | The age after which the view forgets a finished run, or a worker that only the stream knows | `168h` |
| `fleet.atespaces` | `FW_WORKBENCH_FLEET_ATESPACES` | The atespaces whose Tasks are members. Needs `ax.server` | none |
| `fleet.egress` | `FW_WORKBENCH_FLEET_EGRESS` | The subject prefix of the egress stream of the workers. Needs a bus | none |
| `fleet.intake` | `FW_WORKBENCH_FLEET_INTAKE` | The subject prefix of the intake queues. A job goes to the intake of the pool of its agent, else to `<intake>.<agent>` | none: pools use `fw.jobs` |
| `fleet.suspendAfter` | `FW_WORKBENCH_FLEET_SUSPEND_AFTER` | How long a Task idles before the front suspends it. `0s` is off | `10m` with `atespaces`, else off |
| `fleet.wakeOnQueue` | `FW_WORKBENCH_FLEET_WAKE_ON_QUEUE` | Jobs that wait in the queue of a profile wake its sleeping Tasks. Needs `atespaces` and `intake` | on with both, else off |
| `fleet.orphansAfter` | `FW_WORKBENCH_FLEET_ORPHANS_AFTER` | How long an orphan Task, a child Task whose parent is gone, sleeps before the front removes it. `0s` is off | `24h` with `atespaces`, else off |

## Pools, templates, and packages

No variable sets these blocks, and they refuse an unknown key. A pool or a template needs `fleet.atespaces`, `fleet.egress`, and a bus other than `mem`. It also needs `ax.server`, `ax.router`, and a static token of at least 8 characters. See [Pools and templates](../deployment/pools.md) and [section 14.1](../design/workbench-architecture.md#141-configuration).

| Key | Variable | Meaning | Default |
|---|---|---|---|
| `pools[].name` | none | The pool. Its Tasks are `<name>-<index>`, with Workspaces `<name>-<index>-ws` | required |
| `pools[].template` | none | A template. The pool takes every key of it that the pool does not set | none |
| `pools[].atespace` | none | The atespace of the Tasks, one of `fleet.atespaces` | the only atespace |
| `pools[].replicas` | none | The number of Tasks. `0` removes every Task | required |
| `pools[].image` | none | The worker image by digest, `<image>@sha256:<64 hex digits>` | required, or from the template |
| `pools[].agent` | none | The profile of the pool `fw.agents` whose queue the workers take | the only profile |
| `pools[].intake` | none | The intake queue of the workers | `<prefix>.<agent>` for a pool named after its agent, else `<prefix>.<pool>` |
| `pools[].revision` | none | Free text. A new value replaces every Task | none |
| `pools[].generation` | none | A number that orders the versions of the pool. A front never replaces a Task of a higher generation | `0` |
| `pools[].env[]` | none | Variables of the workers: `name` with `value`, or `name` with `fromEnv`. No `FW_*` or `AX_*` name | none |
| `pools[].egress.hosts[]` | none | The hosts that a worker reaches: `host[:port]` for TLS, `http://host[:port]`, or `https://host[:port]`. `*.` matches one label | required, or from the template |
| `pools[].resources` | none | `requests` and `limits`, each with `cpu` and `memory` | none |
| `pools[].files[]` | none | Extra Workspace files, each with `path` and `content` | none |
| `pools[].packages` | none | `on`, `ask`, `python` (at most 100), and `tools` (at most 100). Needs the block `packages` | off |
| `pools[].fw` | none | The `fw.yaml` of each worker. It must name `agents` and a model, and must not set `bus.intake` or `bus.egress` | required |
| `templates[].name` | none | The template, named like a pool | required |
| `templates[].default` | none | The template of a new agent whose request names none. At most one | `false` |
| `templates[].atespace`, `image`, `generation`, `env`, `egress`, `resources`, `files`, `packages` | none | As for a pool. `image` and `egress` are required | as for a pool |
| `templates[].fw` | none | The base `fw.yaml` of the workers, without `agents`. Its `access.admins` must match the static token, such as `kind:token` | none |
| `packages.mirrors.python` | none | The package index for `uv` and `pip` | required in the block |
| `packages.mirrors.tools` | none | The channel of `pixi` in place of conda-forge | required in the block |
| `packages.egress[]` | none | Hosts that reach the mirrors. The front adds them to the egress of every pool | none |

The prefix of `pools[].intake` is `fleet.intake`, else `fw.jobs`. Two pools on one intake are refused, unless both name it. The front adds to each worker `fw.yaml` the bus, `ax.server`, `ax.router`, `bus.egress`, `bus.intake`, and `bus.egressMaxBytes: 4096`. `fw-workbench pools render` prints the result.

## Where the docs and the code differ

- An MCP error of the fleet tools asks for `workbench.fleet.subject`. No code reads that key. The fleet turns on with `fleet.atespaces` or `fleet.egress`.
- The design document says `orphansAfter` and `suspendAfter` take `off`. In the file, only `0s` works. `off` works in the variables.
- A negative `fleet.interval` or `fleet.expire` silently takes the default.
- `examples/bossmode/fw.yaml` never sets `bossmode.enabled`, so with that file the page stays off.
- `examples/sources/fw.yaml` says that runs go to `fw.jobs.<agent>`. The front first uses the intake of the pool that runs the agent.

<div class="paths" markdown>

- [Configuration <span>The keys of the kernel</span>](configuration.md)
- [Pools and templates <span>Run workers for your agents</span>](../deployment/pools.md)

</div>

## Sources

- `featherweight-workbench/fleet/config.go`
- `featherweight-workbench/fleet/pools.go`
- `featherweight-workbench/pools/config.go`
- `featherweight-workbench/pools/template.go`
- `featherweight-workbench/pools/packages.go`
- `featherweight-workbench/sources/config.go`
- `featherweight-workbench/duties/config.go`
- `featherweight-workbench/duties/imported.go`
- `featherweight-workbench/notify/config.go`
- `featherweight-workbench/bossmode/config.go`
- `featherweight-workbench/manager/manager.go`
- `featherweight-workbench/bridges/config.go`
- `featherweight-workbench/pages/config.go`
- `featherweight-workbench/routines/config.go`
- `featherweight-workbench/access/config.go`
- `featherweight-workbench/connections/config.go`
- `featherweight-workbench/connections/signin.go`
- `featherweight-workbench/teams/teams.go`
- `featherweight-workbench/titles/titles.go`
- `featherweight-workbench/dashboard/whoami.go`
- `featherweight-workbench/surface/mcp/fleet.go`
- `featherweight-workbench/examples/pools/fw.yaml`
- `featherweight-workbench/examples/bossmode/fw.yaml`
- `featherweight-workbench/examples/sources/fw.yaml`
- `featherweight-kernel/ax/manifest.go`
