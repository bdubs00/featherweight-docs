# The fleet

A fleet is many agents, each in its own sandbox, and one workbench in front of them that people talk to, called the front. Each sandbox sleeps between jobs and wakes for the next one, so an agent that waits for you costs nothing.

<div class="demo" data-demo="fleet-sleep" markdown>

Three worker Tasks of one pool sleep. When you enqueue a job, the front wakes every sleeping Task of the pool, because a sleeping Task reads no queue. One Task takes the job, and the others stay idle. After 10 minutes idle, the front reads the status of each idle Task and suspends it. A run that waits for a person frees its slot, so its Task can take the next job or go to sleep. Your decision goes through the router and wakes the Task again.

</div>

## The worker and the front

A worker is one kernel, `fw`, in one AX Task. A Task is a sandbox that AX can suspend and resume with its `/workspace` volume intact. The worker takes jobs from a queue, runs them, writes every step to its ledger, and publishes the events of its runs on the bus. It publishes nothing about itself.

The front is the workbench, `fw-workbench`, in its role in a fleet: a Deployment outside the sandboxes, in front of the workers. It signs people in, keeps their credentials, serves bossmode and the MCP tools, sends jobs, and puts idle Tasks to sleep. No member of the fleet leads the others, and no election takes place.

| Who | Holds | Does not hold |
|---|---|---|
| A worker | its ledger on `/workspace`, its runs, the profiles of its `fw.yaml`, the static token of the fleet | a grant of a person, a view of the other workers |
| The front | a view of the fleet in memory, the grants of people, the job records, the profiles of its pools | the ledger or the runs of a worker |
| The platforms | AX: the Tasks and their phases. NATS: the queues, the event stream, and the shared buckets. Substrate: the volume of each Task. | the meaning of a run |

A fleet is not a set of replicas. Replicas of one agent share one ledger and serve the same runs. Each worker keeps its own ledger, and the front acts on a run through the Task that owns it.

### How the front sees the fleet

The front reads two sources, and it never polls a sleeping Task.

1. The AX API. Every `workbench.fleet.interval`, 30 seconds by default, the front lists the Tasks of `workbench.fleet.atespaces`. Each Task is a member named `<atespace>/<task>`. A running Task is `live`, a suspended or pending Task is `quiet`, and any other Task is `stopped`.
2. The event stream. Each worker publishes its ledger events under the prefix `bus.egress`. The front subscribes to `workbench.fleet.egress` and builds each run from its events with the same projection that the kernel uses. The state, the pending approval, and the usage of a run are therefore those of the ledger of the worker.

When a Task becomes live, the front reads `GET /v1/runs` and `GET /v1/agents` of it once. While the view holds a run of a live Task as queued or running, the front reads that Task again once a minute. A suspend can cut the last events of a run, and this read repairs that case.

??? note "Under the hood"
    The view lives in `fleet/platform.go`, `fleet/view.go`, and `fleet/read.go` of the workbench. Section [4.1 The sources](../design/workbench-architecture.md#41-the-sources) also covers a Task that a pool creates again under the same name, and the order of events on the stream.

## Jobs and the queue

A job is one run request on a queue. A batch is many jobs of the same work, sent together. Its jobs spread over the workers of one pool, the set of workers that run one profile. The MCP tool `enqueue` takes `agent`, `items`, and an optional `batch` name. It puts one job per item on the queue of the pool that runs the profile, such as `fw.jobs.migrator`. Every request names the caller as its principal, so the run acts as that person. One call takes at most 500 items.

Each run carries the batch name in the metadata key `fw.batch`. The idempotency key of a request is the batch name and the position of the item. A batch that is sent twice therefore starts each run once. The MCP tool `batch` reports how a batch goes: the jobs that no Task took yet, the runs by state, the runs that wait for a person, and the failed runs with their errors.

On the worker, `bus.intake` names the queue. The intake takes a message only for a free run slot. Under AX, `maxRuns` is 1, because one Task has one working copy. A Task therefore holds one job at a time, and the other Tasks take the other jobs. A run that waits for a person has no driver, so its slot is free for the next job.

The worker acknowledges the message once `fw.run.queued` of its run is on disk. From then on the ledger holds the job. A run that a suspend or a crash cuts off resumes from the ledger at the next start of the same Task.

`bus.intakeRetries` puts a failed job back on its queue that many times. The default is 0, because each retry spends model tokens. After the last attempt, the subject `<intake>.dead` gets the record `fw.intake.dead` with the request, the outcome, and the error.

!!! note
    Section 4.13 of the workbench architecture says that a worker fetches four messages at a time by default. In the code, the NATS driver sets its `concurrency` to the run slots of the process, which is 1 under AX. A pool also renders `concurrency: 1`. The code wins.

??? note "Under the hood"
    The front places a job by its pool, not by the profile name alone (`fleet.QueueFor` in `fleet/enqueue.go`). It records the keys of each job in the NATS bucket `fw_workbench_jobs`, so every replica counts the same job. The intake gate is `intakeGate` in `fw/intake.go` of the kernel. See [4.9 Jobs](../design/workbench-architecture.md#49-jobs) and [9.3 Intake](../design/kernel-architecture.md#93-intake).

## Idle and the suspend controller

A Task that waits for a person costs compute while it runs, and nothing in it changes until the person answers. The front therefore suspends such a Task. When no run is queued or running, `GET /v1/status` of a worker says `idle: true`. The field `idleSince` gives the time of the newest update of a run.

At every interval, the controller looks at each running Task whose newest run update, or last start, is older than `workbench.fleet.suspendAfter`. For each one, it reads `GET /v1/status` through the router. That read wakes nobody, because the Task runs. If the body says `idle` for the whole grace period, the front calls `SuspendTask` on the AX API. The body of the Task decides, so a view that missed an event never suspends a Task that works.

A suspended Task wakes on the next request through the router: a decision, a message, a follow-up, or a new run. The AX API does not learn of such a wake, so the front calls `ResumeTask` after the answer, and the phase follows. A read of a run object wakes no Task, because the front answers it from its view while the Task sleeps.

A sleeping Task reads no queue, so a job needs a wake of its own:

- After `enqueue`, the front wakes every sleeping Task that takes the queue of the job, with one status read each. The Tasks that get no job sleep again later.
- With `workbench.fleet.wakeOnQueue`, the front reads the queues at every interval. If jobs wait and no awake Task has room, it wakes the sleeping Tasks of that queue. If no job left the queue for three intervals, it wakes them too. This covers a job that another process published.

| Key | Meaning | Default |
|---|---|---|
| `workbench.fleet.interval` | The time between two reads of the Task list, the queues, and the idle Tasks | `30s` |
| `workbench.fleet.suspendAfter` | How long a Task stays idle before the front suspends it, or `off` | `10m` with atespaces |
| `workbench.fleet.wakeOnQueue` | Whether the front wakes sleeping Tasks for the jobs that wait in a queue | on with atespaces and an intake |
| `workbench.fleet.orphansAfter` | How long a child Task whose parent is gone sleeps before the front removes it | `24h` with atespaces |

AX records no reason for a suspend, so the front wakes a Task that a person suspended on purpose too. To keep a Task asleep while its profile has jobs, stop the Task.

### A Task that cannot write

A storage failure, such as a full `/workspace`, blocks the kernel: it writes nothing and sends no event, so the view still shows its runs as running. The controller therefore also reads the status of a busy Task, at most once per interval. If the body says `blocked`, the front suspends the Task at once. It shows the reason as `blockedReason` of the member in `GET /v1/fleet` and in the MCP tool `fleet`. The next request restarts the Task from its ledger, so repair the storage first. See [The ledger](../concepts/ledger.md).

??? note "Under the hood"
    The controller is `suspendIdle` in `fleet/suspend.go`, and the wakes are `WakeFor` and the queue reads of `fleet/queues.go`. A Task that a queue wake reached stays out of the next queue wakes for four intervals, so it has time to take a job. The gauges `fw_fleet_queue_pending`, `fw_fleet_queue_ack_pending`, and `fw_fleet_members_blocked` show the state (see [Observability](../deployment/observability.md)). See [4.12 The suspend controller](../design/workbench-architecture.md#412-the-suspend-controller) and [4.13 Queue depth](../design/workbench-architecture.md#413-queue-depth).

## Reaching a run on another worker

Run ids are unique across the fleet. When a person acts on a run that another worker holds, the front forwards the request to that Task. This covers the routes under `/v1/runs/{id}`. It also covers the MCP tools `run_status`, `run_events`, `run_file`, `approve`, `cancel`, `send`, `fork`, and `run_budget`.

The forward goes to the atenet router with the header `ate-target-actor: <atespace>/<task>`. The router is the only door into a Task, and it wakes a sleeping Task first. The front first decides the action with its own rules for the person. Then it sends the static token of the fleet and names the person in the header `Fw-On-Behalf-Of`. The worker records that person as the decider or the sender. The credential of the person never reaches a worker.

`POST /v1/runs?member=<name>` and the argument `member` of the MCP tool `run` start a run on one member. For a run of another member, the run object carries `can`, which says whether the person can operate the run. See [4.5 Acting on a run of another member](../design/workbench-architecture.md#45-acting-on-a-run-of-another-member).

## Child Tasks, branches, and pools

An agent hands work to another agent with the tool `spawn_task`. With `spawn.driver: ax`, each child runs in a child Task of its own, with its own workspace and the egress of its parent. The parent records `fw.run.child` and follows the child through the router. A child that waits for a person is not read, so it can sleep. Every delegated run obeys four rules:

1. A child gets only the tools and the budget that its parent and every ancestor allow, and the stricter verdict of the policy wins.
2. A child acts as the person of the parent and gets that person's tokens from the front. No refresh token enters a sandbox (see [Identity](../concepts/identity.md)).
3. A question or an approval of a child arrives on the parent run, so one person supervises the whole tree.
4. Every worker enforces the budget, the tool limits, the loop guard, and the redaction of secrets (see [Safeguards](../concepts/safeguards.md)).

`spawn.maxDepth` (3), `spawn.maxChildren` (16), `spawn.maxDescendants` (32), and `spawn.maxRunning` (8) bound a tree. The MCP tool `fork` with `spawn` puts a branch of a run in a Task of its own. Two branches therefore never see the files of each other. See [11.9 Child runs and child tasks](../design/kernel-architecture.md#119-child-runs-and-child-tasks).

A pool keeps a number of Tasks that run one profile. The front creates, replaces, and deletes the Tasks of `workbench.pools` to match the configuration. It never replaces a Task with an active run. It also owns the profiles of its pools, so an edit in bossmode reaches every worker of the pool. See [Pools and templates](../deployment/pools.md).

## Where to go next

<div class="paths" markdown>

- [Identity <span>How a run on a worker acts as the person who started it</span>](identity.md)
- [Deploy a fleet <span>A front, a queue, and workers on AX</span>](../deployment/fleet.md)
- [Use a fleet from Claude Code <span>The MCP tools that start, watch, and decide runs</span>](../getting-started/from-claude-code.md)

</div>

## Sources

- `featherweight-workbench/docs/ARCHITECTURE.md` (sections 4.1 to 4.13, and 14)
- `featherweight-workbench/fleet/types.go`
- `featherweight-workbench/fleet/config.go`
- `featherweight-workbench/fleet/platform.go`
- `featherweight-workbench/fleet/view.go`
- `featherweight-workbench/fleet/read.go`
- `featherweight-workbench/fleet/suspend.go`
- `featherweight-workbench/fleet/queues.go`
- `featherweight-workbench/fleet/enqueue.go`
- `featherweight-workbench/fleet/jobs.go`
- `featherweight-workbench/fleet/forward.go`
- `featherweight-workbench/pools/config.go`
- `featherweight-workbench/surface/mcp/batch.go`
- `featherweight-kernel/docs/ARCHITECTURE.md` (sections 9.3, 9.4, 11.8, and 11.9)
- `featherweight-kernel/ax/config.go`
- `featherweight-kernel/fw/config.go`
- `featherweight-kernel/fw/kernel.go`
- `featherweight-kernel/fw/intake.go`
- `featherweight-kernel/bus/nats/nats.go`
- `featherweight-kernel/surface/view/status.go`
- `featherweight-kernel/fw/spawn.go`
- `featherweight-kernel/ax/spawn.go`
