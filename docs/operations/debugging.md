# Debugging a Task

A Task is one agent in one gVisor sandbox on Agent Substrate, with the kernel `fw` as PID 1. Only the atenet router reaches it, the egress gateway decides what it reaches, and its guest output lands in the log of the worker pod. This page is a set of short procedures: where to look for a run or a Task that misbehaves on the homelab. Each one names the command, the host that runs it, and what the output means. The cluster is on [The homelab cluster](homelab.md), and the limits of the platform are on [Platform gaps and patches](platform-gaps.md).

Every `kubectl` and `ax` command below runs on the workstation with `KUBECONFIG=~/.kube/k3s.yaml`. Without it, `ax` dials `localhost:8080`, which is the local model server, and fails. Verified on the homelab.

## Read the run

### Through the front

The front, fw-workbench, serves a view of every run of the fleet. From Claude Code, call `run_result` with the run id for what the run produced and what it needs next. Call `run_events` with `from` or `before` for one page of the ledger, and with `compact` for a cheap poll ([MCP tools](../reference/mcp-tools.md)). Over HTTP, read `GET /v1/runs/{id}` for the run object and `GET /v1/runs/{id}/events` for the ledger. For a run of another member, the front forwards the request to the Task that owns it, with the credential of the caller. The owner records the real decider ([Workbench architecture, 4.5](../design/workbench-architecture.md#45-acting-on-a-run-of-another-member)).

```sh
curl -sS -H "Authorization: Bearer $TOKEN" -H 'Accept: application/json' \
     http://192.168.50.60:8090/v1/runs/$RUN/events
```

Read the token from `e2e/results/.fleet-token` into `TOKEN`. Never paste it into a chat or a ticket.

### Through the router

Without a front, read the Task itself through the atenet router. `fw ax events --name <task> <run-id>` reads `GET /v1/runs/{id}/events` through the router, a page of 1,000 events at a time, and prints the lines of `fw events`. It dials `--router`, so forward the port first. `fw ax status --name <task>` prints the phase and the conditions of the Task, and `GET /v1/status` of the kernel while the Task runs ([Kernel architecture, 21.3](../design/kernel-architecture.md#213-up-status-events-and-down)).

```sh
kubectl -n ate-system port-forward svc/atenet-router 8001:80
fw ax events --name fw-fleet-reviewer --router 127.0.0.1:8001 <run-id>
```

A request through the router wakes a Task that sleeps. A read of a sleeping Task is therefore never free.

### Inside the Task

With `spec.debug: true` on the Task, `ax ssh <task> -- fw events <run-id>` prints the ledger from `/workspace/.fw` without a flag. The `fw` binary is on the PATH of both images, and `fw events` finds the ledger of the Task on its own. See [ax ssh and spec.debug](#ax-ssh-and-specdebug) for the warning.

## Read the Task

### The fw log

The guest stdout of every Task is in the log of the AX worker Deployment: the `fw` log lines and the crash lines. Each line is JSON with the label `ate.actor.name`. The atelet log holds only RPCs. Those carry the environment of the Task, tokens included, so never print the log without a filter. Verified on the homelab. This filter keeps the `fw` lines of one Task and drops the labels, as `e2e/fleet/ax/measure-env.sh` does:

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
' fw-fleet-reviewer
```

The lines `fw: ax boot: ready`, `the environment is ready`, and the warning of the tool user come from here. The actor lines `Actor checkpointing`, `Actor checkpointed`, `Actor restoring`, and `Actor restored` give the suspend and resume times.

### GET /v1/status

`GET /v1/status` on the listener of the kernel gives the state of the agent at a glance. The body holds the usage, the oldest pending approval, the counts of runs, `idle`, and `idleSince`. After a storage failure, it also gives `blocked` and `blockedReason` ([Kernel architecture, 11.8](../design/kernel-architecture.md#118-status-for-the-control-plane)). The front reads it through the router before it suspends a Task. Read it the same way:

```sh
curl -sS -H 'ate-target-actor: default/fw-fleet-reviewer' -H "Authorization: Bearer $TOKEN" \
     http://127.0.0.1:8001/v1/status
```

### ax describe task and the results directory

`ax -a default describe task <task>` prints the phase, the conditions, and the reason of a failure. The k3s loop saves it as `task.describe` in its results directory. Next to it, `actor.log` from `kubectl-ate logs actors <task> -a default` holds the `fw` log and the gVisor log. `kubectl-ate get actors <task> -a default` prints the state of the actor: `ACTOR_STATE_RUNNING`, `ACTOR_STATE_SUSPENDED`, or `ACTOR_STATE_CRASHED`.

## The network

### Egress denied

The egress gateway denies every connection that the egress policy of the actor does not allow. It answers an HTTP request with 403 and the body `egress denied`. If a model call or an MCP call fails with 403, read the reason:

```sh
kubectl -n ate-system logs deploy/atenet-egress --all-containers | grep denied
```

Then compare the policy with the endpoint. `kubectl-ate get egress-policy <task> -a default -o json` prints the policy. `fw ax render` derives one rule for each endpoint of the configuration, so a Task from `fw ax up` misses none. A rule names a DNS name, never an IP address. The gateway carries only HTTP and TLS, so a `nats://` URL needs the WebSocket listener instead.

### The model server answers 401 or 403

A 401 from the model server means that the Secret holds the wrong key. For the k3s loop, run `e2e/k3s/install.sh model` again, which rewrites the Secret `fw-e2e/model` from `OPENAI_API_KEY` or `E2E_API_KEY_CMD`. For the Claude API of the fleet, run `e2e/fleet/anthropic-key.sh` again, which rewrites the Secret `fw-fleet/anthropic` and proves the key with one free request. A 403 is the egress gateway, not the model server. See the procedure above.

### A Task boots before its policy lands

A Task boots before its egress policy takes effect, so the first model call of a Task is refused or reset. The OpenAI driver retries a refused or reset connection five times, about fifteen seconds with the default backoff. The log line `openai: retrying the request` names each try ([Kernel architecture, 6.6](../design/kernel-architecture.md#66-openai-adapter-settings)). Verified on the homelab. A Task that cannot reach NATS at its start stops, and the actor crashes. `e2e/fleet/ax/run.sh` resumes a crashed actor up to three times, and `fw ax up` does the same. The golden boot of the actor template has no egress policy at all, so it fails every time. The actor then boots without the golden snapshot.

## A Task does not get ready

Work through these steps in order:

1. Read `ax -a default describe task <task>`. A reason `EgressPolicyFailed` means that Substrate refused the policy. A phase `Pending` means that the ax server waits for Substrate.
2. Read the state of the actor with `kubectl-ate get actors <task> -a default`. If the state is `ACTOR_STATE_CRASHED`, run `ax -a default resume task <task>` once.
3. Read the `fw` log of the Task with the filter above. A boot that stops at `AX_TASK_YAML` names a key that the kernel does not know.
4. Make sure that the image has a digest. Substrate pulls an actor image by digest only.
5. Make sure that the registry answers: `curl -fsS http://localhost:5001/v2/`. If it does not, see the tunnel procedure below.
6. If the Task runs a goal or a clone, `ax ssh` with `spec.debug` reaches the sandbox before the workspaces are ready.
7. If the log holds the warning `another fw process holds the writer lock of the ledger`, read the section below.

## The ledger lock at boot

`fw` takes the writer lock of its file ledger at each boot. Another `fw` process can hold the lock, for example a `fw run` that a person started through `ax ssh` during a slow boot with `spec.debug`. The boot then tries again for up to 30 seconds and logs this warning every five seconds:

```text
fw: serve: another fw process holds the writer lock of the ledger; waiting for it
```

After 30 seconds, the boot fails with this error, followed by the error of the ledger with its root:

```text
cli: another fw process still holds the writer lock of the ledger after 30s, so this server cannot own the ledger; stop that process, such as fw run started through ax ssh, then start the server again
```

Stop the other process. If `fw` exited after the wait, read the phase of the Task with `ax describe task <task>` and start it again the way its phase allows. The message names an example of a holder and the ledger root, not the process that holds the lock. `fw run` and `fw replay` beside a running server fail at once with `fw: file ledger: another writer owns this root`.

## A Task blocked by a storage failure

A storage failure, such as a full `/workspace`, fail-stops the kernel of a Task. The process writes nothing and runs nothing until it restarts, and its open runs keep their last recorded state. The view of the front therefore shows those runs as running. Look in three places:

- `GET /v1/status` of the Task, read as above. A blocked Task answers `blocked: true`, the cause in `blockedReason`, and `idle: true` with `idleSince` at the time of the failure.
- The `fw` log of the Task, with the filter above. It holds one Error line, `storage failure; execution blocked until restart`, with the cause.
- The gauge `fw_storage_blocked` of the Task, which is 1, and the alert `FwStorageBlocked` of `examples/observability`, which fires after one minute.

The suspend controller of the front reads the status of a Task whose runs the view shows as working without events for the grace period. If the body says `blocked`, the front suspends the Task at once and marks the member with the reason. The member line of the MCP tool `fleet` then says `blocked by a storage failure`. The gauge `fw_fleet_members_blocked` of the front counts the member, and the example alert `FwFleetMemberBlocked` fires. The next request restores a fresh process, which rebuilds from the ledger and resumes the open runs ([The ledger](../concepts/ledger.md#fail-stop-on-a-storage-failure)).

Repair the storage before the next request. If the storage is still full, the fresh process can block again, and the controller suspends it again after the grace period. A Task that the controller suspended wakes on the next request through the router, like any sleeping Task ([Workbench architecture, 4.12](../design/workbench-architecture.md#412-the-suspend-controller)).

## A run stuck in input-required

A run in `input-required` waits for a person. The run object names what it waits for in `pending`:

| What waits | How to read it | How to answer |
|---|---|---|
| An approval | `pending.tool` and `pending.input` in `GET /v1/runs/{id}`, or `run_result` | `approve` with `allow` or `deny`, or `POST /v1/runs/{id}/approvals/{approval}` |
| A question of `ask_user` | `run_result` | `send` with the answer |
| A connect request | `pending.connect` names the service | The person connects the service on the front ([Workbench architecture, 11](../design/workbench-architecture.md#11-connections)) |

A run that waits is idle, so the suspend controller of the front puts its Task to sleep after `workbench.fleet.suspendAfter`. The decision through the front wakes the Task, and the front then calls `ResumeTask` so that the phase follows ([Workbench architecture, 4.12](../design/workbench-architecture.md#412-the-suspend-controller)). A question of a child in another Task arrives on the parent run, and the answer goes to the child.

## A job in the dead letter

A worker takes a job from the intake queue of its profile, `fw.jobs.<agent>` in the lab. It acknowledges the job once the run is queued in its ledger. If the run of the job fails after its last attempt, the worker sends a record to `<queue>.dead`. The front counts the record ([Kernel architecture, 9.3](../design/kernel-architecture.md#93-intake)). `bus.intakeRetries` sets how many times the kernel puts a failed job on its queue again as a new run. The default is 0, because each retry spends model tokens again. The pool `tickets` of the lab sets 2.

To find such a job, read the batch with the MCP tool `batch`, which lists the failed runs. Or read the records on `fw.jobs.<agent>.dead` with the NATS tools. To run it again by hand, call `enqueue` with the agent and one item that holds the input of the job. An event source with `redrive` runs it again on its own at the next delivery of the event after `redrive.cooldown`. It does so up to `redrive.maxAttempts` times ([Workbench architecture, 13.9](../design/workbench-architecture.md#139-redrive-after-a-dead-letter)). The source `tickets` sets three attempts and five minutes, and the sweeper of the helpdesk makes the delivery.

## fw doctor inside a Task

`fw doctor` adds four lines inside a Task, through `ax ssh <task> -- fw doctor` or a Task with `spec.debug` ([Kernel architecture, 21.4](../design/kernel-architecture.md#214-the-doctor-in-a-task)). Outside a Task, it prints one line, `ax: not under ax`.

| Line | What it reads | What a failure means |
|---|---|---|
| `ax reach` | Probes each endpoint of the configuration through the egress gateway at the same time, five seconds each, without a credential. | An endpoint does not answer, and the line names the fix: the egress of the Task. |
| `ax trust bundle` | `/run/ate/egress-trust-bundle/trust-bundle.pem`. | The file holds no certificate. An absent file is ok, because nobody in the Task can change it. |
| `ax tools user` | The user that runs the tools, and whether it is a separate user from the user of `fw`. | `tools.user` names a user that root cannot become in this sandbox. |
| `ax durable` | `FW_HOME` under `/workspace` and writable, `/workspace` a mount, every binding under it. | A path outside the durable volume, which a suspend loses. |

The source is `cli/doctor_ax.go` of the kernel. The line `tools user` of the plain doctor names the tool user, and the `ax tools user` line adds whether that user is a separate one.

## The tools.user warning

Root inside the gVisor sandbox of Substrate holds only the capabilities `CAP_KILL`, `CAP_NET_BIND_SERVICE`, and `CAP_AUDIT_WRITE`. It cannot chown and cannot setuid ([Kernel architecture, 7.12](../design/kernel-architecture.md#712-tool-processes)). Verified on the homelab. The default tool user of ax, `nonroot`, therefore cannot apply there. The kernel falls back to the user of `fw` with this warning in the log:

```text
ax: fw runs as root without the capabilities of tools.user, so the processes of tools run as the user of fw and can read its state; give the sandbox these capabilities for tools.user
```

The warning is a fact of the platform, not a fault of the Task. An explicit `tools.user` stops the start instead, so the lab sets `FW_TOOLS_USER=none` on the migrator. A shell on such a Task reads `FW_HOME`, so a Task that reads untrusted input gets no shell.

## ax ssh and spec.debug

`ax ssh <task> -- <command>` runs a command in the sandbox through the guest services, which the kernel serves on port 80 only for a Task with `spec.debug: true`. `ax ssh` refuses a Task without it. The services start before the workspaces are ready, so a boot that hangs on a clone or a goal is open to inspection. Since ax commit `92d297e`, `ax ssh` forwards standard input, so a bare `ax ssh <task>` opens a shell in the `fw:toolbox` image ([Kernel architecture, 11.12](../design/kernel-architecture.md#1112-guest-services-and-ax-ssh)).

!!! warning
    `spec.debug: true` on a Task that holds keys exposes them. The guest services carry no authentication. Any caller that reaches port 80, a tool process included, can run a process as the user of `fw` and read every `spec.env` entry. Test a sandbox in a throwaway Task with debug on, never on a Task that holds keys. Verified on the homelab.

`fw ax render --debug` and `fw ax up --debug` set the field for a Task of your own. A Task does not change, so a Task without the field needs a new Task.

## The tunnel and the registry

The registry and the model server reach the cluster through the SSH tunnel `fw-e2e-tunnel` on the workstation. If `curl -fsS http://localhost:5001/v2/` fails, or an image push fails, restart the tunnel and read its log:

```sh
systemctl --user restart fw-e2e-tunnel
journalctl --user -u fw-e2e-tunnel
```

The fleet reaches Strata through the second tunnel, `fw-fleet-tunnel`, with the same commands and that name. If the model server moved, run `e2e/k3s/install.sh tunnel` again, which rewrites the unit from `E2E_MODEL_ADDR`.

## Sources

- `featherweight-lab/e2e/README.md`
- `featherweight-lab/e2e/k3s/run.sh`
- `featherweight-lab/e2e/k3s/install.sh`
- `featherweight-lab/e2e/fleet/ax/run.sh`
- `featherweight-lab/e2e/fleet/ax/verify.sh`
- `featherweight-lab/e2e/fleet/ax/measure-env.sh`
- `featherweight-lab/e2e/fleet/anthropic-key.sh`
- `featherweight-lab/e2e/fleet/front-config.sh`
- `featherweight-lab/e2e/fleet/fw-fleet-tunnel.service`
- `featherweight-lab/e2e/fleet/tickets/RUNBOOK.md`
- `featherweight-lab/e2e/fleet/tickets/FINDINGS.md`
- `featherweight-kernel/README.md`
- `featherweight-kernel/docs/ARCHITECTURE.md` (sections 5.6, 6.6, 7.12, 9.3, 11, and 21)
- `featherweight-kernel/cli/doctor_ax.go`
- `featherweight-kernel/cli/doctor.go`
- `featherweight-kernel/cli/serve.go`
- `featherweight-kernel/fw/lifecycle.go`
- `featherweight-kernel/surface/view/status.go`
- `featherweight-kernel/examples/observability/alerts.yml`
- `featherweight-kernel/cli/ax.go`
- `featherweight-kernel/cli/verbs.go`
- `featherweight-kernel/ax/config.go`
- `featherweight-kernel/model/openai/openai.go`
- `featherweight-kernel/examples/fw.yaml`
- `featherweight-kernel/surface/native/native.go`
- `featherweight-workbench/docs/ARCHITECTURE.md` (sections 3.1, 4.5, 4.12, 4.13, 11, and 13.9)
- `featherweight-workbench/fleet/suspend.go`
- `featherweight-workbench/fleet/metrics.go`
- `featherweight-workbench/dashboard/fleet.go`
