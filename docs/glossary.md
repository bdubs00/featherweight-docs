# Glossary

The terms of Featherweight, in alphabetical order. Each entry links to the page of this site that covers it. The definitions follow the code and the design documents of the three repositories.

## A

**A2A**: the Agent-to-Agent protocol. The kernel serves an A2A 1.0 server on its listener and calls A2A peers as tools named `ask_<name>`. See [HTTP API](reference/http-api.md) and [section 8.3 of the kernel architecture](design/kernel-architecture.md#83-a2a-server).

**actor**: a program in a gVisor sandbox that Agent Substrate starts, suspends, and resumes. An AX Task runs as one actor. See [The four layers](concepts/layers.md).

**admission**: the bound on the root runs that one process takes on: `maxRuns` that work and `maxQueuedRuns` that wait, 64 by default. A full process answers a new start or a branch with 429 and `Retry-After`, and never refuses a follow-up or a decision. See [The run lifecycle](concepts/run-lifecycle.md#admission).

**agentgateway**: the gateway that the lab puts in front of the front, so that one URL serves `/mcp`, `/ui`, and `/v1`. In the lab it cuts a call after ten seconds. See [A fleet](deployment/fleet.md) and [The homelab cluster](operations/homelab.md).

**approval**: a hold on a tool call that the policy marks `ask`. The run waits in the state `input-required` until a person allows or denies the call. See [Safeguards](concepts/safeguards.md).

**arming**: the step in which the host of a harness marks a memory call that the policy allowed, with its canonical input. The memory server `fw-memory` then makes that call alone, with the same tool and canonical input, while the run lasts and within two minutes. For a call that a person decided, the host arms the approved call. See [Profiles, tools, and skills](concepts/profiles-and-tools.md#arming).

**atenet router**: the Substrate proxy that sends a request to the actor named in the header `ate-target-actor`, and wakes a suspended actor first. It is the only door into an actor. See [The four layers](concepts/layers.md) and [section 11.4 of the kernel architecture](design/kernel-architecture.md#114-addressing-through-the-atenet-router).

**atespace**: the namespace of AX Tasks, such as `default`. A member of a fleet is named `<atespace>/<task>`. See [The fleet](concepts/fleet.md).

**AX**: Google AX, the control plane that puts Tasks and Workspaces on Agent Substrate. See [The four layers](concepts/layers.md).

## B

**batch**: the name that every run of one job carries in the metadata `fw.batch`, and the MCP tool that reports how a job goes. See [The fleet](concepts/fleet.md).

**blocked**: the state of a process after a storage fault, also called fail-stop. `GET /v1/status` reports `blocked: true` with `blockedReason` and the process idle, and the gauge `fw_storage_blocked` is 1. The front suspends such a Task. See [The ledger](concepts/ledger.md#fail-stop-on-a-storage-failure).

**branch**: a new run whose ledger starts with a copy of the events of a source run up to a sequence number. The tool `fork` makes one. See [The ledger](concepts/ledger.md) and [section 4.7 of the kernel architecture](design/kernel-architecture.md#47-branches).

**budget**: the limits of a run: turns, tokens, cost, working time, tool calls, tool calls per turn, and repeats of one call. See [Safeguards](concepts/safeguards.md).

**bus**: the message queue of the kernel, `mem`, NATS, or Redis. It carries jobs in on the intake queue and events out on the egress subject. See [The fleet](concepts/fleet.md) and [section 9 of the kernel architecture](design/kernel-architecture.md#9-message-queues).

## C

**canonical input**: the form of the input of a memory call of a hosted harness. It holds only the fields of the schema of the tool, each once and of its type, and the full path of a note. The policy decides on it, and the server matches it by bytes. See [Profiles, tools, and skills](concepts/profiles-and-tools.md#the-memory-server).

**CloudEvents**: the envelope of every ledger event. The ledger is one CloudEvents JSON object per line. See [The ledger](concepts/ledger.md).

**compaction**: the replacement of the history of a run by a summary before the context window fills, at `compaction.at` tokens. See [Context, memory, and time](concepts/context-memory-time.md).

**connection**: the link between a person and a service at which an agent acts for that person, made by an OAuth sign-in. A run that needs one waits until the person connects. See [Identity](concepts/identity.md).

**credential injection**: a rule of the egress policy of an actor. It makes the egress gateway replace a request header with a secret, such as a model key, so the real key never enters the sandbox. See [The homelab cluster](operations/homelab.md).

## D

**dead letter**: the record `fw.intake.dead` on the subject `<intake>.dead` for a job whose run failed after its last attempt, or that cannot start. See [The fleet](concepts/fleet.md) and [section 9.3 of the kernel architecture](design/kernel-architecture.md#93-intake).

## E

**egress (bus)**: the bus subject prefix, `bus.egress`, on which a worker publishes its ledger events. The front reads the fleet from that stream. See [The fleet](concepts/fleet.md) and [section 9.4 of the kernel architecture](design/kernel-architecture.md#94-egress).

**egress policy**: the Substrate rules that say where an actor sends traffic. Without one, the egress gateway denies everything. A Task names its rules in `spec.egress`. See [Platform gaps and patches](operations/platform-gaps.md).

**environment**: the packages of an agent on the durable volume, installed by `uv` and `pixi` from lock files that the block `environment` names. See [section 18 of the kernel architecture](design/kernel-architecture.md#18-environments).

**event**: one record of the ledger, such as `fw.tool.requested` or `fw.run.finished`, with a sequence number within its run. See [The ledger](concepts/ledger.md).

## F

**fail-stop**: the state of a process after its first storage fault: a failed append, flush, or read of the ledger. Every write is blocked, `/readyz` answers 503, `GET /v1/status` reports the process blocked and idle, and only a restart resumes the work from the ledger. See [The ledger](concepts/ledger.md#fail-stop-on-a-storage-failure).

**fleet**: a set of workers and one front. The front reads the Task list from the AX API and the runs from the egress stream. See [The fleet](concepts/fleet.md).

**fork**: the MCP tool and the route `POST /v1/runs/{id}/fork` that branch a run. With `spawn`, the branch runs in a Task of its own. See [The ledger](concepts/ledger.md).

**front**: `fw-workbench` outside the sandboxes, as a Deployment. It serves people over `/ui` and `/mcp`, keeps the grants, brokers tokens, sends jobs, and suspends idle Tasks. See [The fleet](concepts/fleet.md).

**fw.brief**: the harness event that the host records before the first prompt with text of a session goes out. Its field `context` is true when that prompt holds the memory index, so the index never goes out twice. See [Profiles, tools, and skills](concepts/profiles-and-tools.md#the-package-harness).

**fw-memory**: the MCP server that gives a hosted harness the memory, on the loopback route `/v1/harness/memory/<secret>` of the native API. Its tools are `recall`, `list`, `remember`, and `forget`, and the policy names them `fw-memory.<tool>`. The name belongs to `fw`. See [Profiles, tools, and skills](concepts/profiles-and-tools.md#the-memory-server).

## G

**generation**: a number in the configuration of a pool that orders its configurations across the replicas of the front. The pool replaces a Task of a lower generation. See [section 14.5 of the workbench architecture](design/workbench-architecture.md#145-no-leader).

**grant**: the permission that a person gives the workbench at an authorization server: a refresh token with its scopes and its client. The front keeps it encrypted under `<home>/grants`. See [Identity](concepts/identity.md).

**gVisor**: the sandbox runtime of Agent Substrate. Inside it, root keeps only `CAP_KILL`, `CAP_NET_BIND_SERVICE`, and `CAP_AUDIT_WRITE`. See [The four layers](concepts/layers.md) and [Platform gaps and patches](operations/platform-gaps.md).

## H

**harness**: an agent program such as opencode or Claude Code that the kernel hosts through the block `harness`. Every run of the process then becomes a session of it. See [section 19 of the kernel architecture](design/kernel-architecture.md#19-hosted-harnesses).

## I

**idle**: the state of a process in which no run is queued or running. `GET /v1/status` reports `idle` and `idleSince`, and the front suspends an idle Task after `workbench.fleet.suspendAfter`. See [The run lifecycle](concepts/run-lifecycle.md) and [The fleet](concepts/fleet.md).

**intake**: the bus queue, `bus.intake`, from which a worker takes run requests, one for each free run slot. See [The fleet](concepts/fleet.md) and [section 9.3 of the kernel architecture](design/kernel-architecture.md#93-intake).

## J

**job**: many pieces of the same work, one run each, on the queue of one profile. The tool `enqueue` sends one. See [The fleet](concepts/fleet.md).

## K

**kernel**: the binary `fw` and its repository: one agent in one Task, with the turn loop, the budget, the policy, and the ledger. See [The four layers](concepts/layers.md).

## L

**ledger**: the append-only log of a run, at `$FW_HOME/runs/<id>/ledger.jsonl`. The kernel rebuilds a run from it after a restart or a wake. See [The ledger](concepts/ledger.md).

## M

**MCP**: the Model Context Protocol. The kernel calls MCP servers as tools, and the workbench serves an MCP server at `/mcp` and over standard input and output. See [Use a fleet from Claude Code](getting-started/from-claude-code.md) and [MCP tools](reference/mcp-tools.md).

**member**: one `fw` process of a fleet, named `<atespace>/<task>` under AX, in the state `live`, `quiet`, or `stopped`. See [The fleet](concepts/fleet.md).

**memory**: the durable state that a later run can use. Its notes are Markdown files under `<home>/memory`, in the scope of the run. The first user message lists them as data, never the system prompt. The tools `memory` and `recall` and the routes `/v1/memory` reach them. See [Context, memory, and time](concepts/context-memory-time.md#memory).

## O

**OIDC**: OpenID Connect. The authentication mode `oidc` accepts a bearer token from an issuer, and the workbench signs a person in at `/ui` with it. See [Identity](concepts/identity.md).

**OTLP**: the OpenTelemetry protocol. A worker pushes its metrics, its ledger as logs, and its traces to the collector that `OTEL_EXPORTER_OTLP_ENDPOINT` names. See [Observability](deployment/observability.md).

**outcome**: a grade of the answer of a run by a grader run against a rubric, recorded as `fw.outcome.evaluated`. See [section 20 of the kernel architecture](design/kernel-architecture.md#20-outcomes).

**overlay**: the profiles and allow rules that the front keeps for a pool in a key-value bucket and merges into the configuration of its workers. An inline profile of a request also overlays the named profile for one run. See [section 14.9 of the workbench architecture](design/workbench-architecture.md#149-profiles-and-rules-of-a-pool) and [Profiles, tools, and skills](concepts/profiles-and-tools.md).

## P

**policy**: the rules that decide each tool call: `allow`, `ask`, or `deny`, by a flag, a tool name, or a `tool: pattern` rule. See [Safeguards](concepts/safeguards.md).

**pool**: a set of Tasks that run one profile, which the front keeps at a replica count from one image and one configuration. See [The fleet](concepts/fleet.md) and [section 14 of the workbench architecture](design/workbench-architecture.md#14-pools).

**principal**: the identity of a caller: a subject, a name, a kind (`user`, `workload`, `token`, `local`, or `anonymous`), groups, and scopes. See [Identity](concepts/identity.md).

**principal scope**: the memory scope `principal`: one directory of notes for each person in each profile, under a hash of the subject of the person. It is the default under ax, where the runs of many people follow one another in one Task. See [Context, memory, and time](concepts/context-memory-time.md#the-store-and-its-scopes).

**profile**: a named agent configuration: a system prompt, instructions, tools, skills, a model, an effort, a time zone, a policy, a budget, and an access block. See [Profiles, tools, and skills](concepts/profiles-and-tools.md).

## Q

**question**: a request from the tool `ask_user` to the caller, with an optional form schema. It is an approval with a schema, answered with `approve` and `content`. See [The run lifecycle](concepts/run-lifecycle.md).

## R

**recall**: the built-in tool that searches the memory of a run. It searches the notes, the earlier runs of the same agent and principal, the workspace files, and the allowed skills. It reads one record by its ref, and it is read-only. See [Context, memory, and time](concepts/context-memory-time.md#the-recall-tool).

**replay**: `fw replay <run> --model <selector>`, which runs a recorded run again against another model with the recorded tool results. See [The ledger](concepts/ledger.md).

**resume**: the rebuild of an unfinished run from its ledger at the start of the process, after a restart or a wake. See [The run lifecycle](concepts/run-lifecycle.md).

**run**: one conversation with one profile, one budget, and one ledger. Its states are `queued`, `running`, `input-required`, `completed`, `failed`, `canceled`, and `suspended`. See [The run lifecycle](concepts/run-lifecycle.md).

## S

**scope (memory)**: the notes that a run reads and writes: `agent`, `principal`, or `shared`, from `tools.memory.scope`. An empty key is `agent`, or `principal` under ax. The kernel builds it from the run, never from the input of a call. See [Context, memory, and time](concepts/context-memory-time.md#the-store-and-its-scopes).

**skill**: a directory with a `SKILL.md` file under `skills/`. The system prompt lists it, and the tool `skill` reads it. See [Profiles, tools, and skills](concepts/profiles-and-tools.md).

**snapshot**: the saved copy of `/workspace` that Substrate takes at a suspend and restores into a fresh container at a resume. See [The four layers](concepts/layers.md) and [Platform gaps and patches](operations/platform-gaps.md).

**source**: an entry of `workbench.sources`. It turns the events of an outside system, by webhook or by poll, into runs on the intake queue of a profile. See [The fleet](concepts/fleet.md) and [section 13 of the workbench architecture](design/workbench-architecture.md#13-event-sources).

**spawn**: the tool `spawn_task`, which starts a child run with fewer rights than its parent. With `spawn.driver: ax`, each child gets a Task of its own. See [Safeguards](concepts/safeguards.md) and [section 11.9 of the kernel architecture](design/kernel-architecture.md#119-child-runs-and-child-tasks).

**SPIFFE**: the workload identity standard. The mode `spiffe` makes a JWT-SVID or an X.509-SVID a principal of the kind `workload`. See [Identity](concepts/identity.md).

**Strata**: the local model server of the lab, on the workstation. The fleet reaches it through a reverse tunnel and the proxy `ax-model`. It serves one request at a time and costs nothing. See [The homelab cluster](operations/homelab.md).

**Substrate**: Agent Substrate, the platform that runs actors in gVisor sandboxes. Each actor has a `/workspace` that survives suspend and resume, and sits behind the atenet router and an egress gateway. See [The four layers](concepts/layers.md).

**suspend**: the stop of an actor by Substrate. It pauses the sandbox, saves `/workspace`, and kills `fw`. The front suspends an idle Task, and the router wakes it. See [The run lifecycle](concepts/run-lifecycle.md) and [section 11.5 of the kernel architecture](design/kernel-architecture.md#115-suspend-and-resume).

## T

**Task**: the AX object that runs one actor from an image and its Workspaces. `fw` is its runner, as PID 1. See [One Task on AX](deployment/one-task-on-ax.md).

**token broker**: the route `POST /v1/tokens` of the front, from which a worker gets a short-lived access token of a person for one run. The refresh token stays on the front. See [Identity](concepts/identity.md) and [section 11.9 of the workbench architecture](design/workbench-architecture.md#119-the-token-broker).

**tool**: a function that the model calls. The built-in tools of the default list are `bash`, `files`, `http`, `memory`, `recall`, `skill`, `clock`, `ask_user`, `spawn_task`, and `await_task`. Other tools come from an MCP server or an A2A peer. See [Profiles, tools, and skills](concepts/profiles-and-tools.md).

**tool user**: the user that runs `bash` and the stdio MCP servers, from `tools.user`. Under AX with `fw` as root, it is `nonroot`, uid 65532, and it cannot read `/workspace/.fw`. See [Safeguards](concepts/safeguards.md) and [section 7.12 of the kernel architecture](design/kernel-architecture.md#712-tool-processes).

**turn**: one model call and the tool calls that it requests. `maxTurns` bounds the turns of a run. See [The run lifecycle](concepts/run-lifecycle.md).

## W

**workbench**: the binary `fw-workbench` and its repository: the kernel plus the page, the sign-in, the MCP server, the fleet, the connections, the pools, and the builder. See [The four layers](concepts/layers.md).

**worker**: a bare `fw` in one Task. It takes jobs from its intake queue, publishes its events on the egress subject, and publishes nothing about itself. See [The fleet](concepts/fleet.md).

**Workspace**: the AX object that ships files, a git clone, MCP servers, and skills into `/workspace` of a Task. Under AX, `fw.yaml` lives at `/workspace/.fw/fw.yaml`. See [One Task on AX](deployment/one-task-on-ax.md).
