---
wide: true
---

# HTTP API

One process serves every surface on one listener. This page lists the routes of the kernel, grouped by what you do with a run. The routes that the workbench adds for bossmode, bridges, duties, the wiki, and the fleet are on [Workbench routes](workbench-routes.md).

The native API lives under `/v1`, the A2A server under `/a2a`, and the health routes at the root. The column In says which binary serves a route. `both` means `fw` and `fw-workbench`. A response is JSON, except the event streams, which are server-sent events. Every error is an RFC 9457 problem document. The design document describes the native API in [section 8.2](../design/kernel-architecture.md#82-native-api).

## Authentication and errors

`auth.mode` names one mode or a chain tried in order: `token`, `oidc`, `spiffe`, or `none`. In `token` mode, a request carries `Authorization: Bearer <token>`, and the token is the value of `FW_API_TOKEN`. A missing or wrong credential gets a 401 problem document. If the browser sign-in is on, the document names its route in the field `signin`.

The agent card, `/healthz`, `/readyz`, and `/metrics` need no credential. Every other route of this page needs the authentication of the agent. The role of the caller on an agent decides what the call can do ([section 13.2](../design/kernel-architecture.md#132-what-the-caller-can-do)).

Two headers carry special meaning:

| Header | Meaning |
|---|---|
| `Idempotency-Key` | Up to 255 bytes on `POST /v1/runs`. A retry with the same key returns the same run |
| `Fw-On-Behalf-Of` | The subject of the person for whom a trusted caller acts. The ledger then records that person as the decider or sender. A person who names another subject gets a 403 |

A trusted caller is the static token or a workload. Only a trusted caller can name another party in a body: the person and the id of a run, the sender of a message, or the person of a reaction.

## Start and follow runs

| Route | In | Request | Response and purpose |
|---|---|---|---|
| `POST /v1/runs` | both | Body: `agent`, `input`, `title`, `instructions`, `profile`, `budget`, `metadata`, `wait`, `files`, `outcome`, `check`. A trusted caller also sets `principal`, `principalKind`, and `id` | 201 with the run object and a `Location` header. With `wait`, 200 once the run ends or needs input |
| `GET /v1/runs` | both | Query: `parent`, `agent`, `state`, `principal`, `batch`, `kind`, `limit`. The state `active` matches every run that is not finished | `{runs, total, glance}`, newest first. Without `kind`, the list leaves out check runs. `kind=check` lists them alone |
| `GET /v1/runs/{id}` | both | none | The run object: state, output, pending approval, and usage |
| `GET /v1/runs/{id}/events` | both | Query: `from`. Header: `Last-Event-ID`, which wins | Server-sent events: the ledger of the run. With `Accept: application/json` and not `text/event-stream`, one page `{run, events, lines}`, with `from` and `limit` |
| `GET /v1/runs/{id}/live` | both | none | Server-sent events of the text as the model writes it: `delta`, `tool`, `done`, and `idle`. Nothing of it is in the ledger. At most 16 clients per run, then 429 |
| `POST /v1/runs/{id}/messages` | both | Body: `content` (a string or content blocks), `files`, `budget`, `pinned`. A trusted caller also sets `from` | 202 with the run object. A follow-up message. `budget` changes the limits first. `pinned` keeps the message through every compaction |
| `PATCH /v1/runs/{id}/budget` | both | Body: a budget. Each limit it sets replaces the same limit for the work that follows. Needs the operator role | `{budget, run}` |
| `POST /v1/runs/{id}/reactions` | both | Body: `seq` (`0` is the whole run), `reaction` (`up`, `down`, or `heart`), `note`, `remove`. A trusted caller also sets `by`. Needs the operator role | The run object. Adds a reaction, or takes it back with `remove` |
| `POST /v1/runs/{id}/cancel` | both | none | The run object. Stops the model call and the tools in flight |

```sh
curl -s -X POST http://localhost:8080/v1/runs \
  -H "Authorization: Bearer $FW_API_TOKEN" -H "Content-Type: application/json" \
  -d '{"agent":"default","input":"List the files in this directory.","wait":true}'
```

### The body of a run

| Field | Meaning |
|---|---|
| `profile` | An inline profile for this run: `system`, `instructions`, `skills`, `tools`, `model`, `effort`, `timeZone`, `policy`, `budget`, and `compaction` |
| `budget` | `maxTurns`, `maxTokens`, `maxCostUSD`, `deadline`, `maxToolCalls`, `maxCallsPerTurn`, `maxRepeats`, `finalReport`, `reportMaxTokens`, and `reportTimeout`. A duration is a string such as `"90s"`, or nanoseconds |
| `files` | Attachments, each `{name, data}` with `data` in base64 |
| `outcome` | `rubric`, `grader`, and `iterations`: a grader run grades the answer. It replaces the outcome of the profile |
| `check` | Makes the run a check run, which calls no model and can have an empty input. `steps` holds up to 5 calls, each `tool` and `input`. `timeout` is `30s` by default and `60s` at most. `maxBytes` bounds each step: 1 MiB by default, 4 MiB at most |
| `wait` | Block until the run finishes or needs input. With `Accept: text/event-stream`, the call streams the events and then closes |

A body is 1 MB at most, plus the size of its attachments. See [section 23](../design/kernel-architecture.md#23-check-runs) for check runs and [Environments and outcomes](../concepts/environments.md) for outcomes.

### Admission and storage failures

`maxRuns` bounds the root runs that work at once, and `maxQueuedRuns` bounds the root runs that wait. If both are full, `POST /v1/runs` and a fork answer 429 with `Retry-After: 5`, and the refused start writes nothing. Retry with the same `Idempotency-Key`. A follow-up and a decision never get a 429. See [The run lifecycle](../concepts/run-lifecycle.md#admission).

After a storage failure, a route that writes answers 503, and the process takes no work until it restarts. See [The ledger](../concepts/ledger.md#fail-stop-on-a-storage-failure).

## Decide, branch, and read files

| Route | In | Request | Response and purpose |
|---|---|---|---|
| `POST /v1/runs/{id}/approvals/{approval}` | both | Body: `decision` (`allow` or `deny`), `note`, `content`. `content` answers a question from a tool such as `ask_user` | The run object. Decides a pending approval. The run waits for a decision from any surface |
| `POST /v1/runs/{id}/fork` | both | Body: `seq` (the last event to keep), `input`, `model`, `metadata`, `spawn` | 200 with the branch, or 202 with `spawn`, which runs it in another process |
| `POST /v1/runs/fork` | both | Body: `id`, `events`, `input`, `model`, `metadata`. At most 64 MB. Trusted callers only | 201 with the branch, from events that the caller sends |
| `GET /v1/runs/{id}/files` | both | none | The files that the run changed |
| `GET /v1/runs/{id}/files/{path}` | both | Query: `download=1` returns the raw content with `Content-Disposition` | The content of one file. With `Accept: application/json`, a view of the file |

```sh
curl -s -X POST http://localhost:8080/v1/runs/$RUN/approvals/$APPROVAL \
  -H "Authorization: Bearer $FW_API_TOKEN" -H "Content-Type: application/json" \
  -d '{"decision":"allow","note":"looks right"}'
```

A branch is a new run that keeps the events of the source up to `seq`. The source does not change. See [section 4.7](../design/kernel-architecture.md#47-branches) and [section 5.3](../design/kernel-architecture.md#53-approvals).

## Memory

The memory routes search the memory of an agent and read and write its notes without a run. See [Context, memory, and time](../concepts/context-memory-time.md#memory).

| Route | In | Request | Response and purpose |
|---|---|---|---|
| `GET /v1/memory` | both | Query: `agent` (default `default`), `q` (required), `kinds` (a comma list of `note`, `run`, and `skill`), `limit` (default 10, at most 50) | `{scope, hits}`. Each hit holds `record`, `score`, `snippet`, and `why` |
| `GET /v1/memory/notes` | both | Query: `agent` | `{scope, notes}`, newest first, without their text |
| `GET /v1/memory/notes/{path}` | both | Query: `agent`. `Accept: text/markdown` or `text/plain` asks for the text alone | The note with its `hash`, which the header `ETag` repeats |
| `PUT /v1/memory/notes/{path}` | both | Query: `agent`. The body is the text. `If-Match` makes a compare-and-swap. `If-None-Match: *` writes only a new note | The note with its new hash. 412 if the note differs from the condition |
| `DELETE /v1/memory/notes/{path}` | both | Query: `agent` | 204 |

The kernel builds the scope from the agent of the query and the principal of the request, never from a field. Reading needs `agent.run`. Writing a note of the scope `agent` needs `agent.edit`, and a note of the scope `shared` needs the admin role. An agent that does not exist and an agent that the caller cannot view both answer 404. A body over 128 KB, or a write past 2,000 notes in one scope, answers 413.

## Agents, tools, skills, and status

| Route | In | Request | Response and purpose |
|---|---|---|---|
| `GET /v1/agents` | both | none | The profiles that the caller can view, each with the role of the caller and the usage of its visible runs |
| `GET /v1/agents/{name}` | both | none | One profile, with the role of the caller and its usage |
| `GET /v1/tools` | both | none | Every tool specification, each with `text`, a plain phrase of what the tool does |
| `GET /v1/skills` | both | none | The skills of the skill directories and of the MCP servers |
| `GET /v1/skills/{name}` | both | `Accept: application/json` asks for the body with the list of the other files | The `SKILL.md` text as `text/markdown`. A name can hold a slash, such as `github/review` |
| `GET /v1/status` | both | none | `usage`, `pendingApproval` (the oldest), `runs` (counts by state), `idle`, and `idleSince`. After a storage failure, also `blocked` and `blockedReason` |
| `GET /v1/environment` | `fw` | Needs `agent.view` on every profile | `{on, ask, lists, state, digest, marker, failure}`: the packages of the block `environment`. 404 without the block |
| `PUT /v1/environment` | `fw` | Body: `on`, `ask` (both required), `python`, `tools`. Needs `agent.run` on every profile | 202 with the view. The workbench of a fleet pushes package lists here. 409 for `placement: image` or a manifest |

```sh
curl -s http://localhost:8080/v1/status -H "Authorization: Bearer $FW_API_TOKEN"
```

## A2A

The A2A surface serves the agent card and the two bindings of A2A protocol 1.0. A task is a run, and the task id is the run id. See [section 8.3](../design/kernel-architecture.md#83-a2a-server).

| Route | In | Auth | Purpose |
|---|---|---|---|
| `GET /.well-known/agent-card.json` | both | none | The agent card, with one skill per profile |
| `POST /a2a/jsonrpc` | both | the agent | The JSON-RPC binding |
| `POST /a2a/message:send`, `POST /a2a/message:stream` | both | the agent | Create a run or send a follow-up, plain or as a stream |
| `GET /a2a/tasks`, `GET /a2a/tasks/{id}` | both | the agent | List the tasks, or get one |
| `POST /a2a/tasks/{id}:cancel`, `/a2a/tasks/{id}:subscribe` | both | the agent | Cancel a task, or follow one |
| `/a2a/tasks/{id}/pushNotificationConfigs[/{configId}]` | both | the agent | Create, list, get, and delete push configurations. They live in memory |
| `GET /a2a/extendedAgentCard` | both | the agent | The extended card |

A `lean` build of `fw` serves A2A only with the tag `a2a`. Three conditions end by themselves, so A2A answers them as temporary errors with a retry hint:

| Condition | Reason | REST status | Retry hint |
|---|---|---|---|
| A control plane does not answer | `AUTHZ_UNAVAILABLE` | 503 `UNAVAILABLE` | 5 seconds |
| The backlog of runs is full | `SATURATED` | 429 `RESOURCE_EXHAUSTED` | 5 seconds |
| A storage failure blocked the process | `STORAGE_UNAVAILABLE` | 503 `UNAVAILABLE` | 30 seconds |

The JSON-RPC binding returns the server error -32000, with `reason` and `retryAfterSeconds` in its data. Retry with the same message id, which gives one run.

## Health, metrics, and loopback routes

| Route | In | Response and purpose |
|---|---|---|
| `GET /healthz` | both | 200 `ok` once the process is up |
| `GET /readyz` | both | 503 `not ready` until the agent is ready, then 200 `ready`. After a storage failure, 503 again. Under ax, it drives the `WorkspaceReady` condition |
| `GET /metrics` | both | The Prometheus registry. `telemetry.metrics` renames the route |
| `GET /metadata/v1alpha1/ax/task`, `GET /metadata/v1alpha1/ax/workspaces` | both | Under ax only, on `127.0.0.1:8099`: the Task and the Workspaces, for the guest services of `ax ssh` |
| `/v1/harness/memory/<secret>` | `fw` | The MCP server `fw-memory` of a hosted run. Loopback callers only. An unknown secret gets 404 |
| `/v1/harness/hook/<secret>` | `fw` | The hook that Claude Code calls before each tool call of a hosted run. Loopback callers only |

During the ax boot, every path except `/healthz` answers 503 with `Retry-After: 5`. See [Profiles, tools, and skills](../concepts/profiles-and-tools.md) for hosted sessions of Claude Code and opencode.

<div class="paths" markdown>

- [Workbench routes <span>Bossmode, bridges, duties, pages, and the fleet</span>](workbench-routes.md)
- [MCP tools <span>The same work through an MCP client</span>](mcp-tools.md)

</div>

## Sources

- `featherweight-kernel/surface/native/native.go`
- `featherweight-kernel/surface/native/manage.go`
- `featherweight-kernel/surface/native/files.go`
- `featherweight-kernel/surface/native/memory.go`
- `featherweight-kernel/surface/native/sse.go`
- `featherweight-kernel/surface/native/extend.go`
- `featherweight-kernel/surface/view/status.go`
- `featherweight-kernel/surface/a2a/a2a.go`
- `featherweight-kernel/surface/a2a/unavailable.go`
- `featherweight-kernel/surface/metrics/metrics.go`
- `featherweight-kernel/surface/axmeta/axmeta.go`
- `featherweight-kernel/fw/agent.go`
- `featherweight-kernel/fw/check.go`
- `featherweight-kernel/fw/live.go`
- `featherweight-kernel/fw/react.go`
- `featherweight-kernel/fw/kernel.go`
- `featherweight-kernel/env/push.go`
- `featherweight-kernel/harness/memory.go`
- `featherweight-kernel/harness/claudecode.go`
- `featherweight-kernel/docs/ARCHITECTURE.md` (sections 8.2, 23)
