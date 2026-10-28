# The four layers

Featherweight is four layers that stack. You talk to the workbench. The workbench sends work into sandboxes, and in each sandbox one kernel runs one agent. Google AX and Agent Substrate make those sandboxes. A sandbox with nothing to do sleeps for free, and new work wakes it.

<div class="demo" data-demo="layers" markdown>

One job in seven steps. Claude Code calls the MCP tool `enqueue`, and the workbench queues twelve jobs. The workbench wakes the sleeping Task through the atenet router, and the kernel takes one job. The kernel gets a short-lived token from the workbench to act as you. A policy rule asks you before `git push`, so the kernel appends `fw.approval.requested`, and the workbench suspends the idle Task. Your decision wakes the Task through the router, and the run goes on. At the end, `fw.run.finished` goes out on the egress stream, and you read the result with `run_result`.

</div>

The demo shows one migrator Task, but a fleet has many. Each layer below has one job, and none of them knows the inside of the layer under it.

## Agent Substrate: sandboxes that sleep

Agent Substrate runs on a Kubernetes cluster and makes sandboxes. A sandbox is a sealed container that runs under gVisor, a user-space Linux kernel that keeps the host safe from the code inside. Substrate calls a sandbox an actor.

Each actor has one folder, `/workspace`, that Substrate can freeze and thaw. A suspend pauses the actor, saves `/workspace`, and frees its CPU and memory. A resume restores that folder into a fresh container. Everything else in the container is lost, so the kernel keeps all of its state in `/workspace`.

Substrate also runs the atenet router, the only door into an actor. A request names its actor in the header `ate-target-actor`. If the actor sleeps, the router wakes it first. Substrate also holds an egress policy for each actor: the list of hosts that the actor can reach. The egress gateway blocks every other host.

## Google AX: Tasks on top of Substrate

AX puts a Kubernetes-like interface on Substrate. You write two objects. A Task names the image and its environment variables. A Workspace names the files and the git repositories for `/workspace`. `ax apply` creates them. `ax suspend`, `ax resume`, and `ax ssh` do what their names say.

AX treats the program inside a Task as a black box. It does not know what a model turn is. It cannot tell whether the program works or waits, or whether a suspend is safe now. Featherweight runs a patched AX that adds `spec.egress` to a Task, so the Task itself lists the hosts that it can reach. See [Platform gaps and patches](../operations/platform-gaps.md).

## The kernel: one agent in one Task

The kernel, the binary `fw`, is the program inside one Task. It runs as the first process of the container, and it is one agent and nothing more. It loads a profile, a named agent configuration: a system prompt, tools, a model, a budget, and a policy. Then it runs the loop: it asks the model, runs the tools that the model asked for, and asks again.

The kernel writes every step of that loop to the ledger, an append-only log in `/workspace`. The ledger survives a suspend because `/workspace` does. So a frozen agent goes on later from the exact step where it stopped. The kernel reports on `GET /v1/status` whether it has work. When a tool must act as a person, the kernel asks the workbench for a short-lived token.

Work reaches the kernel in two ways: a request through the router, or a job from a queue on the bus. The same binary also runs as a plain process on a laptop. See [The run lifecycle](run-lifecycle.md), [The ledger](ledger.md), and [Safeguards](safeguards.md).

## The workbench: the front for people

The workbench, the binary `fw-workbench`, runs outside every sandbox as a normal Kubernetes Deployment. In a fleet, its role is called the front, because it stands in front of the sandboxes. The pages on deployment use that name. It signs people in, keeps their grants to services, and serves the web page and the MCP server. Bossmode, its web page, is where you answer decisions and drive bridges of agents. Claude Code reaches the same fleet through MCP tools such as `run`, `enqueue`, `approve`, and `run_result`.

The workbench reads the Tasks from the AX API and the events of every run from the egress stream of the bus. It puts jobs on the queues, and it wakes the sleeping Tasks that serve a queue. It suspends a Task that stays idle for `workbench.fleet.suspendAfter`, 10 minutes by default. It also answers the token requests of the kernels, so a refresh token never enters a sandbox.

The workbench keeps little state of its own. AX holds the Tasks, Substrate holds each `/workspace`, and the ledger in each Task holds the runs. See [The fleet](fleet.md) and [Identity](identity.md).

??? note "Under the hood"
    The enqueue path is in `fleet/enqueue.go` of the workbench. A worker of a pool reads the intake of its pool, and a worker of no pool reads `<intake>.<agent>`. A sleeping Task reads no queue, so `WakeFor` in `fleet/suspend.go` sends it a read of `GET /v1/status` through the router. The router wakes the actor, and the front then calls `ResumeTask` so that the AX API learns of the wake. The suspend controller in the same file calls `SuspendTask` on the AX API. The token broker serves `POST /v1/tokens` in `connections/broker.go`.

## Why the kernel exists beside AX

AX gives you a box and a freezer, and no view of what happens inside the box. Put a general agent framework inside the Task, and three things go wrong. The framework keeps the conversation in memory, so a suspend loses the thread. Nothing reports idle, so nothing can tell that a suspend is safe. And every agent in the box acts with one service credential.

The kernel fixes those three things. The ledger survives the freeze. The idle signal makes the freeze automatic. The token broker of the workbench, with the budget and the policy of the kernel, lets each agent act as a person within bounds. The [product direction](../design/product-direction.md#2-why-this-layer-exists) states the argument in full.

The kernel helps most with four kinds of work: long runs, runs that wait on people, many runs that sleep most of the time, and runs that fan out into child runs. A short batch job that never waits on a person does about as well in a plain container.

<div class="paths" markdown>

- [The run lifecycle <span>The states of a run, and how it waits and wakes</span>](run-lifecycle.md)
- [The ledger <span>What survives a crash, and how a new process goes on</span>](ledger.md)

</div>

## Sources

- `featherweight-kernel/README.md`
- `featherweight-kernel/docs/ARCHITECTURE.md` (sections 3, 11.5)
- `featherweight-kernel/docs/KERNEL_MAP.md`
- `featherweight-kernel/surface/view/status.go`
- `featherweight-kernel/tokens/tokens.go`
- `featherweight-workbench/README.md`
- `featherweight-workbench/fleet/enqueue.go`
- `featherweight-workbench/fleet/queues.go`
- `featherweight-workbench/fleet/suspend.go`
- `featherweight-workbench/fleet/forward.go`
- `featherweight-workbench/fleet/types.go`
- `featherweight-workbench/connections/broker.go`
- `featherweight-workbench/surface/mcp/tools.go`
- `featherweight-workbench/docs/PRODUCT_DIRECTION.md`
- `ax/README.md`
- `ax/pkg/apis/v1alpha1/types.go`
