# Profiles, tools, and skills

A profile is a named agent configuration: a system prompt, a tool list, a policy, and a budget. A tool is a function that the model calls. A skill is a set of instructions for one kind of task. This page says what a profile holds, how the system prompt is built, which tools exist, and where each comes from.

## What a profile holds

The type `AgentProfile` in `fw/run.go` has these fields.

| Field | Meaning |
|---|---|
| `description` | One line that a listing and a parent run see |
| `system` | The system prompt: the text, or the path of a `.md` or `.txt` file that holds it |
| `instructions` | More texts, or files, that follow the system prompt in order |
| `skills` | Globs over skill names. `null` means every skill, and `[]` means none. |
| `tools` | Globs over tool names. Empty means every tool. |
| `model` | A `provider/model` selector, or a name from `models` |
| `effort` | `low`, `medium`, `high`, `xhigh`, or `max` |
| `timeZone` | An IANA zone name. Empty means `time.zone`. |
| `policy` | Rules that tighten the policy of the process (see [Safeguards](../concepts/safeguards.md#the-policy-rules)) |
| `budget` | Limits that replace the zero fields of `budget:` |
| `access` | The owners, operators, and viewers of the agent (see [Identity](../concepts/identity.md)) |
| `outcome` | A rubric for a grader (below) |

Profiles live in two places. The block `agents:` of `fw.yaml` holds one entry per name, and a variable such as `FW_AGENTS_REVIEWER_MODEL` sets one field. The directory `$FW_HOME/agents/` holds one file per profile, `*.yaml` or `*.yml` (`loadProfiles` in `config/config.go`). The name comes from the field `name`, else from the file name. A profile from `fw.yaml` wins over a file of the same name. A profile from a file is the kind that the workbench edits for people, because the kernel never writes `fw.yaml`.

```yaml
agents:
  reviewer:
    description: Reviews code changes and reports findings
    system: prompts/reviewer.md
    instructions: ["Say when a finding is a guess."]
    skills: ["review-*"]
    tools: [files, http, "git.*"]
    model: fast
    effort: medium
    timeZone: America/Chicago
    policy:
      ask: []
```

## Instructions and an inline profile for one run

A request shapes an agent for one run without a change of the configuration. The field `instructions` of a run request is text that follows the system prompt of the profile, for this run alone. The field `profile` is an inline profile that overlays the named profile (`AgentProfile.Overlay`). A set `system`, `model`, `effort`, or `timeZone` replaces the value of the profile. Instructions are appended. A `tools` or `skills` list replaces the list of the profile. The policy is the stricter of the two, so an overlay can tighten the rules but not loosen them. The budget takes every set field of the overlay, and the parent of a child run caps the result. An inline profile never carries `access`, so a request cannot grant itself a role.

When it queues the run, the kernel resolves the profile once and records the result in `fw.run.queued` as `resolved`. The run keeps it for its life, across follow-ups and restarts. A change of the profile reaches new runs only. An inline tool list can give a run more tools than its agent lists. The run object names them in `extraTools`, so every surface can tell the person.

The body of `POST /v1/runs` and the tool `run` of the workbench take the fields `instructions` and `profile`. The flags of `fw run` build the same: `--system`, `--instructions`, `--tools`, `--skills`, `--model`, `--effort`, and `--time-zone`. See [section 12.5](../design/kernel-architecture.md#125-profiles-instructions-and-skills).

## How the system prompt is assembled

`Agent.SystemPrompt` in `fw/prompt.go` composes the prompt in this order:

1. The `system` of the profile. If the profile has none, `DefaultSystemPrompt`.
2. The heading `# Instructions`, then the instructions of the profile, joined by a blank line.
3. The heading `# Instructions for this run`, then the instructions of the request.
4. The heading `# Skills`, then one line per skill that the profile can use: the name and the description.
5. The sections of linked packages, from `fw.RegisterPromptSection`, such as the Environment section of the package `env`.

The default prompt tells the model to work in small steps and to read before it writes. It forbids a push, a merge, a delete, or a send on the own judgment of the model. The prompt holds no text from a user or a tool.

A `Briefer` adds the rest. A tool that implements `fw.Briefer` returns a section at the start of the run, with the agent and the run in its context. The `memory` tool adds the section `# Memory`, which holds no note, and the `clock` tool adds the date. The kernel records that text in `fw.run.started` as `brief`. The prompt therefore stays the same for the life of the run, and its cached prefix stays valid. A resume and a replay see the same prompt.

Data from a tool never goes into the system prompt. A tool that implements `fw.ContextBriefer`, such as `memory` with the index of its notes, returns data for the start of the first user message. The kernel records it in `fw.run.started` as `context` and wraps it in a `<context>` block that names the tool. The system prompt then gets one sentence, `fw.ContextNote`, which says that such a block holds data and not instructions. See [Context, memory, and time](../concepts/context-memory-time.md#the-index-is-data-not-an-instruction).

## Skills

A skill is a directory with a `SKILL.md` file (`fw/skills.go`). The front matter names the skill and describes it in one line, up to 300 characters. Without a `name`, the directory name is the name. The skill keeps its scripts and references beside the file.

```
---
name: release-notes
description: Write the release notes of a repository from its git history since the last tag.
---
```

`tools.skills` lists the directories that hold skills, and the default is `$FW_HOME/skills`. Every subdirectory with a `SKILL.md` is one skill, and the first directory wins for a name that appears twice. Under ax, `spec.skills.path` of the Workspace is read too. The field `skills` of a profile selects the skills with globs, and the system prompt lists the selected ones.

The tool `skill` reads a skill on demand. Without a name it lists every skill. With a name it returns the body of `SKILL.md` and the files of the skill. The verb `fw skills` lists the skills, `fw skills <name>` prints one, and `--json` adds the directory and the files. The MCP server of the workbench serves the same files as the resources `fw://skills/<name>`. The example `examples/skills/release-notes` holds a `SKILL.md` and a script `scripts/commits.sh`.

## The built-in tools

The package `tools/builtin` registers each tool in `init` through `fw.RegisterTool`. `tools.builtin` in `fw.yaml` names the tools of the process. Its default list is `bash`, `files`, `http`, `memory`, `recall`, `skill`, `clock`, `ask_user`, `spawn_task`, and `await_task`. The package also registers `send`, which the default list in `examples/fw.yaml` leaves out. Each profile selects from the list with `tools`.

| Tool | What it does | Flags |
|---|---|---|
| `bash` | Runs a command in one shell per run, with the environment of a tool process | destructive |
| `files` | Views, creates, and edits files under the root of the workspace | none |
| `http` | Fetches a URL that matches a glob of `tools.http.allow`, with GET or POST | read-only, idempotent, parallel-safe |
| `memory` | Keeps notes between runs under `/memories`, in the scope of the run | none. Each call of `view`, `create`, `delete`, and `rename` is idempotent (`fw.CallIdempotency`) |
| `recall` | Searches and reads notes, earlier runs, workspace files, and skills | read-only, idempotent, parallel-safe |
| `skill` | Lists the skills, or reads one skill with its files | read-only, idempotent, parallel-safe |
| `clock` | Gives the time in the zone of the run and the working time left | read-only, idempotent, parallel-safe |
| `ask_user` | Asks the caller a question and waits for the answer | read-only |
| `spawn_task` | Starts a child run with its own task, prompt, tools, and budget | parallel-safe |
| `await_task` | Waits for a child run and returns its output | read-only, idempotent, parallel-safe |
| `send` | Publishes a message to a subject on the bus | none |
| `env` | Lists, adds, and removes the packages of the environment. Without the block `environment`, only a profile that names it gets it. | opt-in |

The flags come from the `Spec` method of each tool. The policy rules match them by name: `readonly`, `idempotent`, `destructive`, and `parallel`. With the provider Anthropic, `bash`, `files`, and `memory` use the native tool shapes `bash_20250124`, `text_editor_20250728`, and `memory_20250818`. See [section 7.2](../design/kernel-architecture.md#72-built-in-tools).

## MCP servers

The package `tools/mcp` is an MCP client for every entry under `tools.mcp`. An entry with `endpoint` uses the Streamable HTTP transport, and an entry with `command` and `args` uses the stdio transport. The tools of a server appear to the model as `<server>.<tool>`, so a policy rule names `git.*` or `git.commit`. Each entry has `name`, `title`, `tls`, `auth`, `headers`, `timeout` (60 seconds by default), and `trusted`. With `trusted: true`, the kernel takes the annotations and the titles of the server as true.

The block `auth` has three options:

- `bearer`: the name of a secret, sent as `Authorization: Bearer` on every request.
- `oauth`: OAuth 2.1 with `clientId`, `clientSecret`, `scopes`, `issuer`, and `grant`. The grant `client`, the default, acts as the agent. The grant `user` acts for the person who started the run, who connects the service in the workbench. `exchange` adds an RFC 8693 token exchange for an issuer such as Keycloak.
- `spiffe`: a JWT-SVID of this workload as the bearer token, with `audience`. No shared secret is needed.

Under ax, the Workspace field `spec.mcp.servers` adds entries with `name`, `endpoint`, `command`, and `args`. The kernel merges them with `tools.mcp` by name, and the `fw.yaml` entry wins. To secure an endpoint that the Workspace declares, add an entry with the same name to `fw.yaml`. Give that entry the TLS and the auth fields. After five failures in a row, a server is down for 30 seconds, and each call to its tools returns an error at once. Above `tools.searchThreshold` tools, 24 by default, the Anthropic adapter registers a tool search tool and defers the rest. See [section 7.3](../design/kernel-architecture.md#73-mcp-client-over-http-and-https).

## A2A peers

The package `tools/a2a` turns each entry under `tools.peers` into one tool named `ask_<peer>`. A peer with `card` is resolved from that agent card URL. A peer with `ax: <atespace>/<task>` is an `fw` Task in the same cluster, and every request goes to the atenet router with the header `ate-target-actor`. The tool takes a message, follows the stream, and returns the final text. It is destructive and parallel-safe, so the default policy asks before a call. See [section 7.4](../design/kernel-architecture.md#74-a2a-peers).

## Parallel-safe tools

A tool with the flag `ParallelSafe` can run beside other calls. When one response holds several tool calls, the kernel runs consecutive parallel-safe calls at the same time (`execute` in `fw/turn.go`). Every other call runs alone. The results are recorded in the order of the calls. `http`, `recall`, `skill`, `clock`, `spawn_task`, `await_task`, and `ask_<peer>` are parallel-safe. A model that needs three things done therefore starts three children in one response. A replay drops the flag, so the recorded results are consumed in order.

## The tool user and the per-run directory

The shell of `bash` and a stdio MCP server run as the tool user of `tools.user`, away from the home of `fw` (see [Identity](../concepts/identity.md)). With `tools.files.perRun`, on by default under ax, each run works in `<root>/runs/<run id>`, which a child or a branch shares with its tree.

## Environments

The package `env` gives an agent packages on the durable volume. The block `environment` of `fw.yaml` names a `pyproject.toml` for `uv` and a `pixi.toml` for `pixi`, each with its lock file beside it. The package installs them once per digest, in the background, as the tool user, under `dir` (`/workspace/.environment` under ax). Every tool process gets the variables of the environment, such as `PATH` and `VIRTUAL_ENV`. The tool `env` lists, adds, and removes packages, and the default policy asks before `add` and `remove`. The Environment section of the system prompt names the packages. `fw doctor` reports the state and the registry hosts that the egress policy must allow, and `fw env dockerfile --from <image>` prints a Dockerfile for `placement: image`. See [section 18](../design/kernel-architecture.md#18-environments).

## The package `harness`

The block `harness` of `fw.yaml` makes the kernel host an agent program that people use on their laptops: `kind: opencode` or `kind: claude-code`. Every run of the process then becomes a session of that program instead of a run of the turn loop. The kernel keeps what makes a run durable: one ledger, one policy, one approval surface, and an idle run while a person decides. The program asks the kernel about each tool call, and the kernel answers from the policy of the run. A call that the policy asks about becomes `fw.approval.requested`, and after the decision, also after a cold boot, the kernel continues the same session. `home` names the directory of the sessions, `/workspace/.harness` under ax. The build tag `harness` links the package. See [section 19](../design/kernel-architecture.md#19-hosted-harnesses).

If its profile allows the tool `memory`, a hosted run gets the memory as a run of the turn loop does. The host reads that from `tools.builtin` and the tool list of the resolved profile, and it ignores the tool lists of ancestor profiles. A profile that allows `recall` alone gets only the tool `recall` of the server, without the memory section and the index. For a run whose profile allows `memory`, the added system text holds the memory section and `fw.ContextNote`. When the session has the memory server, one sentence between the two names its tools. The text follows the instructions of the run and never holds a note.

The index of the notes goes as data, in a `<context source="memory">` block, to the start of the first prompt with text of the session. Before that prompt goes out, the host records the `fw.harness.event` of the kind `fw.brief`, with `context: true` when the prompt holds the index. A stop, a resumed session, and a cold boot therefore never send the block twice. A message without text records no `fw.brief`, so the block waits for the first prompt with text. When the index leaves notes out, its last line says how many.

### The memory server

The native API serves the MCP server `fw-memory` on the loopback route `/v1/harness/memory/<secret>`, with four tools:

- `recall` searches the memory, and with a ref or the path of a note reads one record.
- `list` shows every note with its first line.
- `remember` writes the whole text of a note, with an optional hash for a compare-and-swap.
- `forget` deletes one note.

Claude Code gets the server in `--mcp-config`. It names the tools `mcp__fw-memory__recall`, `mcp__fw-memory__list`, `mcp__fw-memory__remember`, and `mcp__fw-memory__forget`. opencode gets the server in the block `mcp` of `OPENCODE_CONFIG_CONTENT`. It names the tools `fw-memory_recall`, `fw-memory_list`, `fw-memory_remember`, and `fw-memory_forget`. The ledger and the approvals keep these names. `recall` and `list` are read-only, and `remember` and `forget` have no flag.

The policy sees one name for each tool in both harnesses: `fw-memory.recall`, `fw-memory.list`, `fw-memory.remember`, and `fw-memory.forget`. One rule therefore fits both, such as `fw-memory.remember: path=/memories/private/*`, and the rule `*fw-memory*` matches each tool. The host also asks the policy under the name of the tool of the turn loop that does the same work (`memPolicy` in `harness/memory.go`). That name is `memory` for `remember`, `forget`, and `list`, with the field `command` set to `create`, `delete`, or `view`, and `recall` for `recall`. A verdict under that name counts when a rule gave it. A stricter `ask` or `deny` wins, so `ask: [memory]` holds for a hosted call, and an allow wins over a verdict that only the default gave.

Before it asks the policy, the host turns the input of a memory call into its canonical input. That is a JSON object with only the fields of the input schema of the tool. Each field has its exact name, appears once, and has its type. The path of a note takes its full form, such as `/memories/notes.md` for `notes.md`, and a null value of an optional field counts as absent.

A call without an input gets a deny. So does a call with a key that the schema does not name, a key twice, or a value of the wrong type. The reason of the deny names the key. The policy decides on the canonical input, because the MCP SDK does not check the arguments of a call against the schema.

The host also denies these calls before the policy decides:

- a call of `remember`, `forget`, or `list` when the profile of the run does not allow `memory` (`memRights` in `harness/memory.go`)
- a call of `recall` when the profile allows neither `memory` nor `recall`
- a `recall` with a file ref that has a hidden part
- a `recall` with a file ref that resolves inside the home of the harness, the home of `fw`, the ledger, or the configuration file
- a tool whose name differs from a tool of the server only by case, such as `mcp__FW-Memory__remember`
- a tool with the prefix of the server that is not one of its four tools, such as `fw-memory_view`

A run without the tool `recall` searches and reads only notes through the server (`memGet` in `harness/memory.go`).

### Arming

The server makes only a call that the policy of a run allowed. The host allows a memory call in the hook of Claude Code, or in its answer to a permission of opencode. At that moment it arms the call: it marks the call as allowed for its run, with its canonical input. It never arms a call whose input it did not see: a hook without `tool_input` gets a deny. So does a permission of opencode that comes before the input of its call. Its reason asks the harness to make the call again.

For a call that a person decided, the host arms the approved call, with the tool and the input of the approval. It does so only when the call of the request is that call. A decision answers one call once.

The server turns the arguments of each call into their canonical input too. It takes the armed call with the same tool and the same bytes. Before it makes the call, it checks the rights of the run again: `remember`, `forget`, and `list` need the tool `memory`, and `recall` needs `memory` or `recall`. It makes the call in the memory scope of the run, which the kernel builds from the run info, never from the caller.

An armed call ends with its run, and it expires after two minutes. Two runs never hold the same armed call. A second run that asks for it gets a deny, and the reason asks the harness to try again. Each write appends `fw.memory.changed` to the ledger of the run, without the text.

### The name fw-memory and a missing server

The name `fw-memory` belongs to `fw`, because a server of that name gets the text of each note and each query. The settings of each Claude Code process reject an entry of that name in the `.mcp.json` of the repository with `disabledMcpjsonServers`. The design says that the effect of this setting on the server of `--mcp-config` is not verified against a running Claude Code. For each session of opencode, the host reads the configuration that opencode resolved for the directory of the session, with `GET /config`. Its entry `fw-memory` must be the inline entry of the kernel and nothing more. Otherwise each memory call of the session gets a deny, and the host logs a warning.

The server is a route of the native API on a plain HTTP listener. `fw run` serves no route, and neither does a listener with `tls.provider` or a configuration without the surface `native` (`memBase` in `harness/memory.go`). A run with memory then gets the memory section and the index without the server. The host logs one warning, and the added system text and the index name no tool of the server. opencode serve waits up to 30 seconds for the route at a cold boot, and one second in a process that serves nothing. See [section 19.10](../design/kernel-architecture.md#1910-memory) and the limits in [section 19.9](../design/kernel-architecture.md#199-limits).

## Outcomes

A profile or a request can carry an `outcome` block with `rubric`, `grader`, and `iterations`. At the end of a successful run, the kernel starts a grader run as a child of the run. The grader has the same profile and the tool `files` in view mode only. The grader checks the answer and the changed files against the rubric and ends with a verdict. The kernel records each pass as `fw.outcome.evaluated`. A verdict of `needs_revision` gives the run one more turn with the notes of the grader, up to `iterations` passes. The run still finishes as `completed` with its last answer, and the run object shows the verdict in `outcome`. A child run never takes the outcome of its profile. See [section 20](../design/kernel-architecture.md#20-outcomes).

## Sources

- `featherweight-kernel/fw/run.go`
- `featherweight-kernel/fw/prompt.go`
- `featherweight-kernel/fw/profiles.go`
- `featherweight-kernel/fw/skills.go`
- `featherweight-kernel/fw/tool.go`
- `featherweight-kernel/fw/turn.go`
- `featherweight-kernel/fw/config.go`
- `featherweight-kernel/fw/replay.go`
- `featherweight-kernel/fw/outcome.go`
- `featherweight-kernel/fw/tooluser.go`
- `featherweight-kernel/fw/rundir.go`
- `featherweight-kernel/config/config.go`
- `featherweight-kernel/cli/run.go`
- `featherweight-kernel/cli/verbs.go`
- `featherweight-kernel/tools/builtin/builtin.go`
- `featherweight-kernel/tools/builtin/bash.go`
- `featherweight-kernel/tools/builtin/files.go`
- `featherweight-kernel/tools/builtin/http.go`
- `featherweight-kernel/tools/builtin/memory.go`
- `featherweight-kernel/fw/callidem.go`
- `featherweight-kernel/tools/builtin/recall.go`
- `featherweight-kernel/fw/runcontext.go`
- `featherweight-kernel/tools/builtin/skill.go`
- `featherweight-kernel/tools/builtin/clock.go`
- `featherweight-kernel/tools/builtin/ask_user.go`
- `featherweight-kernel/tools/builtin/spawn_task.go`
- `featherweight-kernel/tools/builtin/await_task.go`
- `featherweight-kernel/tools/builtin/send.go`
- `featherweight-kernel/tools/mcp/mcp.go`
- `featherweight-kernel/tools/a2a/a2a.go`
- `featherweight-kernel/env/env.go`
- `featherweight-kernel/env/tool.go`
- `featherweight-kernel/harness/harness.go`
- `featherweight-kernel/harness/core.go`
- `featherweight-kernel/harness/memory.go`
- `featherweight-kernel/harness/claudecode.go`
- `featherweight-kernel/harness/opencode.go`
- `featherweight-kernel/examples/fw.yaml`
- `featherweight-kernel/examples/skills/release-notes/SKILL.md`
- `featherweight-kernel/docs/ARCHITECTURE.md` (sections 7, 12.5, 18, 19, and 20)
