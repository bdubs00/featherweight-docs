# Run the kernel on your machine

This walk-through builds the agent program, gives it a model, and runs one task from your terminal. Then it starts the same agent as a small web service and reads the log of every step it took. You need no cluster and no container.

At the end you have:

- `fw`, one static binary that runs one agent.
- A working directory with a starter configuration and a default prompt.
- One finished run, and its ledger: the append-only log of every step of the run.

## Before you start

You need Go 1.27 or newer, `make`, and `git`. The Makefile calls `go` from your `PATH`. To use another toolchain, set `GO`, for example `make GO=/opt/go/bin/go build`.

You also need a model. The kernel has no default model, because each model costs what its provider charges. Pick one of two:

| Choice | Model selector | Credential |
|---|---|---|
| The Claude API | `anthropic/<model>`, such as `anthropic/claude-opus-5-5` | `ANTHROPIC_API_KEY` |
| A local server of the OpenAI chat API, such as vLLM, Ollama, or tabbyAPI | `openai/<model>` | `OPENAI_API_KEY`, which a local server can ignore |

## Build fw and write a starter

1. Clone the repository and build the binary:

    ```sh
    git clone https://github.com/bdubs00/featherweight-kernel
    cd featherweight-kernel
    make build
    ```

    `make build` writes `bin/fw`. Run `./bin/fw --help` to see every verb. Every later step runs `./bin/fw` from the directory that holds your work.

2. Write a starter configuration in the directory of your work:

    ```sh
    ./bin/fw init
    ```

    You see this:

    ```text
    wrote fw.yaml
    wrote prompts/default.md
    made  agents/
    made  skills/
    A model must be set: without model in fw.yaml, FW_MODEL, or the model of a profile, fw refuses every run.
    next: set model in fw.yaml or export FW_MODEL, export the credential of its provider, then run fw doctor and fw run "hello"
    ```

    `fw init` never overwrites a file, and `fw init <dir>` writes into another directory. `fw.yaml` has one comment per key. It sets `home: .`, so runs, notes, agents, and skills live next to it. It names one profile, `default`, a named agent setup with its prompt and tools.

3. Set the model. Remove the `#` of one `model` line in `fw.yaml`, or export it, with the credential of its provider:

    ```sh
    export FW_MODEL=anthropic/claude-opus-5-5
    export ANTHROPIC_API_KEY=...
    ```

    For a local server, name the model and the address of the server:

    ```yaml
    model: openai/qwen3-32b
    providers:
      openai:
        baseUrl: http://127.0.0.1:8000/v1
    ```

    Every key of `fw.yaml` maps to a variable by upper snake case, such as `FW_PROVIDERS_OPENAI_BASE_URL`, and a variable wins over the file. `fw env` lists every variable, and `fw config` prints the resolved configuration with secrets masked.

## Check the setup, then run one task

1. Check the setup:

    ```sh
    ./bin/fw doctor
    ```

    The doctor prints one line per check: `ok`, `warn`, or `FAIL`. Every check runs, so one failure hides no other. Before you set a model, the model line warns, and the exit code stays 0:

    ```text
    ok    configuration: fw.yaml
    ok    home: . is writable
    ok    credential: no model is configured, so there is no model credential to check
    warn  model: none configured, so this process serves and refuses every run until model in fw.yaml, FW_MODEL, or the profile of a run names one; there is no default model
    ok    ledger: file ledger runs appends and reads
    ```

    With a model, the line `credential` says whether the variable of the key is set, and the line `model` opens the model. If any line fails, the doctor exits with 1. `-timeout` bounds each check that reaches a provider, 10 seconds by default.

    !!! note
        With a local server and no `OPENAI_API_KEY`, the doctor fails the line `credential`. The adapter sends no key and works all the same. Set the variable to any value.

2. Give the agent one task:

    ```sh
    ./bin/fw run "Which file in this directory is the largest?"
    ```

    `fw run` prints one line per event to standard error and the answer to standard output. The exit code is 0 for a completed run, 1 for a failed run, and 2 for a canceled run.

3. Answer the approval. The default policy asks before a tool that can change things, and `bash` is such a tool. The terminal shows the call and waits:

    ```text
    approval ap_7f3: tool bash
      input: {"command":"ls -lS"}
      reason: rule: ask destructive
    allow? [y/N]
    ```

    Type `y` to allow. Any other answer denies, and the model reads the denial. If standard input is not a terminal, `fw run` denies every approval and says why.

The flags of `fw run` shape one run without a change to `fw.yaml`. The common ones are `-model`, `-system`, `-i` for instructions, `-tools`, `-max-turns`, `-deadline`, and `-json`. `./bin/fw run -h` lists them all, and [fw commands](../reference/fw-commands.md) explains each.

## Serve the agent and read its ledger

1. Start the agent as a service. The default authentication mode is `token`, so set the bearer token first:

    ```sh
    export FW_API_TOKEN=secret-token
    ./bin/fw serve
    ```

    One listener, `:8080` by default, serves the API at `/v1`, the A2A server, `/metrics`, `/healthz`, and `/readyz`. `-listen` changes the address. A call without the token gets 401.

2. In a second terminal, start a run and wait for it:

    ```sh
    curl -s -H "Authorization: Bearer secret-token" -H "Content-Type: application/json" \
         -d '{"input": "Say hello.", "instructions": "Answer in one sentence.", "wait": true}' \
         http://localhost:8080/v1/runs
    ```

    The answer is the run object, with `id`, `state`, `output`, `pending`, and `usage`. Without a model, the answer is a 400 that says `no model configured`. `GET /v1/status` gives the state of the agent at a glance, with `idle` and the counts of runs.

3. Follow the ledger of the run, with the `id` of the run object:

    ```sh
    ./bin/fw events <id> --follow --format text
    ```

    `fw events` reads the ledger file directly, read-only, so it works while `fw serve` runs. `--follow` prints until the run finishes. The same events arrive as server-sent events on `GET /v1/runs/{id}/events`.

4. Decide an approval over the API. A run that waits has the state `input-required`, and `pending` names the approval:

    ```sh
    curl -s -H "Authorization: Bearer secret-token" -H "Content-Type: application/json" \
         -d '{"decision": "allow"}' http://localhost:8080/v1/runs/<id>/approvals/<approval>
    ```

    The decision is an event of the ledger, so it survives a restart. The run goes on after it.

Only one process writes a ledger. If `fw serve` runs, a second `fw run` in the same directory fails with `fw: file ledger: another writer owns this root`. Stop the server first, or use another directory.

## Where things are kept

The home directory holds everything that the process keeps. The starter sets it to `.`. Without a setting, it is `/workspace/.fw` where `/workspace` exists, else `./.fw`. The flag `-home` or `FW_HOME` overrides it. The kernel reads `fw.yaml` from `$FW_CONFIG`, then `./fw.yaml`, then `$FW_HOME/fw.yaml`.

| Path under the home | What |
|---|---|
| `runs/<id>/ledger.jsonl` | The ledger of one run, one JSON object per line |
| `agents/<name>.yaml` | One profile per file, beside the profiles in `fw.yaml` |
| `skills/<name>/SKILL.md` | The skills that a profile can load |
| `memory/` | The notes of the tool `memory` |
| `prompts/default.md` | The system prompt of the starter profile |

The tools `files` and `bash` never open the home directory, the ledger, or the configuration file.

## Where to go next

<div class="paths" markdown>

- [Run the workbench on your machine <span>Add bossmode and the MCP server on top of this kernel</span>](workbench-local.md)
- [The run lifecycle <span>The states and the events that you just saw</span>](../concepts/run-lifecycle.md)
- [One Task on AX <span>The same binary as PID 1 in a sandbox</span>](../deployment/one-task-on-ax.md)

</div>

## Sources

- `featherweight-kernel/README.md`
- `featherweight-kernel/Makefile`
- `featherweight-kernel/go.mod`
- `featherweight-kernel/cli/cli.go`
- `featherweight-kernel/cli/setup.go`
- `featherweight-kernel/cli/run.go`
- `featherweight-kernel/cli/doctor.go`
- `featherweight-kernel/cli/serve.go`
- `featherweight-kernel/cli/verbs.go`
- `featherweight-kernel/fw/policy.go`
- `featherweight-kernel/fw/ledger.go`
- `featherweight-kernel/model/openai/openai.go`
- `featherweight-kernel/examples/fw.yaml`
