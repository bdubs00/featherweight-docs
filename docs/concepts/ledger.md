# The ledger

The ledger is the append-only log of a run, and it is the only state that the kernel keeps. Every surface reads a projection of it. A resume rebuilds from it. A branch copies a prefix of it. This page describes the shape of an event, the event types, the file driver with its single writer and its fail-stop, and the projections. It then covers resume, replay, branches, and the cursors of the bus egress.

## The envelope

Every event is a CloudEvents 1.0 JSON object, the type `fw.Event` in `fw/event.go`. `NewEvent` sets `specversion`, `id`, `type`, `time`, `subject`, and `data`. The ledger sets `seq` and `source` at the append.

| Field | Value |
|---|---|
| `specversion` | `1.0` |
| `id` | A ULID: 48 bits of milliseconds and 80 random bits in Crockford base32, so ids sort by time |
| `source` | `fw://<atespace>/<agent>/<run>` |
| `type` | One of the types below, for example `fw.model.responded` |
| `time` | An RFC 3339 time from the clock of the agent, in UTC |
| `subject` | The run id |
| `seq` | The position of the event in its run, from 1 |
| `node` | The name of the process that appended the event: `node` in `fw.yaml`, `ax:<atespace>/<task>` under ax |
| `traceparent` | The W3C trace context of the run |
| `data` | The payload of the type |

Before the kernel appends an event, it replaces every secret in the data with `[redacted]`. The rules are on [Safeguards](../concepts/safeguards.md#the-redaction-of-secrets).

## The event types

The constants in `fw/event.go` name the types. Each type has a data struct with the matching name, for example `RunQueuedData`. The design document lists every field in [section 4.2](../design/kernel-architecture.md#42-event-types).

| Type | Written |
|---|---|
| `fw.run.queued` | At the start of a run, with the request and the resolved profile |
| `fw.run.started` | At the first step of the driver, with the model, the tool names, the brief, the context, and the time zone. `context` is the data that tools add to the first user message, such as the memory index |
| `fw.message.received` | At a follow-up, and at each note of the kernel: time, budget, loop, report, outcome |
| `fw.turn.started`, `fw.turn.finished` | At the open and the close of a turn |
| `fw.model.requested` | Before a model call, with the estimated input tokens, and `report` for the final report call |
| `fw.model.responded` | After the model answers, with the content, the raw provider blocks, the stop reason, the usage, and the latency |
| `fw.tool.requested` | Before a tool call runs, with the input and the field `idempotent` |
| `fw.tool.responded` | After a tool call, with the content, `isError`, the exit code of a command, and the latency |
| `fw.tool.progress` | At each progress notification of an MCP tool |
| `fw.file.changed` | After a tool changed a file of the workspace |
| `fw.memory.changed` | After a tool call changed a memory note, with the call id, the tool, the operation, the ref, the old ref, the scope, the agent, the size, and the SHA-256, never the text |
| `fw.approval.requested` | At a call that waits for a decision, a question, or a connection |
| `fw.approval.decided` | At the decision of a person |
| `fw.context.compacted` | After a summary replaced the history, with the epoch, the summary, the kept messages, and the usage |
| `fw.budget.exceeded` | At a limit, with the limit, the value, the scope, and `report` |
| `fw.budget.changed` | After a person or a process changed the budget |
| `fw.loop.detected` | At a warning of the loop guard, and at the failure that follows |
| `fw.error` | At an error, with `retryable` |
| `fw.run.suspended` | At a stop of the process on `SIGTERM`, with the totals of the run |
| `fw.run.resumed` | At the boot that resumes the run, with the sequence number it continues from |
| `fw.run.finished` | At the end of the run, with the outcome, the output, the error, and the totals |
| `fw.run.annotated` | After a linked package or the kernel added metadata or usage, also after the end |
| `fw.run.child` | At the record of a child or a branch in another process |
| `fw.child.reported` | After a read of a child in another process |
| `fw.outcome.evaluated` | At the end of a grader pass |
| `fw.harness.event` | At each event of a session of opencode or Claude Code that the kernel hosts (the package `harness`) |

Four types add facts and leave a finished run finished: `fw.run.annotated`, `fw.run.child`, `fw.child.reported`, and `fw.budget.changed` (`fw.LeavesFinished`). Every other event after the end, such as a follow-up, works on the run again. Three types are bus messages and not ledger events: `fw.tool.send` from the tool `send`, `fw.intake.dead` from the intake, and the `fw.env.*` events of the environment.

## Storage

The code registers two ledger drivers, `file` and `mem` (`fw.RegisterLedger`). NATS and Redis are bus drivers, not ledger drivers, as [section 4.3](../design/kernel-architecture.md#43-storage) says. The module table of section 15 still lists `nats.go` for the NATS bus and ledger, so the code wins. The driver `mem` keeps events in memory, for tests and for runs that need no durability. A custom ledger implements `fw.Ledger`. A ledger that several processes share also needs a protocol of ownership and fencing, which the kernel does not have.

The driver `file` in `fw/ledger_file.go` is the default. It writes one file per run at `<root>/<run id>/ledger.jsonl`, one JSON event per line. The root is `ledger.path` from the configuration, else `$FW_HOME/runs`. When `/workspace` exists, as under ax, `$FW_HOME` is `/workspace/.fw`. Elsewhere it is `./.fw`.

The file `<root>/index.jsonl` records each run id once, in the order of creation, with the time of its first event. The state of a run comes from its ledger, never from the index.

The driver only appends. Each append gives the event the next sequence number and writes one line. For most events, the append returns at once. For these events, the append calls `fsync` and returns only after the line is on disk (`needsIntentSync`):

- `fw.run.queued`, for every origin: the native API, the command line, the bus intake, and a tool
- `fw.message.received` from outside the kernel, `fw.budget.changed`, and `fw.run.annotated`, because the kernel acknowledges each one to its caller
- `fw.approval.requested` and `fw.approval.decided`
- `fw.run.finished`, the terminal event
- `fw.run.child`, because the kernel records a child before the spawner creates its process
- `fw.tool.requested` without `idempotent: true`, because the tool body runs only after the append returns

The notes of the kernel about time, the budget, a loop, the final report, and an outcome stay batched, with the model events. They reach the disk at the next sync or at `Flush`. A message whose origin is missing or unreadable counts as external.

The first durable append of a run also syncs the directory of the run and the root. A failed `fsync` returns an error and keeps the debt for a later append. A crash can leave a partial last line, and the next open cuts it off. A finished run closes its file, and a follow-up opens it again. These guarantees stand on the `fsync` of the file system, and they do not make an external effect exactly-once.

### One writer for each root

`OpenFileLedger` takes exclusive writer ownership of the root directory until `Close`. It takes a `flock` on the inode of the root, not on a lock file. A symbolic link to the same directory therefore contends for the same lock. A second writer, in this process or in another one, gets `fw.ErrLedgerLocked`, with the message `fw: file ledger: another writer owns this root`. The system releases the lock when the owner exits. Linux, macOS, and the BSD systems have `flock`, and on another system a writable open fails.

`Flush` syncs the outstanding writes and keeps the ownership. `Close` flushes, ends the watches, and releases the ownership even when the flush fails. A closed ledger stays closed: each later call gets `fw.ErrLedgerClosed`. The lock is a local fence on one file system, not a distributed lease. Give each worker a home and a ledger of its own.

`OpenFileLedgerReadOnly` opens an existing root without the writer lock. It never repairs, creates, or syncs a file, and it reads complete lines only. A later `Read` sees the later appends of the writer, but the reader gets no snapshot across runs and no watch. `fw events` and `fw replay --ledger` use this mode, so both read beside a running server. A replay still needs the writer lock of the ledger that receives the new run. See [fw commands](../reference/fw-commands.md#fw-replay).

### Fail-stop on a storage failure

The first failure of a ledger append, or of a read of a run for its driver, stops the process from writing (`failStorage` in `fw/lifecycle.go`). From that moment:

- The kernel cancels the local work and blocks every write. A start, a follow-up, a decision, a budget change, and a cancel get `fw.ErrStorageUnavailable`, and the native API answers 503.
- `Agent.Ready` is false, and `/readyz` answers 503 with `storage failed; execution blocked until restart`.
- `Agent.RuntimeError` keeps the cause.
- A read of an open run shows the field `blocked` (`Run.Blocked`) beside the last recorded state. The field lives in memory only, never in the ledger.
- A caller that waits for a run gets the storage error.

The kernel never retries an append whose result is unknown, because a failed append can still have reached the disk. It also invents no terminal event. Repair the storage and restart the process. The restart rebuilds every run from what reached the ledger, and an interrupted tool call follows the resume rules. An external effect that was in flight can still finish, and the kernel does not roll it back. A process that is blocked cannot append `fw.run.suspended` at a later `SIGTERM`. See [section 5.6](../design/kernel-architecture.md#56-process-duties).

## Projections

A projection is an `Observer`: a function that receives each event once, in order, after the ledger stored it, and never writes to the ledger. The two pure projections are in `fw/projection.go`. The kernel keeps one of each per active run and folds each event once.

`ProjectHistory` builds the message history that the next model call sends. It starts at the latest `fw.context.compacted`, with a user message that holds the summary. The input of `fw.run.queued` is the first user message. Each `fw.message.received` with the role `user` or `system` adds a message. Each `fw.model.responded` adds the assistant message with every block, opaque blocks included. The `fw.tool.responded` events of one response become one user message of tool results, in the order of the calls. A call that never got a result gets an error result, so every request has a valid history.

`ProjectRun` builds the run object that every surface returns (`Run.Apply`). It sets the state, as [The run lifecycle](../concepts/run-lifecycle.md#the-states) describes. It counts the turns from `fw.turn.started` and the tool calls from `fw.tool.requested`. It adds the tokens of each `fw.model.responded`, `fw.run.annotated`, and `fw.context.compacted`. If the kernel has a price table, it adds the cost too. A `fw.run.finished` or `fw.run.suspended` with totals sets the usage to those totals, so a reader that saw only the lifecycle events knows the usage. The field `usageSeq` names that event. The projection also holds the pending approval, the metadata, the title from the key `fw.title` or from the input, and the budget changes.

The kernel also keeps an execution cursor per active run (`executionCursor` in `fw/cursor.go`). The cursor says what the driver does next. It reads the events once, at a cold load, and after that it decodes only the events after its last boundary. A step of a long run therefore does not scan the whole history again. The ledger keeps every event, and compaction bounds the history that the model reads, not the ledger. See [section 5.1](../design/kernel-architecture.md#51-run-and-turn).

The kernel ships more observers: `metrics` for Prometheus, `bus` for the egress, `a2a` for task updates, and `trace` for OpenTelemetry spans. Each holds no state that the ledger does not hold. See [section 4.4](../design/kernel-architecture.md#44-projections).

## Resume

At boot, `rebuild` in `fw/resume.go` reads the index, projects every run, and finds the runs whose state is not terminal. For each one, `resume` appends `fw.run.resumed` with the sequence number of the last event and starts a driver. The driver reads the log and continues from the last complete point: a model request without an answer goes out again, and a tool call without a result follows the resume rules. A run that waits for a decision stays idle until the decision. The rules are on [The run lifecycle](../concepts/run-lifecycle.md#resume-from-the-ledger-at-boot), and the design document gives them in [section 4.5](../design/kernel-architecture.md#45-resume).

A branch in another process that never started, and a child whose start was open, are also handled at boot. The kernel records such a run as failed with the reason, so nothing is lost without a trace.

## Replay

A replay runs a recorded run again and answers every tool call from the recorded results. `fw replay <run-id>` starts one. The flag `--model` names the model selector of the replay. `--ledger` names the root of a file ledger that holds the run. `--json` prints the new run as JSON. The design document, [section 4.6](../design/kernel-architecture.md#46-replay), writes the command as `fw replay <ledger> --model <selector>`. The verb takes a run id instead, and it reads the configured ledger unless `--ledger` names another.

`fw.Replay` in `fw/replay.go` starts a new run from the recorded run: its agent, input, instructions, inline profile, budget, and metadata. The metadata gets the key `replayOf` with the id of the recorded run. The new run gets the brief, the context, and the time zone of the recorded run. It therefore sees the same memory index and the same date. The kernel resolves the profile again, so a change of the prompt in the configuration shows in the replay.

Every tool of the replay answers from the recorded `fw.tool.responded` events. A recorded result matches a call of the same tool name with the same canonical JSON input. Object key order and whitespace do not matter, and number literals keep their spelling. Repeated identical calls consume one recorded result each, in ledger order. A call that no recorded result matches gets an error result that names the call and what the ledger holds. No live tool ever runs, and the policy allows every call. The calls run one at a time, in the order of the response, because a replay drops the parallel-safe flag.

The result is a second ledger. A diff of the two is a regression test for a model change or a prompt change.

## Fork and branches

A run is its ledger and its workspace, so a run can branch. A branch is a new run whose ledger begins with a copy of the events of its source, up to one sequence number. `Agent.Fork` in `fw/fork.go`, `POST /v1/runs/{id}/fork` on the native API, and the tool `fork` of the workbench make one. The product direction, [section 3.3](../design/product-direction.md#33-ledger-replay-and-speculative-branching-fw-replay-and-fw-fork), names a verb `fw fork`, but the command line has no such verb.

The request has five fields:

- `seq`, the sequence number of the last event to keep. Zero keeps every event.
- `input`, a message from the person that follows the kept events.
- `model`, a model selector for the branch.
- `metadata`, entries that the branch adds to its metadata.
- `spawn`, true for a branch in another process.

The copied events get the id of the branch, new event ids, and the time of the copy. The `fw.run.queued` of the branch names the person who branched and carries the metadata `fw.forkOf`, the id of the source, and `fw.forkSeq`. It also holds `kept`, the number of copied events, so the branch counts its own work only. The branch has no parent, and the source does not change.

A branch goes on as a resumed run does. A model request without an answer is sent again, and a pending approval waits for its decision. An `input` follows the kept events as a follow-up, so a branch of a finished run goes on in another direction. Without an `input`, a branch that keeps the end of a finished run stays finished. The kept events are the same bytes as in the source. The branch therefore keeps the prompt cache prefix of the provider up to the branch point.

A local branch runs in the same process. It shares the workspace of the process, and with `tools.files.perRun` it works in the directory of its source. The source and its branches see each other's changes.

A remote branch runs in another process. `spawn: true` asks the `Spawner` of the agent, which must be a `Forker`. `Place` creates the process, a child Task with the driver `ax`, and names it at once. The kernel records the branch in the source as a child in `fw.run.child`. The route answers 202 with the branch as `queued`, with `member` set. In the background, `Branch` sends the kept events through `POST /v1/runs/fork` once the process runs. That route serves a trusted caller only: the static token or a workload. The source records the branch again with `started`. If the process does not take the branch, the kernel records a failed run under the id of the branch, with the reason. The driver `ax` then deletes the empty child Task. The branch has the workspace of its own Task, a fresh copy of the Workspace of the parent Task. The design document gives the rules in [section 4.7](../design/kernel-architecture.md#47-branches).

## Egress cursors

The bus egress publishes ledger events to `<egress>.<atespace>.<agent>.<type>`, where `<egress>` is `bus.egress`. `bus.egressTypes` limits the types with globs such as `fw.run.*`. The front of a fleet reads this stream.

With a ledger that implements `EgressCursors`, the file ledger, the ledger itself is the queue. The observer only names the run of each new event. One goroutine reads the events of the run after its cursor, publishes them in order, and saves the cursor. A cursor is the last sequence number that the bus confirmed, or that the filter skipped. An event that the bus did not confirm stays after the cursor, so the next boot sends it again. The egress is therefore at least once and never skips an event. A consumer must treat a second copy of an event by its id as the same event.

A cursor is a small JSON file under `<root>/.egress/<route>/<run>.json`, with both names hashed. It holds the sequence number, the event id at that number, and a byte offset as a hint. The route names the prefix, the atespace, and the filter, so a changed route sends the history again. One pass publishes at most 128 events per run. A full pass over every run of the ledger comes at start and then every minute. If the bus refuses, the goroutine waits with a pause that doubles up to 30 seconds. A ledger without cursors, such as `mem`, keeps an ordered queue in memory, up to 10,000 events, which a crash can lose. The design document covers the egress in [section 9.4](../design/kernel-architecture.md#94-egress).

## Sources

- `featherweight-kernel/fw/event.go`
- `featherweight-kernel/fw/ledger.go`
- `featherweight-kernel/fw/ledger_file.go`
- `featherweight-kernel/fw/ledger_file_egress.go`
- `featherweight-kernel/fw/ledger_file_lock_unix.go`
- `featherweight-kernel/fw/ledger_file_lock_unsupported.go`
- `featherweight-kernel/fw/lifecycle.go`
- `featherweight-kernel/fw/cursor.go`
- `featherweight-kernel/fw/memory.go`
- `featherweight-kernel/fw/runcontext.go`
- `featherweight-kernel/fw/run.go`
- `featherweight-kernel/fw/agent.go`
- `featherweight-kernel/fw/mem.go`
- `featherweight-kernel/fw/projection.go`
- `featherweight-kernel/fw/replay.go`
- `featherweight-kernel/fw/fork.go`
- `featherweight-kernel/fw/busio.go`
- `featherweight-kernel/fw/resume.go`
- `featherweight-kernel/fw/kernel.go`
- `featherweight-kernel/fw/annotate.go`
- `featherweight-kernel/fw/outcome.go`
- `featherweight-kernel/fw/intake.go`
- `featherweight-kernel/fw/registry.go`
- `featherweight-kernel/harness/harness.go`
- `featherweight-kernel/cli/verbs.go`
- `featherweight-kernel/cli/cli.go`
- `featherweight-kernel/surface/native/native.go`
- `featherweight-kernel/examples/fw.yaml`
- `featherweight-kernel/docs/ARCHITECTURE.md` (sections 4, 5.1, 5.6, and 15)
- `featherweight-kernel/docs/KERNEL_MAP.md` (section 2)
- `featherweight-workbench/docs/PRODUCT_DIRECTION.md` (section 3.3)
- `featherweight-workbench/surface/mcp/tools.go`
