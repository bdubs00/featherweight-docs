---
wide: true
---

# fw commands

The kernel binary runs one agent in one process. This page lists every command that it takes, with the flags, grouped by what you want to do. The workbench binary takes the same commands, and [fw-workbench commands](fw-workbench-commands.md) lists what it adds.

The column In says which binary serves a command. `both` means `fw` and `fw-workbench`. A `lean` build of `fw` leaves some commands out, and the table says which.

## The form of a command

```sh
fw [global flags] <command> [flags] [arguments]
```

A flag can come before, between, or after the arguments. Everything after `--` is an argument. One dash and two dashes are the same, so `-follow` and `--follow` name one flag. `fw help` and `fw <command> -h` print the usage.

Two cases need no command. Under ax, `fw` with no arguments runs `serve`. A binary started under the name `ax-task-runner` puts `serve` in front of its arguments.

### Global flags

Every command takes these flags.

| Flag | What it sets | Default |
|---|---|---|
| `-config file` | The configuration file | `$FW_CONFIG`, else `./fw.yaml`, else `<home>/fw.yaml`: the first that exists |
| `-home dir` | The home directory of `fw`: runs, memory, agents, and skills | `$FW_HOME`. Else, under a `/workspace` directory, `/workspace/.fw`. Else `./.fw` |
| `-listen address` | The listen address, such as `:8080` | `listen` of the configuration |
| `-log level` | `debug`, `info`, `warn`, or `error` | `FW_TELEMETRY_LOG`, else `FW_LOG`, else `info`, until `telemetry.log` loads |

The configuration loads in this order: the file, then the `FW_*` variables, then the global flags. If `$FW_CONFIG` names a missing file, the load fails on that file. The [configuration page](configuration.md) explains the variables. Logs are JSON lines on standard error.

### Exit codes

| Code | Meaning |
|---|---|
| `0` | Success, or a run that completed |
| `1` | An error, a run that failed, or a `doctor` check that failed |
| `2` | A canceled run, or a bad command line |

## Set up and check

| Command | In | What it does | Flags and details |
|---|---|---|---|
| `fw init [dir]` | both | Writes a starter `fw.yaml`, `prompts/default.md`, and the directories `agents` and `skills` | No flags. The directory is `.` by default. It never overwrites a file, and it loads the file it wrote to make sure that the starter is valid |
| `fw doctor` | both | Checks the installation, one line per check | `-timeout limit`: the limit of each check that reaches a provider or a server, default `10s` |
| `fw config` | both | Prints the resolved configuration as YAML, with every secret masked | No flags |
| `fw env` | both | Prints every configuration variable, one per line. A variable that is set also shows `=value`, and a secret shows `***` | `-set`: print only the variables that are set |
| `fw env dockerfile` | `fw` | Prints a Dockerfile that bakes the block `environment` into an image, for `environment.placement: image`. It builds nothing | `-from image`: the base image by digest, required. A `lean` build needs the tag `env` |
| `fw version` | both | Prints the version, the commit, and the Go version with the platform | No flags. The commit comes from the link flags, else the VCS stamp, else `unknown` |

### What fw init writes {#fw-init}

The starter `fw.yaml` sets no model, because a paid model is never a built-in choice. It shows one commented `model` line for each provider: `anthropic/claude-opus-5-5`, `gemini/gemini-3.8-flash`, and `openai/<model>`. It sets the effort `high`, `compaction.at: 262144`, and an empty `tools.memory.scope`. Its list of built-in tools is the default list of `tools.builtin`, with `decide` at the end. After the paths, the command prints this line:

```
A model must be set: without model in fw.yaml, FW_MODEL, or the model of a profile, fw refuses every run.
```

Remove the `#` of one `model` line in `fw.yaml`, or export `FW_MODEL`, before the first run.

### What fw doctor checks {#fw-doctor}

The first checks are the configuration, the home, the tools user, the time, the authentication, TLS, and the access rules. Next come the control plane, the credential, the model, the tool sources, the token broker, the telemetry, and the bus. The checks of linked packages, the ledger, the skills, and the memory come last. The package `environment` adds a line. Inside an ax Task, the lines `ax reach`, `ax trust bundle`, `ax tools user`, and `ax durable` follow. Outside ax, one line says that they do not apply.

Each line starts with `ok`, `warn`, or `FAIL`. A `FAIL` line sets the exit code to `1`. A `warn` line names a risk of a setup that works. Two examples are a configuration without a model and the memory scope `agent` inside an ax Task. The ledger check writes into `<root>/.doctor`, so it runs beside a server.

### What fw env lists {#fw-env}

After the configuration variables, `fw env` lists the other variables that `fw` reads: `ANTHROPIC_API_KEY`, `FW_AGENT`, `FW_API_TOKEN`, `FW_ATESPACE`, `FW_CONFIG`, `FW_LOG`, `FW_MCP_STATE_KEY`, `GEMINI_API_KEY`, `GOOGLE_API_KEY`, `OPENAI_API_KEY`, and `SPIFFE_ENDPOINT_SOCKET`. Then it lists the map and list entries that are set, such as `FW_TOOLS_MCP_GIT_ENDPOINT`.

## Start and watch runs

| Command | In | What it does | Flags and details |
|---|---|---|---|
| `fw run "<input>"` | both | Runs one input and prints the output. Events go to standard error, one line each | The flags of the table below. An input of `-` reads standard input |
| `fw serve` | both | Serves every enabled surface on one listener | The flags of the table below |
| <span id="fw-events"></span>`fw events <run-id>` | both | Prints the events of a run from the ledger. It opens a file ledger read-only, so it works beside a server and never resumes a run | `-follow`: print new events until the run ends, read every 250 ms. `-from number`: the first sequence number, default `0`. `-format`: `jsonl` (default) or `text` |
| <span id="fw-replay"></span>`fw replay <run-id>` | both | Runs a recorded run again against a model, with the recorded tool results. It is a regression test for a model change | `-model selector`: the model of the replay. `-ledger dir`: the file ledger that holds the run, opened read-only. `-json`: print the new run as JSON |

### fw run

The words of the input are joined with spaces. If a tool needs an approval and standard input is a terminal, the command asks `allow? [y/N]`. Otherwise it denies the approval. The profile flags build an inline profile for this run only.

| Flag | What it sets | Default |
|---|---|---|
| `-agent name` | The agent profile | `$FW_AGENT`, else `default` |
| `-json` | Print the run object as JSON instead of the output | off |
| `-no-approve` | Deny every approval and question without asking | off |
| `-system text` | The system prompt, or `@path` to read a file. It replaces the prompt of the profile | the profile |
| `-instructions text`, `-i text` | Text after the system prompt, or `@path`. Repeat the flag for more | none |
| `-tools globs` | Comma-separated globs over the tool names, such as `files,git.*`. `none` allows nothing | the profile |
| `-skills globs` | Comma-separated globs over the skill names. `none` allows no skill | the profile |
| `-model selector` | A selector such as `anthropic/claude-haiku-5-5`, or a name from `models` | the profile |
| `-effort effort` | `low`, `medium`, `high`, `xhigh`, or `max` | the profile |
| `-time-zone zone` | The IANA time zone of the run, such as `America/Chicago` | the profile |
| `-max-turns count` | The most model turns | the budget |
| `-deadline duration` | The most working time, such as `30m`. Time spent waiting does not count | the budget |
| `-max-tool-calls count` | The most tool calls of the run | the budget |

If the run stops at a budget limit, the command names the limit and the flag or key that raises it. The exit code follows the state of the run.

!!! warning
    If `fw serve` runs with the same home, `fw run` fails with `fw: file ledger: another writer owns this root`. One process owns a file ledger at a time. Give the second process another home with `-home`.

### fw serve

Under ax, or with `-task-file` or `-workspace-file`, the command runs the ax boot sequence. It listens at once with a boot handler, prepares the workspaces, loads the configuration, resumes unfinished runs, and then swaps in the agent. See [section 11.3](../design/kernel-architecture.md#113-boot-sequence-under-ax).

| Flag | What it sets | Default |
|---|---|---|
| `-task-file file` | Read the ax Task from this file instead of `AX_TASK_YAML` | none |
| `-workspace-file file` | Read ax Workspaces from this file instead of `AX_WORKSPACES_YAML`. Repeat the flag for more | none |
| `-port port` | Listen on this port on every interface. It wins over `-listen` | none |
| `-metadata-port port` | Serve the ax metadata endpoints on this loopback port. `0` picks a free port | `8099` |

At boot, the command takes the writer lock of the file ledger. If another `fw` holds it, the command tries again every half second for 30 seconds. Then it exits with an error that asks you to stop the other process. Under ax, the listener is `:80` unless `-listen` or `-port` says otherwise. The command `spec.command` of the Task decides what runs after the boot. Without a command, `FW_GOAL` starts one run.

To replay a run of a live server, give `fw replay` another home with `-home`. Name the ledger of the server with `-ledger`.

## Agents, tools, and identity

| Command | In | What it does | Flags and details |
|---|---|---|---|
| <span id="fw-agents"></span>`fw agents [name]` | both | Lists the agent profiles, or prints one as YAML. The list shows the name, the description, the model, and the access block. An access of `-` follows `access.default` | `-json`: print JSON |
| `fw agents put <file.yaml>` | `fw-workbench` | Writes a profile under `<home>/agents`. In `fw`, it fails with a message that names `fw-workbench agents` | `-name name`: the profile name, in place of the one in the file |
| `fw agents delete <name>` | `fw-workbench` | Removes a profile file. In `fw`, it fails as `put` does | none |
| `fw whoami` | both | Prints the local principal `local:<user>`, its kind `local`, whether `access.admins` names it, and which commands act as it | `-json`: print JSON |
| `fw tools` | both | Lists the tools of every source: built-in, MCP servers, and A2A peers, with the flags `readonly`, `idempotent`, `destructive`, `parallel`, and `trusted` | `-json`: print the tool specifications |
| `fw skills [name]` | both | Lists the skills of the skill directories, or prints the `SKILL.md` of one. It needs no model credential | `-json`: print JSON with the directory and the files of each skill |
| `fw card` | both | Prints the A2A agent card as JSON | No flags. A `lean` build needs the tag `a2a` |
| <span id="fw-mcp"></span>`fw mcp` | `fw-workbench` | Serves the MCP server over standard input and output, as `local:<user>`. In `fw`, it fails with a message that names `fw-workbench mcp` | No flags |

`fw mcp` and `fw agents` always act as the local principal. If `access.default` is `closed`, or a control plane decides, then `fw run`, `fw events`, and `fw replay` act as it too. Otherwise they are trusted.

## Routines {#fw-routine}

A routine is a vetted list of tool calls that the kernel can run in place of the model. These commands check a routine against recorded runs, or write one from them. See [section 22.4](../design/kernel-architecture.md#224-replay-and-propose) and the [routines guide](../guide/routines.md).

| Command | In | What it does | Flags and details |
|---|---|---|---|
| `fw routine replay` | both | For each recorded run, renders the steps with the answers of the agent and compares each input with the call that the agent made. It prints matched, diverged, handed to the agent, and unreadable runs | `-routine file` (required): the routine, YAML or JSON. `-ledger dir`: a file ledger, opened read-only. `-agent name`: read only the runs of this agent. `-decide`: also ask the questions of the routine on each input and score the answers. `-json`: print JSON |
| `fw routine propose` | both, not `lean` | Makes a routine from the runs of an agent that completed and that no one sent back | `-agent name` (required). `-ledger dir`. `-runs ids`: only these runs, comma-separated. `-out file`: write the routine to a file, default standard output. `-name name`: default the agent name. `-decider name`: a key of `deciders`. `-json`: print the routine and the proposal |

A `lean` build carries `routine propose` only with the tag `propose`. A proposal that cannot fill every value says `Not complete` in its first lines.

## One Task on AX {#fw-ax}

`fw ax` renders, starts, inspects, and deletes one ax Task for a profile file, without a front. It dials the ax API over gRPC and reaches the kernel through the atenet router. Outside the cluster, forward `svc/ax-server` and `svc/atenet-router` first. See [section 21](../design/kernel-architecture.md#21-fw-ax-and-the-doctor-in-a-task).

| Command | In | What it does |
|---|---|---|
| `fw ax render -f <file> -name <task> -image <image@sha256:...>` | both | Prints the Workspace and the Task as YAML, in the order of the apply, with `<secret: NAME>` for each secret |
| `fw ax up -f <file> -name <task> -image <image@sha256:...>` | both | Applies the Workspace and the Task, resumes the Task, and waits for `/readyz` through the router. It sends each secret from `-env` or from its own environment |
| `fw ax status -name <task>` | both | Prints the Task and `GET /v1/status` of its kernel |
| `fw ax events -name <task> <run-id>` | both | Prints the ledger of a run through the router |
| `fw ax down -name <task>` | both | Deletes the Task and its Workspace. It retries a refused delete for one minute |

| Flag | Subcommands | What it sets | Default |
|---|---|---|---|
| `-name name` | all | The name of the Task (required) | none |
| `-atespace atespace` | all | The atespace of the Task | `default` |
| `-f file` | `render`, `up` | The profile file: a fragment of `fw.yaml`, such as `policy`, `access`, and `agents` | none |
| `-image image` | `render`, `up` | The image by digest, `name@sha256:...` (required) | none |
| `-egress destination` | `render`, `up` | One more destination, as `spec.egress.hosts` takes it: a host for TLS on port 443, `http://host[:port]`, `https://host[:port]`, or a `ws`, `wss`, or `rediss` URL. Repeat for more | none |
| `-env NAME=VALUE` | `render`, `up` | A variable in `spec.env`. Repeat for more | none |
| `-workspace-file path=localpath` | `render`, `up` | Ship a local file in the Workspace at `path`. Repeat for more | none |
| `-debug` | `render`, `up` | Set `spec.debug`, which turns on the guest services of `ax ssh`. They carry no authentication | off |
| `-server address` | `up`, `status`, `down` | The ax API address | `$AX_SERVER`, else `ax.server` |
| `-router address` | `up`, `status`, `events` | The atenet router address | `ax.router` |
| `-timeout duration` | `up` | How long to wait for `/readyz` | `10m` |
| `-format format` | `events` | `jsonl` or `text` | `jsonl` |

## Commands that do not exist

There is no `fw fork`. A branch of a run comes from `POST /v1/runs/{id}/fork` on the [HTTP API](http-api.md), or from the MCP tool `fork`.

The design document, section 4.6, writes `fw replay <ledger>`. The code takes a run id, and `-ledger` names the ledger directory, so the code wins.

<div class="paths" markdown>

- [fw-workbench commands <span>The commands that the workbench adds</span>](fw-workbench-commands.md)
- [Configuration <span>Every key of fw.yaml</span>](configuration.md)

</div>

## Sources

- `featherweight-kernel/cli/cli.go`
- `featherweight-kernel/cli/verbs.go`
- `featherweight-kernel/cli/run.go`
- `featherweight-kernel/cli/serve.go`
- `featherweight-kernel/cli/setup.go`
- `featherweight-kernel/cli/env.go`
- `featherweight-kernel/cli/identity.go`
- `featherweight-kernel/cli/doctor.go`
- `featherweight-kernel/cli/doctor_ax.go`
- `featherweight-kernel/cli/routine.go`
- `featherweight-kernel/cli/routine_propose.go`
- `featherweight-kernel/cli/ax.go`
- `featherweight-kernel/cmd/fw/main.go`
- `featherweight-kernel/cmd/fw/drivers.go`
- `featherweight-kernel/cmd/fw/driver_a2a.go`
- `featherweight-kernel/cmd/fw/driver_env.go`
- `featherweight-kernel/Makefile`
- `featherweight-kernel/fw/config.go`
- `featherweight-kernel/docs/ARCHITECTURE.md` (sections 4.6, 11.3, 12.9, 21, 22)
