# Context, memory, and time

A model sees only what the kernel sends it. This page covers three things that the kernel manages for the model: the size of the context, the notes that last between runs, and the time. Each has a configuration block, an event in the ledger, and a tool or a note that the model reads.

## Context management

### The estimate before each call

Before each model call, the kernel estimates the size of the request (`contextTokens` in `fw/projection.go`). It starts from the usage that the provider reported for the latest response of the epoch: the input, cache read, cache write, and output tokens. To that it adds an estimate for the messages after that response. The estimate counts about one token per four bytes of text and 1,600 tokens per image. A document counts one token per 40 bytes. The constants are in `fw/compact.go`. Without a reported usage, the estimate covers the system prompt, the tool specifications, and the whole history. The kernel records the estimate in `fw.model.requested` as `estimatedInputTokens`.

### The summary at 150,000 tokens

When the estimate reaches `compaction.at`, the kernel compacts before the call (`maybeCompact` in `fw/compact.go`). The default is 150,000 tokens, and `compaction.at: 0` turns compaction off. The default compactor asks the model of the run for a summary. The summary call has the prefix of a turn, the same system prompt, tools, and effort, so it reads the prompt cache. The history gets one more user message that asks for a summary inside `<summary>` tags and forbids tool calls.

The summary replaces the whole history. The new epoch starts with one user message that holds an introduction and the summary. The kernel replays no earlier response, no tool call, and no thinking block, because a provider binds a thinking block to the history before it. The messages from the caller at the end of the history, such as a new question, carry no provider data. They therefore follow the summary word for word. A message that arrives during the summary call also goes to the new epoch.

If the summary call itself does not fit, the compactor summarizes the history up to the last assistant message. That part fit an earlier call. It adds the rest after the summary as plain text, and cuts each block to 4,000 characters. `compaction.model` sends the summary call to another model, a selector or a name from `models`. That model does not read the prompt cache of the run.

Compaction appends `fw.context.compacted` with the new epoch number, the summary block, the kept messages, and the usage of the summary calls. The usage counts in the budget, so the kernel checks the budget again after a compaction and before the call of the turn. The message history projection starts from the latest epoch. The system prompt is not part of the history, so the profile prompt, the skills list, and the memory index survive every compaction. The ledger before the epoch stays unchanged. See [section 5.4](../design/kernel-architecture.md#54-context-management).

### The retry after a context overflow

A model call can also fail because the request does not fit the context window. The kernel recognizes an overflow with `IsContextOverflow`: the error `fw.ErrContextOverflow`, or the error text of the provider. It appends `fw.error` with the note `compacting the context`, compacts, and calls the model again in the same turn. A second overflow in the same turn fails the run. A local server with a small window therefore needs no setting. With `compaction.at: 0`, the overflow fails the run at once.

## Memory

### The memory tool

The tool `memory` keeps notes between runs in files (`tools/builtin/memory.go`). It has the shape of the Anthropic memory tool `memory_20250818`: the commands `view`, `create`, `str_replace`, `insert`, `delete`, and `rename`, on paths that start with `/memories`. The tool is idempotent. The files live under `$FW_HOME/memory`, and `tools.memory.scope` picks the directory:

| `tools.memory.scope` | Directory | Meaning |
|---|---|---|
| `agent` (the default) | `$FW_HOME/memory/agents/<agent>` | Each agent profile has notes of its own |
| `shared` | `$FW_HOME/memory/shared` | Every profile uses one set of notes |

A child run uses the directory of its own profile. The tool user cannot read the home of `fw`, so a shell never reads the notes (see [Identity](../concepts/identity.md)).

### The index in the system prompt

At the start of a run, the memory tool adds a section to the system prompt. The section lists each note with its path and its first line, newest first, up to 40 files and about 4 KB. A `description:` field in front matter takes the place of the first line. The section also tells the model what to save. It looks like this:

```
# Memory

The memory tool keeps notes between runs under /memories. Each line below names a file and its first line, newest first. View a file when its line matters for the task.

- /memories/build.md: How to build and test this repository
- /memories/user/preferences.md: The user wants short answers

Save what a later run needs and cannot find in the workspace: a preference of the user, a decision and its reason, a fact that took effort to find. Start each file with one line that says what it holds, because that line appears here at the start of every run. Keep one topic in each file. Update a file instead of adding a second one, and delete a note that turns out to be wrong. Never store a secret, a key, or a password.
```

Without notes, the section says that the memory holds no notes yet. A tool that implements `fw.Briefer` adds such a section, and the kernel records the text in `fw.run.started` as `brief`. The prompt therefore stays the same for the life of the run, and its cached prefix stays valid. A note that the model writes during a run appears in the index of the next run. See [section 7.8](../design/kernel-architecture.md#78-memory).

## Time

A model does not know the date, and it does not see how much time passes between two of its turns. The kernel gives it both. Every time comes from the wall-clock times in the ledger and from the `Clock` of the agent (`fw/clock.go`). The uptime of the process plays no part. The values therefore stay right after a restart and after a resume in a fresh sandbox.

### The zone

`time.zone`, or the variable `FW_TIME_ZONE`, names the time zone of the agent with an IANA name, for example `America/Chicago` or `UTC`. An empty value means the zone of the system: the zone of `TZ`, else the zone of `/etc/localtime`, else UTC. A sandbox under ax sets neither, so its zone is UTC until `FW_TIME_ZONE` names another one. A profile sets its own zone with `timeZone`, or `FW_AGENTS_<NAME>_TIME_ZONE`. A child run without a zone takes the zone of its parent.

`fw.run.started` records the zone of the run, and the run keeps it for its life, after a resume and in a replay. The binary embeds the zone database, so a name resolves in an image without zone files. If a zone in the configuration does not resolve, the process stops at start. An inline profile with an unknown zone gets a 400 that names the field.

### The clock tool

The tool `clock` takes no input (`tools/builtin/clock.go`). It returns the exact time in the zone of the run and the start of the run. It also returns the working time so far and the working time left before the deadline. A run without a deadline reads `No deadline applies to this run.` The tool is read-only, idempotent, and parallel-safe. It is also a `Briefer`. Its section of the system prompt gives the date only, because a prompt that changes on every run cannot share the prompt cache:

```
# Time

Today is Wednesday, 2026-10-14, in the time zone America/Chicago. The clock tool gives the exact time, the time since this run started, and the working time left before its deadline. When time passes between two of your responses, a system message gives the new time.
```

If time notes are off, the last sentence is left out. The method `Agent.RunClock` gives the same values to Go code.

### The note after a gap

Before a model call, the kernel measures the gap since the latest model response or the latest time note (`timeNote` in `fw/turn.go`). The later of the two counts. If the gap is `time.noteAfter` or more, the kernel adds a time note. The default of `time.noteAfter` is 10 minutes, and 0 turns the notes off. A note looks like this:

```
Time note: it is now Thursday 2026-10-15 09:12 CDT, 21 hours 3 minutes after your last response. This run has 1 hour 40 minutes of working time left before its deadline.
```

The second sentence appears only for a run with a deadline. The first model call of a run gets no note, because the system prompt gives the date. One rule covers a follow-up on the next day, a late approval, a slow tool, and a restart after a suspend. The note is a `fw.message.received` event with the role `system`, the origin `kernel`, and the note kind `time`. It is an event and not text that a projection adds, because a history that changes after the fact breaks the prompt cache.

### Working time against the deadline

The `deadline` of a budget counts working time, and `fw.WorkingTime` computes it from the ledger. A run works from its input, a follow-up, an approval decision, or a resume. If it finishes, waits for a decision or an answer, or is suspended, it stops working. A gap with no event before `fw.run.resumed` means that the process stopped without a word, for example a sandbox that ax killed on suspend. The working period then ends at the last event before the gap. The time that a run waits for a person, for a follow-up, or in a suspended sandbox therefore does not count.

The budget notes give the working time that is left at 75 and 90 percent of the deadline. A model call that is in flight carries a timer for the time that is left. If the timer ends the call, the run reports and stops at its deadline. See [Safeguards](../concepts/safeguards.md#the-budget) and [section 5.8](../design/kernel-architecture.md#58-time).

## Sources

- `featherweight-kernel/fw/compact.go`
- `featherweight-kernel/fw/projection.go`
- `featherweight-kernel/fw/turn.go`
- `featherweight-kernel/fw/clock.go`
- `featherweight-kernel/fw/budget.go`
- `featherweight-kernel/fw/config.go`
- `featherweight-kernel/fw/event.go`
- `featherweight-kernel/fw/tool.go`
- `featherweight-kernel/tools/builtin/memory.go`
- `featherweight-kernel/tools/builtin/clock.go`
- `featherweight-kernel/tools/builtin/builtin.go`
- `featherweight-kernel/examples/fw.yaml`
- `featherweight-kernel/docs/ARCHITECTURE.md` (sections 5.4, 5.8, and 7.8)
