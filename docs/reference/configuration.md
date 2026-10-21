# Configuration

One `fw.yaml` file configures one `fw` or `fw-workbench` process. This page lists every block of the file with its keys and defaults. The kernel defines them in `fw/config.go`, `config/`, and `examples/fw.yaml`. The block `workbench`, which the workbench reads, comes last. The design document explains the three layers in [section 12.1](../design/kernel-architecture.md#121-three-configuration-layers).

## Precedence

The loader starts from the defaults in Go, overlays the file, overlays the `FW_*` variables, and then applies the command line flags. Then it reads the profile files under `<home>/agents` and validates the result. A key in the file that the schema does not know is an error that names the key and its line. The [fw commands](fw-commands.md) page says how `fw` finds the file.

A value in the file expands `${NAME}` and `${NAME:-default}` from the environment before the loader reads it, and `$$` is one `$`. If `NAME` is unset or empty, the default applies. A reference to an unset variable with no default stops the load. A plain `${PORT}` that expands to `8080` is a number, and a quoted `"${PORT}"` is a string. Values that arrive as variables, and prompts read from a file, do not expand.

## From a key to a variable

A key path maps to a variable in upper snake case: `bus.url` is `FW_BUS_URL`, and `tools.searchThreshold` is `FW_TOOLS_SEARCH_THRESHOLD`. These rules apply:

- A list of strings is one comma-separated value.
- A map of strings takes one variable per key: `FW_MODELS_FAST` sets `models.fast`, and `FW_TOOLS_BASH_ENV_NATS_URL` sets `tools.bash.env.NATS_URL`.
- A map of entries, and a list of named entries, take one variable per field: `FW_PROVIDERS_OPENAI_BASE_URL` sets `providers.openai.baseUrl`, and `FW_TOOLS_MCP_GIT_ENDPOINT` sets the `endpoint` of the `tools.mcp` entry `git`. An entry that the file lacks is created. The entry name ends where the longest known field starts, so `FW_TOOLS_MCP_GIT_MCP_ENDPOINT` names the entry `git_mcp`.
- A key segment becomes a name in lower case. Four maps differ. Under `headers` it becomes a header name: `X_API_KEY` is `X-Api-Key`. Under `options` it becomes a lower camel name: `MAX_TOKENS_FIELD` is `maxTokensField`. Under `env` it stays as given. Under `prices` it becomes a selector: `ANTHROPIC_CLAUDE_OPUS_5_5` is `anthropic/claude-opus-5-5`.
- An empty value counts as unset. `FW_LOG` is an alias of `FW_TELEMETRY_LOG`.
- The block `workbench` is an extension block. No kernel variable sets it. The workbench packages read their own `FW_WORKBENCH_*` variables, listed below.

`fw env` prints every variable name, and `fw config` prints the result with secrets masked.

## Top-level keys

| Key | Meaning | Default |
|---|---|---|
| `listen` | The listen address. ax runner mode forces `:80` | `:8080` |
| `home` | Where runs, memory, agents, and skills live | `/workspace/.fw` under ax, else `./.fw` |
| `model` | The `provider/model` selector of every run | none, and a run without a model is refused |
| `models` | Named selectors that a profile can reference. `FW_MODELS_<NAME>` | `{}` |
| `effort` | `low`, `medium`, `high`, `xhigh`, or `max` | `high` |
| `node` | The name of this process in every ledger event | `ax:<atespace>/<task>` under ax, else `<host>:<port>` |
| `prices` | Per-million-token prices by selector: `{input, output}` | `{}` |
| `surfaces` | The surfaces to serve | `[native, a2a, metrics]`, plus `mcp` in `fw-workbench` |
| `maxRuns` | Runs in flight at once | `16`, or `1` under ax |

## tls

| Key | Meaning | Default |
|---|---|---|
| `provider` | `""`, `file`, or `spiffe`. `file` uses `cert` and `key`. `spiffe` serves the X.509-SVID | `""`, plain HTTP with unencrypted HTTP/2 |
| `cert`, `key` | The PEM chain and the PEM private key for `file` | `""` |
| `clientCA` | The PEM bundle that signs client certificates | `""`, the system roots |
| `clientAuth` | `none`, `request`, or `require` | `none` |

## auth

| Key | Meaning | Default |
|---|---|---|
| `mode` | One mode, or several tried in order: `token`, `none`, `oidc`, `spiffe`. `none` must be explicit | `token` |
| `tokenEnv` | The secret that holds the bearer token. `FW_API_TOKEN_FILE` names a file instead | `FW_API_TOKEN` |
| `oidc.issuer` | The issuer URL | `""` |
| `oidc.audience` | Accepted `aud` claims | `[]` |
| `oidc.jwksUrl` | The key set, in place of the one in the discovery document | `""` |
| `oidc.groupsClaim` | The claim that fills the groups of the principal | `groups` |
| `oidc.nameClaim` | The claim that fills the name | `email`, then `preferred_username`, `name`, `sub` |
| `oidc.scopes` | The scopes that the protected-resource metadata advertises | `[]` |
| `oidc.ca` | The PEM bundle for the issuer | `""`, the system roots |
| `oidc.insecure` | Allow an `http://` issuer, for a test | `false` |
| `oidc.clientId` | The client at the issuer. A value turns the browser sign-in on | `""` |
| `oidc.clientSecret` | The secret that holds the client secret. Empty is a public client | `""` |
| `oidc.redirectUrl` | The callback that the issuer knows | `/ui/callback` on the public address |
| `spiffe.trustDomain` | The trust domain of accepted identities | `""` |
| `spiffe.bundle` | A file or URL of the trust bundle in JWKS form | `""`, the Workload API |
| `spiffe.socket` | The Workload API socket | `""`, `SPIFFE_ENDPOINT_SOCKET` |
| `spiffe.audience` | Accepted JWT-SVID audiences | `[]` |
| `spiffe.x509` | Accept an X.509-SVID as a client certificate | `false` |

## access

An entry is a subject, a glob, `group:<name>`, `kind:<kind>`, `issuer:<url>`, or `*`. See [section 13.2](../design/kernel-architecture.md#132-what-the-caller-can-do).

| Key | Meaning | Default |
|---|---|---|
| `default` | `open`: an agent with no access block is open to every caller as an operator. `closed`: admins only | `open` |
| `admins` | The admins own every agent. `local:*` is the user that runs `fw` on the host | `[]` |
| `creators` | Who can create agents through the API | the admins, plus everyone with `open` |
| `external` | `{mcp, tool}` or `{bus, timeout}`: a control plane decides every request | none |

## providers

One entry per provider: `anthropic`, `gemini`, and `openai`. `FW_PROVIDERS_<NAME>_BASE_URL` and the other fields set them.

| Key | Meaning | Default |
|---|---|---|
| `baseUrl` | Replaces the endpoint of the provider | `""`, the public API |
| `apiKeyEnv` | The secret that holds the API key | `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, or `OPENAI_API_KEY` |
| `headers` | Extra headers on every request. Values resolve through the secrets | `{}` |
| `timeout` | One request | `0s`, the default of the adapter |
| `maxConcurrent` | The most calls of this process to the provider at once | `0`, no limit |
| `tls.ca`, `tls.cert`, `tls.key`, `tls.insecure` | The trust bundle, the client certificate, and the development switch | `""`, `""`, `""`, `false` |
| `options` | Options of the adapter | `{}` |

The OpenAI adapter reads nine options: `reasoning`, `maxTokensField`, `authHeader`, `organization`, `project`, `promptCacheKey`, `parallelToolCalls`, `idleTimeout`, and `mediaTypes`. Their defaults are `auto`, `auto`, `""`, `""`, `""`, `auto`, `"true"`, `120s`, and `auto`. Section 6.6 of the [kernel design](../design/kernel-architecture.md#6-models) explains each one.

## secrets, ledger, bus, and tokens

| Key | Meaning | Default |
|---|---|---|
| `secrets.driver` | `env`, `vault`, or `gsm` | `env` |
| `secrets.options` | Driver options. `FW_SECRETS_OPTIONS_<NAME>` | `{}` |
| `ledger.driver` | `file`, `nats`, `redis`, or `sqlite` | `file` |
| `ledger.path` | `file`: the directory | `<home>/runs` |
| `ledger.url` | `nats` and `redis`: the server | `""` |
| `ledger.options` | Driver options. `FW_LEDGER_OPTIONS_<NAME>` | `{}` |
| `bus.driver` | `mem`, `nats`, `redis`, or `kafka` | `mem` |
| `bus.url` | `nats://nats:4222`, `redis://redis:6379`, or `kafka://broker:9092` | `""` |
| `bus.intake` | The queue to pull run requests from, for example `fw.jobs.reviewer` | `""` |
| `bus.intakeRetries` | Times a failed job goes on the queue again as a new run | `0` |
| `bus.deadLetter` | Send a record of each failed or rejected job to `<intake>.dead` | `true` |
| `bus.egress` | The subject prefix to publish ledger events to, for example `fw.events` | `""` |
| `bus.egressTypes` | The event types to publish | `[]`, every type |
| `bus.options` | Driver options. `nats` and `redis` take `concurrency` | `{}` |
| `tokens.url` | The front of the workbench that brokers the tokens of people | `""`, off |
| `tokens.credential` | The secrets name of the bearer token for the broker | `""`, `auth.tokenEnv` |
| `tokens.subject` | The bus subject of the notices of the broker | `fw.connections` |

## tools

| Key | Meaning | Default |
|---|---|---|
| `builtin` | The built-in tools the model can call. The workbench adds `propose_agent` | `[bash, files, http, memory, skill, clock, ask_user, spawn_task, await_task]` |
| `user` | The user of `bash` and of the stdio MCP servers: a name or uid, with `:group`. `none` is the user of `fw` | `""`: `65532` under ax as root, else the user of `fw` |
| `files.root` | The directory that the `files` tool cannot leave | the working directory, `/workspace` under ax |
| `files.deny` | Patterns that are never read or written | `[.env, .env.*, *.pem, *.key, .netrc, **/.git/config]` |
| `files.readOnly` | Patterns that are read, never written | `[.git]` |
| `files.maxFileBytes` | The largest file that is read or written | `8388608` |
| `files.perRun` | Each run works in `<root>/runs/<run id>` | `null`: on under ax, off elsewhere |
| `http.allow` | URL globs the `http` tool can fetch | `[]` |
| `bash.env` | Variables that every command starts with. `FW_TOOLS_BASH_ENV_<NAME>` | `{}` |
| `bash.timeout` | One command. `0` leaves the limit to `tools.limits` | `0s` |
| `memory.scope` | `agent`: notes per profile. `shared`: one set | `agent` |
| `limits.maxInputBytes` | A larger input does not run | `262144` |
| `limits.maxOutputBytes` | A larger result keeps its head and tail | `102400` |
| `limits.timeout` | One tool call | `10m` |
| `limits.perTool` | The same three limits by tool name or glob. `FW_TOOLS_LIMITS_PER_TOOL_<NAME>_MAX_OUTPUT_BYTES` | `{}` |
| `skills` | Directories that hold skills | `[]`, which is `<home>/skills` |
| `mcp` | MCP servers, a named list. `FW_TOOLS_MCP_<NAME>_ENDPOINT` | `[]` |
| `peers` | A2A peers, each the tool `ask_<name>`. `FW_TOOLS_PEERS_<NAME>_AX` | `[]` |
| `searchThreshold` | Above this many tools, the model uses tool search | `24` |

### A tools.mcp entry

| Key | Meaning | Default |
|---|---|---|
| `name` | The entry name, and the prefix of its tools | required |
| `title` | The name of the service for a person | the entry name |
| `endpoint` | The HTTP or HTTPS endpoint | `""` |
| `command`, `args` | The stdio transport instead of an endpoint | none |
| `tls.ca`, `tls.cert`, `tls.key`, `tls.insecure` | The trust bundle, the client certificate, and the development switch | `""`, `""`, `""`, `false` |
| `auth.bearer` | A secrets name, sent as `Authorization: Bearer` | `""` |
| `auth.oauth` | `clientId`, `clientSecret`, `scopes`, `issuer`, `grant` (`client` or `user`), `offline`, `authParams`, and `exchange.audience` | none |
| `auth.spiffe.audience` | Send a JWT-SVID of this workload as the bearer token | none |
| `headers` | Extra headers on every request | `{}` |
| `timeout` | One request | `0s` |
| `trusted` | Treat the tool annotations of the server as true | `false` |

A `grant: user` entry acts for the person who started the run. See [section 7.11](../design/kernel-architecture.md#711-acting-for-a-person).

## policy, budget, compaction, time, and spawn

| Key | Meaning | Default |
|---|---|---|
| `policy.default` | `allow` or `deny` | `allow` |
| `policy.ask` | Flags or tool names that need an approval | `[destructive]` |
| `policy.deny` | Flags or tool names that never run | `[]` |
| `policy.external` | `{mcp, tool}` or `{bus, timeout}`. It replaces the rules above | `null` |
| `budget.maxTurns` | Model turns of one run | `200` |
| `budget.maxTokens` | Tokens of the run and its child runs together | `2000000` |
| `budget.maxCostUSD` | Cost of the run and its child runs together. Needs `prices` | `0`, off |
| `budget.deadline` | Working time. Time spent waiting does not count | `2h` |
| `budget.maxToolCalls` | Tool calls of the run and its child runs together | `1000` |
| `budget.maxCallsPerTurn` | Tool calls in one model response | `32` |
| `budget.maxRepeats` | The same call this many times in a row fails the run | `5` |
| `budget.finalReport` | One bounded model call past a limit of turns, tool calls, or working time | `true` |
| `budget.reportMaxTokens` | The output cap of the report call | `1024` |
| `budget.reportTimeout` | The time limit of the report call | `2m` |
| `compaction.at` | Estimated context tokens that start a summary. `0` is off | `150000` |
| `compaction.model` | The model of the summary call | `""`, the model of the run |
| `time.zone` | An IANA name such as `America/Chicago` | `""`, the zone of the system |
| `time.noteAfter` | A longer gap since the last model response adds a time note. `0` is off | `10m` |
| `spawn.maxDepth` | `1` lets a run start children, `2` lets those start children | `3` |
| `spawn.maxChildren` | Child runs that one run can start | `16` |
| `spawn.maxDescendants` | Runs that one tree can hold under its root | `32` |
| `spawn.maxRunning` | Child runs of this process that work at the same time | `8` |
| `spawn.driver` | `""` runs children in this process. `ax` runs each child in a child Task | `""` |

## agents

Each entry of `agents` is a profile. A file `<home>/agents/<name>.yaml` adds one. `FW_AGENTS_<NAME>_MODEL` and the other fields set them.

| Key | Meaning | Default |
|---|---|---|
| `description` | One line that a listing and a parent run see | `""` |
| `system` | The system prompt, or the path of a `.md` or `.txt` file | the built-in prompt |
| `instructions` | More texts, or files, that follow the system prompt | `[]` |
| `skills` | Globs over skill names. `null` is every skill, `[]` is none | `null` |
| `tools` | Globs over tool names | every tool |
| `model` | A selector, or a name from `models` | the top-level `model` |
| `effort` | The reasoning effort | the top-level `effort` |
| `timeZone` | The zone of the runs of this profile | `time.zone` |
| `policy` | Rules that tighten `policy` | none |
| `budget` | Limits that lower `budget` | none |
| `access` | `owners`, `operators`, and `viewers` | none, the profile follows `access.default` |
| `outcome` | `rubric`, `grader`, and `iterations` (`1` to `10`): a grader run grades each answer | none |

## a2a, mcp, ax, and telemetry

| Key | Meaning | Default |
|---|---|---|
| `a2a.name`, `a2a.description` | The name and the description on the agent card | `featherweight`, `A featherweight agent` |
| `a2a.url` | The public base URL on the card | `""`, built from `listen` |
| `mcp.path` | The route of the MCP server | `/mcp` |
| `mcp.origins` | Allowed `Origin` values. `*` allows every origin | `[]` |
| `mcp.expose` | Local or upstream tools to re-export through `/mcp` | `[]` |
| `mcp.tasks` | Advertise the tasks extension. The SDK does not serve it yet | `true` |
| `mcp.taskTTL` | The life of a task handle and of a signed approval retry | `24h` |
| `mcp.auth.authorizationServers` | Served in `/.well-known/oauth-protected-resource` | `[]` |
| `mcp.auth.audience` | The canonical URL of this server | `""`, built from `listen` and `path` |
| `ax.server` | The ax API, for `spawn_task` and the pools | `ax-server.ax-system.svc.cluster.local:8080` |
| `ax.router` | The atenet router, for peers and the fleet | `atenet-router.ate-system.svc.cluster.local` |
| `telemetry.metrics` | The route of the Prometheus registry | `/metrics` |
| `telemetry.log` | `debug`, `info`, `warn`, or `error` | `info` |

## The blocks `environment` and `harness`

The block `environment` installs packages on the durable volume from the lock files of `uv` and `pixi` ([section 18](../design/kernel-architecture.md#18-environments)). The block `harness` makes every run a session of opencode or Claude Code ([section 19.1](../design/kernel-architecture.md#191-configuration)). Neither block is in `fw-workbench`, which does not link the packages `env` and `harness`.

| Key | Meaning | Default |
|---|---|---|
| `environment.dir` | The install directory | `/workspace/.environment` under ax, else `./.environment` |
| `environment.cache` | The download cache | `/workspace/.cache` under ax, else `./.cache` |
| `environment.python` | A `pyproject.toml` with `uv.lock` next to it | `""` |
| `environment.tools` | A `pixi.toml` with `pixi.lock` next to it | `""` |
| `environment.prepare` | Shell commands after the install, once per digest | `[]` |
| `environment.placement` | `durable` or `image` | `durable` |
| `environment.brief` | The Environment section of the system prompt | `true` |
| `harness.kind` | `opencode` or `claude-code` | required |
| `harness.home` | `HOME` of the hosted program | `.harness` beside the home of `fw` |
| `harness.command` | The program and its first arguments | `opencode serve`, or `claude` |
| `harness.port` | `opencode` only: the loopback port | `0`, a free port |

## The block workbench

The workbench claims the top-level key `workbench`. Each package reads its own sub-block, and the variables below win over the file. `fw` without the workbench refuses the block as an unknown key.

### workbench.fleet

If `atespaces` or `egress` names a source, the fleet is on. See [section 4.6](../design/workbench-architecture.md#46-configuration).

| Key | Variable | Meaning | Default |
|---|---|---|---|
| `name` | `FW_WORKBENCH_FLEET_NAME` | The name of this process in the view | `<atespace>/<task>` under ax, else `<host>:<port>` |
| `interval` | `FW_WORKBENCH_FLEET_INTERVAL` | The time between two reads of the Task list | `30s` |
| `expire` | `FW_WORKBENCH_FLEET_EXPIRE` | The age after which the view forgets a finished run | `168h` |
| `atespaces` | `FW_WORKBENCH_FLEET_ATESPACES` | The atespaces whose Tasks are members, comma-separated | none |
| `egress` | `FW_WORKBENCH_FLEET_EGRESS` | The subject prefix of the egress stream of the workers | none |
| `intake` | `FW_WORKBENCH_FLEET_INTAKE` | The subject prefix of the intake queues: a worker of `<agent>` reads `<intake>.<agent>` | none |
| `suspendAfter` | `FW_WORKBENCH_FLEET_SUSPEND_AFTER` | How long a Task idles before the front suspends it, or `off` | `10m` with `atespaces`, else off |
| `wakeOnQueue` | `FW_WORKBENCH_FLEET_WAKE_ON_QUEUE` | `on` or `off`. If jobs wait in the queue of a profile, the front wakes its sleeping Tasks | on with `atespaces` and `intake` |

### workbench.pools

A list of pools. No variable sets it. The front reads every pool at its start, and a problem stops the start. See [section 14.1](../design/workbench-architecture.md#141-configuration) and `examples/pools/fw.yaml`.

| Key | Meaning | Default |
|---|---|---|
| `name` | The pool. Its Tasks are `<name>-<index>`, with Workspaces `<name>-<index>-ws` | required |
| `atespace` | The atespace of the Tasks, one of `workbench.fleet.atespaces` | the only atespace of the fleet |
| `replicas` | The number of Tasks. `0` deletes every idle Task | required |
| `image` | The worker image by digest, `<image>@sha256:<64 hex digits>` | required |
| `agent` | The profile of `fw.agents` whose queue the workers take | the only profile of `fw.agents` |
| `intake` | The intake queue of the workers | `<workbench.fleet.intake>.<agent>`, else `fw.jobs.<agent>` |
| `revision` | Free text. A new value replaces every Task | none |
| `generation` | A number that orders the configurations of the pool | `0` |
| `env` | Variables of the workers: `name` with `value`, or `name` with `fromEnv` | none |
| `egress` | `spec.egress` of each Task: `rules` with `http`, `https`, or `tls`, each with `hostnames` and `ports` | required |
| `resources` | `requests` and `limits` with `cpu` and `memory` | none |
| `files` | Extra Workspace files, each with `path` and `content` | none |
| `fw` | The `fw.yaml` of each worker | required |

### workbench.sources

A list of event sources. No variable sets it. See [section 13.2](../design/workbench-architecture.md#132-configuration) and `examples/sources/fw.yaml`.

| Key | Meaning | Default |
|---|---|---|
| `name` | 1 to 63 lower-case letters, digits, `-`, or `_` | required |
| `agent` | The profile, and so the queue `<intake>.<agent>` | required |
| `auth.mode` | `bearer`, `hmac`, or `none` for a webhook | required for a webhook |
| `auth.secret` | The variable that holds the token or the HMAC key | required for `bearer` and `hmac` |
| `auth.header` | The header of the HMAC signature | `X-Signature-256` |
| `poll.url` | The endpoint of a poll source. This key makes the entry a poll source | none |
| `poll.every` | The time between two polls, `5s` or more | `1m` |
| `poll.timeout` | The limit of one poll | `30s` |
| `poll.secret` | The variable that holds the credential | none |
| `poll.header` | The header that carries the credential as it is | none, `Authorization: Bearer` |
| `items` | A dotted path to the array of events | the body itself |
| `input`, `title`, `metadata` | Go templates over one event | the event as JSON, no title, none |
| `key` | The template of the de-duplication key, at most 512 bytes | required |
| `dedupFor` | How long a key blocks a second run, `1m` or more | `168h` |
| `redrive.maxAttempts` | Runs of one event after a dead letter, `2` to `10` | `3` |
| `redrive.cooldown` | The time from the dead letter to the next run, `1m` or more | `5m` |
| `runAs`, `runAsKind` | The principal of the runs and its kind, `workload` or `user` | `source:<name>`, `workload` |

### workbench.grants, access, teams, and titles

| Key | Variable | Meaning | Default |
|---|---|---|---|
| `grants.store` | `FW_WORKBENCH_GRANTS_STORE` | `file`, `memory`, or a registered driver | `file` |
| `grants.dir` | `FW_WORKBENCH_GRANTS_DIR` | The directory of the file store | `<home>/grants` |
| `grants.key` | `FW_WORKBENCH_GRANTS_KEY` | The secrets name of the key that encrypts the file store | `FW_GRANT_KEY` |
| `access.external.mcp` | `FW_WORKBENCH_ACCESS_EXTERNAL_MCP` | The name of a `tools.mcp` entry that decides | none |
| `access.external.tool` | `FW_WORKBENCH_ACCESS_EXTERNAL_TOOL` | The tool on that server | `authorize` |
| `access.external.bus` | `FW_WORKBENCH_ACCESS_EXTERNAL_BUS` | The bus subject that receives the requests | none |
| `access.external.timeout` | `FW_WORKBENCH_ACCESS_EXTERNAL_TIMEOUT` | The limit of one request | `5s` |
| `teams` | `FW_WORKBENCH_TEAMS` | Glob patterns over group names, comma-separated in the variable | `[]`, every group is a team |
| `titles` | `FW_WORKBENCH_TITLES` | `model`: a model writes a title. `input`: the first sentence of the input | `model` |

`access.external` sets exactly one of `mcp` and `bus`, or the process stops at start. With it, `access.default`, `access.admins`, and `access.creators` of the kernel do not apply.

## Where the example and the code differ

`examples/fw.yaml` says that it shows each key with its default, and the loader of the configuration reads it. Some values in it are samples: `tools.files.root: /workspace`, `tools.http.allow`, `access.admins: ["local:*"]`, `models.fast`, `auth.oidc.issuer`, `auth.spiffe.trustDomain`, the `tools.mcp` and `tools.peers` entries, and the profile `reviewer`. The tables above give the defaults of `fw.DefaultConfig` for those keys.

## Sources

- `featherweight-kernel/examples/fw.yaml`
- `featherweight-kernel/config/config.go`
- `featherweight-kernel/config/env.go`
- `featherweight-kernel/config/expand.go`
- `featherweight-kernel/fw/config.go`
- `featherweight-kernel/fw/policy.go`
- `featherweight-kernel/fw/run.go`
- `featherweight-kernel/fw/outcome.go`
- `featherweight-kernel/fw/external.go`
- `featherweight-kernel/fw/workspace.go`
- `featherweight-kernel/fw/clock.go`
- `featherweight-kernel/ax/config.go`
- `featherweight-kernel/env/config.go`
- `featherweight-kernel/harness/harness.go`
- `featherweight-kernel/authn/oidc/claims.go`
- `featherweight-kernel/model/anthropic/anthropic.go`
- `featherweight-kernel/model/gemini/gemini.go`
- `featherweight-kernel/model/openai/openai.go`
- `featherweight-workbench/fleet/config.go`
- `featherweight-workbench/fleet/types.go`
- `featherweight-workbench/pools/config.go`
- `featherweight-workbench/sources/config.go`
- `featherweight-workbench/connections/config.go`
- `featherweight-workbench/access/config.go`
- `featherweight-workbench/teams/teams.go`
- `featherweight-workbench/titles/titles.go`
- `featherweight-workbench/examples/pools/fw.yaml`
- `featherweight-workbench/examples/sources/fw.yaml`
- `featherweight-workbench/examples/agentgateway/fleet.yaml`
