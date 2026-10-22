# Use a fleet from Claude Code

The main path into Featherweight is an MCP client that talks to the front. The front is `fw-workbench` outside the sandboxes, and a fleet is the set of workers behind it, one `fw` per AX Task. Claude Code reaches the front as one MCP server and sees every worker through it. This page says how the server is reached, lists its tools, and walks through the work of one person: a run, an approval, a job, a connection, a branch, and a new agent.

## How Claude Code reaches the front

The MCP server of the front listens at `/mcp` over Streamable HTTP. A request with the header `Mcp-Protocol-Version` of `2026-07-28` or later is served without a session. Every other request opens a session of the 2025-11-25 revision with `Mcp-Session-Id`. Both answer the same tools.

With agentgateway, one URL serves the front. The gateway routes `/mcp` through an MCP backend with a login policy, and `/ui` and `/v1` as plain HTTP. Add the server to Claude Code with its URL:

```sh
claude mcp add --transport http fw-fleet https://fleet.example.com/mcp
```

Claude Code does the login itself through the OpenID Connect issuer of the front. A developer without an issuer sends the static token of the fleet as a bearer token instead. The name you give the server is the prefix of its tools in Claude Code. This site uses `fw-fleet`, so the tool `run` appears as `mcp__fw-fleet__run`.

Every tool result holds a text and, in `structuredContent`, the object that the text describes. For a work tool that object is the run. If the run failed, `isError` is true.

## The tools

| Group | Tool | What it does |
|---|---|---|
| Work | `run` | start a run of a profile with `input`, and wait for it by default |
| | `run_status` | the run object: state, output, pending approval, and usage |
| | `send` | add a follow-up message to a run, with an optional `budget` that the run gets first |
| | `cancel` | stop a run, its model call, and its tools in flight |
| | `approve` | allow or deny the pending approval of a run, or answer its question |
| | `fork` | branch a run into a new run, in the same Task or in a Task of its own |
| | `run_budget` | change the limits of a run, also of a run that is running |
| Jobs | `enqueue` | send one run per item to the queue of a profile, under one batch name |
| | `batch` | how a job goes: the queued, the runs by state, the members, the failures, the usage |
| Reading | `run_result` | what a run produced and what it needs next, as a person reads it |
| | `run_events` | one page of the events of a run, forward with `from` or back with `before` |
| | `run_file` | a file that a run changed, as text, as an image, or with `raw` as bytes |
| | `runs_list` | the runs you can see, with filters by agent, state, member, batch, and `by` |
| Agents | `agents_list`, `agent_get` | the profiles you can see, and one profile in full |
| | `agent_put`, `agent_delete` | create, replace, or remove a profile, with `dryRun` to check one |
| | `agent_builder` | start the conversation that proposes a profile |
| | `capabilities` | the tools of the runtime in plain words |
| Fleet and people | `fleet` | the members and the pools you can see |
| | `connections`, `disconnect` | the services that act for you, and the removal of one grant |
| | `whoami` | your principal, your role on every agent, and your teams |
| | `dashboard` | the MCP App, or the home as text |
| Deprecated | `usage` | a sum of the runs, kept for old clients |

## Walk-through

### Start a run and read its result

Call `run` with the task. `agent` names a profile from `agents_list`, and `member` names a worker from `fleet`:

```json
{"agent": "ops", "member": "default/fw-fleet-alpha",
 "input": "Reply with the single word pear and nothing else. Use no tool."}
```

With `wait` true, the default, the call waits until the run finishes or needs input. If the request carries a progress token, the call sends one progress notification per turn. A run on another member never waits: the call returns the run object at once, with `id` and `state`. Read it with `run_status`, or with `run_result` for the answer, the files that changed, the steps, and the next actions. `run_events` pages through the ledger: `from` reads forward, `before` reads back, and `compact` cuts each tool output to 200 characters.

`run` also takes `title`, `instructions`, `profile`, `budget`, `files`, `metadata`, and `requestId`. `profile` is an inline profile that overlays the named profile for this run alone.

### Send a follow-up

Call `send` with `runId` and `content`. A finished run starts a new turn. If the run failed at a limit, pass `budget` too: the run gets the new limits before it reads the message. Every limit counts the whole run.

### Approve a held tool call

The policy of a profile holds some tool calls, such as `bash` under the rule `ask: [destructive]`. How the hold reaches you depends on the client:

- A client with form elicitation gets a form with the fields `decision`, `allow` or `deny`, and `note`. A modern client gets it as an `input_required` result with a signed `requestState`. It retries `run` with the answer and the unchanged `requestState`, and the retry continues the same run.
- Any other client gets the run object in the state `input-required`. `pending.id` is the approval, and `pending.tool` and `pending.input` say what waits.

Decide with `approve`:

```json
{"runId": "01JA...", "approvalId": "ap_7f3", "decision": "allow"}
```

A question from the tool `ask_user` is an approval with a schema. Answer it with `decision` `allow` and the answers in `content`, or in `note` for a free-text question. With `rule` true, `allow` also adds the tool to the policy of the pool whose worker runs the run, so its workers stop asking. The run waits for a decision from any surface, so the page at `/ui` decides the same approval.

### Send a job

Call `enqueue` with a profile and one item per run:

```json
{"agent": "reviewer", "batch": "reviews-20261020-1200",
 "items": [{"input": "Review pull request 41.", "title": "piece 1"},
           {"input": "Review pull request 42.", "title": "piece 2"}]}
```

The call returns at once with `batch`, `queue`, and `count`. Every run acts as you and carries the batch name in the metadata `fw.batch`. A worker that sleeps reads no queue, so the front wakes the suspended Tasks that serve the profile. Follow the job with `batch` and the batch name. Its result holds `finished`, `total`, `states`, `members`, `waiting`, `failed`, `queued`, and `usage`. The job is finished once no item waits in the queue and every run ended. Then `runs_list` with `batch` lists the runs, and `run_result` reads each one.

### See the fleet

Call `fleet` without arguments. Each member has a name such as `default/fw-fleet-alpha`, a state, and the time it was last heard. It also lists the agents you can see and counts its active runs and its runs that wait. The state is `live` for a Task that runs, `quiet` for a Task that sleeps or is pending, and `stopped` otherwise. The pools of the front follow, each with the Tasks it wants, the Tasks that exist, and the reason for a gap.

### Connect a service that acts as you

Some MCP servers of a profile act for the person who started the run, with `auth.oauth.grant: user`. If you have not connected the service, the run waits in `input-required`, and `pending.connect.server` names it. The front asks in the shape your client supports:

- A client with URL elicitation gets a link to open in the browser, `<base>/ui#connect/<server>/<run>`. The run goes on by itself after the sign-in.
- A client with form elicitation gets a form with the link and the choices `done` and `skip`.
- Any other client gets the link in the text of the run.

`connections` lists the services that act for you, connected or not, each with its link. `disconnect` removes your grant for one service. `approve` cannot allow a connect request, because a click is not a grant. A deny skips the service, and the run goes on without it.

### Branch a run

Call `fork` with `runId` and a new `input`. The branch keeps the events of the source up to `seq`, every event without `seq`, and goes on in the same Task. Its metadata carries `fw.forkOf` and `fw.forkSeq`. The source does not change.

```json
{"runId": "01JA...", "input": "Now reply with the single word plum and nothing else.", "spawn": true}
```

With `spawn` true, the branch runs in a Task of its own, with a workspace of its own. The call answers at once: the branch is queued on the new Task, and the source answers for it until the new Task has it. Follow it with `run_status`. Its `member` names the child Task, which the `fleet` tool lists once it runs.

### Build an agent and save it

Call `agent_builder` with exactly one of two arguments. `input` says what the agent handles and what it must never do. `fromRun` is the id of a completed run of yours to turn into an agent. The call returns the run of the builder at once. Answer its questions with `send` on that run. Read its proposal with `run_result` or `run_events`: the item of the tool `propose_agent` carries `profile`. The builder never saves anything. Check the profile with `agent_put` and `dryRun` true, then save it with `agent_put`:

```json
{"name": "release-notes", "description": "Writes release notes from merged pull requests",
 "system": "You write release notes.", "tools": ["files", "git.*"], "policy": {"ask": ["bash"]}}
```

A new profile gets you as its owner. With pools, the profile goes to the pool whose workers run it, or to the pool that `pool` names. Every worker of that pool takes it. `agents_list` shows it with its pool.

## wait, requestId, disconnects, and the gateway

- `wait` false makes `run` return the run object at once. Poll `run_status`, or read the resource `fw://runs/{id}`. The resources read the runs of the front itself only, and the tools reach every member.
- `requestId` is an idempotency key. A retried `run` with the same `requestId` returns the same run instead of a second one.
- If the connection closes, the `run` call ends but the run continues. Read it again with `run_status`. Only `cancel` stops a run.
- A gateway bounds a call. agentgateway cuts a call after ten seconds, so a long run must not be held open through it. Start it with `wait` false, or with `member`, and read it later. `fork` with `spawn` answers at once for the same reason, and `enqueue` never waits.

## Next steps

- [MCP tools](../reference/mcp-tools.md) lists every argument of every tool.
- [The fleet](../concepts/fleet.md) explains members, jobs, pools, and the suspend of an idle Task.
- [Identity](../concepts/identity.md) explains principals, roles, and connections.
- [Safeguards](../concepts/safeguards.md) explains the policy and the budget behind an approval.
- [A fleet](../deployment/fleet.md) deploys the front and the workers.
- The design of the server is in [section 3 of the workbench architecture](../design/workbench-architecture.md#3-mcp-server-work-intake), with [the approvals](../design/workbench-architecture.md#33-approvals-over-mcp), [the connections](../design/workbench-architecture.md#34-connections-over-mcp), and [the disconnects](../design/workbench-architecture.md#35-cancellation-and-disconnects).

## Sources

- `featherweight-workbench/surface/mcp/mcp.go`
- `featherweight-workbench/surface/mcp/tools.go`
- `featherweight-workbench/surface/mcp/work.go`
- `featherweight-workbench/surface/mcp/manage.go`
- `featherweight-workbench/surface/mcp/batch.go`
- `featherweight-workbench/surface/mcp/connect.go`
- `featherweight-workbench/surface/mcp/fleet.go`
- `featherweight-workbench/surface/mcp/files.go`
- `featherweight-workbench/surface/mcp/resources.go`
- `featherweight-workbench/docs/ARCHITECTURE.md`, sections 3, 4.5, 4.9, 6.1, and 14.9
- `featherweight-workbench/examples/agentgateway/README.md`
