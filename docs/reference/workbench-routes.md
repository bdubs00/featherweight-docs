---
wide: true
---

# Workbench routes

The workbench adds HTTP routes for the work of people: bossmode, bridges, duties, the wiki, notifications, routines, and the fleet with its pools. This page lists every one of them, grouped by what you want to do. The routes of the kernel, such as starting a run, are on [HTTP API](http-api.md).

Only `fw-workbench` serves these routes, on the same listener as the native API. The MCP tools of the [MCP tools](mcp-tools.md) page do the same work, and the design document lists the routes in [section 2](../design/workbench-architecture.md#2-routes-for-people). In a fleet, the workbench is called the [front](../glossary.md#d-to-h), because it stands in front of the workers.

## Rules for every route

| Rule | What it means |
|---|---|
| Authentication | A route needs the authentication of the agent, as the run routes do, unless the column Auth says public. A missing credential gets a 401 problem document. If the browser sign-in is on, the document names `signin` |
| Acting for a person | A route also takes `Fw-On-Behalf-Of`. Only the static token or a workload can name another person with it |
| Bodies | A JSON body decodes strictly, so an unknown field answers 400. A body holds at most 1 MB, more with `files` |
| Errors | An error is an RFC 9457 problem document. The token broker answers `{reason, detail}` instead |
| Stores | The routes of bridges, conversations, duties, faces, notifications, the wiki, playbooks, and routines need the bus `nats` or `mem`. On another bus, they are not mounted |

A role in the column Auth is the role of the caller on an agent: owner (`agent.edit`), operator (`agent.run`), or viewer (`agent.view`). Admin means `access.admins`.

## Bossmode

These routes need `workbench.bossmode.enabled`. See [Serve bossmode](../deployment/bossmode.md).

| Route | Auth | Request | Response and purpose |
|---|---|---|---|
| `GET /bossmode` | public | none | 301 to `/bossmode/` |
| `GET /bossmode/{file...}` | public | none | A file of the page, from `bossmode.dir` or the copy in the binary. A path without an extension gets `index.html` |
| `GET /v1/bossmode` | any caller | none | `{manager, placement, maxMembers, theme, templates, chat, routines, packages}`: the settings that the page reads |
| `GET /v1/bossmode/logo` | any caller | `If-None-Match` | The logo of the theme, SVG or PNG, with `ETag`. 404 without a logo |
| `GET /v1/bossmode/stream` | any caller. Each event goes only to a caller who can see it | `Last-Event-ID` | Server-sent events: `run`, `member`, `task`, `reset`, `bridge.message`, `bridge.member`, `page`, `face`, and `routine`. A keep-alive every 15 seconds. It closes after 15 minutes. 429 past 64 streams |
| `GET /v1/bossmode/agents/{agent}/today` | viewer | none | `{agent, zone, since, runs, costUSD, decisions, ...}`: the numbers of today for one agent |

## Bridges and conversations

These callers can use a bridge: its operator, the owner of the duty that opened it, and an operator of the agent of every seat. See [Bridges and seats](../guide/bridges.md).

| Route | Auth | Request | Response and purpose |
|---|---|---|---|
| `GET /v1/bridges` | any caller | none | `{bridges}`: the bridges of the caller and of the teams of the caller, open first, each with its unread count and `needsYou` |
| `POST /v1/bridges` | operator of the agent of each seat | `title`, `goal`, `placement`, `members` (each `handle`, `agent`, `task`, `pool`, `budget`), `delegation`, `caps` | 201 with the bridge and its seats. Opens a bridge and seats its members |
| `GET /v1/bridges/{id}` | the bridge | none | The bridge, its seats with presence and activity, and its usage |
| `PATCH /v1/bridges/{id}` | the bridge | `title`, `delegation`, `caps`, `state` (`open` or `closed`) | The bridge. Renames, caps, closes, or opens it again |
| `PUT /v1/bridges/{id}/read` | the bridge | `seq` | 204. Moves the read mark of the caller |
| `GET /v1/bridges/{id}/messages` | the bridge | Query: `from`, `before`, `limit` (default 50, at most 500) | `{bridge, messages, next, prev}`: one page of the channel |
| `POST /v1/bridges/{id}/messages` | the bridge | `text`, `to`, `replyTo`, `pinned`, `skill` (`name`, `args`), `files` | 201 with the entry. A message of a person, sent on to the seats. `skill` makes it a slash command |
| `GET /v1/bridges/{id}/messages/{seq}` | the bridge | none | One entry, whole up to 64 KB |
| `GET /v1/bridges/{id}/pages` | the bridge, and reading the wiki | none | `{bridge, pages, count}`: the wiki pages that the work of the bridge wrote |
| `POST /v1/bridges/{id}/messages/{seq}/reactions` | the bridge | `reaction` (`up`, `down`, or `heart`), `note`, `remove` | The entry. A heart keeps the work in the wiki |
| `POST /v1/bridges/{id}/questions/{seq}/settle` | the bridge | none | 204. Ends the question of a seat without an answer. The seat does not wake |
| `POST /v1/bridges/{id}/members` | the bridge, and operator of the agent | `handle`, `agent`, `task`, `pool`, `budget` | 201 with the seat. Adds a seat and starts its run |
| `DELETE /v1/bridges/{id}/members/{handle}` | the bridge | none | The fired seat. Cancels its open runs and mutes it |
| `PATCH /v1/bridges/{id}/members/{handle}` | the bridge | `muted`, `task`, `continue` | The seat. Mutes it, unmutes it, or gives it a new task |
| `PATCH /v1/conversations/{run}` | a person who can view the run | `title`, `hidden` | `{run, myTitle, hidden}`. Your own title for a conversation, or hides it from your lists |

## Decisions, home, and agents

| Route | Auth | Request | Response and purpose |
|---|---|---|---|
| `GET /v1/inbox` | any caller | none | `{items}`: what needs the caller now. Each item has a `kind`: `approval`, `question`, `failure`, or `paused` |
| `POST /v1/runs/{id}/approvals/{approval}/rule` | owner of the profile in its pool | `note` | `{pool, rule}`. Adds the tool of the approval to the policy of the pool, and decides nothing. 409 without a pool |
| `GET /v1/home` | any caller | none | `{sentence, glance, needsYou, inProgress, recent, others}` |
| `GET /v1/home/others` | any caller | none | `{runs}`: at most 200 runs of people outside the teams of the caller |
| `GET /v1/runs/{id}/result` | viewer | none | What the run produced and what it needs next |
| `GET /v1/runs/{id}/transcript` | viewer | Query: `from` or `before`, `limit` | `{run, items, next, prev}`: the conversation as chat items |
| `GET /v1/whoami` | any caller | none | `{principal, roles, admin, canCreate, teams, fleet, links}` |
| `PUT /v1/agents/{name}` | creator to create, owner to change | Query: `pool`, `dryRun=true`. Body: a profile, and `workers` (`template`, `replicas`) | 201 or 200 with the agent. A new agent that no pool runs gets a runtime pool. A dry run answers a draft and saves nothing |
| `DELETE /v1/agents/{name}` | owner | Query: `pool` | 204 |
| `GET /v1/agents/{name}/skills` | viewer | Query: `pool` | `{agent, pool, allowlist, skills}`: the skills that the profile allows |
| `POST /v1/builder` | operator | `input` or `fromRun`, and `files`. Header: `Idempotency-Key` | 201 with the run of the agent builder |
| `GET /v1/usage` | any caller | none | Deprecated. The answer carries `Deprecation: true` |

## Faces and skills

| Route | Auth | Request | Response and purpose |
|---|---|---|---|
| `GET /v1/faces` | any caller | none | `{faces}`: the faces of the agents that the caller can view, without pictures |
| `GET /v1/faces/{agent}` | any caller. Without `agent.view`, the identicon | `Accept`, `If-None-Match` | The picture as SVG with `ETag`, or the entry as JSON |
| `PUT /v1/faces/{agent}` | owner | An SVG body, at most 32 KB | The entry. 422 if the sanitizer refuses the picture |
| `PATCH /v1/faces/{agent}` | owner | `displayName` (64 characters), `tagline` (140 characters) | The entry |
| `DELETE /v1/faces/{agent}` | owner | none | The entry, back to the identicon |
| `GET /v1/bossmode/skills` | operator of some agent | none | `{skills}`: the catalog of skills. Needs bossmode |
| `POST /v1/bossmode/runs/{id}/skill` | operator of the run | `name`, `args`, `text` | 202 with the run. Sends a slash command as a pinned message. Needs bossmode |
| `GET /v1/bossmode/marketplaces` | admin | none | `{marketplaces}`: the skills that each marketplace offers |
| `POST /v1/bossmode/skills/preview` | admin | `url`, or `marketplace` with `name`, or `text`, or `files` | The preview of a skill. Installs nothing |
| `POST /v1/bossmode/skills` | admin | A source as for the preview, `replace`, `digest` | 201 or 200 with `{skill, replaced, preview}`. Installs a skill |
| `DELETE /v1/bossmode/skills/{name}` | admin | none | 204. Removes an imported skill |

## Duties and notifications

Viewers of the agent of a duty read it, and owners change, run, and delete it. See [Duties](../guide/duties.md).

| Route | Auth | Request | Response and purpose |
|---|---|---|---|
| `GET /v1/duties` | any caller | none | `{duties, paused, reason}` |
| `PATCH /v1/duties` | admin | `paused`, `reason` | `{paused, reason, by, at}`: the switch that pauses every duty |
| `GET /v1/duties/options` | any caller | none | `{secrets, events, actions, looks}`: what the editor can offer. Secret names and hosts only, never values |
| `GET /v1/duties/{name}` | viewer | none | The duty, its schedule read back in words, its next time, its state, and its history |
| `PUT /v1/duties/{name}` | owner | Query: `dryRun`, `test`. Header: `X-Time-Zone`. Body: the duty | 201 or 200 with the duty. A dry run answers `{duty, readback, forDevelopers, next, problems, check}` |
| `PATCH /v1/duties/{name}` | owner | `paused` | The duty. Pauses or resumes it |
| `DELETE /v1/duties/{name}` | owner | none | 204 |
| `POST /v1/duties/{name}/run` | owner | none | 202 `{run}` or `{waiting}`, or 200 `{skipped}` or `{duplicate}`. Starts the duty now |
| `POST /v1/duties/{name}/write-check` | owner | `words`, `agent`, `budget` | `{checkFirst, readback, forDevelopers, check, run}`. The agent writes the check from your words |
| `POST /v1/duties/{name}/call` | public. The duty checks its own bearer token or HMAC signature | The event, at most 1 MB | 202 `{run}` or `{waiting}`. Another app starts a duty |
| `GET /v1/notifications` | a person | none | `{channels, quietHours, offered, shared, serverDefault, off}`: the settings of the caller |
| `PUT /v1/notifications` | a person | `channels`, `quietHours`. Header: `X-Time-Zone` | The same shape, or 400 with `problems` |
| `POST /v1/notifications/test` | a person | `channel`, empty for all | `{results}`: sends a test now |

## The wiki, playbooks, and routines

Reading the wiki needs the operator role on some agent, and writing needs the owner role. See [The wiki](../guide/wiki.md) and [Routines](../guide/routines.md).

| Route | Auth | Request | Response and purpose |
|---|---|---|---|
| `GET /v1/pages` | read | Query: `prefix` | `{pages}`: the tree of the wiki |
| `GET /v1/pages/search` | read | Query: `q`, `limit` | `{q, results, read, unread, cut}` |
| `GET /v1/pages/removed` | read | none | `{removed}`: removed pages that keep a history, for a restore |
| `GET /v1/pages/{path}` | read | Query: `version`. `Accept: text/markdown` asks for the text alone | The page with `ETag`. A path that ends in `.md/history` answers the versions |
| `PUT /v1/pages/{path}` | write | `text`, `summary`. `If-Match` or `If-None-Match: *` | 201 or 200 with the page. 412 if the page changed |
| `DELETE /v1/pages/{path}` | write | `If-Match` | 204. The history stays |
| `GET /v1/playbooks` | any caller | none | `{playbooks}` |
| `GET /v1/playbooks/{name}` | the owner, or an operator of each seat | none | The playbook, with its caps and delegation |
| `PUT /v1/playbooks/{name}` | an operator of the agent of each seat | `goal`, `placement`, `seats`, `caps`, `delegation`, `revision` | 201 or 200. 409 for an old revision |
| `DELETE /v1/playbooks/{name}` | as for a read | none | 204 |
| `GET /v1/routines` | any caller | Query: `agent` | `{routines, off}`. With routines off, `off: true` and a `reason` |
| `GET /v1/routines/summary` | viewer | Query: `agent` (required), `days` (1 to 30, default 7) | The recent runs, cost, and sent-back runs of the agent, by routine |
| `GET /v1/routines/{agent}/{name}` | viewer | none | The routine with its standing, readiness, sign-off, history, and evidence |
| `PUT /v1/routines/{agent}/{name}` | operator to propose, owner otherwise | `routine`, `standing`, `source`, `replay`, `note` | 201 or 200 with the routine |
| `POST /v1/routines/{agent}/{name}/standing` | owner | `standing`, `note`, `version` | The routine. 409 for a move that is not allowed |

## The fleet and pools

The fleet routes need `workbench.fleet.atespaces` or `workbench.fleet.egress`. The pool routes also need `workbench.pools` or `workbench.templates`, and the package routes need `workbench.packages`. See [Pools and templates](../deployment/pools.md).

| Route | Auth | Request | Response and purpose |
|---|---|---|---|
| `GET /v1/fleet` | any caller | none | `{name, members, pools}`, as far as the caller can see |
| `GET /v1/fleet/runs` | any caller | Query: `scope` (`fleet` or `local`), `member`, `parent`, `agent`, `state`, `principal`, `batch`, `limit`, `hidden` | `{runs, total, glance}`: the runs of the whole fleet |
| `GET /v1/pools` | any caller | none | `{pools}`: each with the Tasks it wants and has, and the reason for a gap |
| `POST /v1/pools` | creator | `name`, `template`, `agent`, `replicas`, `env`, `resources` | 201 with the pool. Creates a runtime pool |
| `GET /v1/pools/{name}` | viewer | none | The pool |
| `PATCH /v1/pools/{name}` | owner of the agent | `replicas`, `env`, `resources`, `template` | The pool |
| `DELETE /v1/pools/{name}` | owner of the agent | none | 202. Removes a runtime pool once its Tasks idle |
| `GET /v1/templates` | any caller | none | `{templates}`: each with its name, whether it is the default, its atespace, and its model |
| `GET /v1/pools/{name}/packages` | viewer | none | `{pool, available, on, ask, python, tools, applying, workers}` |
| `PUT /v1/pools/{name}/packages` | owner of the agent | Query: `dryRun=true`. Body: `on`, `ask`, `python`, `tools` | The packages. The lists replace the lists of the pool |
| `GET /v1/fleet/orphans` | admin | none | `{orphans, removeAfter}`: child Tasks whose parent Task is gone |
| `DELETE /v1/fleet/orphans` | admin | none | `{removed, failed}` |

## Sign-in, connections, and sources

| Route | Auth | Request | Response and purpose |
|---|---|---|---|
| `GET /ui` | public | none | The dashboard page |
| `GET /ui/signin` | public | Query: `next` | 302 to the issuer, with PKCE. Needs `auth.oidc.clientId` and `workbench.signin` |
| `GET /ui/callback` | public | Query: `code`, `state` | The end of the sign-in. It keeps the token in the page and returns to `next` |
| `POST /ui/refresh`, `DELETE /ui/refresh` | public, same origin, with the cookie `fw_refresh` | none | A new token for the page, or forget the renewal at sign-out |
| `GET /.well-known/oauth-protected-resource`, with `/{rest...}` | public, with `oidc` in `auth.mode` | none | The RFC 9728 document |
| `/mcp` | the agent, and an `Origin` check | JSON-RPC | The MCP server over Streamable HTTP. `mcp.path` renames it |
| `GET /v1/connections` | a person | none | `{connections}`: the services that act for the caller |
| `POST /v1/connections/{server}` | a person | `next` | `{url}` and the cookie `fw_connect`. Starts a connection |
| `DELETE /v1/connections/{server}` | a person | none | 204. Removes the grant of the caller |
| `GET /ui/connect/callback` | public, with the cookie `fw_connect` | Query: `state`, `code` | 303 back to the page. The end of a connection |
| `POST /v1/tokens` | the static token or a workload | `subject`, `server`, `run` | `{token, expiresAt}`: the token of a person for one run |
| `POST /v1/tokens/reject`, `POST /v1/tokens/forget` | the static token or a workload | `subject`, `server`, and `token` for reject | 204. A refused token, or a dropped grant |
| `POST /v1/sources/{name}` | public. The source checks its bearer token or HMAC signature | One event or an array, at most 1 MB | 202 with the run requests. If every event was a duplicate, 200 |

## How the front reaches a run of a worker

In a fleet, a worker runs as an ax Task, and the atenet router is the only way in. The front answers for the whole fleet. For a run route of the kernel, it asks the view which member owns the run, and forwards the request to that member. `POST /v1/runs?member=<name>` starts a run on that member. See [section 4.5](../design/workbench-architecture.md#45-acting-on-a-run-of-another-member).

1. For a person, the front first decides `run.view` or `run.operate`. Then it sends the static token with `Fw-On-Behalf-Of`, so the member records the person.
2. The front sends the request to `ax.router` with the header `ate-target-actor: <atespace>/<task>`. If the Task sleeps, the router wakes it first.
3. The headers `Accept`, `Content-Type`, `Idempotency-Key`, and `Last-Event-ID` go along. `Fw-Fleet-Via` stops a second forward.
4. The member decides with its own rules. The front copies back the status and the headers such as `Content-Type`, `Retry-After`, and `Location`.

The front answers some requests itself. It reads a run of a quiet or stopped member from the view, and a run of the archive as `archived: true`. It builds `result`, `transcript`, and the rule route from the ledger of the owner. Every route of this page answers from the stores of the front, not from a worker.

<div class="paths" markdown>

- [HTTP API <span>The routes of the kernel</span>](http-api.md)
- [MCP tools <span>The same work through an MCP client</span>](mcp-tools.md)

</div>

## Sources

- `featherweight-workbench/surface/web/web.go`
- `featherweight-workbench/surface/web/agents.go`
- `featherweight-workbench/surface/web/builder.go`
- `featherweight-workbench/surface/web/views.go`
- `featherweight-workbench/surface/web/fleet.go`
- `featherweight-workbench/surface/web/connect.go`
- `featherweight-workbench/surface/web/signin.go`
- `featherweight-workbench/surface/web/refresh.go`
- `featherweight-workbench/surface/mcp/mcp.go`
- `featherweight-workbench/bossmode/routes.go`
- `featherweight-workbench/bossmode/skills.go`
- `featherweight-workbench/bossmode/imports.go`
- `featherweight-workbench/bossmode/stream.go`
- `featherweight-workbench/bridges/routes.go`
- `featherweight-workbench/conversations/routes.go`
- `featherweight-workbench/duties/routes.go`
- `featherweight-workbench/duties/call.go`
- `featherweight-workbench/faces/routes.go`
- `featherweight-workbench/inbox/inbox.go`
- `featherweight-workbench/notify/routes.go`
- `featherweight-workbench/pages/routes.go`
- `featherweight-workbench/playbooks/routes.go`
- `featherweight-workbench/routines/routes.go`
- `featherweight-workbench/sources/webhook.go`
- `featherweight-workbench/workers/routes.go`
- `featherweight-workbench/connections/broker.go`
- `featherweight-workbench/fleet/relay.go`
- `featherweight-workbench/fleet/forward.go`
- `featherweight-workbench/docs/ARCHITECTURE.md` (sections 2, 4.5)
