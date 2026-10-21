# MCP tools

The workbench serves an MCP server that makes `fw` a tool for any MCP client, such as Claude Code, an editor, or another agent. The package `surface/mcp` builds it with `github.com/modelcontextprotocol/go-sdk`. The server names itself `featherweight-kernel` with the title `featherweight agent`. This page lists every tool, resource, and prompt, and the rules of approvals, retries, and disconnects. The design document describes the server in [section 3](../design/workbench-architecture.md#3-mcp-server-work-intake).

## Transports

Over HTTP, the server listens at `mcp.path`, which is `/mcp` by default. The handler first compares the `Origin` header with `mcp.origins`. A request without `Origin` passes, `*` allows every origin, and any other mismatch gets a 403. Then the authentication of the agent runs, as for the native API. The server is dual-era. A request with `Mcp-Protocol-Version` of `2026-07-28` or later and no `Mcp-Session-Id` goes to a stateless handler. Every other request goes to a stateful handler, where `initialize` opens a legacy session with `Mcp-Session-Id`. A legacy session closes after one hour without a request. One request is at most 1 MB plus the size of its attachments.

Over standard input and output, `fw-workbench mcp` serves the same server to a desktop client. Every call then acts as the local principal `local:<user>`.

The server instructions describe the tools, the approvals, the disconnects, the retries, the resources, and the prompts, without any profile name or prompt text. A client discovers the profiles through `agents_list` or `prompts/list`, which apply the access rules of the caller. Discovery is cacheable as public for 60 seconds, the tool list as private for 60 seconds, and a resource read is never cached.

## Start and follow work

Every result holds a text for the model and a structured value in `structuredContent`. A result of `run`, `send`, `cancel`, `fork`, and `run_status` holds the run object. If the run failed, `isError` is true.

| Tool | Arguments | What it returns |
|---|---|---|
| `run` | `input`, `title`, `agent`, `instructions`, `profile`, `outcome`, `wait` (default `true`), `budget`, `requestId`, `member`, `files`, `metadata` | The run object. With `wait`, the call waits until the run finishes or needs input, and sends one progress notification per turn. With `member`, the run starts on that member and the call returns at once |
| `run_status` | `runId` | The run object: state, output, pending approval, and usage |
| `send` | `runId`, `content`, `files`, `budget` | The run object. A finished run starts a new turn. With `budget`, the run gets new limits first |
| `run_budget` | `runId`, `budget` | `budget` and `run` after the change, also for a run that is running |
| `cancel` | `runId` | The run object. It stops the model call and the tools in flight |
| `fork` | `runId`, `seq`, `input`, `model`, `metadata`, `spawn` | The branch: a new run with the events up to `seq`. With `spawn`, it runs in a Task of its own |
| `run_result` | `runId` | `{view: "result", result}`: the title, the status, what the run produced, and what it needs next |
| `run_events` | `runId`, `limit`, `from`, `before`, `compact` | `{view, run, events, items, next, prev}`: one page of events as short lines and chat items. `from` reads forward, `before` reads back, and `compact` cuts each tool output to 200 characters |
| `run_file` | `runId`, `path`, `raw` | The current content of a file that the run changed: text as text, an image as an image. With `raw`, the bytes up to 4 MiB come back as an embedded resource. The result names `path`, `op`, `tool`, `size`, `mediaType`, `sha256`, `uri`, and `changed` |
| `capabilities` | none | `{view: "capabilities", tools}`: the tools of the runtime, each with what it does in plain words |
| `enqueue` | `agent`, `items` (each `input`, `title`, `metadata`), `batch`, `instructions`, `budget` | `{view, batch, agent, queue, count}`. One run per item goes on the queue of the profile, and the call returns at once |
| `batch` | `batch` | `{view, batch, total, states, members, waiting, failed, finished, usage}`: how a job goes |

`profile` is an inline profile. Its fields are `system`, `instructions`, `skills`, `tools`, `model`, `effort`, `timeZone`, `policy`, `budget`, and `outcome`. A `budget` takes `maxTurns`, `maxTokens`, `maxCostUSD`, `deadline`, `maxToolCalls`, `maxCallsPerTurn`, and `maxRepeats`. `deadline` is a duration string such as `30m`, or positive integer nanoseconds. A file is `{name, data}` with `data` in base64. `enqueue` and `batch` exist only with `workbench.fleet.intake`. Every run of a job acts as the caller and carries the batch name in its metadata.

## Decide

| Tool | Arguments | What it returns |
|---|---|---|
| `approve` | `runId`, `approvalId`, `decision` (`allow` or `deny`), `note`, `content`, `rule` | The run object. The run continues after the decision. With `rule` and `allow`, the front first adds the tool to the policy of the pool of the agent, so its workers stop asking |

The policy can hold a tool call until somebody allows or denies it. A `run` call with `wait` asks in one of three shapes, from the capabilities of the client. A client with form elicitation gets a form with the fields `decision`, an enum of `allow` and `deny`, and `note`. A question from a tool such as `ask_user` uses the schema of the question instead, and for a free-text question the note is the answer. A legacy session gets `elicitation/create` as a server request on the open call. Any other client gets the run in the state `input-required`, and the text names `approve` and `POST /v1/runs/{id}/approvals/{approval}`. The run waits for a decision from any surface. `rule` needs a pool, and without one the tool says so and decides nothing.

## Manage agents and runs

| Tool | Arguments | What it returns |
|---|---|---|
| `whoami` | none | The principal (subject, name, kind, groups), its role on every agent it can see, and its teams |
| `agents_list` | none | The profiles the caller can view, with the description, the model, the tools, the skills, the access lists, and the role of the caller. With pools, each profile names its pool, and the profiles of the front are marked `front` |
| `agent_get` | `name`, `pool` | One profile in full, the role of the caller, and what the agent can do in plain words |
| `agent_put` | the fields of a profile, `dryRun`, `pool` | `{view, agent, created}`. With `dryRun`, a draft: what the agent does and whether a save replaces one. Creating needs the creator role, and replacing needs the owner role |
| `agent_delete` | `name`, `pool` | `{view, deleted}`. It needs the owner role. The runs of the agent stay in the ledger |
| `agent_builder` | one of `input` and `fromRun` | The run of the builder, at once. Answer it with `send`, read its proposal with `run_result` or `run_events`, and save with `agent_put` |
| `runs_list` | `agent`, `state`, `principal`, `by`, `limit`, `scope`, `member`, `parent`, `batch` | `{view, runs, total, glance}`, newest first. Each run of another member names its member |
| `dashboard` | `view` (`home`, `run`, `agent`, `usage`, `agents`, `runs`, `approvals`, `fleet`), `agent`, `runId` | The MCP App `ui://fw/dashboard` for a host that renders MCP Apps, else the home as text |
| `usage` | none | Deprecated. The sums of runs, turns, tokens, and cost of the visible runs. Operators read `/metrics` instead |

The arguments of `agent_put` mirror a profile. They are `name`, `description`, `system`, `instructions`, `skills`, and `tools`. Then `model`, `effort`, `timeZone`, `policy`, `budget`, `outcome`, and `access` follow. In `runs_list`, `by` is `me`, `team`, or `others`, and `scope` is `fleet`, the default, or `local`. The tool `dashboard` is the only tool that names the page in `_meta`. The page loads its own data through the other tools, so a host opens it once. See [section 6.1](../design/workbench-architecture.md#61-the-mcp-tools).

## The fleet

| Tool | Arguments | What it returns |
|---|---|---|
| `fleet` | none | The members the caller can see. Each has its state: `live`, `quiet`, or `stopped`. It also has the time it was last heard, its authorization mode, its visible agents, and its counts of active and waiting runs. Then the pools follow, each with the Tasks it wants, the Tasks that exist and are ready, and the reason for a gap |

With the fleet on, seven tools act on a run of any member by its id. They are `run_status`, `run_events`, `run_result`, `run_file`, `approve`, `cancel`, and `send`. The request goes to the member that owns the run with the credential of the caller, and that member decides. `runs_list` lists the runs of every member, `scope: local` keeps the runs of this process, and `member` keeps one member. `agent_builder` with `fromRun` reads the run from its owner and starts the builder in this process. The resources read the runs of this process only.

## Connections

A `tools.mcp` entry with `auth.oauth.grant: user` acts for the person who started the run. If that person has not connected the service, the run waits in `input-required`, and `pending.connect` names the service. See [section 3.4](../design/workbench-architecture.md#34-connections-over-mcp).

| Tool | Arguments | What it returns |
|---|---|---|
| `connections` | none | The services that act for the caller, each with whether the caller connected it and the address that connects it in the browser |
| `disconnect` | `server` | Removes the grant of the caller. If the service allows revocation, the tool also revokes the grant there |

The server asks for the connection in the shape that the client declares. A client with URL elicitation gets `elicitation/create` in the mode `url` with the address `<base>/ui#connect/<server>/<run>`. The base is `mcp.auth.audience`, else `a2a.url`, else the origin of the request. Accept means that the person opened the link, and the call keeps waiting until the connection ends. A client with the form only gets a form with one field, `choice`, an enum of `done` and `skip`. `done` waits 30 seconds and asks again. `skip`, a decline, and a cancel deny the approval, so the run goes on without the service. The tool `approve` cannot allow a connect request. The tools exist only with a `grant: user` entry in the configuration.

## Resources

| Resource | Type | What it holds |
|---|---|---|
| `fw://runs/{id}` | `application/json` | The run object |
| `fw://runs/{id}/ledger` | `application/jsonl` | Every event of the run, one JSON object per line |
| `fw://runs/{id}/files/{+path}` | text or a blob with its media type | A file that the run changed, up to 4 MiB. `{+path}` keeps the slashes of a path |
| `fw://skills/{name}` | `text/markdown` | The `SKILL.md` file of a skill. The resource list names every skill that exists at start |
| `ui://fw/dashboard` | `text/html;profile=mcp-app` | The page of the dashboard as an MCP App |

The three run resources read the runs of this process only. For a run of another member, use `run_status`, `run_events`, `run_result`, and `run_file`.

## Prompts

There is one prompt per profile that the caller can view, named after the profile, with the optional argument `input`. The messages are the system prompt of the profile and then the input, both as user messages. A profile without a system prompt gets one message that says to start a run with the `run` tool. The list applies the access rules before it pages, 1000 entries per page, so no cursor exposes a hidden profile. Both methods read the current profiles, so a change takes effect on the next request.

## Retries and the request state

Pass `requestId` to make a retried `run` call return the same run instead of a second one. It is the idempotency key of the run.

An approval that `run` asks through a form travels with a `requestState`: an HMAC-signed blob that holds the run id, the approval id, the principal, and an expiry. The client retries `run` with the answer and the unchanged blob, and the retry continues the same run. The key is the SHA-256 of the secret `FW_MCP_STATE_KEY`. Without the secret, the server reads or creates the file `mcp-state.key` under the home directory, 32 random bytes with mode 0600. If the file cannot be read or written, the key lives in memory only. Replicas behind one endpoint must share the secret. The blob expires after `mcp.taskTTL`, 24 hours by default.

## Disconnects

If the connection closes, the `run` call ends, but the run continues. The handler context of a stateless request ends with the HTTP request, and the kernel keeps the run. Read the run again with `run_status` or the resource `fw://runs/{id}`. Only the tool `cancel` stops a run.

## Exposed tools

`mcp.expose` names local or upstream tools, such as `git.*`, that the server re-exports under their prefixed names with the annotations of their specifications. A call to an exposed tool passes through the same policy as a call from the model, so the gateway can ask for an approval. An exposed tool never takes the name of a work tool or a management tool.

## Sources

- `featherweight-workbench/surface/mcp/mcp.go`
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
- `featherweight-workbench/surface/mcp/state.go`
- `featherweight-workbench/fleet/types.go`
- `featherweight-workbench/cmd/fw-workbench/drivers.go`
- `featherweight-kernel/cli/verbs.go`
- `featherweight-kernel/fw/config.go`
