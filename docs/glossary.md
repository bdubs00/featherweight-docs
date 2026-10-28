---
wide: true
---

# Glossary

These are the words of Featherweight and of bossmode, in alphabetical order. Each row gives a short meaning and the page that explains the word.

## A to C

| Term | Meaning | Read more |
|---|---|---|
| A2A | The Agent-to-Agent protocol. The kernel serves an A2A server and calls A2A peers as tools named `ask_<name>`. | [HTTP API](reference/http-api.md#a2a) |
| access | The rules that say who owns, operates, or views an agent: `access` of the process and of each profile. | [Identity](concepts/identity.md) |
| activity | The place of bossmode that lists what needs you first, then what is new. Its list is the inbox. | [Decisions and activity](guide/decisions.md) |
| actor | A program in a gVisor sandbox that Agent Substrate starts, suspends, and resumes. One AX Task runs as one actor. | [The four layers](concepts/layers.md) |
| admission | The bound on the root runs of one process: `maxRuns` that work and `maxQueuedRuns` that wait. A full process answers 429. | [The run lifecycle](concepts/run-lifecycle.md#admission) |
| agent | An AI helper with its own prompt, tools, and limits, that a person talks to. In the configuration, an agent is a profile. | [Profiles, tools, and skills](concepts/profiles-and-tools.md) |
| approval | A hold on a tool call that the policy marks `ask`. The run waits until a person allows or denies the call. | [Safeguards](concepts/safeguards.md) |
| atenet router | The Substrate proxy that sends a request to the actor named in `ate-target-actor`. It wakes a suspended actor first. | [The four layers](concepts/layers.md) |
| atespace | The namespace of AX Tasks, such as `default`. A member of a fleet is named `<atespace>/<task>`. | [The fleet](concepts/fleet.md) |
| AX | Google AX, the control plane that puts Tasks and Workspaces on Agent Substrate. | [The four layers](concepts/layers.md) |
| batch | Many jobs sent together under one name. Every run of a batch carries the name in the metadata `fw.batch`. A bridge uses the batch `bridge:<id>`. | [The fleet](concepts/fleet.md#jobs-and-the-queue) |
| bossmode | The web page for operators that the workbench serves at `/bossmode`: a chat client whose members are agents. | [Bossmode at a glance](guide/index.md) |
| branch | A new run whose ledger starts with a copy of the events of a source run, up to a sequence number. | [The ledger](concepts/ledger.md) |
| bridge | One large job split into seats, with one channel where the agents and the operator talk. | [Bridges and seats](guide/bridges.md) |
| budget | The limits of a run: turns, tokens, cost, working time, tool calls, calls per turn, and repeats of one call. | [Safeguards](concepts/safeguards.md) |
| bus | The message queue of the kernel: `mem`, NATS, Redis, or Kafka. It carries jobs in and events out. | [The fleet](concepts/fleet.md) |
| channel | The posts of a bridge. For notifications, a channel is one place that the front reaches for a person, such as ntfy or Slack. | [Bridges and seats](guide/bridges.md) |
| check run | A run that makes up to five tool calls under the policy and calls no model. A duty uses one to look first. | [Outcomes and check runs](concepts/outcomes.md#a-check-run-calls-no-model) |
| compaction | The replacement of the history of a run by a summary before the context window fills, at `compaction.at` tokens. | [Context, memory, and time](concepts/context-memory-time.md) |
| connection | The link between a person and a service at which an agent acts for that person, made by an OAuth sign-in. | [Identity](concepts/identity.md) |
| conversation | In bossmode, a one-on-one thread with an agent. One conversation is one run, and each later message follows up in it. | [Chat with an agent](guide/chat.md) |
| credential injection | An egress rule of an actor that replaces a request header with a secret, so the real key never enters the sandbox. | [One Task on AX](deployment/one-task-on-ax.md) |

## D to H

| Term | Meaning | Read more |
|---|---|---|
| dead letter | The record on `<intake>.dead` for a job whose run failed after its last attempt, or that cannot start. | [The fleet](concepts/fleet.md) |
| decider | A small model that answers typed questions with probabilities, for routines and the tool `decide`. The key `deciders` names it. | [Routines](guide/routines.md) |
| decision | A card that needs you: an approval to allow or deny, or a question to answer. The run sleeps until you decide. | [Decisions and activity](guide/decisions.md) |
| duty | Work that an agent does on its own, with a schedule in words, a task, and limits. | [Duties](guide/duties.md) |
| egress (bus) | The subject prefix, `bus.egress`, on which a worker publishes its ledger events. The front reads the fleet from it. | [The fleet](concepts/fleet.md) |
| egress policy | The Substrate rules that say where an actor can send traffic. A Task names them in `spec.egress`. | [Platform gaps and patches](operations/platform-gaps.md) |
| environment | The packages of an agent on the durable volume, installed by `uv` and `pixi` from the block `environment`. | [Environments and agent programs](concepts/environments.md) |
| event | One record of the ledger, such as `fw.tool.requested`, with a sequence number within its run. | [The ledger](concepts/ledger.md) |
| face | The picture, display name, and one-line tagline of an agent. Without a picture, the agent gets an identicon. | [Bossmode at a glance](guide/index.md) |
| fail-stop | The state after a storage fault. Writes stop, `/readyz` answers 503, status reports `blocked`, and only a restart resumes. | [The ledger](concepts/ledger.md#fail-stop-on-a-storage-failure) |
| fleet | A set of workers and one front. The front reads the Tasks from the AX API and the runs from the egress stream. | [The fleet](concepts/fleet.md) |
| fork | The MCP tool and the route `POST /v1/runs/{id}/fork` that branch a run. | [The ledger](concepts/ledger.md) |
| front | The role of the workbench in a fleet: `fw-workbench` outside the sandboxes, in front of the workers. It serves people, keeps grants and stores, sends jobs, and suspends idle Tasks. | [The fleet](concepts/fleet.md#the-worker-and-the-front) |
| fw-memory | The MCP server that gives a hosted Claude Code or opencode session the memory, on a loopback route of the native API. | [Profiles, tools, and skills](concepts/profiles-and-tools.md) |
| generation | A number in the configuration of a pool that orders its versions across the replicas of the front. | [Pools and templates](deployment/pools.md) |
| grant | The permission a person gives at an authorization server: a refresh token that the front keeps encrypted. | [Identity](concepts/identity.md) |
| gVisor | The sandbox runtime of Agent Substrate. Inside it, root keeps only a few capabilities. | [The four layers](concepts/layers.md) |
| `harness` | The block that makes the kernel host an agent program, opencode or Claude Code. Every run becomes a session of it. | [Profiles, tools, and skills](concepts/profiles-and-tools.md) |
| heart | A reaction that keeps a piece of work in the wiki, on the page `agents/<agent>/learned.md`, with an optional note. | [The wiki](guide/wiki.md) |

## I to O

| Term | Meaning | Read more |
|---|---|---|
| idle | A process with no run queued or running. The front suspends an idle Task after `suspendAfter`. | [The run lifecycle](concepts/run-lifecycle.md) |
| inbox | The list of what needs the caller now, in the order of attention. `GET /v1/inbox` and the tool `inbox` serve it. | [Decisions and activity](guide/decisions.md) |
| intake | The bus queue, `bus.intake`, from which a worker takes run requests, one for each free run slot. | [The fleet](concepts/fleet.md) |
| job | One run request on the queue of a profile, which one worker takes and runs. The tool `enqueue` sends many jobs at once, as a batch. | [The fleet](concepts/fleet.md#jobs-and-the-queue) |
| kernel | The binary `fw` and its repository: one agent in one Task, with the turn loop, the budget, the policy, and the ledger. | [The four layers](concepts/layers.md) |
| ledger | The append-only log of a run, one event per line. The kernel rebuilds a run from it after a restart or a wake. | [The ledger](concepts/ledger.md) |
| manager | One more agent of the fleet that helps an operator: it reads the fleet, opens bridges, and writes reports. | [The manager](guide/manager.md) |
| MCP | The Model Context Protocol. The kernel calls MCP servers as tools, and the workbench serves one at `/mcp`. | [MCP tools](reference/mcp-tools.md) |
| member | One `fw` process of a fleet, named `<atespace>/<task>`, in the state `live`, `quiet`, or `stopped`. | [The fleet](concepts/fleet.md) |
| memory | Notes in Markdown that a later run of the same scope can read, through the tools `memory` and `recall`. | [Context, memory, and time](concepts/context-memory-time.md#memory) |
| notification | A message that the front sends to a channel of a person: a question, a failure, or a digest. | [Decisions and activity](guide/decisions.md) |
| OIDC | OpenID Connect. The mode `oidc` accepts a bearer token from an issuer, and the workbench signs people in with it. | [Identity](concepts/identity.md) |
| orphan | A child Task whose parent Task is gone. An admin removes orphans, and the front removes them after `orphansAfter`. | [Pools and templates](deployment/pools.md) |
| OTLP | The OpenTelemetry protocol. A worker pushes metrics, its ledger as logs, and traces to a collector. | [Observability](deployment/observability.md) |
| outcome | A grade of the answer of a run by a grader run against a rubric, recorded as `fw.outcome.evaluated`. | [Outcomes and check runs](concepts/outcomes.md) |
| overlay | The profiles and allow rules that the front keeps for a pool and merges into the configuration of its workers. | [Pools and templates](deployment/pools.md) |

## P to R

| Term | Meaning | Read more |
|---|---|---|
| package | Extra software that a pool gives its workers: Python packages and programs, installed on the durable volume of each Task. | [Skills, tools, and packages](guide/skills.md) |
| page | One Markdown document of the wiki, with its history. A page outlives every run and every Task. | [The wiki](guide/wiki.md) |
| place | A key of the app bar of bossmode: Activity, Chat, Bridges, Fleet, Duties, Skills, Routines, Wiki, or Manager. Each opens its own panes. In Where to reach me, a place is a channel for notices. | [Bossmode at a glance](guide/index.md) |
| playbook | The plan of a bridge saved under a name. A duty or a person opens a bridge from it. | [Bridges and seats](guide/bridges.md) |
| policy | The rules that decide each tool call: `allow`, `ask`, or `deny`, by a flag, a tool name, or a pattern. | [Safeguards](concepts/safeguards.md) |
| pool | A set of Tasks that run one profile. The front keeps them at a replica count from one image and one configuration. | [Pools and templates](deployment/pools.md) |
| principal | The identity of a caller: a subject, a name, a kind, groups, and scopes. | [Identity](concepts/identity.md) |
| profile | A named agent configuration: a prompt, tools, skills, a model, a policy, a budget, an access block, and routines. | [Profiles, tools, and skills](concepts/profiles-and-tools.md) |
| question | A request from the tool `ask_user` to a person, with an optional form. It is an approval that you answer with text. | [Decisions and activity](guide/decisions.md) |
| recall | The built-in tool that searches the notes, the earlier runs, the workspace files, and the skills of a run. | [Context, memory, and time](concepts/context-memory-time.md) |
| replay | A recorded run run again against another model, with the recorded tool results: `fw replay`. | [fw commands](reference/fw-commands.md) |
| resume | The rebuild of an unfinished run from its ledger after a restart or a wake. | [The run lifecycle](concepts/run-lifecycle.md) |
| routine | A vetted list of tool calls with typed questions and a check afterward, that the kernel runs in place of the model. | [Routines](guide/routines.md) |
| run | One conversation with one profile, one budget, and one ledger, in a state such as `running` or `input-required`. Bossmode shows a run as a chat or a conversation. | [The run lifecycle](concepts/run-lifecycle.md) |
| runtime pool | A pool that an operator creates from a template while the front runs, without an image digest or egress rule. | [Pools and templates](deployment/pools.md) |

## S to Z

| Term | Meaning | Read more |
|---|---|---|
| sandbox | The sealed container in which one agent runs: a Substrate actor under gVisor, which AX hands out as a Task. | [The four layers](concepts/layers.md) |
| scope | The notes that a run reads and writes: `agent`, `principal`, or `shared`, from `tools.memory.scope`. | [Context, memory, and time](concepts/context-memory-time.md) |
| seat | One agent on a bridge, with a handle and a task. You can mute a seat, give it a new task, or fire it. | [Bridges and seats](guide/bridges.md) |
| skill | A directory with a `SKILL.md` file: instructions that an agent reads for a task that needs them. | [Skills, tools, and packages](guide/skills.md) |
| snapshot | The saved copy of `/workspace` that Substrate takes at a suspend and restores at a resume. | [The four layers](concepts/layers.md) |
| source | An entry of `workbench.sources` that turns outside events, by webhook or poll, into runs. | [The fleet](concepts/fleet.md) |
| spawn | The tool `spawn_task`, which starts a child run with fewer rights than its parent, in this process or a child Task. | [Safeguards](concepts/safeguards.md) |
| SPIFFE | The workload identity standard. The mode `spiffe` makes a JWT-SVID or an X.509-SVID a principal of kind `workload`. | [Identity](concepts/identity.md) |
| standing | The state of a routine: `shadow` decides beside the agent and never acts, `live` acts in place of the model. | [Routines](guide/routines.md) |
| Substrate | Agent Substrate, the platform that runs actors in gVisor sandboxes, each with a `/workspace` that survives a suspend. | [The four layers](concepts/layers.md) |
| suspend | The stop of an actor by Substrate. It saves `/workspace` and stops `fw`. The router wakes the actor later. | [The run lifecycle](concepts/run-lifecycle.md) |
| Task | The AX object that runs one actor from an image and its Workspaces. `fw` is its runner. | [One Task on AX](deployment/one-task-on-ax.md) |
| template | What a worker is, said once by the deployer: image, egress, variables, and base configuration. Operators create pools from it. | [Pools and templates](deployment/pools.md) |
| token broker | The route `POST /v1/tokens` of the front, from which a worker gets a short-lived token of a person for one run. | [Identity](concepts/identity.md) |
| tool | A function that the model calls: a built-in tool, a tool of an MCP server, or an A2A peer. | [Profiles, tools, and skills](concepts/profiles-and-tools.md) |
| tool user | The user that runs `bash` and the stdio MCP servers, from `tools.user`. Under AX, with `fw` as root, it is uid 65532. | [Safeguards](concepts/safeguards.md) |
| turn | One model call and the tool calls that it asks for. `budget.maxTurns` bounds the turns of a run. | [The run lifecycle](concepts/run-lifecycle.md) |
| wiki | The set of pages that the agents and people of a fleet keep together: the long-term memory of the fleet. | [The wiki](guide/wiki.md) |
| workbench | The binary `fw-workbench` and its repository: the kernel plus bossmode, the MCP server, the fleet, and the stores for people. | [The four layers](concepts/layers.md) |
| worker | A bare `fw` in one Task: the sandbox that runs the work of one agent. It takes jobs from its intake queue and publishes its events on the egress subject. | [The fleet](concepts/fleet.md) |
| Workspace | The AX object that ships files, a git clone, MCP servers, and skills into `/workspace` of a Task. | [One Task on AX](deployment/one-task-on-ax.md) |

<div class="paths" markdown>

- [Bossmode at a glance <span>The places of the page</span>](guide/index.md)
- [The four layers <span>How the parts fit</span>](concepts/layers.md)

</div>

## Sources

- `featherweight-bossmode/docs/DESIGN.md` (sections 1 and 5)
- `featherweight-bossmode/docs/COPY.md`
- `featherweight-workbench/docs/ARCHITECTURE.md` (sections 4, 14 to 24)
- `featherweight-workbench/bridges/react.go`
- `featherweight-kernel/docs/ARCHITECTURE.md` (sections 4, 5, 7, 11, 18 to 23)
- `featherweight-kernel/fw/config.go`
- `featherweight-kernel/fw/routine.go`
- `featherweight-kernel/fw/check.go`
- `featherweight-kernel/fw/decider.go`
