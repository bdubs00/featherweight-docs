---
wide: true
---

# Configuration

One file configures one process of the kernel or the workbench. This page lists every key of the kernel with its default, grouped by what the key controls. The keys that only the workbench reads have a page of their own: [Workbench configuration](workbench-configuration.md).

The file is `fw.yaml`. Every key here works in both binaries, with three exceptions. The blocks `environment` and `harness` work only in `fw`, because `fw-workbench` does not link them. The block `mcp` configures the MCP server, which only `fw-workbench` serves.

## How the file loads

The loader starts from the defaults in Go and overlays the file. Then it overlays the `FW_*` variables and applies the global flags. Last, it reads the profile files under `<home>/agents` and validates the result. A key that the schema does not know stops the load with the key and its line. The [fw commands](fw-commands.md#global-flags) page says how `fw` finds the file.

The file expands `${NAME}` and `${NAME:-default}` from the environment before the loader reads it, and `$$` is one `$`. If `NAME` is unset or empty, the default applies. An unset variable with no default stops the load. A plain `${PORT}` that expands to `8080` is a number, and a quoted `"${PORT}"` is a string. Values from variables, and prompts read from a file, do not expand.

### From a key to a variable

A key path maps to `FW_` and the path in upper snake case: `bus.url` is `FW_BUS_URL`, and `tools.searchThreshold` is `FW_TOOLS_SEARCH_THRESHOLD`.

| Shape of the key | Rule | Example |
|---|---|---|
| A list of strings | One comma-separated value | `FW_SURFACES=native,a2a` |
| A map of strings | One variable per key | `FW_MODELS_FAST` sets `models.fast` |
| A map of entries, or a list of named entries | One variable per field. A missing entry is created. The name ends where the longest known field starts | `FW_TOOLS_MCP_GIT_ENDPOINT` sets the `endpoint` of the `tools.mcp` entry `git` |
| A key under `headers` | A header name | `X_API_KEY` is `X-Api-Key` |
| A key under `options` | A lower camel name | `MAX_TOKENS_FIELD` is `maxTokensField` |
| A key under `env` | Stays as given | `FW_TOOLS_BASH_ENV_NATS_URL` sets `tools.bash.env.NATS_URL` |
| A key under `prices` | A selector | `ANTHROPIC_CLAUDE_OPUS_5_5` is `anthropic/claude-opus-5-5` |

An empty value counts as unset. `FW_LOG` is an alias of `FW_TELEMETRY_LOG`. No kernel variable sets an extension block such as `workbench`. `fw env` prints every variable name, and `fw config` prints the result with secrets masked.

## The process

| Key | Meaning | Default |
|---|---|---|
| `listen` | The listen address. Under ax, `fw` forces `:80` | `:8080` |
| `home` | Where runs, memory, agents, and skills live | `/workspace/.fw` under ax, else `./.fw` |
| `node` | The name of this process in every ledger event | `ax:<atespace>/<task>` under ax, else `<host>:<port>` |
| `surfaces` | The surfaces to serve | `[native, a2a, metrics]`, plus `mcp` in `fw-workbench` |
| `maxRuns` | Root runs that work at once | `0`, which is `16`, or `1` under ax |
| `maxQueuedRuns` | Root runs that wait behind `maxRuns`. A full backlog refuses a new start or a branch with 429, never a follow-up or a decision | `0`, which is `64` |
| `tls.provider` | `""`, `file`, or `spiffe`. `file` uses `cert` and `key`, and `spiffe` serves the X.509-SVID | `""`, plain HTTP with unencrypted HTTP/2 |
| `tls.cert`, `tls.key` | The PEM chain and the PEM private key for `file` | `""` |
| `tls.clientCA` | The PEM bundle that signs client certificates | `""`, the system roots |
| `tls.clientAuth` | `none`, `request`, or `require` | `none` |
| `a2a.name`, `a2a.description` | The name and the description on the agent card | `featherweight`, `A featherweight agent` |
| `a2a.url` | The public base URL on the card | `""`, built from `listen` |
| `mcp.path` | `fw-workbench`: the route of the MCP server | `/mcp` |
| `mcp.origins` | `fw-workbench`: allowed `Origin` values. `*` allows every origin | `[]` |
| `mcp.expose` | `fw-workbench`: local or upstream tools to re-export through `/mcp` | `[]` |
| `mcp.tasks` | `fw-workbench`: advertise the tasks extension. The SDK does not serve it yet | `true` |
| `mcp.taskTTL` | `fw-workbench`: the life of a task handle and of a signed approval retry | `24h` |
| `mcp.auth.authorizationServers` | `fw-workbench`: served in `/.well-known/oauth-protected-resource` | `[]` |
| `mcp.auth.audience` | `fw-workbench`: the canonical URL of the MCP server | `""`, built from `listen` and `path` |
| `ax.server` | The ax API, for `spawn_task`, `fw ax`, and the pools | `ax-server.ax-system.svc.cluster.local:8080` |
| `ax.router` | The atenet router, for peers and the fleet | `atenet-router.ate-system.svc.cluster.local` |
| `ax.childRetention` | How long a child Task of `spawn.driver: ax` stays after its runs end. A negative value keeps every child Task | `0`, which is `24h` |
| `telemetry.metrics` | The route of the Prometheus registry | `/metrics` |
| `telemetry.log` | `debug`, `info`, `warn`, or `error` | `info` |

## Who can call

An entry of `access` is a subject, a glob, `group:<name>`, `kind:<kind>`, `issuer:<url>`, or `*`. See [section 13.2](../design/kernel-architecture.md#132-what-the-caller-can-do) and [Identity](../concepts/identity.md).

| Key | Meaning | Default |
|---|---|---|
| `auth.mode` | One mode, or several tried in order: `token`, `none`, `oidc`, `spiffe`. `none` must be explicit | `token` |
| `auth.tokenEnv` | The secret that holds the bearer token. `FW_API_TOKEN_FILE` names a file instead | `FW_API_TOKEN` |
| `auth.oidc.issuer` | The issuer URL | `""` |
| `auth.oidc.audience` | Accepted `aud` claims | `[]` |
| `auth.oidc.jwksUrl` | The key set, in place of the one in the discovery document | `""` |
| `auth.oidc.groupsClaim` | The claim that fills the groups of the principal | `groups` |
| `auth.oidc.nameClaim` | The claim that fills the name | `email`, then `preferred_username`, `name`, `sub` |
| `auth.oidc.scopes` | The scopes that the protected-resource metadata advertises | `[]` |
| `auth.oidc.ca` | The PEM bundle for the issuer | `""`, the system roots |
| `auth.oidc.insecure` | Allow an `http://` issuer, for a test | `false` |
| `auth.oidc.clientId` | The client at the issuer. A value turns the browser sign-in of the workbench on | `""` |
| `auth.oidc.clientSecret` | The secret that holds the client secret. Empty is a public client | `""` |
| `auth.oidc.redirectUrl` | The callback that the issuer knows | `/ui/callback` on the public address |
| `auth.spiffe.trustDomain` | The trust domain of accepted identities | `""` |
| `auth.spiffe.bundle` | A file or URL of the trust bundle in JWKS form | `""`, the Workload API |
| `auth.spiffe.socket` | The Workload API socket | `""`, `SPIFFE_ENDPOINT_SOCKET` |
| `auth.spiffe.audience` | Accepted JWT-SVID audiences | `[]` |
| `auth.spiffe.x509` | Accept an X.509-SVID as a client certificate | `false` |
| `access.default` | `open`: an agent with no access block is open to every caller as an operator. `closed`: admins only | `open` |
| `access.admins` | The admins own every agent. `local:*` is the user that runs `fw` on the host | `[]` |
| `access.creators` | Who can create agents through the API | `[]`: the admins, plus everyone with `open` |

## Models

There is no default model, because a paid model is never a built-in choice. Without `model`, `FW_MODEL`, or the model of a profile, `fw` refuses every run, and `fw doctor` prints a `warn` line.

| Key | Meaning | Default |
|---|---|---|
| `model` | The `provider/model` selector of every run | none |
| `models` | Named selectors that a profile can name, such as `fast` | `{}` |
| `effort` | `low`, `medium`, `high`, `xhigh`, or `max` | `high` |
| `prices` | Prices per million tokens by selector: `{input, output}`. `budget.maxCostUSD` needs them | `{}` |
| `providers.<name>.baseUrl` | Replaces the endpoint of `anthropic`, `gemini`, or `openai` | `""`, the public API |
| `providers.<name>.apiKeyEnv` | The secret that holds the API key | `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, or `OPENAI_API_KEY` |
| `providers.<name>.headers` | Extra headers on every request. Values resolve through the secrets | `{}` |
| `providers.<name>.timeout` | One request | `0s`, the default of the adapter |
| `providers.<name>.maxConcurrent` | The most calls of this process to the provider at once | `0`, no limit |
| `providers.<name>.tls` | `ca`, `cert`, `key`, and `insecure` | empty, `false` |
| `providers.<name>.options` | Options of the adapter | `{}` |
| `deciders.<name>.baseUrl` | A decider answers typed questions for routines and the tool `decide`. This is its server: `POST {baseUrl}/v1/systemone` | none. No decider exists by default |
| `deciders.<name>.model` | The model name that the client sends. Required, because a decider costs money or a GPU | none |
| `deciders.<name>.apiKeyEnv` | The secret that holds the bearer token. Empty sends no token | `""` |
| `deciders.<name>.driver` | The client of the decider | `""`, which is `systemone` |
| `deciders.<name>.timeout` | One call | `0`, which is `30s` |
| `compaction.at` | Estimated context tokens that start a summary of the history. `0` is off | `262144` |
| `compaction.model` | The model of the summary call | `""`, the model of the run |
| `compaction.off` | Turn compaction off. It wins over `at` | `false` |

The OpenAI adapter reads nine options: `reasoning`, `maxTokensField`, `authHeader`, `organization`, `project`, `promptCacheKey`, `parallelToolCalls`, `idleTimeout`, and `mediaTypes`. Their defaults are `auto`, `auto`, `""`, `""`, `""`, `auto`, `"true"`, `120s`, and `auto`. [Section 6](../design/kernel-architecture.md#6-models) of the kernel design explains each one. `FW_DECIDERS_<NAME>_BASE_URL` and the other fields set a decider.

## Tools

| Key | Meaning | Default |
|---|---|---|
| `tools.builtin` | The built-in tools the model can call. `decide` needs a decider. The workbench adds `propose_agent` | `[bash, files, http, memory, recall, skill, clock, ask_user, spawn_task, await_task, decide]` |
| `tools.user` | The user of `bash` and of the stdio MCP servers: a name or uid, with `:group`. `none` is the user of `fw` | `""`: `65532` under ax as root, else the user of `fw` |
| `tools.userHome` | `HOME` of the tool user, an absolute path that `fw` creates with mode 0700 | `""`: the home in `/etc/passwd`, or `/workspace/.home` under ax |
| `tools.files.root` | The directory that the `files` tool cannot leave | the working directory, or the first Workspace path under ax |
| `tools.files.deny` | Patterns that are never read or written | `[.env, .env.*, *.pem, *.key, .netrc, **/.git/config]` |
| `tools.files.readOnly` | Patterns that are read, never written | `[.git]` |
| `tools.files.maxFileBytes` | The largest file that is read or written | `8388608` |
| `tools.files.perRun` | Each run works in `<root>/runs/<run id>` | unset: on under ax, off elsewhere |
| `tools.http.allow` | URL globs that the `http` tool can fetch | `[]` |
| `tools.bash.env` | Variables that every command starts with | `{}` |
| `tools.bash.timeout` | One command. `0` leaves the limit to `tools.limits` | `0s` |
| `tools.memory.scope` | `agent`: notes per profile. `principal`: notes per person and profile. `shared`: one set for every profile | `""`: `agent`, or `principal` under ax |
| `tools.limits.maxInputBytes` | A larger input does not run | `262144` |
| `tools.limits.maxOutputBytes` | A larger result keeps its head and tail | `102400` |
| `tools.limits.timeout` | One tool call | `10m` |
| `tools.limits.perTool` | The same three limits by tool name or glob. An exact name wins | `{}` |
| `tools.skills` | Directories that hold skills | `[]`, which is `<home>/skills` |
| `tools.mcp` | MCP servers, a list of named entries. See the next table | `[]` |
| `tools.peers` | A2A peers, each the tool `ask_<name>`: `name` with `ax` (`<atespace>/<task>`) or `card` (a card URL) | `[]` |
| `tools.searchThreshold` | Above this many tools, the model uses tool search | `24` |

### A tools.mcp entry

Under ax, the entries merge by name with `spec.mcp.servers` of the Workspace, and `fw.yaml` wins.

| Key | Meaning | Default |
|---|---|---|
| `name` | The entry name, and the prefix of its tools | required |
| `title` | The name of the service for a person | the entry name |
| `endpoint` | The HTTP or HTTPS endpoint | `""` |
| `command`, `args` | The stdio transport instead of an endpoint | none |
| `tls` | `ca`, `cert`, `key`, and `insecure` | empty, `false` |
| `auth.bearer` | A secrets name, sent as `Authorization: Bearer` | `""` |
| `auth.oauth` | The OAuth client. Its keys are `clientId`, `clientSecret`, `scopes`, `grant` (`client` or `user`), and `offline`. The keys `issuer`, `authorizeUrl`, `tokenUrl`, `authParams`, and `exchange` (`audience`, `scopes`) are optional | none |
| `auth.spiffe.audience` | Send a JWT-SVID of this workload as the bearer token | none |
| `headers` | Extra headers on every request | `{}` |
| `timeout` | One request | `0s` |
| `trusted` | Treat the tool annotations of the server as true | `false` |
| `skills` | Where the skills of the server come from: `auto` (`skills/list`), `off`, or a list of `SKILL.md` URIs to pin, with or without `auto` | `auto` |

`grant: client` acts as the agent. `grant: user` acts for the person who started the run, and `offline` defaults to `true`. See [section 7.11](../design/kernel-architecture.md#711-acting-for-a-person).

## Safety limits

| Key | Meaning | Default |
|---|---|---|
| `policy.default` | If no rule matches, this verdict applies: `allow` or `deny` | `allow` |
| `policy.allow`, `policy.ask`, `policy.deny` | Flags, tool names, or `tool: pattern` rules. Deny wins over ask, and ask wins over allow | `ask: [destructive]` |
| `policy.all` | Independent clauses. Every clause must allow a call, or the call does not run | `[]` |
| `policy.external` | `{mcp, tool}` or `{bus, timeout}`. It replaces the rules above, and a profile can only tighten it | none |
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
| `spawn.maxDepth` | `1` lets a run start children, `2` lets those start children | `3` |
| `spawn.maxChildren` | Child runs that one run can start | `16` |
| `spawn.maxDescendants` | Runs that one tree can hold under its root | `32` |
| `spawn.maxRunning` | Child runs of this process that work at the same time | `8` |
| `spawn.driver` | `""` runs children in this process. `ax` runs each child in a child Task | `""` |
| `spawn.disabled` | Forbid child runs | `false` |
| `time.zone` | An IANA name such as `America/Chicago` | `""`, the zone of the system |
| `time.noteAfter` | A longer gap since the last model response adds a time note. `0` is off | `10m` |

See [Safeguards](../concepts/safeguards.md) for what each limit does to a run.

## Agents

Each entry of `agents` is a profile. A file `<home>/agents/<name>.yaml` adds one, and `FW_AGENTS_<NAME>_MODEL` and the other fields set them. See [Profiles, tools, and skills](../concepts/profiles-and-tools.md).

| Key | Meaning | Default |
|---|---|---|
| `description` | One line that a listing and a parent run see | `""` |
| `system` | The system prompt, or the path of a `.md` or `.txt` file | the built-in prompt |
| `instructions` | More texts, or files, after the system prompt | `[]` |
| `skills` | Globs over skill names. `null` is every skill, `[]` is none | `null` |
| `tools` | Globs over tool names | every tool |
| `model` | A selector, or a name from `models` | the top-level `model` |
| `effort` | The reasoning effort | the top-level `effort` |
| `timeZone` | The zone of the runs of this profile | `time.zone` |
| `policy` | Rules that tighten `policy` | none |
| `budget` | Limits that lower `budget` | none |
| `compaction` | `at`, `model`, and `off` for the runs of this profile. `off` with `at` is invalid | the top-level block |
| `access` | `owners`, `operators`, and `viewers` | none: `access.default` applies |
| `outcome` | `rubric` (required to grade), `grader` (a model), and `iterations` (`1` to `10`) | none |
| `routines` | Routines that the kernel can run in place of the model. See the next table | `[]` |

### A routine of a profile

A profile holds at most 64 routines. See [section 22](../design/kernel-architecture.md#22-routines) and the [routines guide](../guide/routines.md).

| Key | Meaning | Default |
|---|---|---|
| `name` | Unique within the agent | required |
| `version` | A positive integer that the workbench raises on every change | required |
| `standing` | `shadow` decides beside the agent and never acts. `live` acts in place of the model | required |
| `canary` | The share of the runs of a live routine that the agent handles anyway | `0.05` |
| `decider` | A key of `deciders`. A routine with questions needs one | `""` |
| `questions` | Typed questions by id: `type` (`choice`, `noul`, or `score`), `instructions`, `criteria`, `act`, `expect`, and `observe` | `{}`, at most 16 |
| `steps` | Tool calls in order: `tool`, `input` (a template), `as`, and `compare` | `[]`, at most 16 |
| `after` | Tool calls after the steps: `tool` and `input`, with the text that the result must hold (`contains`) and must not hold (`lacks`) | `[]` |
| `answer` | A template: the output of a run that the routine completes | `""` |

## Storage and messages

| Key | Meaning | Default |
|---|---|---|
| `secrets.driver` | `env`, `vault`, or `gsm` | `env` |
| `secrets.options` | Driver options | `{}` |
| `ledger.driver` | `file` or `mem`. One writer process owns a file root | `file` |
| `ledger.path` | `file`: the directory | `<home>/runs` |
| `ledger.url` | The server of a ledger driver that a program registers. `file` and `mem` do not read it | `""` |
| `ledger.options` | Driver options | `{}` |
| `bus.driver` | `mem`, `nats`, `redis`, or `kafka` | `mem` |
| `bus.url` | Such as `nats://nats:4222` | `""` |
| `bus.intake` | The queue to take run requests from, such as `fw.jobs.reviewer` | `""` |
| `bus.intakeRetries` | Times a failed job goes on the queue again as a new run | `0` |
| `bus.deadLetter` | Send a record of each failed or rejected job to `<intake>.dead` | `true` |
| `bus.egress` | The subject prefix to publish ledger events to, such as `fw.events` | `""` |
| `bus.egressTypes` | The event types to publish | `[]`, every type |
| `bus.egressMaxBytes` | Cut each string value of a published event to this many bytes. The ledger stays whole | `0`, no cut |
| `bus.options` | Driver options. `nats` and `redis` take `concurrency` | `{}` |
| `tokens.url` | The address of the workbench that brokers the tokens of people | `""`, off |
| `tokens.credential` | The secrets name of the bearer token for the broker | `""`, `auth.tokenEnv` |
| `tokens.subject` | The bus subject of the notices of the broker | `fw.connections` |

## Packages and the harness

These two blocks work only in `fw`. The block `environment` installs packages on the durable volume ([section 18](../design/kernel-architecture.md#18-environments)). The block `harness` makes every run a session of opencode or Claude Code ([section 19.1](../design/kernel-architecture.md#191-configuration)).

| Key | Meaning | Default |
|---|---|---|
| `environment.on` | Turn the packages on. With `false`, the tool `env` only lists | `true` |
| `environment.ask` | Let the agent ask for a package through the tool `env` | `true` |
| `environment.packages.python`, `environment.packages.tools` | Plain lists of packages for `uv` and for `pixi`, in place of a manifest | none |
| `environment.mirrors.python`, `environment.mirrors.tools` | The package index of `uv` and the conda-forge mirror of `pixi` | `""` |
| `environment.python` | A `pyproject.toml` with `uv.lock` next to it | `""` |
| `environment.tools` | A `pixi.toml` with `pixi.lock` next to it | `""` |
| `environment.prepare` | Shell commands after the install, once per digest | `[]` |
| `environment.placement` | `durable` installs at run time. `image` means the image holds the packages | `durable` |
| `environment.dir` | The install directory | `/workspace/.environment` under ax, else `./.environment` |
| `environment.cache` | The download cache | `/workspace/.cache` under ax, else `./.cache` |
| `environment.brief` | Add the Environment section to the system prompt | `true` |
| `harness.kind` | `opencode` or `claude-code` | required |
| `harness.home` | `HOME` of the hosted program | `.harness` beside the home of `fw` |
| `harness.command` | The program and its first arguments | `opencode serve`, or `claude` |
| `harness.port` | `opencode` only: the loopback port | `0`, a free port |

## Where the example and the code differ

`examples/fw.yaml` labels `ledger.url` as the server of `nats` and `redis`, but no ledger driver of that name exists, so the code wins. The example shows no `environment.packages`, `environment.mirrors`, `environment.on`, or `environment.ask`, but the code reads them. Some values in the example are samples, not defaults: `tools.files.root: /workspace`, `tools.http.allow`, `access.admins: ["local:*"]`, `models.fast`, `maxRuns: 16`, and the `tools.mcp`, `tools.peers`, and profile entries. The tables above give the defaults of the code.

<div class="paths" markdown>

- [Workbench configuration <span>The block workbench</span>](workbench-configuration.md)
- [fw commands <span>How fw finds and prints its configuration</span>](fw-commands.md)

</div>

## Sources

- `featherweight-kernel/examples/fw.yaml`
- `featherweight-kernel/fw/config.go`
- `featherweight-kernel/fw/run.go`
- `featherweight-kernel/fw/authz.go`
- `featherweight-kernel/fw/policy.go`
- `featherweight-kernel/fw/clock.go`
- `featherweight-kernel/fw/decider.go`
- `featherweight-kernel/fw/routine.go`
- `featherweight-kernel/fw/outcome.go`
- `featherweight-kernel/fw/prices.go`
- `featherweight-kernel/fw/kernel.go`
- `featherweight-kernel/fw/workspace.go`
- `featherweight-kernel/config/config.go`
- `featherweight-kernel/config/env.go`
- `featherweight-kernel/config/expand.go`
- `featherweight-kernel/ax/config.go`
- `featherweight-kernel/ax/binding.go`
- `featherweight-kernel/env/config.go`
- `featherweight-kernel/harness/harness.go`
- `featherweight-kernel/cli/setup.go`
- `featherweight-workbench/cmd/fw-workbench/drivers.go`
- `featherweight-workbench/surface/mcp/mcp.go`
- `featherweight-workbench/tools/builder/propose_agent.go`
