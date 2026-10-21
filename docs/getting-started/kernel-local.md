# Run the kernel on your machine

The kernel is `fw`, one static Go binary that runs one agent. This page builds it, writes a starter configuration, and runs one task from the terminal. Then it serves the HTTP API and follows a run through its ledger, the append-only log of the run. Nothing on this page needs a cluster.

## Prerequisites

You need three things:

- Go 1.27 or newer on your `PATH`. The module file of the kernel names `go 1.27.1`.
- `make`. The Makefile calls `go` from your `PATH`. To use another toolchain, set `GO`, for example `make GO=/opt/go/bin/go build`.
- A model. The kernel has no default model. A process without one boots, serves, and refuses every run until `model`, `FW_MODEL`, or the profile of the run names one.

There are two ways to give the kernel a model:

| Choice | Selector | Credential | Endpoint |
|---|---|---|---|
| The Claude API | `anthropic/<model>` | `ANTHROPIC_API_KEY` | the public API |
| A local server that speaks the OpenAI chat completions API, such as vLLM, Ollama, or tabbyAPI | `openai/<model>` | `OPENAI_API_KEY` | `providers.openai.baseUrl`, or `FW_PROVIDERS_OPENAI_BASE_URL` |

A local server often needs no key. If `OPENAI_API_KEY` is not set, the OpenAI adapter sends no credential. `fw doctor` still reports the missing variable as a problem. If your server needs no key, set the variable to any value.

## Build

Clone the repository and build the binary:

```sh
git clone https://github.com/bdubs00/featherweight-kernel
cd featherweight-kernel
make build
```

`make build` writes `bin/fw`. `make test` runs every test with the race detector. Without a build tag the binary carries every driver. `TAGS=lean` builds the core alone, and each driver comes back with its own tag, for example `make build TAGS=lean,openai`.

## Write a configuration with fw init

Run `fw init` in the directory that holds your work:

```sh
./bin/fw init
```

It writes and creates these paths, and it never overwrites a file:

| Path | What |
|---|---|
| `fw.yaml` | the starter configuration, with one comment per key |
| `prompts/default.md` | the default system prompt |
| `agents/` | one profile file per agent, empty at first |
| `skills/` | one directory with a `SKILL.md` file per skill, empty at first |

`fw init <dir>` writes into another directory. The starter sets `home: .`, so the directory of `fw.yaml` is the home of the process. It also sets `model: anthropic/claude-opus-5-5`, `effort: high`, the built-in tool list, the budget, `compaction.at`, the time keys, and one profile named `default`. The kernel loads the file at once, so a broken starter fails here and not later.

To use a local server instead of the Claude API, change the model and add the endpoint:

```yaml
model: openai/qwen3-32b
providers:
  openai:
    baseUrl: http://127.0.0.1:8000/v1
```

The same two keys work as variables: `FW_MODEL` and `FW_PROVIDERS_OPENAI_BASE_URL`. Every key of `fw.yaml` maps to a variable by upper snake case, and a variable wins over the file. `fw env` prints every variable, and `fw config` prints the resolved configuration with secrets masked.

## Check the setup with fw doctor

Export the credential of your model, then run the doctor:

```sh
export ANTHROPIC_API_KEY=...
./bin/fw doctor
```

It prints one line per check, `ok` or `FAIL`. If any check fails, it exits with 1. Every check runs on its own, so one failure does not hide the others. `-timeout` bounds each check that reaches a provider or a server, 10 seconds by default. The lines are these:

| Line | What it checks |
|---|---|
| `configuration` | the file loads, or the defaults and the `FW_*` variables apply |
| `home` | the home directory exists and is writable |
| `tools user` | the user that runs the processes of tools |
| `time` | the time zone resolves, with the current time and the gap that starts a time note |
| `auth`, `auth token` | the authentication modes, and whether `FW_API_TOKEN` is set |
| `tls` | the certificate loads, or the listener speaks plain HTTP |
| `access` | the access default and the number of admins |
| `credential` | the secret of the provider of the model is set, without printing it |
| `model` | the model opens, and for a provider that lists its models, the name is in the list |
| `tool sources` | each MCP server and A2A peer answers `tools/list` |
| `tokens`, `telemetry`, `bus` | the token broker, the OTLP export, and the bus driver |
| `ledger` | the ledger appends one event and reads it back |
| `skills` | each skills directory exists and loads |

If a local server does not know the name you set, the `model` line names close matches.

## Run one task with fw run

Give the kernel one task:

```sh
./bin/fw run "List the files in this directory and say which one is the largest."
```

`fw run` prints one line per event to standard error and the final answer to standard output. The words of the input are joined by spaces, and `-` reads the input from standard input. The exit code is 0 for a completed run, 1 for a failed run, and 2 for a canceled run. If the run stops at a budget limit, the last line on standard error names the limit and the flag or key that raises it.

The flags shape the run without a change to the configuration:

| Flag | Meaning |
|---|---|
| `-agent <name>` | the profile, else `$FW_AGENT`, else `default` |
| `-system <text or @path>` | the system prompt, which replaces the prompt of the profile |
| `-instructions <text or @path>`, `-i` | text that follows the system prompt, repeatable |
| `-tools <globs>` | comma-separated globs over tool names, for example `files,git.*` |
| `-skills <globs>` | comma-separated globs over skill names, and `none` allows no skill |
| `-model <selector>` | a `provider/model` selector, or a name from `models` |
| `-effort <level>` | `low`, `medium`, `high`, `xhigh`, or `max` |
| `-time-zone <zone>` | an IANA zone such as `America/Chicago` |
| `-max-turns`, `-deadline`, `-max-tool-calls` | three of the budget limits, for example `-deadline 30m` |
| `-json` | print the run object as JSON instead of the output |
| `-no-approve` | deny every approval and question without asking |

The global flags come before or after the verb: `-config <file>`, `-home <dir>`, `-listen <address>`, and `-log <level>`.

### How an approval looks on the terminal

The default policy asks before a destructive tool call, and `bash` is destructive. The first run above therefore asks you on the terminal:

```
approval ap_7f3: tool bash
  input: {"command":"ls -lS"}
  reason: rule: ask destructive
allow? [y/N]
```

Type `y` or `yes` to allow. Any other answer denies, and the model reads the denial. A question from the tool `ask_user` reads `question from tool ask_user: ...` and takes one line. If the question has a form schema, the answer is one line of JSON. An empty line declines. If standard input is not a terminal, `fw run` denies every approval and says why.

## Serve the API with fw serve

`fw serve` needs a bearer token in the default authentication mode, `token`. Export it and start the server:

```sh
export ANTHROPIC_API_KEY=... FW_API_TOKEN=secret
./bin/fw serve
```

The one listener, `:8080` by default, serves these routes. `-listen` changes the address, and `-port` the port.

| Path | What |
|---|---|
| `POST /v1/runs`, `GET /v1/runs`, `GET /v1/runs/{id}` | start, list, and read runs, with the bearer token |
| `GET /v1/runs/{id}/events` | the ledger of a run as server-sent events |
| `POST /v1/runs/{id}/messages`, `/cancel`, `/fork`, `PATCH .../budget` | a follow-up, a cancel, a branch, a change of the budget |
| `POST /v1/runs/{id}/approvals/{approval}` | decide a pending approval |
| `GET /v1/agents`, `/v1/tools`, `/v1/skills`, `/v1/status` | the profiles, the tools, the skills, and the state of the agent |
| `/.well-known/agent-card.json`, `/a2a/jsonrpc`, `/a2a/` | the A2A server |
| `/metrics` | Prometheus, without authentication |
| `/healthz`, `/readyz` | health |

Start a run and wait for it:

```sh
curl -s -H "Authorization: Bearer secret" -H "Content-Type: application/json" \
     -d '{"input": "Say hello.", "instructions": "Answer in one sentence.", "wait": true}' \
     http://localhost:8080/v1/runs
```

The answer is the run object: `id`, `agent`, `state`, `input`, `output`, `pending`, `usage`, and `seq`. With `"wait": false`, the call returns the run at once, and `GET /v1/runs/{id}` reads it later.

## Follow a run with fw events

Take the `id` from the run object and follow its ledger:

```sh
./bin/fw events <id> --follow
```

`fw events` opens the ledger directly, without a kernel, so it never resumes a run. It opens a file ledger read-only, so it works while `fw serve` owns the ledger. `--follow` keeps printing until the run finishes. `--format text` prints one short line per event with its time instead of the JSON of the event. `--from <n>` starts at a sequence number. The same events arrive as server-sent events on `GET /v1/runs/{id}/events`.

### How an approval looks over the API

A run that waits for a decision has the state `input-required`, and `pending` names the approval:

```json
{"id": "01JA...", "state": "input-required",
 "pending": {"id": "ap_7f3", "tool": "bash", "input": {"command": "git push"}, "reason": "rule: ask destructive"}}
```

Decide it with the approval route. The body holds `decision`, `allow` or `deny`, and an optional `note`. For a question with a schema, put the answers in `content`.

```sh
curl -s -H "Authorization: Bearer secret" -H "Content-Type: application/json" \
     -d '{"decision": "allow"}' http://localhost:8080/v1/runs/<id>/approvals/ap_7f3
```

The run continues after the decision. The decision is a ledger event, so it survives a restart.

## Where FW_HOME is

The home directory holds everything the process keeps. Without a setting, it is `./.fw`. If `/workspace` exists, it is `/workspace/.fw` instead. The starter sets `home: .`, and the global flag `-home` or the variable `FW_HOME` overrides it. The kernel reads `fw.yaml` from `$FW_CONFIG`, then `./fw.yaml`, then `$FW_HOME/fw.yaml`.

| Path under the home | What |
|---|---|
| `runs/<id>/ledger.jsonl` | the ledger of one run, one JSON object per line |
| `runs/index.jsonl` | the list of run ids |
| `agents/<name>.yaml` | one profile per file, beside the profiles in `fw.yaml` |
| `skills/<name>/SKILL.md` | the skills, unless `tools.skills` names other directories |
| `memory/agents/<profile>/` | the notes of the `memory` tool, or `memory/principals/<profile>/<hash>/` with `tools.memory.scope: principal`, or `memory/shared/` with `shared` |
| `memory/index/` | the derived search index of a build with the tag `memory_sqlite` |
| `prompts/default.md` | the system prompt that the starter profile names, written by `fw init` |

The `files` tool and the `bash` tool never open the home directory, the ledger directory, or the configuration file.

## Next steps

- [The run lifecycle](../concepts/run-lifecycle.md) explains the states and the events you saw on the terminal.
- [The ledger](../concepts/ledger.md) explains what `fw events` reads and how a run resumes from it.
- [Safeguards](../concepts/safeguards.md) covers the budget, the policy, and the approval you answered.
- [Profiles, tools, and skills](../concepts/profiles-and-tools.md) covers `agents/`, `skills/`, and the flags of `fw run`.
- [Context, memory, and time](../concepts/context-memory-time.md) covers `compaction.at`, `memory/`, and `time.zone`.
- [fw commands](../reference/fw-commands.md), [Configuration](../reference/configuration.md), and [HTTP API](../reference/http-api.md) list every verb, key, and route.
- [Run the workbench on your machine](workbench-local.md) adds the page and the MCP server on top of this kernel.
- [One Task on AX](../deployment/one-task-on-ax.md) runs the same binary as PID 1 in a sandbox.

## Sources

- `featherweight-kernel/README.md`
- `featherweight-kernel/Makefile`
- `featherweight-kernel/go.mod`
- `featherweight-kernel/cli/cli.go`
- `featherweight-kernel/cli/setup.go`
- `featherweight-kernel/memory/store.go`
- `featherweight-kernel/cli/run.go`
- `featherweight-kernel/cli/doctor.go`
- `featherweight-kernel/cli/serve.go`
- `featherweight-kernel/cli/verbs.go`
- `featherweight-kernel/examples/fw.yaml`
- `featherweight-kernel/fw/agent.go`
- `featherweight-kernel/fw/run.go`
- `featherweight-kernel/model/openai/openai.go`
- `featherweight-kernel/surface/native/native.go`
- `featherweight-kernel/docs/ARCHITECTURE.md`, sections 7.2, 8.2, and 12.5
