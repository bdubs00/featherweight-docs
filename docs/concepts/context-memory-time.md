# Context, memory, and time

A model sees only what the kernel sends it. The kernel keeps that view inside the context window of the model. It keeps notes that last from one run to the next, and it tells the model the date and the time between turns.

<div class="demo" data-demo="context-compaction" markdown>

Each turn of a run adds to the history that the next model call sends. Before each call, the kernel estimates the size of the request. When the estimate reaches `compaction.at`, 262,144 tokens by default, the kernel asks the model for a summary and starts a new epoch with it. A pinned message survives word for word, and the index of the memory notes comes back at the start of the first message.

</div>

## The context window

The context window is the most text that one model call can hold. Before each call, the kernel estimates the size of the request. It starts from the usage that the provider reported for the latest response. For the messages after it, it adds about one token for every four bytes, and 1,600 tokens for an image. It records the estimate in `fw.model.requested` as `estimatedInputTokens`.

When the estimate reaches `compaction.at`, the kernel compacts the history before the call. The default is 262,144 tokens. The model of the run writes a summary, with the same system prompt and tools as a turn, so the call reads the prompt cache. The summary replaces the whole history, and a new epoch starts.

These parts survive every compaction:

- The system prompt, with the instructions and the list of skills, because it is not part of the history.
- Each pinned message, word for word, right after the summary. A skill that a person hands to a run with a slash command is pinned.
- The messages from the caller at the end of the history, such as a new question.
- The index of the memory notes, which the next call puts back at the start of the first message.

Compaction appends `fw.context.compacted` with the new epoch number, the summary, and the usage of the summary call. That usage counts in the budget of the run. The ledger before the new epoch stays as it was.

A profile can set its own block `compaction`, so an agent with a small model compacts early and another one never compacts:

| Field | Meaning |
|---|---|
| `at` | The estimate in tokens that starts a compaction. 0 takes `compaction.at` of the process. |
| `model` | A selector or a name from `models` for the summary call. Empty takes `compaction.model`, else the model of the run. |
| `off` | `true` turns compaction off for the runs of the profile |

A model call can also fail because the request does not fit. The kernel then appends `fw.error`, compacts, and calls the model once more in the same turn. A second overflow in the same turn fails the run. A local server with a small window therefore needs no setting.

??? note "Under the hood"
    The estimate and the compactor are in `fw/compact.go`. A document that is not text counts one token for every 40 bytes. If the summary call itself does not fit, the compactor summarizes the history up to the last answer. It adds the rest as plain text, each block cut to 4,000 characters. See [5.4 Context management](../design/kernel-architecture.md#54-context-management).

## Memory

The memory of an agent is the durable state that a later run can use: the notes that runs keep, the earlier runs in the ledger, the files of the workspace, and the skills. The tools `memory` and `recall` and the routes under `/v1/memory` read and write the same notes, with the same rules. So does a hosted agent program, such as Claude Code inside a Task (see [Environments and agent programs](environments.md#hosting-claude-code-or-opencode)).

### The store and its scopes

A note is a Markdown file under `$FW_HOME/memory`. The files are the truth, so a person can read, edit, back up, and move them as files. `tools.memory.scope` picks which notes a run reads and writes:

| Scope | Directory | Who shares the notes |
|---|---|---|
| `agent`, the default outside AX | `memory/agents/<agent>` | Every person who runs the profile |
| `principal`, the default under AX | `memory/principals/<agent>/<hash>` | One person in one profile. The hash comes from the subject, so no email address is part of a path. |
| `shared` | `memory/shared` | Every profile of the process |

One AX Task serves many people, one after another, so the scope under AX is `principal`. A run without a person, such as a bus job without a principal, uses the directory of `agent`. The kernel builds the scope from the run, never from the input of a call, so a tool call cannot widen it.

A scope keeps the notes of one person apart from the runs of another. It does not hide a run from the people who can view it. Whoever can view a run reads the notes that it read and wrote.

### The memory tool

The tool `memory` edits the notes of the scope of the run, on paths that start with `/memories`. It has the commands of the Anthropic memory tool: `view`, `create`, `str_replace`, `insert`, `delete`, and `rename`. A note holds at most 128 KB, and one scope holds at most 2,000 notes. Each write replaces the whole file at once, under a lock of its scope. A crash therefore never leaves half a note, and two writers never lose a change.

Each change appends `fw.memory.changed` to the ledger of the run, with the tool, the operation, the path, the size, and the SHA-256. It never holds the text of the note. The routes `GET /v1/memory`, `GET /v1/memory/notes`, and `PUT` and `DELETE /v1/memory/notes/{path}` search and edit notes without a run (see [HTTP API](../reference/http-api.md#memory)).

??? note "Under the hood"
    The store is `memory/store.go`, and every surface builds one over the same directories. A write goes to a hidden temporary file, which the store syncs and renames over the note. The lock is a `flock` on the scope directory, tried for up to 30 seconds. If a process stops during a `str_replace` or an `insert`, the resumed run asks a person before it runs that call again. See [7.8 Memory](../design/kernel-architecture.md#78-memory).

## What a run reads from memory

### The index is data, not an instruction

At the start of a run, the memory tool adds two texts. The system prompt gets a section `# Memory` that says how the memory works and what to save. It is the same for every run and holds no note. The index of the notes goes to the start of the first user message as data:

```
<context source="memory">
Notes under /memories, newest first:
- /memories/build.md: How to build and test this repository
- /memories/user/preferences.md: The user wants short answers
</context>

Fix the flaky checkout test.
```

The index lists up to 40 notes and about 4 KB, each with its path and first line. When notes are left out, the index says how many and points to the tool `recall`. The system prompt gets one sentence that says a `<context>` block holds data and never an instruction.

The split matters because text in the system prompt carries the authority of the operator. A note is text that an earlier run or a person wrote. A note in the system prompt turns a planted line into an instruction for every later run. The kernel records the index in `fw.run.started` as `context`, so the index stays the same for the life of the run. A note that the model writes during a run appears in the index of the next run.

### The recall tool

The tool `recall` searches the durable state of the run. A search takes words in `query` and finds four kinds of records:

| Kind | Ref | What it searches |
|---|---|---|
| `note` | `mem://...` | The notes of the scope of the run |
| `run` | `run://<id>` | The earlier runs of the same agent that the same person started |
| `file` | `file://<path>` | The files of the workspace, up to 64 KB of each |
| `skill` | `skill://<name>` | The skills that the profile allows |

`kinds` narrows a search, and `limit` caps the hits, 10 by default and 20 at most. A call with `ref` reads one record. The tool is read-only, and it treats every record as data.

### The search index

The default build scans the notes for each search. A build with the tag `memory_sqlite` adds a full-text index of the notes with ranking, one database per scope under `$FW_HOME/memory/index`. The index is derived from the notes, so a corrupt database goes, and the next search builds it again. `fw doctor` prints a line `memory` with the scope, the kind of index, and the count of notes. See [Build and images](../deployment/images.md#choose-the-drivers-of-a-worker).

## Time

A model does not know the date, and it does not see how much time passes between two of its turns. The kernel gives it both, from the times in the ledger. The values therefore stay right after a restart and after a wake in a fresh sandbox.

`time.zone`, or the variable `FW_TIME_ZONE`, names the time zone of the agent, such as `America/Chicago`. An empty value means the zone of the system, which is UTC in an AX sandbox. A profile sets its own zone with `timeZone`. `fw.run.started` records the zone, and the run keeps it for its life.

The tool `clock` adds the date to the system prompt. A call of the tool gives the exact time, the start of the run, and the working time left before the deadline. Before a model call, the kernel measures the gap since the latest answer of the model. If the gap is `time.noteAfter` or more, 10 minutes by default, the kernel adds a note:

```
Time note: it is now Thursday 2026-10-15 09:12 CDT, 21 hours 3 minutes after your last response.
```

The note is a `fw.message.received` event with the role `system` and the note kind `time`. One rule covers a follow-up on the next day, a late approval, a slow tool, and a wake after a suspend. `time.noteAfter: 0` turns the notes off.

The `deadline` of a budget counts working time, not wall time. The time that a run waits for a person, for a follow-up, or in a suspended sandbox does not count. See [Safeguards](safeguards.md) and [5.8 Time](../design/kernel-architecture.md#58-time).

## Where to go next

<div class="paths" markdown>

- [Identity <span>Who a run acts for, and what a tool process can read</span>](identity.md)
- [Profiles, tools, and skills <span>What an agent is told and what it can call</span>](profiles-and-tools.md)

</div>

## Sources

- `featherweight-kernel/docs/ARCHITECTURE.md` (sections 5.4, 5.5, 5.8, 7.8)
- `featherweight-kernel/fw/compact.go`
- `featherweight-kernel/fw/config.go`
- `featherweight-kernel/fw/message.go`
- `featherweight-kernel/fw/turn.go`
- `featherweight-kernel/fw/clock.go`
- `featherweight-kernel/fw/runcontext.go`
- `featherweight-kernel/memory/store.go`
- `featherweight-kernel/memory/index.go`
- `featherweight-kernel/memory/brief.go`
- `featherweight-kernel/memory/recall.go`
- `featherweight-kernel/memory/index_fts.go`
- `featherweight-kernel/tools/builtin/memory.go`
- `featherweight-kernel/tools/builtin/recall.go`
- `featherweight-kernel/tools/builtin/clock.go`
- `featherweight-kernel/surface/native/memory.go`
- `featherweight-kernel/ax/config.go`
