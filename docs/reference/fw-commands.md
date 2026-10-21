# fw commands

`fw` is the kernel binary: one agent in one process. Each command is one verb. This page lists every verb with its flags, as `cli/cli.go` and the files next to it define them. The design document describes the command line in [section 12.9](../design/kernel-architecture.md#129-the-command-line).

The form is `fw [global flags] <verb> [flags] [arguments]`. A flag can come before, between, or after the positional arguments. Everything after `--` is positional. The Go flag package accepts one dash or two, so `-follow` and `--follow` are the same flag.

## How fw finds its configuration

Every verb loads the configuration in the same order:

1. The file. `-config` names it. Without the flag, `fw` looks in this order: `$FW_CONFIG`, then `./fw.yaml`, then `<home>/fw.yaml`. The first file that exists wins. The home is `-home`, else `$FW_HOME`, else the default home. If `/workspace` is a directory, the default home is `/workspace/.fw`, else `./.fw`. If `$FW_CONFIG` names a missing file, the load reports the missing file instead of another one.
2. The `FW_*` variables. `bus.url` is `FW_BUS_URL`. The [configuration page](configuration.md) has the mapping rule.
3. The global flags `-home`, `-listen`, and `-log`.

The log level comes from `-log`, else `FW_TELEMETRY_LOG`, else `FW_LOG`, else `info`, until the configuration loads and `telemetry.log` applies. Logs are JSON lines on standard error.

Two cases need no verb. When the process runs under ax, `fw` with no arguments runs `serve`. When the binary is started under the name `ax-task-runner`, `cmd/fw/main.go` puts `serve` in front of the arguments.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Success, or a run that completed |
| `1` | An error, a run that failed, or a `doctor` check that failed |
| `2` | A canceled run, or a bad command line |

## Global flags

Every verb accepts these flags.

| Flag | Meaning | Default |
|---|---|---|
| `-config file` | The configuration file | `$FW_CONFIG`, `./fw.yaml`, or `$FW_HOME/fw.yaml` |
| `-log level` | The log level: `debug`, `info`, `warn`, or `error` | `info` |
| `-home dir` | The fw home directory | `$FW_HOME`, `/workspace/.fw`, or `./.fw` |
| `-listen address` | The listen address, for example `:8080` | `listen` of the configuration |

## fw run

Runs one input and prints the output. The verb prints one line per event to standard error and the output to standard output. When a tool needs an approval and standard input is a terminal, the verb asks `allow? [y/N]`. Otherwise it denies the approval.

```sh
fw run [flags] "<input>"
```

The words of the input are joined with spaces. An input of `-` reads standard input. The profile flags build an inline profile for this run only. `-tools` and `-skills` take comma-separated globs, and the word `none` allows nothing. A value of `@path` for `-system` or `-i` reads the file at that path.

| Flag | Meaning | Default |
|---|---|---|
| `-agent name` | The agent profile | `$FW_AGENT`, else `default` |
| `-json` | Print the run object as JSON instead of the output | off |
| `-no-approve` | Deny every approval and question without asking | off |
| `-system text` | The system prompt, or `@path`. It replaces the prompt of the profile | the profile |
| `-instructions text`, `-i text` | Text that follows the system prompt, or `@path`. Repeat the flag for more | none |
| `-tools globs` | Globs over the tool names the run can call, for example `files,git.*` | the profile |
| `-skills globs` | Globs over the skill names the run can use | the profile |
| `-model selector` | A model selector such as `anthropic/claude-haiku-5-5`, or a name from `models` | the profile |
| `-effort effort` | The reasoning effort: `low`, `medium`, `high`, `xhigh`, or `max` | the profile |
| `-time-zone zone` | The IANA time zone of the run, for example `America/Chicago` | the profile |
| `-max-turns count` | The most model turns | the budget |
| `-deadline duration` | The most working time, for example `30m`. Time spent waiting does not count | the budget |
| `-max-tool-calls count` | The most tool calls in the run | the budget |

If the run stops at a budget limit, the verb names the limit and the flag or key that raises it. The exit code follows the state of the run.

The verb opens the configured ledger as its writer. One process owns a file ledger at a time, so `fw run` beside a running `fw serve` with the same home fails with `fw: file ledger: another writer owns this root`. Give the second process another home with `-home`.

## fw serve

Serves every enabled surface on one listener. Under ax, or with `-task-file` or `-workspace-file`, the verb runs the ax boot sequence of [section 11.3](../design/kernel-architecture.md#113-boot-sequence-under-ax) instead: it listens at once with a boot handler, prepares the workspaces, loads the configuration, resumes unfinished runs, and then swaps in the agent.

```sh
fw serve [flags]
```

| Flag | Meaning | Default |
|---|---|---|
| `-task-file file` | Read the ax Task from this file instead of `AX_TASK_YAML` | none |
| `-workspace-file file` | Read ax Workspaces from this file instead of `AX_WORKSPACES_YAML`. Repeat the flag for more files | none |
| `-port port` | Listen on this port on every interface. It wins over `-listen` | none |
| `-metadata-port port` | Serve the ax metadata endpoints on this loopback port. `0` picks a free port | `8099` |

Under ax the listener is `:80` unless `-listen` or `-port` says otherwise. Under ax, `spec.command` of the Task decides what runs after the boot: nothing serves, `fw run` and `fw serve` run in process, and any other command runs as a supervised child. Without a command, `FW_GOAL` starts one run.

## fw mcp

Serves the MCP server over standard input and output, as the local principal `local:<user>`. The kernel binary does not link the MCP server, so `fw mcp` fails with a message that names `fw-workbench mcp`.

```sh
fw mcp
```

The verb has no flags of its own.

## fw init

Writes a starter `fw.yaml`, `prompts/default.md`, and the directories `agents` and `skills` into a directory. It never overwrites a file, and it loads the file it wrote to make sure that the starter is valid.

```sh
fw init [<dir>]
```

The verb has no flags of its own. The directory is `.` by default. The starter `fw.yaml` names the model `anthropic/claude-opus-5-5`, the effort `high`, and the built-in tools `bash`, `files`, `http`, `memory`, `recall`, `skill`, `clock`, `ask_user`, `spawn_task`, and `await_task`.

## fw doctor

Checks the installation, one line per check. The checks cover the configuration, the home, the tool user, the time zone, the authentication, TLS, the access rules, and the control plane. They also cover the credential, the model, the tool sources, the token broker, the telemetry, the bus, the ledger, the skills, and the memory. Inside an ax Task, `cli/doctor_ax.go` adds the lines `ax reach`, `ax trust bundle`, `ax tools user`, and `ax durable`. Outside ax, one line says that they do not apply.

```sh
fw doctor [flags]
```

| Flag | Meaning | Default |
|---|---|---|
| `-timeout limit` | The limit of each check that reaches a provider or a server | `10s` |

The memory check is the last line. It names the scope, the index of this build, and the count of the notes of the profile `default`:

```
ok    memory: scope agent, index scan, 3 notes of the profile default
```

The index is `scan`, or `sqlite-fts5` in a build with the tag `memory_sqlite`. If the store does not open or cannot list its notes, the line reads `FAIL  memory:` with the error. The ledger check writes into `<root>/.doctor`, a directory of its own, so it runs beside a server.

If any check fails, the exit code is `1`.

## fw agents

Lists the agent profiles, prints one, or puts and deletes one. The verb acts as the local principal. The kernel writes no profile: `put` and `delete` answer with an error that names `fw-workbench agents`.

```sh
fw agents [flags] [<name> | put <file.yaml> | delete <name>]
```

| Flag | Meaning | Default |
|---|---|---|
| `-json` | Print the profiles as JSON | off, a table or YAML |
| `-name name` | `put`: the profile name, in place of the one in the file | the `name` field, else the file name |

The list shows the name, the description, the model, and the access block of each profile. An access of `-` means that the profile follows `access.default`.

## fw whoami

Prints the local principal: the subject `local:<user>`, the name, the kind `local`, and whether `access.admins` names it. The last line says which commands act as it. `fw mcp` and `fw agents` always act as it. If `access.default` is `closed`, or if a control plane decides, then `fw run`, `fw events`, and `fw replay` act as it too.

```sh
fw whoami [flags]
```

| Flag | Meaning | Default |
|---|---|---|
| `-json` | Print the principal as JSON | off |

## fw tools

Lists the tools of every source: the built-in tools, the MCP servers, and the A2A peers of the configuration. The table shows the name, the flags, the source, and the first line of the description. The flags are `readonly`, `idempotent`, `destructive`, `parallel`, and `trusted`.

```sh
fw tools [flags]
```

| Flag | Meaning | Default |
|---|---|---|
| `-json` | Print the tool specifications as JSON | off |

## fw skills

Lists the skills of the configured skill directories, or prints the `SKILL.md` file of one skill. The verb reads the directories without an agent, so it works without a model credential.

```sh
fw skills [flags] [<name>]
```

| Flag | Meaning | Default |
|---|---|---|
| `-json` | Print the skills as JSON, with the directory and the files of each | off |

## fw events

Prints the events of a run from the configured ledger. The verb opens the ledger without a kernel, so it never resumes a run. It opens a file ledger read-only, without the writer lock, so it reads beside a running server (`fw.OpenFileLedgerReadOnly`). A read-only open never repairs or creates a file. Another ledger driver opens as the driver defines.

```sh
fw events [flags] <run-id>
```

| Flag | Meaning | Default |
|---|---|---|
| `-follow` | Keep printing new events until the run finishes | off |
| `-from number` | The first sequence number to print | `0` |
| `-format format` | The output format: `jsonl` or `text` | `jsonl` |

With `-follow`, the verb reads the ledger again every 250 milliseconds until the last event is terminal. Without `-follow`, a run with no events exits with `1`.

## fw replay

Replays a recorded run against a model and prints the new run. The replay feeds the recorded tool results to the model, so it is a regression test for a model change. See [section 4.6](../design/kernel-architecture.md#46-replay).

```sh
fw replay [flags] <run-id>
```

| Flag | Meaning | Default |
|---|---|---|
| `-model selector` | The model selector, or a key of `models`, for the replay. It replaces the model of every profile | the configured model |
| `-ledger dir` | The root directory of the file ledger that holds the run | the configured ledger |
| `-json` | Print the new run as JSON instead of the output | off |

`-ledger` opens that directory read-only, so the source can be the ledger of a running server. The new run goes to the configured ledger of the replay, which needs its writer lock. To replay a run of a live server, give the replay another home with `-home`, and name the ledger of the server with `-ledger`.

The design document, section 4.6, still writes `fw replay <ledger>`. The code takes a run id, and `-ledger` names another ledger directory, so the code wins.

## fw card

Prints the A2A agent card as JSON.

```sh
fw card
```

The verb has no flags of its own. If the binary is a `lean` build without the tag `a2a`, the A2A surface is not linked, and the verb fails.

## fw config

Prints the resolved configuration as YAML, with every secret masked.

```sh
fw config
```

The verb has no flags of its own.

## fw env

Prints every configuration variable, one per line. If a variable is set, the line also holds `=` and its value. A secret value prints as `***`. After the configuration variables, the verb lists the other variables that `fw` reads, such as `FW_CONFIG`, `FW_API_TOKEN`, and the provider keys. Then it lists the map and list entries that are set, such as `FW_TOOLS_MCP_GIT_ENDPOINT`.

```sh
fw env [flags]
```

| Flag | Meaning | Default |
|---|---|---|
| `-set` | Print only the variables that are set | off |

### fw env dockerfile

Prints a Dockerfile that bakes the block `environment` of `fw.yaml` into an image, for `environment.placement: image`. It builds nothing. See [section 18.10](../design/kernel-architecture.md#1810-fw-env-dockerfile).

```sh
fw env dockerfile -from <image>
```

| Flag | Meaning | Default |
|---|---|---|
| `-from image` | The base image, such as `fw:toolbox` by digest (required) | none |

The verb needs the package `env`, which a `lean` build carries only with the tag `env`.

## fw ax

Renders, starts, inspects, and deletes one ax Task for a profile file, without a front. The verbs dial the ax API over gRPC and reach the kernel through the atenet router. Outside the cluster, forward `svc/ax-server` and `svc/atenet-router` first. See [section 21](../design/kernel-architecture.md#21-fw-ax-and-the-doctor-in-a-task).

```sh
fw ax <render|up|status|events|down> [flags]
```

Every subverb takes `-name` and `-atespace`. The other flags belong to the subverbs that the table names.

| Flag | Subverbs | Meaning | Default |
|---|---|---|---|
| `-name name` | all | The name of the Task (required) | none |
| `-atespace atespace` | all | The atespace of the Task | `default` |
| `-f file` | `render`, `up` | The profile file: a fragment of `fw.yaml`, such as `policy`, `access`, and `agents` | none |
| `-image image` | `render`, `up` | The image of the Task by digest, `name@sha256:...` (required) | none |
| `-egress destination` | `render`, `up` | Allow one more destination: `host:port` (http), `tls:host:port`, `https:host:port`, or a URL. Repeat the flag for more | none |
| `-env NAME=VALUE` | `render`, `up` | Set a variable in `spec.env` of the Task. Repeat the flag for more | none |
| `-workspace-file path=localpath` | `render`, `up` | Ship a local file in the Workspace at `path`. Repeat the flag for more | none |
| `-debug` | `render`, `up` | Set `spec.debug`, which turns on the guest services of `ax ssh`. They carry no authentication | off |
| `-server address` | `up`, `status`, `down` | The ax API address | `$AX_SERVER`, else `ax.server` |
| `-router address` | `up`, `status`, `events` | The atenet router address | `ax.router` |
| `-timeout duration` | `up` | How long to wait until `/readyz` answers | `10m` |
| `-format format` | `events` | The output format: `jsonl` or `text` | `jsonl` |

### fw ax render

Prints the Workspace and the Task as YAML, in the order of the apply, with a placeholder `<secret: NAME>` for each secret. The image must carry a digest.

```sh
fw ax render -f <profile file> -name <task> -image <image@sha256:...>
```

### fw ax up

Applies the Workspace and the Task, resumes the Task, and waits for `/readyz` through the router. It sends the value of each secret from `-env` or from its own environment.

```sh
fw ax up -f <profile file> -name <task> -image <image@sha256:...>
```

### fw ax status

Prints the Task and `GET /v1/status` of its kernel.

```sh
fw ax status -name <task>
```

### fw ax events

Prints the ledger of a run through the router.

```sh
fw ax events -name <task> <run-id>
```

### fw ax down

Deletes the Task and its Workspace. It tries a delete that Substrate refuses for one minute.

```sh
fw ax down -name <task>
```

## fw version

Prints the version, the commit, and the Go version with the platform.

```sh
fw version
```

The verb has no flags of its own. The commit comes from the link flags, else from the VCS revision that the Go toolchain stamped, else `unknown`.

## Verbs that do not exist

There is no `fw fork` verb. A branch of a run comes from `POST /v1/runs/{id}/fork` on the [HTTP API](http-api.md) or from the MCP tool `fork` of the workbench.

## Sources

- `featherweight-kernel/cli/cli.go`
- `featherweight-kernel/cli/verbs.go`
- `featherweight-kernel/cli/run.go`
- `featherweight-kernel/cli/serve.go`
- `featherweight-kernel/cli/ax.go`
- `featherweight-kernel/cli/env.go`
- `featherweight-kernel/cli/identity.go`
- `featherweight-kernel/cli/setup.go`
- `featherweight-kernel/cli/doctor.go`
- `featherweight-kernel/cli/doctor_ax.go`
- `featherweight-kernel/cmd/fw/main.go`
- `featherweight-kernel/cmd/fw/drivers.go`
- `featherweight-kernel/cmd/fw/driver_env.go`
- `featherweight-kernel/cmd/fw/driver_a2a.go`
- `featherweight-kernel/config/config.go`
- `featherweight-kernel/fw/agent.go`
- `featherweight-kernel/fw/ledger_file.go`
- `featherweight-kernel/memory/index_scan.go`
- `featherweight-kernel/memory/index_fts.go`
- `featherweight-kernel/ax/config.go`
- `featherweight-kernel/surface/axmeta/axmeta.go`
- `featherweight-kernel/README.md`
- `featherweight-kernel/docs/ARCHITECTURE.md` (section 12.9)
