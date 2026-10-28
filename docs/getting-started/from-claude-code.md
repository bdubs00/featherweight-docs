# Use a fleet from Claude Code

Claude Code reaches a whole fleet of agents as one MCP server. The workbench serves the tools, and every agent sandbox behind it answers through them. This walk-through connects Claude Code to a workbench and does the work of one person: a run, a decision, a batch of jobs, a connection to a service, a branch, and a new agent.

## Before you start

You need a running workbench. It can serve a fleet on a cluster, as [A fleet](../deployment/fleet.md) deploys it. It can also be one `fw-workbench serve` on your laptop, as [Run the workbench on your machine](workbench-local.md) shows. You also need a way to sign in: an account at the OpenID Connect issuer of the workbench, or its static token.

The MCP server of the workbench listens at `/mcp` over Streamable HTTP. A request of the protocol revision `2026-07-28` or later needs no session. An older client opens a session of the revision `2025-11-25`. Both get the same tools.

## Connect Claude Code

1. Add the server with its public address. Behind agentgateway with a login policy, Claude Code does the login itself through the issuer of the workbench:

    ```sh
    claude mcp add --transport http fw-fleet https://fleet.example.com/mcp
    ```

    Without an issuer, send the static token of the fleet as a bearer token:

    ```sh
    claude mcp add --transport http fw-fleet https://fleet.example.com/mcp --header "Authorization: Bearer <token>"
    ```

2. Ask Claude Code who you are and what the fleet holds. It calls `whoami`, `fleet`, and `agents_list`.

    The name of the server is the prefix of its tools, so `fleet` appears as `mcp__fw-fleet__fleet`. A worker is one sandbox, an AX Task, that runs the work of one agent. The text of `fleet` names the agents first, each with its workers awake, asleep, or stopped, such as `manager: 1 worker, awake; 1 run works`. The members follow by name, such as `default/manager-0`. A member is one `fw` process of the fleet, here one worker. A member is `live` for a Task that runs, `quiet` for a Task that sleeps, and `stopped` otherwise.

Every result holds a text and, in `structuredContent`, the object that the text describes. For a work tool, that object is the run. If the run failed, `isError` is true.

## Run, read, and decide

1. Start a run with `run`. A run is one conversation with an agent, with its own budget and its own log, the ledger. `agent` names a profile, the configuration of an agent, from `agents_list`. `member` names a worker from `fleet`:

    ```json
    {"agent": "triage", "input": "Sort ticket 4182.", "title": "Ticket 4182"}
    ```

    With `wait` true, the default, the call waits until the run finishes or needs a person. It sends one progress notification per turn. A run on another member never waits: the call returns the run object at once.

2. Read the run. `run_status` gives the run object: its state, its output, a pending decision, and its usage. `run_result` gives what the run produced, the files that it changed, and what it needs next. `run_events` pages through its ledger: `from` reads forward, `before` reads back, and `compact` cuts each tool output short.

3. Answer a decision. The policy of a profile holds some calls for a person, such as `bash` under `ask: [destructive]`. A client with form elicitation shows a form with `decision` and `note`. Any other client gets the run in the state `input-required`, and `pending.id` names the decision. Decide it with `approve`:

    ```json
    {"runId": "01JA...", "approvalId": "ap_7f3", "decision": "allow"}
    ```

    With `rule` true, `allow` also adds the tool to the policy of the pool whose workers run the agent, so they stop asking. A question of the tool `ask_user` is a decision too: answer it with `allow` and the answers in `content`, or in `note` for free text. The run waits for a decision from any surface, so the card in bossmode decides the same one.

4. Send a follow-up with `send`, with `runId` and `content`. A finished run starts a new turn. For a run that failed at a limit, also pass a `budget`, and the run goes on with the new limits. `cancel` stops a run, and only `cancel` does.

## Send a batch of jobs

A job is one run request on a queue. Call `enqueue` with a profile, a batch name, and one item per job:

```json
{"agent": "reviewer", "batch": "reviews-20261027",
 "items": [{"input": "Review pull request 41.", "title": "PR 41"},
           {"input": "Review pull request 42.", "title": "PR 42"}]}
```

The call returns at once with `batch`, `queue`, and `count`. Every run acts as you and carries the batch name. The workbench puts the jobs on the queue of the pool that runs the profile, and it wakes the sleeping Tasks of that pool. A pool is a set of workers that run one profile. Follow the batch with the tool `batch` and the batch name. It gives the runs by state, the members that hold them, and the runs that wait for you. It also gives the failures, the jobs still in the queue, and the usage. One call takes at most 500 items.

## Connect a service, branch a run, add an agent

Some MCP servers act for the person who started the run. If you never connected such a service, the run waits in `input-required`, and `pending.connect.server` names it. A client with URL elicitation gets a link to open in the browser. Any other client gets the link in the text of the run. After the sign-in, the run goes on by itself. `connections` lists your services, and `disconnect` removes your grant for one. `approve` cannot allow a connection, because a click is not a grant.

`fork` branches a run into a new run that keeps the events of the source up to `seq`. With `spawn` true, the branch runs in a Task of its own, with a workspace of its own. The call answers at once, and `run_status` follows the branch.

`agent_builder` starts a conversation that proposes a profile. Pass `input`, what the agent handles and what it must never do, or `fromRun`, a completed run to turn into an agent. Answer its questions with `send`, and read its proposal with `run_result`. The builder saves nothing. Check the profile with `agent_put` and `dryRun` true, then save it with `agent_put`. A new profile gets you as its owner. On a workbench with a default template, it also gets a pool of two workers: see [Pools and templates](../deployment/pools.md).

## The tools

| Group | Tools |
|---|---|
| Work | `run`, `run_status`, `send`, `approve`, `cancel`, `fork`, `run_budget` |
| Jobs | `enqueue`, `batch` |
| Reading | `run_result`, `run_events`, `run_file`, `runs_list`, `inbox` |
| Agents | `agents_list`, `agent_get`, `agent_put`, `agent_delete`, `agent_builder`, `capabilities`, `faces_put` |
| Fleet and pools | `fleet`, `pools_list`, `pool_put`, `pool_delete`, `templates_list`, `packages_get`, `packages_put`, `orphans_list`, `orphans_remove` |
| Bridges | `bridge_open`, `bridge_list`, `bridge_read`, `bridge_post`, `bridge_react`, `bridge_add_member`, `bridge_remove_member`, `bridge_close`, and more |
| Duties and notices | `duty_preview`, `duty_put`, `duty_get`, `duties_list`, `duty_run_now`, `duty_pause`, `notifications_get`, `notifications_put`, and more |
| Wiki and skills | `pages_list`, `pages_read`, `pages_write`, `pages_search`, `pages_history`, `skills_list`, `skill_send` |
| People | `whoami`, `connections`, `disconnect`, `dashboard` |

A workbench without a feature offers none of its tools. The pool tools need pools or templates, and the package tools need `workbench.packages`. `dashboard` opens an MCP App, a page that the host renders in the chat. A host without MCP Apps gets the same home as text. [MCP tools](../reference/mcp-tools.md) lists every argument of every tool.

## Retries and disconnects

- `wait` false makes `run` return the run object at once. Poll `run_status`, or read the resource `fw://runs/{id}`. The resources read the runs of the workbench itself only, and the tools reach every member.
- `requestId` makes a retry safe. A retried `run` with the same `requestId` returns the same run instead of a second one.
- If the connection closes, the call ends and the run goes on. Read it again with `run_status`.
- `continues` on `run` names a run of a worker that a pool replaced. The new run starts with a summary of the earlier conversation.

## Where to go next

<div class="paths" markdown>

- [Bossmode at a glance <span>The same fleet in the browser</span>](../guide/index.md)
- [MCP tools <span>Every tool and every argument</span>](../reference/mcp-tools.md)

</div>

## Sources

- `featherweight-workbench/surface/mcp/mcp.go`
- `featherweight-workbench/surface/mcp/tools.go`
- `featherweight-workbench/surface/mcp/manage.go`
- `featherweight-workbench/surface/mcp/batch.go`
- `featherweight-workbench/surface/mcp/fleet.go`
- `featherweight-workbench/surface/mcp/connect.go`
- `featherweight-workbench/workers/tools.go`
- `featherweight-workbench/bridges/tools.go`
- `featherweight-workbench/duties/tools.go`
- `featherweight-workbench/notify/tools.go`
- `featherweight-workbench/inbox/inbox.go`
- `featherweight-workbench/docs/ARCHITECTURE.md`, sections 3, 4.7, 4.9, 4.19, 6.1, 11, and 14.10
- `featherweight-workbench/examples/agentgateway/README.md`
