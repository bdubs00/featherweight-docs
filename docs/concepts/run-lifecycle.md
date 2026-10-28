# The run lifecycle

A run is one conversation between one agent and a model, with one budget and one ledger. The kernel never stores the state of a run: it reads the state from the ledger. So one loop starts a run, goes on after your decision, and picks the run up again after a restart.

<div class="demo" data-demo="run-lifecycle" markdown>

Press the keys to drive a run. Each key appends the events that the kernel appends, such as `fw.run.queued`, `fw.approval.requested`, and `fw.run.finished`. A click on a line of the ledger shows the state of the run at that line.

</div>

## The states

A run is always in one of seven states. Each state comes from the events in the ledger, so a new process that reads the same ledger finds the same state. In the table, a driver is the part of the kernel that works on one run.

| State | What it means | The event that sets it |
|---|---|---|
| `queued` | The kernel accepted the run, and no driver works on it yet | `fw.run.queued` |
| `running` | A driver works on the run | `fw.run.started`, `fw.turn.started`, `fw.run.resumed`, a follow-up, a decision |
| `input-required` | The run waits for a person: an approval, an answer, or a connection | `fw.approval.requested` |
| `suspended` | The process got `SIGTERM` while the run worked | `fw.run.suspended` |
| `completed` | The model ended its turn with an answer | `fw.run.finished` with the outcome `completed` |
| `failed` | An error, a limit, a refusal, or a loop ended the run | `fw.run.finished` with the outcome `failed` |
| `canceled` | A person or a parent run stopped the run | `fw.run.finished` with the outcome `canceled` |

`completed`, `failed`, and `canceled` are the end states. An ended run is not dead: a follow-up message opens it again, and the same ledger goes on.

## How a run starts

Every start appends `fw.run.queued`. The event holds the whole request: the input, the agent, the instructions, the budget, the person who asked, and the profile as the kernel resolved it. A restart and a replay therefore see exactly the request of the first start. Then a driver takes the run and appends `fw.run.started`.

| Where the run comes from | How |
|---|---|
| Claude Code and other MCP clients | The MCP tools `run`, `enqueue`, and `batch` of the workbench |
| The native API | `POST /v1/runs` with a JSON body that holds `input` |
| The command line | `fw run "<input>"`, which waits for the end and prints the output |
| A queue | A run request on the bus queue `bus.intake`, one for each free run slot |
| The A2A server | A message to `/a2a` or `/a2a/jsonrpc`. A message to an open task is a follow-up. |
| Another run | The tool `spawn_task`, which starts a child run |

A request with an `Idempotency-Key` header that the process saw before returns the first run instead of a second one. So a client that retries after a lost answer does not start the work twice. The flags of `fw run` are in [fw commands](../reference/fw-commands.md).

### Admission

One process takes on a bounded number of root runs, the runs that no other run started. `maxRuns` bounds the root runs that work at the same time: 16 by default, or 1 in an AX Task. `maxQueuedRuns`, 64 by default, bounds the runs that wait behind them. When both are full, a new start gets the answer 429 with `Retry-After`. A follow-up and a decision on a run that the process already accepted are never refused.

??? note "Under the hood"
    Admission is in `fw/lifecycle.go`. A start and a branch reserve their place before they store an attachment or append an event, so a refused start leaves nothing on disk. The refusal is `fw.ErrSaturated` with a `fw.SaturationError` that names both limits. The A2A server answers the JSON-RPC error -32000 with the reason `SATURATED`, or 429 on its REST binding. The bus intake reserves a place for each job that it takes, so such a job is never refused. A child run takes no root place: `spawn.maxRunning` and the budget of its tree bound it. The environment variables are `FW_MAX_RUNS` and `FW_MAX_QUEUED_RUNS`. See [section 5.6](../design/kernel-architecture.md#56-process-duties) of the kernel architecture.

## One turn after another

A turn is one model call and the tool calls that it asks for. Before each step, the driver reads the cursor of the run, a position that comes from the ledger alone. The cursor says whether the run started, whether a turn is open, what the model answered last, and which tool calls still need a result. The driver then does the next step and appends its events.

In a turn, the kernel checks the budget, appends `fw.turn.started` and `fw.model.requested`, and calls the model. The answer becomes `fw.model.responded`. For each tool call in the answer, the policy decides, and each call that runs gets `fw.tool.requested` and `fw.tool.responded`. Then `fw.turn.finished` closes the turn. The stop reason of the answer decides what comes next.

| Stop reason | What the kernel does |
|---|---|
| `end_turn` | Closes the turn and finishes the run as `completed`, with the text of the answer as the output |
| `tool_use` | Runs the tool calls, then calls the model again with the results |
| `max_tokens` | Appends `fw.error` and sends the message `Continue.` once. A second `max_tokens` in a row fails the run. |
| `refusal` | Finishes the run as `failed` |
| `pause_turn` | Closes the turn and calls the model again at once |

If the network cuts the answer of the model, the kernel appends `fw.error`, waits half a second, and sends the same request once more. A second cut fails the run.

??? note "Under the hood"
    The loop is `drive` in `fw/turn.go`. Its steps are `stepStart`, `stepModel`, `stepResponse`, `stepTools`, and `endTurn`. The cursor is `executionCursor` in `fw/cursor.go`. It reads the ledger once and then takes up only the events after its last step. Consecutive tool calls that are safe to run in parallel run at the same time.

## Waiting for a person

Three things make a run wait, and each one is a `fw.approval.requested` event:

- An approval. The policy answers `ask` for a tool call. The default policy asks before `bash`.
- A question. The tool `ask_user` asks the person with free text or a form.
- A connection. A tool must act for the person at a service, such as GitHub, and the person has not connected it yet.

The run moves to `input-required`, and its driver stops. No process waits, so the Task can sleep. A decision comes from bossmode, from the MCP tool `approve`, from `POST /v1/runs/{id}/approvals/{approval}`, or from the terminal of `fw run`. The kernel appends `fw.approval.decided` and starts a driver again. Before an allowed call runs, the kernel checks the rules again, and a deny rule that arrived meanwhile wins. A child run that waits sends its question up to its parent, so the top run is the one place to watch.

## Idle, sleep, and wake

`GET /v1/status` says whether the process has work. When no run is `queued` or `running`, the body says `idle: true`. The workbench reads this flag through the router. It suspends a Task that stays idle for `workbench.fleet.suspendAfter`, 10 minutes by default. Substrate then saves `/workspace` and kills the kernel with `SIGKILL`, so the ledger gets no event. A sleeping Task costs nothing.

Any request through the router wakes a sleeping Task: a decision, a follow-up, a new run, or a read. A sleeping Task reads no queue, so a new job makes the workbench wake the Tasks that serve that queue. The state `suspended` comes from another path: if the worker pod stops, the kernel gets `SIGTERM`. It then appends `fw.run.suspended` to each run that works, writes the ledger to disk, and exits.

### Resume from the ledger at boot

When the kernel starts, it reads every run of the ledger and finds the runs that did not end. It appends `fw.run.resumed` to each one and starts a driver, unless the run waits for a person. The driver then goes on from the last complete step:

- A model request without an answer goes out again.
- If the tool is idempotent, a tool call without a result runs again. If not, the kernel asks a person first, with the reason `rerun after resume`.
- A question of `ask_user` that has its answer finishes from the ledger, so nobody is asked twice.
- A call that waited for a connection runs again, because the service never saw it.
- A pending approval waits for its decision.

The deadline of a run counts working time only. The time that a Task sleeps does not count. [The ledger](ledger.md) has a demo of a crash and a resume.

## Follow-ups, limits, and cancel

A run takes more messages after it ends or while it waits. `POST /v1/runs/{id}/messages` or the MCP tool `send` appends `fw.message.received`. An ended run goes back to `running`, and its output and its outcome clear. A message that arrives in the middle of a turn goes with the next model call. A message to a run that waits for an approval waits for the decision.

A follow-up can carry a `budget`. The kernel then appends `fw.budget.changed` before the message, so a run that failed at a limit goes on with more room. Every limit counts the whole run. At a limit of turns, tool calls, or working time, the run makes one last model call for a report and finishes as `failed`. [Safeguards](safeguards.md) describes the limits and the report.

`POST /v1/runs/{id}/cancel` or the MCP tool `cancel` stops the run. The kernel stops the call in flight and appends `fw.run.finished` with the outcome `canceled`. Then it cancels every open run under that run, in this process and in other processes. A branch is a run of its own, so a cancel of its source leaves it alone.

??? note "Under the hood"
    Only a fault of the ledger stops the whole process. Any other error fails one run with `fw.run.finished`, and the process goes on. After a storage fault, the process blocks every write until a restart, and `GET /v1/status` reports `blocked: true` and `idle: true`. Under AX, the workbench then suspends the Task, and the next request starts a fresh process. See [Fail-stop on a storage failure](ledger.md#fail-stop-on-a-storage-failure).

<div class="paths" markdown>

- [The ledger <span>Kill the process in the middle of a step, and watch a new one go on</span>](ledger.md)
- [Safeguards <span>The policy, the budget, and the final report</span>](safeguards.md)

</div>

## Sources

- `featherweight-kernel/fw/run.go`
- `featherweight-kernel/fw/event.go`
- `featherweight-kernel/fw/projection.go`
- `featherweight-kernel/fw/kernel.go`
- `featherweight-kernel/fw/lifecycle.go`
- `featherweight-kernel/fw/turn.go`
- `featherweight-kernel/fw/cursor.go`
- `featherweight-kernel/fw/resume.go`
- `featherweight-kernel/fw/callidem.go`
- `featherweight-kernel/fw/budget.go`
- `featherweight-kernel/fw/config.go`
- `featherweight-kernel/cli/run.go`
- `featherweight-kernel/surface/native/native.go`
- `featherweight-kernel/surface/view/status.go`
- `featherweight-kernel/tools/builtin/ask_user.go`
- `featherweight-kernel/tools/builtin/child.go`
- `featherweight-kernel/tools/builtin/memory.go`
- `featherweight-kernel/docs/ARCHITECTURE.md` (sections 4.5, 5, 11.5)
- `featherweight-workbench/fleet/suspend.go`
- `featherweight-workbench/fleet/types.go`
- `featherweight-workbench/surface/mcp/tools.go`
