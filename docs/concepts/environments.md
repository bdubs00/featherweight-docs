# Environments and agent programs

An environment puts the packages of an agent on the workspace volume of its Task, the only part of a Task that survives a sleep. The kernel can also host Claude Code or opencode, and still keep one ledger, one policy, and free sleep during a decision.

## Why packages need a place of their own

AX resumes a Task by starting its container again from the image and putting back `/workspace`. A `pip install` or an `apt-get install` writes to the root file system, so the next suspend loses it. Without an environment, a run installs the same package after every wake and spends model calls to find out what the Task holds.

The block `environment` of `fw.yaml` fixes that with two package managers that need no root:

- `uv` for Python packages.
- `pixi` for everything else from conda-forge, such as Node, git, compilers, Ansible, and PostgreSQL.

The image carries both programs, and the kernel never downloads them. The image `fw:toolbox` has them. For each manager, the block names a manifest with its lock file, or a plain list of packages. With a list, the kernel writes the manifest and the lock file itself.

```yaml
environment:
  packages:
    python: [ansible-lint, "pyyaml>=6"]
    tools: ["nodejs>=22", jq]
  mirrors:
    python: http://pkg-cache.fw-fleet.svc:8080/pypi/simple
    tools: http://pkg-cache.fw-fleet.svc:8080/conda-forge
```

| Key | Meaning | Default |
|---|---|---|
| `dir` | The directory of the environment | `/workspace/.environment` under AX, else `.environment` in the workspace |
| `python`, `tools` | A `pyproject.toml` for uv and a `pixi.toml` for pixi, each with its lock file beside it | none |
| `packages.python`, `packages.tools` | Lists in place of the two manifests | none |
| `mirrors.python`, `mirrors.tools` | A package index and a conda-forge mirror, such as a cache in the cluster | none |
| `prepare` | Shell commands that run once after each new install | none |
| `placement` | `durable` installs under `dir` at run time. `image` says that the image already holds the environment. | `durable` |
| `on`, `ask` | `on: false` turns the packages off. `ask: false` keeps the agent from asking for a change. | `true`, `true` |

## How an install works

When the process starts, a background service installs the environment from the lock files, as the tool user. The install never delays `/readyz`. While it runs, the process reports itself busy, so the workbench does not suspend the Task in the middle of a download. A failed install tries again after 5 seconds, and the pause doubles up to 5 minutes. A new digest of the manifests and the lists installs again, and the caches make that fast.

Every tool process gets the variables of the environment, such as `PATH` and `VIRTUAL_ENV`. A tool process never fails because of an install: until the new environment is ready, it gets the last one that installed. The system prompt gets an Environment section that names the packages and their versions. Inside a Task, it also says what a Task lacks: a change outside `/workspace` is lost, apt and sudo are not available, and there is no GPU.

`fw run` starts no service, so it installs the environment in the first tool process of the run. A laptop therefore tests a profile with the packages of its Task before the Task exists.

??? note "Under the hood"
    The package `env` registers the block, the install service, the tool, the variables, and the prompt section. The install runs `uv sync --frozen` and `pixi install --frozen` for a manifest, or writes and locks the manifest of a list first. A heavy environment such as PyTorch can live in the image instead: `fw env dockerfile --from <image>` prints a Dockerfile for `placement: image`. See [18. Environments](../design/kernel-architecture.md#18-environments).

## Changing the packages of a running agent

The tool `env` takes `command`: `list`, `add`, or `remove`. An add or a remove also takes `manager`, `python` or `tools`, and `package`, such as `pyyaml>=6`. By default the policy asks a person before each add and each remove, with the rules `env: command=add` and `env: command=remove`. The tool installs the change and records `fw.env.changed`. If a change of a list fails to install, the tool puts the previous list back, so the agent keeps a working environment.

Two keys make the tool refuse a change, each with a sentence for the model:

- With `on: false`: `A person turns packages on for this agent on the page.`
- With `ask: false`: `This agent cannot ask for packages. A person adds them on the page.`

The events of the environment belong to the process, not to a run. The kernel publishes `fw.env.ready`, `fw.env.failed`, and `fw.env.changed` on the bus subject `fw.environment`. In a fleet, the workbench reads them and keeps the packages of each pool in one place. A person can allow a change on one worker. The workbench then writes the change into the lists of the pool, so every worker of the pool gets it.

The workbench changes the packages of a running worker in place with `PUT /v1/environment`, so the worker keeps its `/workspace` and its runs. `GET /v1/environment` reads the lists and the state: `pending`, `materializing`, `ready`, or `failed`. See [Skills, tools, and packages](../guide/skills.md) for the view in bossmode.

`fw doctor` prints a line `environment` with the state and the hosts that the egress policy of the Task must let through, such as `tls pypi.org`. The kernel cannot add an egress host, so a person adds the hosts to the Task.

## Hosting Claude Code or opencode

A hosted agent program is a program that the kernel runs inside the Task, such as Claude Code or opencode. People also use these programs on their laptops. The block `harness` turns it on. Every run of the process then becomes a session of that program, in place of a run of the turn loop of the kernel.

```yaml
harness:
  kind: claude-code         # or opencode
  home: /workspace/.harness # the sessions and transcripts of the program
```

| Key | Meaning | Default |
|---|---|---|
| `kind` | `opencode` or `claude-code` | none, and required |
| `home` | The home of the program, on the durable volume beside the home of `fw` | `/workspace/.harness` under AX |
| `command` | The program and its first arguments | `opencode serve`, or `claude` |
| `port` | The loopback port of `opencode serve`, or `0` for a free port | `0` |

The block names no model and no key. The program uses the model of the run and the endpoint and key of its provider. The kernel keeps what makes a run durable:

- One ledger. The kernel records each model call and tool call of the program with its usual events, such as `fw.tool.requested`. Every other step becomes `fw.harness.event`.
- One policy. The kernel names the tools of both programs in lower case, such as `bash` and `write`. One rule such as `bash: git push*` therefore fits both. opencode asks the kernel about every call through its permission requests. Claude Code asks through a `PreToolUse` hook on the route `/v1/harness/hook/<secret>`.
- Free sleep. A call that the policy asks about becomes `fw.approval.requested`, the run waits in `input-required`, and the Task can sleep. After the decision, also after a cold boot, the kernel resumes the same session, for Claude Code with `claude -p --resume <session>`.
- One budget. At a limit, the kernel stops the program and fails the run. Claude Code also gets `--max-turns` and `--max-budget-usd` from the budget that is left.

!!! warning
    The key of the model reaches the hosted program and every process that it starts. The system prompt of the profile does not reach the program, only the instructions of the run. The MCP servers of `tools.mcp` do not reach it yet, and a branch of a hosted run fails. Claude Code needs a model of the provider `anthropic` and the native API on a plain HTTP listener. See [19.9 Limits](../design/kernel-architecture.md#199-limits).

### The memory server

A hosted run whose profile allows the tool `memory` gets the memory as a run of the turn loop does. The system text of the program gets the memory section. The index of the notes goes as data in a `<context source="memory">` block at the start of the first prompt. The kernel records `fw.harness.event` of the kind `fw.brief` before that prompt, so a cold boot never sends the index twice.

The native API also serves an MCP server named `fw-memory` on the loopback route `/v1/harness/memory/<secret>`. Its four tools are `recall`, `list`, `remember`, and `forget`. The policy names them `fw-memory.recall` and so on in both programs, so one rule fits both, such as `fw-memory.remember: path=/memories/private/*`. The name `fw-memory` belongs to `fw`: a server of that name in the configuration of a repository gets a deny for every memory call.

### Arming

The memory server makes only a call that the policy of a run allowed. When the host allows a memory call, it arms the call: it marks the call as allowed for its run, with its canonical input. The canonical input is a JSON object with only the fields of the schema of the tool, each once and of its type. For each call, the server looks for an armed call with the same tool and the same canonical input. Without one, it makes no call. It makes the call in the memory scope of that run. An armed call ends with its run, and it expires after two minutes.

??? note "Under the hood"
    The hosts live in the package `harness`, one file for each program, and the default build links it. The kernel seam is `fw.Runner` in `fw/runner.go`. The arming, the canonical input, and the checks of the name `fw-memory` are in `harness/memory.go`. See [section 19](../design/kernel-architecture.md#191-configuration) and [19.10 Memory](../design/kernel-architecture.md#1910-memory).

## Where to go next

<div class="paths" markdown>

- [Outcomes and check runs <span>A grader that checks the answer, and runs that call no model</span>](outcomes.md)
- [Skills, tools, and packages <span>Give an agent packages from bossmode</span>](../guide/skills.md)

</div>

## Sources

- `featherweight-kernel/docs/ARCHITECTURE.md` (sections 18 and 19)
- `featherweight-kernel/env/config.go`
- `featherweight-kernel/env/install.go`
- `featherweight-kernel/env/state.go`
- `featherweight-kernel/env/tool.go`
- `featherweight-kernel/env/push.go`
- `featherweight-kernel/env/brief.go`
- `featherweight-kernel/env/doctor.go`
- `featherweight-kernel/env/dockerfile.go`
- `featherweight-kernel/cli/setup.go`
- `featherweight-kernel/cmd/fw/driver_env.go`
- `featherweight-kernel/cmd/fw/driver_harness.go`
- `featherweight-kernel/harness/harness.go`
- `featherweight-kernel/harness/claudecode.go`
- `featherweight-kernel/harness/opencode.go`
- `featherweight-kernel/harness/memory.go`
- `featherweight-kernel/fw/runner.go`
- `featherweight-workbench/docs/ARCHITECTURE.md` (section 14.11)
