# Debugging a Task

A Task is one agent in one sealed sandbox. You cannot open a shell in it by default, a request to it can wake it, and its output lands in a log outside it. This page is a set of short procedures for a run or a Task that misbehaves: where to look, what to type, and what the answer means.

Every `kubectl`, `kubectl-ate`, and `ax` command below runs on a machine whose `KUBECONFIG` names the cluster. Without it, `ax` dials `localhost:8080` and fails.

## Read the run

Start with the run, not the Task. Three ways reach it, from the cheapest to the most direct.

Through the front, the workbench in front of the workers. In bossmode, open the conversation or the bridge: every step of the run is there. From Claude Code, call `run_result` with the run id for what the run produced and what it needs next. Call `run_events` for one page of its ledger. Over HTTP, read `GET /v1/runs/{id}` and `GET /v1/runs/{id}/events` on the front. A read of a run object wakes no Task, because the front answers it from its view. A run of a Task that a pool replaced comes from the archive of the front, with `archived: true`.

Through the router, without a front. `fw ax events` reads the ledger of a run through the router, 1,000 events at a time. Forward the port of the router first. A request through the router wakes a sleeping Task.

```sh
kubectl -n ate-system port-forward svc/atenet-router 8001:80 &
fw ax events --name reviewer --router 127.0.0.1:8001 <run-id>
```

Inside the Task. With `spec.debug: true` on the Task, `ax ssh <task> -- fw events <run-id>` prints the ledger from `/workspace/.fw`. See the warning in [One Task on AX](../deployment/one-task-on-ax.md#look-inside-a-task).

## Read the Task

`GET /v1/status` gives the state of the kernel at a glance: the usage, the oldest pending approval, the counts of runs, `idle`, and `idleSince`. After a storage failure, it adds `blocked` and `blockedReason`. Read it through the router. The read wakes a sleeping Task.

```sh
curl -sS -H 'ate-target-actor: default/reviewer' -H "Authorization: Bearer $FW_API_TOKEN" \
     http://127.0.0.1:8001/v1/status
```

The platform knows the rest. `ax -a default describe task <task>` prints the phase, the conditions, and the reason of a failure. `kubectl-ate get actors <task> -a default` prints the state of the actor, such as `ACTOR_STATE_RUNNING`, `ACTOR_STATE_SUSPENDED`, or `ACTOR_STATE_CRASHED`. `kubectl-ate logs actors <task> -a default` streams the log of the actor.

The output of `fw` also lands in the log of the Substrate worker pool that hosts the Task. Such a pool belongs to Substrate and is not a pool of Featherweight. Its Deployment has the name of the pool, such as `deploy/ax` in the namespace `ax-workers`. Each line is JSON with the label `ate.actor.name`. That log also holds the environment of each Task, tokens included, so never print it without a filter. This filter keeps the lines of `fw` for one Task:

```sh
kubectl -n ax-workers logs deploy/ax --since=1h | python3 -I -c '
import json, sys
task = sys.argv[1]
for line in sys.stdin:
    try:
        d = json.loads(line)
    except ValueError:
        continue
    if (d.get("labels") or {}).get("ate.actor.name") != task:
        continue
    if "msg" in d and "level" in d:
        d.pop("labels", None)
        print(json.dumps(d))
' reviewer
```

Look for `fw: ax boot: ready` at the end of a boot, and `the environment is ready` after the packages of a pool install. The actor lines `Actor checkpointing` and `Actor restored` give the times of a suspend and a resume.

## A Task does not get ready

Work through these steps in order:

1. Read `ax -a default describe task <task>`. The reason `EgressPolicyFailed` means that Substrate refused the egress policy. The phase `Pending` means that AX waits for Substrate.
2. Read the state of the actor with `kubectl-ate get actors <task> -a default`. If it is `ACTOR_STATE_CRASHED`, run `ax -a default resume task <task>` once.
3. Read the log of `fw` with the filter above. A boot that stops at `AX_TASK_YAML` names a key that the kernel does not know.
4. Make sure that the image has a digest. Substrate pulls an actor image by digest only.
5. If the Task runs a goal or a clone, `ax ssh` with `spec.debug` reaches the sandbox before the workspaces are ready.

If the log says `fw: serve: another fw process holds the writer lock of the ledger; waiting for it`, another `fw` holds the ledger, such as a `fw run` that a person started through `ax ssh`. The boot waits up to 30 seconds and then stops with the message `another fw process still holds the writer lock of the ledger after 30s`. Stop the other process and resume the Task. `fw run` beside a running server fails at once with `fw: file ledger: another writer owns this root`.

If the log says `storage failure; execution blocked until restart`, the storage of the Task failed, such as a full `/workspace`. The kernel writes nothing and runs nothing, and `/readyz` answers 503. Its open runs keep their last state, so the front shows them as running. The front reads the status, sees `blocked`, and suspends the Task. The tool `fleet` then says `blocked by a storage failure`, and the gauge `fw_fleet_members_blocked` counts the member. Repair the storage before the next request: the next request starts a fresh process, which rebuilds from the ledger.

## The network

A Task reaches only the hosts of its egress. The egress gateway answers any other HTTP request with 403 and the body `egress denied`. If a model call or an MCP call fails with 403, read the reason and the policy:

```sh
kubectl -n ate-system logs deploy/atenet-egress --all-containers | grep denied
kubectl-ate get egress-policy <task> -a default -o json
```

Then compare the policy with the endpoint. A host is a DNS name, never an IP address. The gateway carries only HTTP and TLS, so a worker reaches NATS at a `ws://` URL. `fw ax render` derives one host for each endpoint of the configuration, and the front warns about each address of a pool that no host allows. Inside the Task, the doctor line `ax reach` names each endpoint that does not answer.

A 401 from the model means that the proxy holds the wrong key, not the gateway. Rewrite the Secret behind the proxy, and prove the key with one request before the next run.

A Task can boot before its egress policy takes effect, so its first model call can be refused or reset. The OpenAI driver tries a refused connection again five times, about fifteen seconds, and the log line `openai: retrying the request` names each try. A Task that cannot reach NATS at its start stops, and `fw ax up` resumes it up to three times.

## A run that waits, a job that failed

A run in `input-required` waits for a person, and `pending` of the run object says for what:

| What waits | Where to read it | How to answer |
|---|---|---|
| An approval | `pending.tool` and `pending.input`, or the card Needs your decision in bossmode | The verb of the card, such as Run command, or Deny. Or the tool `approve`, or `POST /v1/runs/{id}/approvals/{approval}`. |
| A question of `ask_user` | `run_result` | The tool `approve` with the answer in `content` or `note` |
| A connection | `pending.connect.server` | The person connects the service on the page |

A run that waits is idle, so the front suspends its Task after `workbench.fleet.suspendAfter`. The decision wakes the Task. A question of a child in another Task arrives on the parent run.

A worker acknowledges a job once its run is in the ledger. If the run of a job fails after its last attempt, the worker sends a record to `<queue>.dead`, such as `fw.jobs.triage.dead`. The front counts it in `fw_fleet_dead_letters_total`. The tool `batch` with the batch name lists the failed runs with their errors. To run a job again by hand, call `enqueue` with the agent and the input of the job. `bus.intakeRetries` puts a failed job on its queue again, 0 times by default, because each retry spends model tokens again.

## The tool user

Under AX, the tools of a Task, such as `bash`, run as a separate user, `nonroot`. That needs root in the sandbox to have the capabilities to switch users. Without them, the kernel logs this warning and runs the tools as the user of `fw`:

```text
ax: fw runs as root without the capabilities of tools.user, so the processes of tools run as the user of fw and can read its state; give the sandbox these capabilities for tools.user
```

The warning is a fact of the platform, not a fault of the Task. A patched AX can give every new Task the capabilities, as [Platform gaps and patches](platform-gaps.md#tool-user-capabilities) explains. With them, `fw` opens the root directory of the sandbox for the tool user at each boot, and logs `ax: the root directory kept the tool user out, so fw opened it`. A Task whose tools need root sets `FW_TOOLS_USER=none`. A shell on such a Task can read the state of `fw`, so a Task that reads untrusted input gets no shell.

## Where to go next

<div class="paths" markdown>

- [Platform gaps and patches <span>What AX and Substrate do not do yet, and how the project gets around it</span>](platform-gaps.md)
- [Observability <span>The metrics and the logs that show a problem before a person does</span>](../deployment/observability.md)

</div>

## Sources

- `featherweight-kernel/README.md`
- `featherweight-kernel/docs/ARCHITECTURE.md`, sections 5.6, 6.6, 7.12, 9.3, 11, and 21
- `featherweight-kernel/cli/serve.go`
- `featherweight-kernel/cli/ax.go`
- `featherweight-kernel/cli/doctor_ax.go`
- `featherweight-kernel/ax/config.go`
- `featherweight-kernel/fw/ledger.go`
- `featherweight-kernel/fw/lifecycle.go`
- `featherweight-kernel/env/install.go`
- `featherweight-kernel/surface/view/status.go`
- `featherweight-workbench/docs/ARCHITECTURE.md`, sections 4.5, 4.12, 4.14, 4.18, and 11
- `featherweight-workbench/fleet/suspend.go`
- `featherweight-workbench/fleet/metrics.go`
- `featherweight-lab/e2e/k3s/ax-pool.yaml`
