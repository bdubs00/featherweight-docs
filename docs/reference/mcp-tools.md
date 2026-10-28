---
wide: true
---

# MCP tools

The workbench serves an MCP server, so Claude Code, an editor, or another agent can use the fleet as a set of tools. This page lists every tool of that server, grouped by what you want to do, with its arguments and what it returns. Then come the resources, the prompts, and the rules of retries and disconnects.

The server lives in `fw-workbench`: at `/mcp` over HTTP, and over standard input and output with `fw-workbench mcp`. The kernel binary `fw` serves no MCP server. The server names itself `featherweight-kernel` with the title `featherweight agent`. The design document describes it in [section 3](../design/workbench-architecture.md#3-mcp-server-work-intake) and lists the tools in [section 6.1](../design/workbench-architecture.md#61-the-mcp-tools). In a fleet, the workbench is called the [front](../glossary.md#d-to-h), because it stands in front of the workers.

## Rules for every tool

Every result holds a text for the model and a structured value in `structuredContent`. If a result holds a run object and the run failed, `isError` is true. In the tables, `*` marks a required argument.

The role in a row is the role of the caller on the agent: owner, operator, or viewer. Admin means `access.admins`, and creator means `access.creators`.

| Rule | What it means |
|---|---|
| Registration | If its part of the workbench is off, a tool does not exist. Each section names the part. The tools of bridges, duties, the wiki, faces, playbooks, routines, and notifications need the bus `nats` or `mem` |
| Standard input and output | `fw-workbench mcp` starts no service. It serves no tool that needs a store, and no `fleet`, connection, or pool tool |
| Acting for a person | A worker reaches the server through a `tools.mcp` entry with the static token and `trusted: true`. Most tools then act as the person of the run that `_meta` names. The bridge, wiki, faces, skill, connection, and template tools keep the caller |
| A budget | `maxTurns`, `maxTokens`, `maxCostUSD`, `deadline`, `maxToolCalls`, `maxCallsPerTurn`, and `maxRepeats`. A `deadline` is a duration string such as `30m`, or nanoseconds |
| A file | `{name, data}`, with `data` in base64 |

## Start and follow work

These tools exist always, except `enqueue` and `batch`, which need `workbench.fleet.intake`. With the fleet on, nine tools act on a run of any member by its id: `run_status`, `run_events`, `run_result`, `run_file`, `approve`, `cancel`, `send`, `fork`, and `run_budget`. The front forwards the call to the member that owns the run, and that member decides.

| Tool | Arguments | Returns and purpose |
|---|---|---|
| `run` | `input`* `title` `agent` `instructions` `profile` `outcome` `wait` (default `true`) `budget` `requestId` `metadata` `files` (at most 20) `continues` `member` | The run object. Starts a run. With `wait`, it waits until the run ends or needs input, and sends one progress notification per turn. `member` runs on another member and returns at once. `continues` starts a new run of an earlier conversation, with its summary. Role: operator |
| `run_status` | `runId`* | The run object: state, output, pending approval, and usage. Role: viewer, or the person who started the run |
| `send` | `runId`* `content` `files` `budget` | The run object. A follow-up message, and a finished run starts a new turn. `budget` sets new limits first. Role: operator, or the person who started the run |
| `run_budget` | `runId`* `budget`* | `{budget, run}`. Changes the limits of a run, also of a run that works. Role: operator |
| `cancel` | `runId`* | The run object. Stops the model call and the tools in flight. Role: operator |
| `fork` | `runId`* `seq` (`0` keeps every event) `input` `model` `metadata` `spawn` | The branch. With `spawn`, the branch runs in a Task of its own. Role: operator on the run, and the right to run the agent |
| `run_result` | `runId`* | `{view: "result", result}`: the title, the status, what the run produced, and what it needs next. Role: viewer |
| `run_events` | `runId`* `limit` (1 to 500, default 50) `from` `before` `compact` | `{view, run, events, items, next, prev}`: one page of events. `from` reads forward, `before` reads back, and `compact` cuts each tool output to 200 characters. Role: viewer |
| `run_file` | `runId`* `path`* `raw` | The current content of a file that the run changed. With `raw`, the bytes up to 4 MiB as an embedded resource. Role: viewer |
| `capabilities` | none | `{view: "capabilities", tools}`: each tool of the runtime, with what it does in plain words |
| `enqueue` | `agent`* `items`* (1 to 500, each `input`*, `title`, `metadata`) `batch` `instructions` `budget` | `{view, batch, agent, queue, count}`. One run per item goes on the queue of the profile, and the call returns at once. Role: operator |
| `batch` | `batch`* | `{view, batch, total, states, members, waiting, failed, finished, usage, ...}`: how a batch of jobs goes |

`profile` is an inline profile for one run: `system`, `instructions`, `skills`, `tools`, `model`, `effort`, `timeZone`, `policy`, `budget`, `outcome`, and `compaction`. `outcome` takes `rubric`, `grader`, and `iterations` (0 to 10). The budget of `enqueue` takes only `maxTurns`, `maxTokens`, `maxCostUSD`, `deadline`, and `maxToolCalls`.

## Decide and manage agents

These tools exist always.

| Tool | Arguments | Returns and purpose |
|---|---|---|
| `approve` | `runId`* `approvalId`* `decision`* (`allow` or `deny`) `note` `content` `rule` | The run object. Decides an approval, or answers a question with `content`. With `rule` and `allow`, it first adds the tool to the policy of the pool of the agent. A rule needs the owner role and a pool. Role: operator, or the person who started the run |
| `whoami` | none | `{view, principal, roles, admin, canCreate, teams, fleet, links}`: who the caller is, and the role on every agent it can see |
| `agents_list` | none | `{view: "agents", agents}`: the profiles that the caller can view. With pools, each names its pool, its overlay, and the policy, tools, and packages of its workers |
| `agent_get` | `name`* `pool` | `{view: "agent", agent}`: one profile, what it can do in plain words, and its resolved skills. Role: viewer |
| `agent_put` | the fields of a profile, `dryRun`, `pool`, `workers` (`template`, `replicas` 0 to 64, default 2) | `{view, agent, created, pool}`. With `dryRun`, `{view: "draft", draft, pool}`. A new agent that no pool runs gets a runtime pool. Role: creator to create, owner to replace |
| `agent_delete` | `name`* `pool` | `{view, deleted}`. Also removes the runtime pool that `agent_put` made. The runs stay in the ledger. Role: owner |
| `agent_builder` | one of `input` and `fromRun` | The run of the builder, at once. Answer it with `send`, read its proposal with `run_result`, and save with `agent_put` |
| `runs_list` | `agent` `state` `principal` `by` (`me`, `team`, `others`) `parent` `batch` `limit` `scope` (`fleet` or `local`) `member` | `{view: "runs", runs, total, glance}`, newest first. `scope` and `member` exist with the fleet on |
| `dashboard` | `view` (`home`, `run`, `agent`, `usage`) `agent` `runId` | The MCP App `ui://fw/dashboard` for a host that renders MCP Apps, else the home as text. It is the only tool whose `_meta` names the page |
| `usage` | none | Deprecated. The sums of the visible runs. Operators read `/metrics` instead |

The fields of a profile in `agent_put` are `name`*, `description`, `system`, `instructions`, `skills`, and `tools`. Then come `model`, `effort`, `timeZone`, `policy`, `budget`, `outcome`, `compaction`, and `access`.

## Bridges and conversations

The bridge tools need the bridge store. `bridge` defaults to the bridge of the run that calls. Some tools serve only a run, such as a seat or the manager, and some serve only a person. See [Bridges and seats](../guide/bridges.md).

| Tool | Arguments | Returns and purpose |
|---|---|---|
| `bridge_read` | `bridge` `since` `limit` (1 to 500, default 50) `seq` | `{bridge, title, lastSeq, messages}`. Each entry shows its first 2 KB, and `seq` returns one entry whole. Runs only |
| `bridge_post` | `text`* `bridge` `to` `ask` `choices` (2 to 4). A person also has `replyTo`, `pinned`, and `files` | The message. A run posts as its seat or as `manager`, and `ask` asks the operator. A person must name `bridge` |
| `bridge_list` | none | `{bridges}`: the open bridges of the person of the run. Runs only |
| `bridge_open` | `title`* `members`* (each `handle`*, `agent`*, `task`*, `pool`, `budget`) `goal` `placement` (`queue` or `spawn`) `delegation` `caps` | The bridge. Opens a bridge as the person of the run. Runs only |
| `bridge_add_member` | `handle`* `agent`* `task`* `bridge` `pool` `budget` | The seat. Adds a seat. Runs only, with the delegation `members` |
| `bridge_remove_member` | `handle`* `bridge` | The seat. Fires a seat. Runs only, with the delegation `members` |
| `bridge_close` | `bridge` | The bridge. Closes it and cancels nothing. Runs only, with the delegation `report` |
| `bridge_patch` | `bridge`* `title` `state` (`open` or `closed`) `delegation` `caps` | The bridge. People only: the operator of the bridge, or an operator of the agent of each seat |
| `bridge_member_patch` | `bridge`* `handle`* `muted` `task` `continue` | The seat. Mutes, gives a new task to, or continues a seat. People only |
| `bridge_react` | `bridge`* `seq`* `reaction`* (`up`, `down`, `heart`) `note` `remove` | The message. A heart keeps the work in the wiki. People only |
| `bridge_mark_read` | `bridge`* `seq`* | `{bridge, read}`: moves the read mark. People only |
| `bridge_settle_question` | `bridge`* `seq`* | `{bridge, seq, settled}`: ends the question of a seat without an answer. People only |
| `conversation_patch` | `run`* `title` (at most 100 characters, empty restores it) `hidden` | `{run, myTitle, hidden}`: renames a conversation, or hides it from your own lists. It exists always and needs the right to view the run |

`delegation` names what the manager can do for the operator: `approve`, `budget`, `members`, and `report`. The default is `report` alone. `caps` takes `maxMessages` (2000), `maxFanoutPerMinute` (30), `maxPairMessages` (6), and `maxTurns` (1000).

## Duties

The duty tools need the duty store. A name is 1 to 63 lower-case letters, digits, `-`, or `_`. See [Duties](../guide/duties.md).

| Tool | Arguments | Returns and purpose |
|---|---|---|
| `duties_list` | none | `{duties, paused, reason}`. Role: viewer of each agent |
| `duty_get` | `name`* | The duty with its schedule read back in words, its next time, its state, and the last 50 starts. Role: viewer |
| `duty_put` | `name`* `duty`* `dryRun` `test` `timeZone` | `{duty, created}`. With `dryRun`, `{dryRun: {duty, readback, forDevelopers, next, problems, check}}`. Unknown fields are refused. Role: owner |
| `duty_preview` | `name`* `duty`* `test` `timeZone` | `{dryRun: {...}}`, and saves nothing. Role: owner |
| `duty_run_now` | `name`* | `{run, waiting, skipped, failed, duplicate}`. Starts the duty now. Role: owner |
| `duty_pause` | `name`* `paused`* | The duty. Pauses or resumes it. Role: owner |
| `duty_delete` | `name`* | `{name, deleted}`. Role: owner |
| `duty_write_check` | `name`* `words`* `agent` `budget` | `{checkFirst, readback, forDevelopers, check, run}`. The agent of the duty writes the check from your words, and nothing is saved. Role: owner |
| `duties_pause_all` | `paused`* `reason` | `{paused, reason, by, at}`: the switch that pauses every duty. Role: admin |

## Attention and notifications

`inbox` exists always. The notification tools need the notification store and a person. See [Decisions and activity](../guide/decisions.md).

| Tool | Arguments | Returns and purpose |
|---|---|---|
| `inbox` | none | `{items}`: what needs the caller now. Each item has a `kind` (`approval`, `question`, `failure`, or `paused`), with its run, duty, agent, bridge, text, and time |
| `notifications_get` | none | `{channels, quietHours, offered, shared, serverDefault, off}`. A secret reads as `"set"` |
| `notifications_put` | `channels` (at most 10) `quietHours` (`from`, `to`, `timeZone`) `timeZone` | The same shape. Leave `channels` out to keep them, or send `[]` to clear them |
| `notification_test` | `channel` | `{results}`: sends a test now, to one channel or to all. A test of an agent channel starts a run |

A channel has an `id`, a `kind`, a `label`, and `send` switches for `questions`, `failures`, and `digest`. The kinds are `ntfy`, `slack`, `discord`, `teams`, `webhook`, `email`, `agent`, and `shared`.

## The wiki and playbooks

The wiki tools need the page store. They keep the caller: the static token reads and writes, and a run that writes through it is recorded as `agent:<profile>`. Another caller needs the operator role on some agent to read, and the owner role to write. The playbook tools need the playbook store. See [The wiki](../guide/wiki.md).

| Tool | Arguments | Returns and purpose |
|---|---|---|
| `pages_list` | `prefix` `limit` (1 to 1000, default 200) | `{pages, total, index}`: the tree of the wiki |
| `pages_read` | `path`* (ends in `.md`) `version` | `{page}`: the text, the hash, the version, the writer, and the time |
| `pages_write` | `path`* `text`* `summary` `ifHash` (a hash, `*`, or `absent`) | `{page, created, changed}`. `ifHash` makes the write a compare-and-swap |
| `pages_search` | `query`* `limit` (1 to 100, default 20) | `{q, results, read, unread, cut}` |
| `pages_history` | `path`* | `{path, versions}` |
| `playbooks_list` | none | `{playbooks}`: each with its goal, placement, seats, revision, and owner |
| `playbook_get` | `name`* | The playbook, with its caps and delegation |
| `playbook_put` | `name`* `playbook`* (`goal`, `placement`, `seats`, `caps`, `delegation`) `revision` | `{playbook, created}`. Role: the owner of the playbook, or an operator of the agent of each seat |
| `playbook_delete` | `name`* | `{name, deleted}` |

## Routines

The routine tools need the routine store and `workbench.routines.enabled`, which is on by default. See [Routines](../guide/routines.md).

| Tool | Arguments | Returns and purpose |
|---|---|---|
| `routines_list` | `agent` `name` | `{routines}`: each with its standing, readiness, sign-off, history, and evidence. Role: viewer |
| `routine_standing` | `agent`* `name`* `standing`* (`rehearsing`, `live`, `paused`, `retired`) `note` `version` | `{routine, moved}`. A move to `live` is a sign-off: it needs a person and writes the page `agents/<agent>/routines/<name>.md`. Role: owner |
| `routine_put` | `agent`* `name`* `routine`* `standing` (default `proposed`) `source` `replay` `note` | `{routine, created, changed}`. Role: operator to propose a new routine, owner for any other write |

## Skills, faces, and packages

The skill tools need `workbench.bossmode.enabled`. `faces_put` needs the face store. The package tools need the pool tools and `workbench.packages`. See [Skills, tools, and packages](../guide/skills.md).

| Tool | Arguments | Returns and purpose |
|---|---|---|
| `skills_list` | none | `{skills}`: the catalog, each with its origin, server, and arguments. Role: operator of some agent |
| `skill_send` | `name`* `args` `text`, one of `runId` and `bridge`, `to` | `{run}` or `{bridge, message}`. Sends a skill as a pinned message of the person. People only |
| `skill_preview` | `url`, or `marketplace` with `name`, or `text`, or `files` | The preview: name, description, files, digest, problems, and whether it can install. People only. Role: admin |
| `skill_install` | the preview arguments, `replace`, `digest` | `{skill, replaced, preview}`. `digest` is required for a URL or a marketplace. People only. Role: admin |
| `faces_put` | `agent`* `svg`* (at most 32 KB) | `{face, svg}`. Sets the face of an agent after the sanitizer. Role: owner |
| `packages_get` | `pool`* | `{view: "packages", packages}`: the lists of the pool and the state of each worker |
| `packages_put` | `pool`* `on`* `ask` `python` `tools` (at most 100 each) `dryRun` | `{view, packages, dryRun}`. The lists replace the lists of the pool. Role: owner |

## The fleet, pools, and connections

`fleet` needs the fleet on: `workbench.fleet.atespaces` or `workbench.fleet.egress`. The pool tools also need an entry in `workbench.pools` or `workbench.templates`. The connection tools need a `tools.mcp` entry with `auth.oauth.grant: user`. See [Pools and templates](../deployment/pools.md).

| Tool | Arguments | Returns and purpose |
|---|---|---|
| `fleet` | none | `{view, name, members, pools}`. Each member has its state: `live`, `quiet`, or `stopped`. It also has the time it was last heard, its agents, and its counts of runs |
| `pools_list` | none | `{view: "pools", pools}`: each with its template, agent, the Tasks it wants and has, and the reason for a gap |
| `templates_list` | none | `{view, templates}`: each with its name, whether it is the default, its atespace, and its model |
| `pool_put` | `name`* `agent` `template` `replicas` (0 to 64, required to create) `env` `resources` | `{view: "pool", pool, created}`. Role: creator to create, owner of the agent to change |
| `pool_delete` | `name`* | `{view, pool}`. Runtime pools only. Role: owner |
| `orphans_list` | none | `{orphans, removeAfter}`: child Tasks whose parent Task is gone. Role: admin |
| `orphans_remove` | none | `{removed, failed}`. Role: admin |
| `connections` | none | `{view, connections}`: each service that acts for the caller, whether it is connected, and the address that connects it |
| `disconnect` | `server`* | The same shape. Removes the grant. If the service allows it, the tool also revokes the grant there |

If a run needs a connection that the person has not made, the run waits in `input-required`, and `pending.connect` names the service. A client with URL elicitation gets the address `<base>/ui#connect/<server>/<run>`. A client with forms gets the choice `done` or `skip`. `approve` cannot allow a connect request. See [section 3.4](../design/workbench-architecture.md#34-connections-over-mcp).

## Resources, prompts, and retries

| Resource | Type | What it holds |
|---|---|---|
| `fw://runs/{id}` | `application/json` | The run object |
| `fw://runs/{id}/ledger` | `application/jsonl` | Every event of the run, one per line |
| `fw://runs/{id}/files/{+path}` | text, or a blob with its type | A file that the run changed, up to 4 MiB |
| `fw://skills/{+name}` | `text/markdown` | The `SKILL.md` of a skill, or of a skill of an MCP server as `<server>/<name>` |
| `ui://fw/dashboard` | `text/html;profile=mcp-app` | The page of the dashboard as an MCP App |

The three run resources read the runs of this process only. There is one prompt per profile that the caller can view, with the optional argument `input`.

| Topic | Rule |
|---|---|
| Transport | Over HTTP, the server checks `Origin` against `mcp.origins` and then authenticates. A request with `Mcp-Protocol-Version` of `2026-07-28` or later and no `Mcp-Session-Id` is stateless. Any other request gets a legacy session, which closes after one idle hour |
| Approvals in a call | A client with form elicitation gets a form with `decision` and `note`. Another client gets the run in `input-required`, and decides with `approve` or `POST /v1/runs/{id}/approvals/{approval}` |
| Retries | Pass `requestId` to make a retried `run` call return the same run. A form answer travels with a signed `requestState`. Its key comes from `FW_MCP_STATE_KEY`, else the file `mcp-state.key` under the home. It expires after `mcp.taskTTL` |
| Disconnects | If the connection closes, the `run` call ends, but the run goes on. Read it again with `run_status`. Only `cancel` stops a run |
| Exposed tools | `mcp.expose` re-exports local or upstream tools, such as `git.*`, under the same policy as a call of the model. An exposed tool never takes the name of a tool of this page |
| Caching | Discovery is public for 60 seconds, the tool list private for 60 seconds, and a read of a run is never cached |

## Tools for the model in a run

These tools are not tools of the MCP server. The model inside a run calls them.

| Tool | Where | What it does |
|---|---|---|
| `propose_agent` | `fw-workbench` | Shows a Create agent card with a name, description, instructions, and tools, and creates nothing. The builder run of `agent_builder` gets it. A profile has to name it |
| `decide` | both | Asks a decider typed questions and returns answers with probabilities. It needs a key of `deciders` |
| `fw-memory.recall`, `.list`, `.remember`, `.forget` | `fw` | The memory of a hosted Claude Code or opencode session, on a loopback route |
| The tools of this page | both | A worker reaches them through a `tools.mcp` entry with the static token and `trusted: true`. The manager calls them this way |

<div class="paths" markdown>

- [Use a fleet from Claude Code <span>Connect a client to /mcp</span>](../getting-started/from-claude-code.md)
- [Workbench routes <span>The same work over HTTP</span>](workbench-routes.md)

</div>

## Sources

- `featherweight-workbench/surface/mcp/mcp.go`
- `featherweight-workbench/surface/mcp/register.go`
- `featherweight-workbench/surface/mcp/tools.go`
- `featherweight-workbench/surface/mcp/work.go`
- `featherweight-workbench/surface/mcp/manage.go`
- `featherweight-workbench/surface/mcp/batch.go`
- `featherweight-workbench/surface/mcp/connect.go`
- `featherweight-workbench/surface/mcp/files.go`
- `featherweight-workbench/surface/mcp/fleet.go`
- `featherweight-workbench/surface/mcp/gateway.go`
- `featherweight-workbench/surface/mcp/resources.go`
- `featherweight-workbench/surface/mcp/prompts.go`
- `featherweight-workbench/surface/mcp/onbehalf.go`
- `featherweight-workbench/bridges/tools.go`
- `featherweight-workbench/bridges/people.go`
- `featherweight-workbench/conversations/tools.go`
- `featherweight-workbench/duties/tools.go`
- `featherweight-workbench/faces/tools.go`
- `featherweight-workbench/inbox/inbox.go`
- `featherweight-workbench/notify/tools.go`
- `featherweight-workbench/pages/tools.go`
- `featherweight-workbench/playbooks/tools.go`
- `featherweight-workbench/routines/tools.go`
- `featherweight-workbench/routines/config.go`
- `featherweight-workbench/workers/tools.go`
- `featherweight-workbench/bossmode/skills.go`
- `featherweight-workbench/bossmode/imports.go`
- `featherweight-workbench/dashboard/dashboard.go`
- `featherweight-workbench/tools/builder/propose_agent.go`
- `featherweight-workbench/fleet/builder.go`
- `featherweight-kernel/fw/decider.go`
- `featherweight-kernel/harness/memory.go`
