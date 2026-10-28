# Platform gaps and patches

Google AX and Agent Substrate carry the sandboxes of Featherweight, and both are young. This page lists what they do not do yet, as of 2026-10-27, and how the project gets around each gap: with a patch to AX, with code in the kernel or the workbench, or not yet.

## The patches the project runs

The project pins AX at commit `8888435` and applies its patches on top, in name order, before it builds AX. A patch that does not fit stops the build. The patches live in the private lab repository, and their source is the fork `github.com/bdubs00/ax`.

| Patch | What it adds | State |
|---|---|---|
| Egress | `spec.egress.hosts` on a Task, and the egress policy of the actor from it | Applied |
| Capabilities | The server flags `--task-capabilities-add` and `--task-capabilities-drop` | Applied. The lab adds `CHOWN,DAC_OVERRIDE,SETGID,SETUID` since 2026-10-25. |
| Secrets | `secretRef` on a variable of a Task, which the egress gateway injects | Waits for review |
| Resources | `spec.resources.limits` of a Task on its actor template | Waits for review |
| Trust bundle | The CA of the egress gateway in every Task | Waits for review |
| Tags | `ax tag task` and `spec.from.tag`, a new Task from the snapshot of another | Waits for review |

On 2026-10-25, none of the four waiting patches applied after the current egress patch without a rebase. The kernel and the workbench need nothing new for the capabilities patch, because it is a flag of the AX server. The secrets patch needs a new version of the AX module in both, and the resources patch needs both to stop sending `spec.resources.requests`.

## The egress patch

Substrate denies every connection of an actor that has no egress policy, and the AX at the pin creates none. Without the patch, a Task has no network: no model API, no clone, and no package. The upstream issue is google/ax#449.

The patch adds `spec.egress.hosts` to a Task. Each entry is `[http://|https://]host[:port]`:

- A name alone is TLS on port 443, which the gateway passes through without decryption.
- `http://` is cleartext HTTP on port 80.
- `https://` is HTTPS on port 443, which the gateway intercepts. A client in the Task then needs the CA of the gateway, which only the trust bundle patch mounts. Until then, write names alone and `http://` hosts.
- A port after the name replaces the default, and a name can start with `*.`.

The controller writes the policy right after it creates the actor and before the first resume. AX creates every Task suspended, which gives that window. The API server refuses a bad entry at apply time. A policy that Substrate refuses fails the Task with the reason `EgressPolicyFailed`. A child Task of the kernel inherits the egress of its parent, so it reaches what its parent reaches and nothing more.

The shape follows the draft pull request google/ax#499, with one extension: the schemes and the ports, because a Task inside a cluster reaches its services over cleartext HTTP on other ports. `spec.egress` carries no credential. A model key stays in a proxy Service, and other secrets reach a worker through its variables.

## Tool user capabilities

Root inside the gVisor sandbox of Substrate holds only `CAP_KILL`, `CAP_NET_BIND_SERVICE`, and `CAP_AUDIT_WRITE`. To run its tools as the separate user `nonroot`, `fw` needs `CAP_CHOWN`, `CAP_DAC_OVERRIDE`, `CAP_KILL`, `CAP_SETGID`, and `CAP_SETUID`. Without them, the tools run as the user of `fw`, and a shell can read the state of `fw` in `/workspace/.fw`. The kernel logs a warning, as [Debugging a Task](debugging.md#the-tool-user) shows.

Substrate can give a container more capabilities, and the capabilities patch lets the AX server pass them to every new Task. Two issues of Substrate made the first test fail: the root directory of an actor has the mode `0700` (agent-substrate/substrate#2035), and a file of an image layer shows the owner root (#2036). The kernel works around both. At each boot under AX, it opens `/` for the tool user. It gives the tool user the home `tools.userHome`, `/workspace/.home` by default under AX.

Use a worker image with kernel `3f04111` or later before you turn the flag on. With the capabilities, an older `fw` stops at its start. A Task keeps the template that it has. An old Task therefore gets the capabilities only as a new Task, such as at the next roll of its pool.

## The Substrate pin

AX at `8888435` pins the Substrate commit `f6a1dc7`, after v0.4.0 and before v0.5.0, and builds against it without a patch. The project follows the pin of AX. Substrate after v0.5.0 requires CPU and memory limits on every actor template, so a later bump needs the resources patch first.

!!! warning
    Do not upgrade Substrate in place. An upgrade from v0.4.0 failed on 2026-10-18: the old SandboxConfig CRD has no `versions` field, and the admission policy of the new one requires it. Move to a newer Substrate on a fresh install only.

## Gaps that the code works around

| Gap | What the project does |
|---|---|
| AX creates every Task suspended. | The kernel spawner, the pools of the front (the workbench in front of the workers), and `fw ax up` resume each Task that they create. |
| A wake through the router does not move the phase on the AX API. | The front calls `ResumeTask` after each answer of a Task whose phase is not Running. |
| AX has no status RPC for a runner. | `fw` serves `GET /v1/status`, which the front reads before a suspend. |
| A suspend sends `SIGKILL` after it saves `/workspace`, with no `SIGTERM` first. | `fw` writes no event at a suspend. A resume rebuilds the run from the ledger. |
| A suspend keeps only `/workspace`. AX builds every template with the fidelity `VOLUMES`. | Packages go on the durable volume, through the block `environment` and the packages of a pool. See [Environments and agent programs](../concepts/environments.md). |
| The AX API has no authentication. | Only the front and a Task that starts child Tasks get it in their egress. A child that cannot start children loses it. |
| A Task has no owner, no label, and no time to live. | The parent removes its child Tasks after `ax.childRetention`, 24 hours by default. The front removes orphans after `workbench.fleet.orphansAfter`. |
| No workload identity. Substrate defines `MintActorJWT` and the egress effect `actorJwt`, but the gateway mints no token yet. | Every process of a fleet shares one static token. The kernel roadmap holds the change as blocked on Substrate. |
| No GPU reaches a Task. | GPU work belongs to a service outside the sandbox, such as a model server. |

The kernel lists the gaps of AX in [section 11.11 of the kernel architecture](../design/kernel-architecture.md#1111-gaps-in-ax-today).

## Where to go next

<div class="paths" markdown>

- [Debugging a Task <span>Procedures for a Task that misbehaves</span>](debugging.md)
- [The four layers <span>What AX, Substrate, the kernel, and the workbench each do</span>](../concepts/layers.md)

</div>

## Sources

- `featherweight-kernel/docs/ARCHITECTURE.md`, sections 7.12, 11, 18.1, and 18.11
- `featherweight-kernel/docs/ROADMAP.md`, stage 5
- `featherweight-kernel/ax/config.go`
- `featherweight-kernel/ax/manifest.go`
- `featherweight-kernel/ax/spawn.go`
- `featherweight-workbench/docs/ARCHITECTURE.md`, sections 4.12 and 14.10
- `featherweight-workbench/fleet/suspend.go`
- `featherweight-lab/e2e/k3s/install.sh`
- `featherweight-lab/e2e/k3s/CAPABILITIES.md`
- `featherweight-lab/e2e/k3s/ax-task-egress.comment.md`
- `featherweight-lab/e2e/k3s/pending/README.md`
- `featherweight-lab/e2e/k3s/pending/ax-task-resources.pr.md`
- `featherweight-lab/e2e/k3s/SECRETS.md`
- `ax`, the fork: `git log packages/ax` and `git log feat/task-egress-policy`
