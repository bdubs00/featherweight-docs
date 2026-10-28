# The ledger

The ledger is the diary of a run: a file of events, one line for each step, that only grows. The kernel keeps no other state. If the process dies in the middle of a step, a new process reads the ledger and goes on from where the old one stopped.

<div class="demo" data-demo="ledger-replay" markdown>

A run fixes a failing build with two tool calls: `http`, which is idempotent, and `files`, which is not. Kill the process, or cut the power, in the middle of a call. A new process reads the ledger and appends `fw.run.resumed`. It runs the `http` call again at once, but it asks a person before it runs the `files` call again, with the reason `rerun after resume`. Lines marked fsync reach the disk before the kernel goes on.

</div>

## What an event looks like

Every event is a CloudEvents 1.0 object, a standard envelope for events. The file holds each event on one line. Here is one event, spread over several lines to read it:

```json
{
  "specversion": "1.0",
  "id": "01JBX4V7Q8M2N5P6R7S8T9V0WX",
  "source": "fw://default/migrator/01JBX4T2K5M8N1P3Q6R9S2T5VW",
  "type": "fw.tool.requested",
  "time": "2026-10-27T14:03:11.204Z",
  "subject": "01JBX4T2K5M8N1P3Q6R9S2T5VW",
  "seq": 12,
  "node": "ax:default/migrator-1",
  "data": {
    "tool": "files",
    "callId": "toolu_02",
    "input": {"command": "str_replace", "path": "build/flags.go"}
  }
}
```

`subject` is the run id, and `seq` is the place of the event in its run, from 1. `id` is a ULID, a unique id that sorts by time. `node` names the process that wrote the event, so the workbench of a fleet knows which Task holds the run. `data` holds the fields of the type. Before the kernel appends an event, it replaces every secret in the data with `[redacted]` (see [Safeguards](safeguards.md#the-redaction-of-secrets)).

## The event types

| Group | Event types | What they record |
|---|---|---|
| The run | `fw.run.queued`, `fw.run.started`, `fw.run.suspended`, `fw.run.resumed`, `fw.run.finished` | The request, the start, a stop on `SIGTERM`, a boot that goes on, and the end with its outcome |
| The model | `fw.turn.started`, `fw.model.requested`, `fw.model.responded`, `fw.turn.finished`, `fw.context.compacted` | Each turn and model call, the answer with the raw blocks of the provider, and a summary that replaced the history |
| Tools | `fw.tool.requested`, `fw.tool.responded`, `fw.tool.progress`, `fw.file.changed`, `fw.memory.changed` | Each tool call and its result, and each file or memory note that a call changed |
| People | `fw.message.received`, `fw.approval.requested`, `fw.approval.decided`, `fw.run.reacted` | Follow-ups and the notes of the kernel, questions and their decisions, and reactions |
| Limits | `fw.budget.exceeded`, `fw.budget.changed`, `fw.loop.detected`, `fw.error` | A limit, a change of the budget, a loop of the same call, and an error |
| Other runs | `fw.run.child`, `fw.child.reported` | A child run in another process, and what it last reported |
| Extensions | `fw.run.annotated`, `fw.outcome.evaluated`, `fw.routine.decided`, `fw.routine.applied`, `fw.routine.compared`, `fw.harness.event` | Metadata and usage, a grade, a routine, and the events of a hosted Claude Code or opencode session |

Five types add facts and leave an ended run ended: `fw.run.annotated`, `fw.run.reacted`, `fw.run.child`, `fw.child.reported`, and `fw.budget.changed`. Any other event after the end, such as a follow-up, works on the run again. The kernel architecture lists every field in [section 4.2](../design/kernel-architecture.md#42-event-types).

## On disk

The default driver, `file`, writes one file for each run at `<root>/<run id>/ledger.jsonl`. The root is `ledger.path` in the configuration, else `$FW_HOME/runs`. In an AX Task, where `/workspace` exists, `$FW_HOME` is `/workspace/.fw`. Elsewhere it is `./.fw`. The file `<root>/index.jsonl` lists each run once. The other driver, `mem`, keeps the events in memory for tests.

The driver only appends, and it writes each event with one write call. A process that dies loses no line that it wrote. A crash of the machine can lose more, so the kernel waits for `fsync`, a write to the disk itself, after these events:

- `fw.run.queued`, because the caller learns that the run is accepted
- `fw.tool.requested` of a tool that is not idempotent, because the tool runs only after the line is on disk
- `fw.approval.requested` and `fw.approval.decided`
- `fw.run.finished`, the end of the run
- a follow-up from outside, `fw.budget.changed`, `fw.run.annotated`, and `fw.run.reacted`, because the caller gets an answer
- `fw.run.child`, because the kernel records a child before it creates the process of the child

Every other event, such as a model call or a note of the kernel, reaches the disk at the next fsync. So after any crash, the ledger holds the intent of every call that is not safe to repeat. These rules stand on the `fsync` of the file system. They do not make an effect outside the sandbox happen exactly once.

### One writer for each root

A file ledger has one writer at a time. The kernel takes a lock on the root directory, and a second writer gets `fw: file ledger: another writer owns this root`. `fw serve` and the boot in an AX Task try again for up to 30 seconds, then exit with an error. `fw events` and `fw replay --ledger` open the ledger read-only, so both work beside a running server. Give each worker a home and a ledger of its own: the lock is not a lease across machines.

### Fail-stop on a storage failure

Only a fault of the ledger stops the whole process: an append, a flush, or a read that fails. From the first such fault, the process blocks every write until it restarts. A new start, a follow-up, a decision, and a cancel all fail with 503. `/readyz` answers 503, the gauge `fw_storage_blocked` is 1, and the log gets one line that names the cause.

`GET /v1/status` then reports `blocked: true` with `blockedReason`, and `idle: true` since the failure. Under AX, the workbench therefore suspends the Task, and the next request starts a fresh process that rebuilds from the ledger. Elsewhere, repair the storage and restart the process. The kernel never retries an append whose result it does not know, and it invents no end event. An effect outside the sandbox that was in flight can still finish.

??? note "Under the hood"
    The driver is `fw/ledger_file.go`. `needsIntentSync` decides which events wait for `fsync`, and the first durable event of a run also syncs the directories. A crash can leave a partial last line, and the next open cuts it off. The lock is a `flock` on the inode of the root. A symbolic link to the same directory therefore takes the same lock, and a second writer gets `fw.ErrLedgerLocked`. The fail-stop is `failStorage` in `fw/lifecycle.go`. `Agent.RuntimeError` keeps the cause, and a caller that waits gets `fw.ErrStorageUnavailable`. A read of an open run shows the field `blocked` beside its last state. A blocked process cannot append `fw.run.suspended` at a later `SIGTERM`. See [section 5.6](../design/kernel-architecture.md#56-process-duties).

## Reading the ledger back

A projection is a read model, a view that the kernel folds from the events in order. It never writes to the ledger. Two projections matter most. The run object that every surface returns has the state, the usage, the pending approval, and the title. The history is the list of messages that the next model call sends. It starts at the latest summary of `fw.context.compacted` and holds the raw blocks of the provider unchanged.

A resume uses the same events. At boot, the kernel finds every run that did not end, appends `fw.run.resumed`, and starts a driver. The driver reads its next step from the ledger, as the demo shows. A model request without an answer goes out again. If a tool call without a result is safe to repeat, it runs again. If not, the kernel asks a person with the reason `rerun after resume`.

A tool can decide for each call whether a repeat is safe. The tool `memory` runs an interrupted `view`, `create`, `delete`, or `rename` again at once. It asks a person before it repeats an `insert` or a `str_replace`, because a second edit changes the note again. [The run lifecycle](run-lifecycle.md#resume-from-the-ledger-at-boot) lists every resume rule.

## Replay and branches

A replay runs a recorded run again against a model and answers every tool call from the recorded results. No live tool runs. `fw replay <run-id>` starts one, and `--model` names the model. The result is a second ledger, and a diff of the two ledgers is a test of a new model or a new prompt.

A replay matches a recorded result by the tool name and the input, whatever the order of the keys. A call that no recorded result matches gets an error result. The replay sees the same memory index and the same date as the recorded run. It reads the profile again, so a changed prompt shows in the replay.

A branch is a new run whose ledger starts with a copy of the events of another run, up to one sequence number. `POST /v1/runs/{id}/fork` and the MCP tool `fork` make one, with the fields `seq`, `input`, `model`, `metadata`, and `spawn`. With `input`, the branch goes on as a follow-up, so you can take a finished run in another direction. The copied events are the same bytes, so the branch keeps the prompt cache of the provider. With `spawn: true`, the branch runs in a new child Task with its own copy of the workspace.

??? note "Under the hood"
    `fw.Replay` in `fw/replay.go` adds the metadata key `replayOf`. Number literals in an input keep their spelling, so `1` and `1.0` differ. Repeated identical calls take the recorded results in ledger order, and the calls run one at a time. `Agent.Fork` in `fw/fork.go` gives the copied events new ids. The `fw.run.queued` of the branch holds `kept`, the number of copies, so the branch counts only its own work. It also carries the metadata `fw.forkOf` and `fw.forkSeq`. See [section 4.6](../design/kernel-architecture.md#46-replay) and [section 4.7](../design/kernel-architecture.md#47-branches).

## The egress stream

A worker of a fleet publishes its ledger events on the bus, on the subject `<bus.egress>.<atespace>.<agent>.<type>`. `bus.egressTypes` limits the types with patterns such as `fw.run.*`. The workbench reads this stream to show the fleet. With the file ledger, the ledger itself is the queue: the kernel keeps a cursor for each run and sends every event after it. So an event is sent at least once and never skipped. A consumer treats two copies with the same `id` as one event.

??? note "Under the hood"
    A cursor is a small JSON file under `<root>/.egress/`, with the route and the run hashed. It holds the last sequence number that the bus confirmed. One pass sends at most 128 events of a run, and a full pass over every run comes at the start and then every minute. The `mem` ledger keeps an ordered queue in memory instead, up to 10,000 events, which a crash loses. See [section 9.4](../design/kernel-architecture.md#94-egress).

<div class="paths" markdown>

- [The run lifecycle <span>The states of a run, and how it waits and wakes</span>](run-lifecycle.md)
- [fw commands <span>fw events and fw replay</span>](../reference/fw-commands.md)

</div>

## Sources

- `featherweight-kernel/fw/event.go`
- `featherweight-kernel/fw/ledger.go`
- `featherweight-kernel/fw/ledger_file.go`
- `featherweight-kernel/fw/ledger_file_egress.go`
- `featherweight-kernel/fw/ledger_file_lock_unix.go`
- `featherweight-kernel/fw/lifecycle.go`
- `featherweight-kernel/fw/agent.go`
- `featherweight-kernel/fw/config.go`
- `featherweight-kernel/fw/projection.go`
- `featherweight-kernel/fw/cursor.go`
- `featherweight-kernel/fw/turn.go`
- `featherweight-kernel/fw/resume.go`
- `featherweight-kernel/fw/callidem.go`
- `featherweight-kernel/fw/replay.go`
- `featherweight-kernel/fw/fork.go`
- `featherweight-kernel/fw/busio.go`
- `featherweight-kernel/fw/react.go`
- `featherweight-kernel/harness/harness.go`
- `featherweight-kernel/tools/builtin/memory.go`
- `featherweight-kernel/tools/builtin/http.go`
- `featherweight-kernel/tools/builtin/files.go`
- `featherweight-kernel/cli/verbs.go`
- `featherweight-kernel/surface/view/status.go`
- `featherweight-kernel/docs/ARCHITECTURE.md` (sections 4, 5.6, 9.4)
