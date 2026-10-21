# HTTP API

One `fw` process serves every surface on one listener. The native API lives under `/v1`, the A2A server under `/a2a`, and the health and metrics routes at the root. The workbench mounts its routes for people on the same listener. Every response is JSON, except the event streams, which are server-sent events. Every error is an RFC 9457 problem document. The design document describes the native API in [section 8.2](../design/kernel-architecture.md#82-native-api).

## Authentication

`auth.mode` names one mode or a chain tried in order: `token`, `oidc`, `spiffe`, or `none`. In `token` mode, a request carries `Authorization: Bearer <token>`, and the token is the value of `FW_API_TOKEN`. A missing or wrong credential gets a 401 problem document. If the browser sign-in is on, the document names its route in the field `signin`.

A few routes need no credential. They are the agent card, `/healthz`, `/readyz`, `/metrics`, and `/ui`. The sign-in and connect callbacks, the protected-resource document, and the webhook route of a source need none either. Every other route is behind the authentication of the agent. The role of the caller on an agent decides what the call can do ([section 13.2](../design/kernel-architecture.md#132-what-the-caller-can-do)).

## Runs

| Method and path | Request | Response |
|---|---|---|
| `POST /v1/runs` | Body: `agent`, `input`, `title`, `instructions`, `profile`, `budget`, `metadata`, `wait`, `files`, `outcome`. A trusted caller, the static token or a workload, also sets `principal`, `principalKind`, and `id`. The header `Idempotency-Key`, up to 255 bytes, makes a retry return the same run | 201 with the run object |
| `GET /v1/runs` | Query: `parent`, `agent`, `state`, `principal`, `batch`, `limit`. The state `active` matches every run that is not finished | `{"runs", "total", "glance"}`, newest first |
| `GET /v1/runs/{id}` | none | The run object |
| `POST /v1/runs/{id}/messages` | Body: `content`, a string or content blocks, `files`, and `budget`, which changes the limits before the message | 202 with the run object |
| `PATCH /v1/runs/{id}/budget` | Body: a budget. Each limit that it sets replaces the same limit for the work that follows. It needs the operator role | `{"budget", "run"}` |
| `POST /v1/runs/{id}/cancel` | none | The run object |

`profile` is an inline profile: `system`, `instructions`, `skills`, `tools`, `model`, `effort`, `timeZone`, `policy`, and `budget`. A budget takes `maxTurns`, `maxTokens`, `maxCostUSD`, `deadline`, `maxToolCalls`, `maxCallsPerTurn`, `maxRepeats`, `finalReport`, `reportMaxTokens`, and `reportTimeout`. `deadline` and `reportTimeout` are duration strings such as `"90s"`, or numbers of nanoseconds. A file is `{"name", "data"}` with `data` in base64. A body is 1 MB at most, and a body with files is larger by the size of the attachments.

With `wait: true`, the call blocks until the run finishes or needs input. With the header `Accept: text/event-stream`, the same call streams the events as they happen and then closes.

Admission bounds the work of one process. `maxRuns` bounds the root runs that work at once, and `maxQueuedRuns` bounds the root runs that wait behind them. If both are full, `POST /v1/runs` and a fork answer 429 with `Retry-After: 5`, and a refused start writes nothing. Retry with the same `Idempotency-Key`.

A follow-up and an approval decision on an accepted run never get a 429. A start that the process already accepted returns its run without a new admission. See [The run lifecycle](../concepts/run-lifecycle.md#admission).

After a storage failure, a route that writes answers 503, and the process accepts no work until it restarts. A start whose `fw.run.queued` reached the ledger before the failure still returns its run. See [The ledger](../concepts/ledger.md#fail-stop-on-a-storage-failure).

```sh
curl -s -X POST http://localhost:8080/v1/runs \
  -H "Authorization: Bearer $FW_API_TOKEN" -H "Content-Type: application/json" \
  -d '{"agent":"default","input":"List the files in this directory.","wait":true}'
```

## Events as server-sent events

`GET /v1/runs/{id}/events` streams the ledger of a run. Each event has the fields `id` (the sequence number), `event` (the type), and `data` (the event as JSON). A comment line every 15 seconds keeps an idle stream open. The stream ends with the run. The query parameter `from` names the first sequence number. The header `Last-Event-ID` names it too, and the header wins, because a reconnecting `EventSource` sends it.

A client that accepts `application/json` and not `text/event-stream` gets one page instead: `{"run", "events", "lines"}`. `lines` holds the short line of each event that a person reads, the same lines as the MCP tool `run_events`. The parameters `from` and `limit` select the page. Without `from`, the page holds the last `limit` events.

```sh
curl -N http://localhost:8080/v1/runs/$RUN/events \
  -H "Authorization: Bearer $FW_API_TOKEN" -H "Accept: text/event-stream"
```

## Approvals

`POST /v1/runs/{id}/approvals/{approval}` decides a pending approval. The body has `decision`, `note`, and `content`. `decision` is `allow` or `deny`. `content` is the answer to a question from a tool such as `ask_user`. The answer is the run object. The run waits for a decision from any surface, so a decision through MCP or the page works the same way. See [section 5.3](../design/kernel-architecture.md#53-approvals).

```sh
curl -s -X POST http://localhost:8080/v1/runs/$RUN/approvals/$APPROVAL \
  -H "Authorization: Bearer $FW_API_TOKEN" -H "Content-Type: application/json" \
  -d '{"decision":"allow","note":"looks right"}'
```

## Fork

| Method and path | Request | Response |
|---|---|---|
| `POST /v1/runs/{id}/fork` | Body: `seq`, `input`, `model`, `metadata`, `spawn`. `seq` is the last event to keep. `input` is a message that follows the kept events. `spawn` runs the branch in another process | The branch. With `spawn`, 202 |
| `POST /v1/runs/fork` | Body: `id`, `events`, `input`, `model`, `metadata`. The body is 64 MB at most. Only a trusted caller, the static token or a workload, can send it | 201 with the branch |

A branch is a new run that keeps the events of the source up to `seq`. The source does not change. See [section 4.7](../design/kernel-architecture.md#47-branches).

```sh
curl -s -X POST http://localhost:8080/v1/runs/$RUN/fork \
  -H "Authorization: Bearer $FW_API_TOKEN" -H "Content-Type: application/json" \
  -d '{"seq":40,"input":"Try the other approach."}'
```

## Files

`GET /v1/runs/{id}/files` lists the files that the run changed. `GET /v1/runs/{id}/files/{path}` returns the content of one file. A client that accepts `application/json` gets a view of the file instead. The query parameter `download=1` always returns the raw content, with the file name in `Content-Disposition`. See [section 7.9](../design/kernel-architecture.md#79-workspace).

```sh
curl -s "http://localhost:8080/v1/runs/$RUN/files/report.md?download=1" \
  -H "Authorization: Bearer $FW_API_TOKEN"
```

## Memory

The memory routes search the memory of an agent and read and write its notes without a run. The design document lists them in [section 8.2](../design/kernel-architecture.md#82-native-api). The concepts are on [Context, memory, and time](../concepts/context-memory-time.md#memory).

| Method and path | Request | Response |
|---|---|---|
| `GET /v1/memory` | Query: `agent`, the profile, `default` when absent. `q`, the words, required. `kinds`, a comma list of `note`, `run`, and `skill`, all three when absent. `limit`, 10 by default and 50 at most | `{"scope", "hits"}`, and `notes` when a bound stopped a search early. Each hit holds `record`, `score`, `snippet`, and `why` |
| `GET /v1/memory/notes` | Query: `agent` | `{"scope", "notes"}`, newest first, without their text |
| `GET /v1/memory/notes/{path}` | Query: `agent`. The header `Accept: text/markdown` or `text/plain` asks for the text alone | The note with its `hash`, the SHA-256 of the whole file, which the header `ETag` repeats. A directory answers 400 |
| `PUT /v1/memory/notes/{path}` | Query: `agent`. The body is the text of the note. `If-Match` with the hash of the current note, quoted or weak, makes the write a compare-and-swap. `If-Match: *` writes only a note that exists, and `If-None-Match: *` writes only a new note | The note with its new hash and `ETag`. 412 when the note differs from the condition. A directory answers 400 |
| `DELETE /v1/memory/notes/{path}` | Query: `agent` | 204. The note also leaves the search index at once. A directory answers 400 |

The kernel builds the scope from the agent of the query and the principal of the request, never from a field. A caller therefore reaches only the notes that a run of that caller reaches. The roles decide the rest:

- Reading needs `agent.run` on the agent.
- Writing or deleting a note of the scope `principal` needs `agent.run`.
- Writing or deleting a note of the scope `agent`, which every person of the agent reads, needs `agent.edit`.
- Writing or deleting a note of the scope `shared`, which every profile reads, needs the admin role of the process (`access.admins`). The 403 says so.

An agent that does not exist and an agent that the caller cannot view (`agent.view`) both answer 404 with the same text, as `GET /v1/agents/{name}` does. The routes therefore do not tell which agents exist. A caller who can view the agent and lacks the action gets 403. A missing note answers 404. The kind `file` belongs to the tool `recall` of a run, so `GET /v1/memory` answers 400 for it.

A body over 128 KB, and a write past the limit of 2,000 notes in one scope, answer 413. A path with more than 8 parts, a control character, or a part that starts with `.` answers 400. Each write and each delete goes to the log of the process. The line holds the subject of the caller, the operation, the agent, the scope, the ref, the size, and the SHA-256. It never holds the text.

```sh
curl -s -X PUT "http://localhost:8080/v1/memory/notes/build.md?agent=default" \
  -H "Authorization: Bearer $FW_API_TOKEN" -H "Content-Type: text/markdown" \
  -H "If-None-Match: *" --data-binary @build.md
```

A host of a harness also serves the route `/v1/harness/memory/<secret>`, the MCP server `fw-memory` of a hosted run. It answers only a caller on the loopback address, and an unknown secret gets 404. See [Profiles, tools, and skills](../concepts/profiles-and-tools.md#the-package-harness).

## Status, tools, skills, and agents

| Method and path | Response |
|---|---|
| `GET /v1/status` | The usage of the runs that the caller can view, the oldest approval that waits, the counts of runs by state, `idle`, and `idleSince`. After a storage failure, also `blocked: true` and `blockedReason`, and `idle: true` since the failure |
| `GET /v1/tools` | Every tool specification of the runtime, each with the field `text`, a plain phrase that says what the tool does |
| `GET /v1/skills` | The skills of the configured skill directories |
| `GET /v1/skills/{name}` | The `SKILL.md` text as `text/markdown`, or, with `Accept: application/json`, the body with the list of the other files |
| `GET /v1/agents` | The profiles that the caller can view, each with the role of the caller and the usage of its visible runs |
| `GET /v1/agents/{name}` | One profile, with the role of the caller and the usage of its visible runs |

```sh
curl -s http://localhost:8080/v1/status -H "Authorization: Bearer $FW_API_TOKEN"
```

## A2A

The A2A surface serves the agent card and the two bindings of A2A protocol 1.0. A task is a run, and the task id is the run id. See [section 8.3](../design/kernel-architecture.md#83-a2a-server).

| Method and path | Authentication | Purpose |
|---|---|---|
| `GET /.well-known/agent-card.json` | none | The agent card, with one skill per profile |
| `POST /a2a/jsonrpc` | the agent | The JSON-RPC binding |
| `POST /a2a/message:send`, `POST /a2a/message:stream` | the agent | The REST binding: create a run or append a follow-up, plain or as a stream |
| `GET /a2a/tasks`, `GET /a2a/tasks/{id}` | the agent | List the tasks, or get one |
| `POST /a2a/tasks/{id}:cancel`, `/a2a/tasks/{id}:subscribe` | the agent | Cancel a task, or follow one |
| `/a2a/tasks/{id}/pushNotificationConfigs`, `/a2a/tasks/{id}/pushNotificationConfigs/{configId}` | the agent | Create, list, get, and delete push configurations. They live in memory |
| `GET /a2a/extendedAgentCard` | the agent | The extended card |

The REST paths come from the SDK `github.com/a2aproject/a2a-go/v2`, mounted under `/a2a`.

Three conditions end by themselves, so the A2A server answers them as temporary errors (`surface/a2a/unavailable.go`). The JSON-RPC binding returns the server error -32000, and its data carries `reason` and `retryAfterSeconds`. The metadata of its error info repeats them as `fwReason` and `retryAfter`. The REST binding answers with the status of the table and `Retry-After`.

| Condition | Reason | REST status | Retry hint |
|---|---|---|---|
| A control plane does not answer | `AUTHZ_UNAVAILABLE` | 503 `UNAVAILABLE` | 5 seconds |
| The backlog of runs is full | `SATURATED` | 429 `RESOURCE_EXHAUSTED` | 5 seconds |
| A storage failure blocked the process | `STORAGE_UNAVAILABLE` | 503 `UNAVAILABLE` | 30 seconds |

Retry with the same message id, which gives one run. The message of a storage error holds no cause, because the cause can name a path of the server.

```sh
curl -s http://localhost:8080/.well-known/agent-card.json
```

## Health and metrics

| Method and path | Response |
|---|---|
| `GET /healthz` | 200 `ok` once the process is up |
| `GET /readyz` | 503 `not ready` until the agent is ready, then 200 `ready`. After a storage failure, 503 `storage failed; execution blocked until restart`. Under ax, it drives the `WorkspaceReady` condition |
| `GET /metrics` | The Prometheus registry. `telemetry.metrics` renames the route |

The three routes carry no authentication. During the ax boot, every path except `/healthz` answers 503 with `Retry-After: 5`. Under ax, the process also serves `GET /metadata/v1alpha1/ax/task` and `GET /metadata/v1alpha1/ax/workspaces` on `127.0.0.1:8099`, for the guest services of `ax ssh`.

```sh
curl -s http://localhost:8080/readyz
```

## The routes of the workbench

The package `surface/web` mounts these routes through `native.Extend`, behind the same authentication as the run routes. The design document lists them in [section 2](../design/workbench-architecture.md#2-routes-for-people).

| Method and path | Authentication | Purpose |
|---|---|---|
| `GET /ui` | none | The page. It authenticates to `/v1` with the token of the sign-in, or with a token that the person pastes |
| `GET /ui/signin`, `GET /ui/callback` | none, with `auth.oidc.clientId` | The browser sign-in: the authorization code flow with PKCE. `?next=` names a place in the page |
| `GET /ui/connect/callback` | the connect cookie | The end of a connection |
| `GET /.well-known/oauth-protected-resource`, with `/{rest...}` | none, with `oidc` in `auth.mode` | The RFC 9728 document |
| `/mcp` | the agent | The MCP server over Streamable HTTP. See [MCP tools](mcp-tools.md) |
| `POST /v1/sources/{name}` | the credential of the source | The webhook route: one event or an array of events. 202 with the run requests. If every event was a duplicate, 200 |
| `GET /v1/whoami` | the agent | The principal, its role on every agent that it can see, and its teams |
| `PUT /v1/agents/{name}` | the agent | Create or replace a profile. The body is a profile. `?dryRun=true` answers a draft and saves nothing. `?pool=` names the pool |
| `DELETE /v1/agents/{name}` | the agent | Remove a profile, 204. `?pool=` names the pool |
| `GET /v1/home`, `GET /v1/home/others` | the agent | The runs that need the caller, in progress, and recent, and then the runs of people outside the teams of the caller |
| `POST /v1/builder` | the agent | Start the agent builder with one of `input` and `fromRun`, and `files`. 201 with the run and a `Location` header |
| `GET /v1/runs/{id}/result` | the agent | What the run produced and what it needs next |
| `GET /v1/runs/{id}/transcript` | the agent | The conversation as chat items: `{"run", "items", "next", "prev"}`. Query: `from`, `before`, `limit` |
| `POST /v1/runs/{id}/approvals/{approval}/rule` | the agent | Add the tool of the pending approval to the policy of the pool. 409 without a pool |
| `GET /v1/fleet` | the agent | The members that the caller can see, and the pools |
| `GET /v1/fleet/runs` | the agent | The runs of the whole fleet in the shape of `GET /v1/runs`. Query: `scope` (`fleet` or `local`), `member`, `parent`, `agent`, `state`, `principal`, `batch`, `limit` |
| `GET /v1/usage` | the agent | Deprecated. The answer carries `Deprecation: true` |
| `GET /v1/connections` | a person | The services that act for the caller |
| `POST /v1/connections/{server}` | a person | Start a connection. Body: `next`. Answer: `{"url"}` and the cookie `fw_connect` |
| `DELETE /v1/connections/{server}` | a person | Remove the grant of the caller |
| `POST /v1/tokens`, `/v1/tokens/reject`, `/v1/tokens/forget` | the static token or a workload | The token broker of a fleet: the token of a person for a run, a refused token, and a dropped grant |

```sh
curl -s http://localhost:8080/v1/home -H "Authorization: Bearer $FW_API_TOKEN"
```

## How a request reaches a Task in a fleet

A worker of a fleet runs as an ax Task, and the atenet router is the only door into it. The front, the `fw-workbench` Deployment outside, answers for the whole fleet. The package `fleet` sets a relay on the native surface. For a route with a run id, the relay asks the view which member owns the run. If another member owns it, the relay forwards the request. `POST /v1/runs?member=<name>` starts a run on that member. See [section 4.5](../design/workbench-architecture.md#45-acting-on-a-run-of-another-member) and [section 11.4](../design/kernel-architecture.md#114-addressing-through-the-atenet-router) of the kernel design.

A forward works like this:

1. The member must have the address `ax:<atespace>/<task>`. A worker that only the event stream knows has no address, and the front cannot reach it.
2. The front sends the request to `http://<ax.router>` with the same path and query. The header `ate-target-actor: <atespace>/<task>` tells the router which actor gets it. If the Task sleeps, the router wakes it first, so the response headers can take up to two minutes.
3. The request carries the credential of the caller in `Authorization` and the name of the front in `Fw-Fleet-Via`. Four request headers go along: `Accept`, `Content-Type`, `Idempotency-Key`, and `Last-Event-ID`. A member never forwards a request that carries `Fw-Fleet-Via`.
4. The member decides with its own rules and answers. The front relays the status and the headers `Content-Type`, `Cache-Control`, `Retry-After`, `Location`, `Content-Disposition`, and the security headers. A redirect goes back to the caller as it is.

The front builds three routes itself from the run and the events of the owner, because a worker serves the native API alone: `/v1/runs/{id}/result`, `/v1/runs/{id}/transcript`, and the rule route.

## Sources

- `featherweight-kernel/surface/native/native.go`
- `featherweight-kernel/surface/native/manage.go`
- `featherweight-kernel/surface/native/files.go`
- `featherweight-kernel/surface/native/memory.go`
- `featherweight-kernel/memory/store.go`
- `featherweight-kernel/memory/recall.go`
- `featherweight-kernel/harness/memory.go`
- `featherweight-kernel/fw/lifecycle.go`
- `featherweight-kernel/fw/kernel.go`
- `featherweight-kernel/surface/native/sse.go`
- `featherweight-kernel/surface/native/extend.go`
- `featherweight-kernel/surface/a2a/a2a.go`
- `featherweight-kernel/surface/a2a/card.go`
- `featherweight-kernel/surface/a2a/push.go`
- `featherweight-kernel/surface/a2a/unavailable.go`
- `featherweight-kernel/surface/a2a/handler.go`
- `featherweight-kernel/surface/view/status.go`
- `featherweight-kernel/surface/metrics/metrics.go`
- `featherweight-kernel/surface/axmeta/axmeta.go`
- `featherweight-kernel/fw/agent.go`
- `featherweight-kernel/fw/config.go`
- `featherweight-kernel/cli/serve.go`
- `featherweight-kernel/tokens/tokens.go`
- `featherweight-workbench/surface/web/web.go`
- `featherweight-workbench/surface/web/signin.go`
- `featherweight-workbench/surface/web/connect.go`
- `featherweight-workbench/surface/web/views.go`
- `featherweight-workbench/surface/web/agents.go`
- `featherweight-workbench/surface/web/builder.go`
- `featherweight-workbench/surface/web/fleet.go`
- `featherweight-workbench/surface/mcp/mcp.go`
- `featherweight-workbench/sources/webhook.go`
- `featherweight-workbench/connections/broker.go`
- `featherweight-workbench/fleet/relay.go`
- `featherweight-workbench/fleet/forward.go`
- `featherweight-workbench/fleet/types.go`
- `github.com/a2aproject/a2a-go/v2@v2.6.0/a2asrv/rest.go` and `internal/rest/rest.go` (module cache)
