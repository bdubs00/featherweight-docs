# Profiles, tools, and skills

An agent profile is the recipe of one agent: what it is told, which tools it can call, which skills it can read, which model it uses, and how far it can go. A tool is something the model can do, such as run a command. A skill is a set of instructions for one kind of task, which the model reads on demand.

## What a profile holds

A profile has a name and these fields. Every field is optional, and an empty field takes the setting of the process.

| Field | Meaning |
|---|---|
| `description` | One line that a listing and a parent run show |
| `system` | The system prompt: the text, or the path of a `.md` or `.txt` file that holds it |
| `instructions` | More texts or files that follow the system prompt, in order |
| `tools` | Globs over tool names. Empty means every tool except an opt-in tool. |
| `skills` | Globs over skill names. No list means every skill, and `[]` means none. |
| `model` | A `provider/model` selector, or a name from `models` |
| `effort` | `low`, `medium`, `high`, `xhigh`, or `max` |
| `timeZone` | An IANA zone name, such as `America/Chicago` |
| `policy` | Rules that make the policy of the process stricter (see [Safeguards](safeguards.md)) |
| `budget` | Limits for each run of the profile |
| `access` | The owners, operators, and viewers of the agent (see [Identity](identity.md#what-each-person-can-do)) |
| `outcome` | A rubric that a grader checks at the end of each run (see [Outcomes and check runs](outcomes.md)) |
| `compaction` | When the runs of this profile summarize their history (see [Context, memory, and time](context-memory-time.md)) |
| `routines` | The routines of the agent (see [Routines](../guide/routines.md)) |

```yaml
agents:
  reviewer:
    description: Reviews code changes and reports findings
    system: prompts/reviewer.md
    instructions: ["Say when a finding is a guess."]
    tools: [files, http, "git.*"]
    skills: ["review-*"]
    model: fast
    effort: medium
```

Profiles live in two places on one process. The block `agents:` of `fw.yaml` holds one entry per name. The directory `$FW_HOME/agents/` holds one `*.yaml` or `*.yml` file per profile. A profile of `fw.yaml` wins over a file of the same name. The kernel never writes `fw.yaml`, so the file directory is where a program edits profiles.

In a fleet, the workbench owns the profiles of its pools. A pool is a set of workers, sandboxes that run one profile. An edit in bossmode, or with the MCP tool `agent_put`, goes to the overlay of the pool. The overlay holds the profiles that the workbench keeps for the pool. Every worker of the pool gets the edit at its next idle moment. Each entry of `tools` must then name a tool that the workers have, or the workbench refuses the profile and names what the pool offers. See [14.9 Profiles and rules of a pool](../design/workbench-architecture.md#149-profiles-and-rules-of-a-pool).

## Shaping one run

A request can change an agent for one run without a change of the configuration. The field `instructions` of a request is text that follows the system prompt for this run alone. The field `profile` is an inline profile that lays over the named profile:

- A set `system`, `model`, `effort`, or `timeZone` replaces the value of the profile.
- Instructions are added after the instructions of the profile.
- A `tools` or `skills` list replaces the list of the profile.
- The policy is the stricter of the two, so an overlay can tighten the rules but not loosen them.
- An inline profile never carries `access`, so a request cannot grant itself a role.

The kernel resolves the profile once, at the queue of the run, and records the result in `fw.run.queued`. The run keeps it for its whole life, across follow-ups and restarts, so a change of the profile reaches new runs only. An inline tool list can give a run more tools than its agent lists. The run object then names them in `extraTools`, so every surface can tell the person.

`POST /v1/runs` and the MCP tool `run` take `instructions` and `profile`. On the command line, `fw run` builds the same overlay from `--system`, `--instructions`, `--tools`, `--skills`, `--model`, `--effort`, and `--time-zone`. See [12.5 Profiles, instructions, and skills](../design/kernel-architecture.md#125-profiles-instructions-and-skills).

## How the system prompt is built

The kernel builds the system prompt in this order:

1. The `system` of the profile, or a short default prompt. The default tells the model to work in small steps and to read before it writes. It also tells the model never to push, merge, delete, or send on its own judgment.
2. `# Instructions`, with the instructions of the profile.
3. `# Instructions for this run`, with the instructions of the request.
4. `# Skills`, with one line per skill that the profile allows: the name and the description.
5. The sections that linked packages add, such as the Environment section (see [Environments and agent programs](environments.md)).

At the start of a run, some tools add a short section of their own. The memory tool adds how the memory works, and the clock tool adds the date. The kernel records that text in `fw.run.started` as `brief`. The prompt therefore stays the same for the life of the run, and its cached prefix stays valid.

Data from a tool never goes into the system prompt. The index of the memory notes goes to the start of the first user message instead. A `<context>` block holds it, and the model reads the block as data. See [Context, memory, and time](context-memory-time.md#the-index-is-data-not-an-instruction).

## The tools

`tools.builtin` names the built-in tools of the process, and each profile selects from them with `tools`.

| Tool | What it does |
|---|---|
| `bash` | Runs a command in one shell per run. Destructive, so the default policy asks a person. |
| `files` | Views, creates, and edits files under the root of the workspace |
| `http` | Fetches a URL that matches a glob of `tools.http.allow` |
| `memory` | Keeps notes between runs, in the scope of the run |
| `recall` | Searches the notes, the earlier runs, the workspace files, and the skills |
| `skill` | Lists the skills, or reads one skill with its files |
| `clock` | Gives the time in the zone of the run and the working time left |
| `ask_user` | Asks the caller a question and waits for the answer |
| `spawn_task`, `await_task` | Start a child run with its own task and budget, and wait for its output |
| `decide` | Asks a decider typed questions. It exists only with an entry in `deciders`. |
| `send` | Publishes a message on the bus. Registered, but not in the default list. |
| `env` | Lists, adds, and removes the packages of the environment (see [Environments and agent programs](environments.md)) |

The default list holds every tool of the table except `send` and `env`. The workbench adds `propose_agent`, which the agent builder uses.

Each tool carries flags that the policy matches by name: `readonly`, `idempotent`, `destructive`, and `parallel`. Some tools are parallel-safe, such as `http`, `recall`, and `spawn_task`. If one response of the model holds several such calls, the kernel runs them at the same time.

### Tools from other servers

Each entry of `tools.mcp` is an MCP server. An entry with `endpoint` speaks HTTP, and an entry with `command` starts a local process. The model sees each tool as `<server>.<tool>`, so a policy rule names `git.*` or `git.commit`. The block `auth` of an entry sends a bearer secret or a SPIFFE identity. It can also run OAuth, as the agent or for the person of the run. After five failures in a row, the kernel marks a server down for 30 seconds.

Each entry of `tools.peers` is another agent, reached over A2A, and becomes one tool named `ask_<peer>`. Above `tools.searchThreshold` tools, 24 by default, the Anthropic adapter lets the model search the tool list instead of loading every schema.

??? note "Under the hood"
    The built-in tools register in `tools/builtin`, and their flags come from the `Spec` method of each. With the provider Anthropic, `bash`, `files`, and `memory` use the native tool shapes of Anthropic. The MCP client is `tools/mcp`, and the A2A client is `tools/a2a`. See [7. Tools](../design/kernel-architecture.md#7-tools).

## Skills

A skill is a directory with a `SKILL.md` file. Its front matter gives the name and a description of up to 300 characters, and the body holds the instructions. Scripts and references can sit beside the file.

```
---
name: release-notes
description: Write the release notes of a repository from its git history since the last tag.
---
```

The kernel reads skills from three places:

- The directories of `tools.skills`, `$FW_HOME/skills` by default. Each subdirectory with a `SKILL.md` is one skill.
- Under AX, the directory that the Workspace names in `spec.skills.path`.
- The MCP servers of `tools.mcp` that serve skills. Such a skill is named `<server>/<name>`, such as `github/review`, so it never hides a local skill.

The system prompt lists each skill that the profile allows, by name and description. If the task needs a skill, the model reads the whole skill with the tool `skill`. `fw skills` lists the skills on the command line, and `fw skills <name>` prints one.

A person can also hand a skill to a running conversation with a slash command in bossmode, such as `/release-notes`. The workbench sends the body of the skill as a pinned message, so the skill survives every summary of the history. An admin imports new skills from a URL, a marketplace, or a paste. See [Skills, tools, and packages](../guide/skills.md) for the operator view.

## Where to go next

<div class="paths" markdown>

- [Context, memory, and time <span>What the model sees, what lasts between runs, and the clock</span>](context-memory-time.md)
- [Skills, tools, and packages <span>Give an agent skills and tools from bossmode</span>](../guide/skills.md)

</div>

## Sources

- `featherweight-kernel/docs/ARCHITECTURE.md` (sections 7, 12.5)
- `featherweight-kernel/fw/run.go`
- `featherweight-kernel/fw/prompt.go`
- `featherweight-kernel/fw/grants.go`
- `featherweight-kernel/fw/event.go`
- `featherweight-kernel/fw/skills.go`
- `featherweight-kernel/fw/config.go`
- `featherweight-kernel/fw/turn.go`
- `featherweight-kernel/config/config.go`
- `featherweight-kernel/cli/run.go`
- `featherweight-kernel/cli/verbs.go`
- `featherweight-kernel/tools/builtin/builtin.go`
- `featherweight-kernel/tools/builtin/decide.go`
- `featherweight-kernel/tools/mcp/mcp.go`
- `featherweight-kernel/tools/a2a/a2a.go`
- `featherweight-kernel/examples/fw.yaml`
- `featherweight-kernel/examples/skills/release-notes/SKILL.md`
- `featherweight-workbench/docs/ARCHITECTURE.md` (sections 14.9, 20)
