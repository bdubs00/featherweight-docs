# Platform gaps and patches

Google AX and Agent Substrate carry the Tasks of Featherweight, and both are young. This page lists what they do not do yet, as of 2026-10-20, and how the project works around each gap. A gap is either patched in the lab, worked around in the kernel or the workbench, or open. The cluster that runs the patches is on [The homelab cluster](homelab.md). The kernel documents the gaps of ax in [Kernel architecture, 11.11](../design/kernel-architecture.md#1111-gaps-in-ax-today). The review of 2026-10-20 lists what Substrate offers that AX does not expose. It is the file `docs/REVIEW_2026-10-20.md` in the kernel checkout, section 4, and it is not committed as of 2026-10-21.

## The egress patch

Substrate denies every connection of an actor that has no egress policy, and AX creates none. A Task therefore has no network at all: no model API, no clone at run time, no package. The only way was `kubectl ate create egress-policy` by hand after the actor exists, which google/ax issue #449 describes.

The lab carries a patch to AX. The branch `feat/task-egress-policy` of the fork `github.com/bdubs00/ax` holds one commit, `fc509c5` of 2026-10-18, on top of the AX commit `8d2ccf3`. The file `e2e/k3s/ax-task-egress.patch` is its diff, and `install.sh` applies it to the AX source before the build. The text of the pull request is in `e2e/k3s/ax-task-egress.pr.md`. The patch adds:

- `spec.egress` on the Task: rules with exactly one protocol each, `http`, `https`, or `tls`, with `hostnames` and optional `ports`. A rule without ports gets the default port of its protocol.
- The controller writes the rules to the egress policy of the actor right after it ensures the actor and before the first resume. AX creates every Task suspended, which gives exactly that window. Tasks do not change, so the policy is created once.
- The API server refuses a bad section at apply time. It requires one protocol per rule, at least one hostname in the pattern syntax of the gateway, and ports between 1 and 65535 without repeats.
- A policy that Substrate refuses fails the Task with the reason `EgressPolicyFailed`. A Task without `spec.egress` gets no policy and no network, as before.

A child Task of the kernel inherits the egress of its parent. The spawner copies `spec.egress` of this Task into the child, so the child reaches what its parent reaches and nothing more. It has a network from its first request ([Kernel architecture, 11.9](../design/kernel-architecture.md#119-child-runs-and-child-tasks)). `spec.egress` carries no credential injection, which issue #475 designs around secret references. The lab adds the GitHub injection to the policy of each named member afterwards with `e2e/fleet/ax/egress-apply.sh`. A pool renders `spec.egress` alone, so it holds its token in a proxy instead.

No pull request is open, because google/ax limits pull requests to collaborators. The way in is a comment on issue #449 that points at the branch, in `e2e/k3s/ax-task-egress.comment.md`, and the lab runs the patched AX meanwhile. Verified on the homelab. `install.sh` stops at a patch that does not fit the AX commit, so the patch goes away the day the change lands upstream.

## The Substrate pin

AX at commit `8888435` pins the Substrate commit `f6a1dc7`, after v0.4.0 and before v0.5.0, and builds against its API without a patch. Substrate v0.5.0 is out, but AX does not build against it yet, so the lab follows the pin of AX. The lab also learned not to upgrade Substrate in place: the attempt of 2026-10-18 crashed every actor until the old installer ran again, and the cluster was rebuilt fresh on 2026-10-19. The lesson and the steps are on [The homelab cluster](homelab.md#a-fresh-install-instead-of-an-upgrade-in-place). Substrate after v0.5.0 requires cpu and memory limits on every actor template, so the next bump needs the resources patch below first.

## Workload identity

The front and the workers share one static token today. Substrate v0.4.0 defines `MintActorJWT` on its API and an egress rule effect `actorJwt`. With that effect, the gateway puts a Substrate-issued JWT with `sub: actor/<atespace>/<name>` on each request of a worker. The gateway does not mint one yet, and the API server serves no discovery document for the issuer. The kernel roadmap holds the item as blocked on Substrate since 2026-10-18 ([Kernel roadmap, stage 5, item 2](../design/kernel-roadmap.md#stage-5-final-boundary-and-identity-cleanup)). Once Substrate mints the token, the front and the workers accept the issuer with the `oidc` driver. The egress rules then carry the `actorJwt` effect, and the static token goes.

## The pending patches

Three more patches wait for review under `e2e/k3s/pending/`. `install.sh` does not apply them, because its glob is `e2e/k3s/ax-*.patch`. Each one stacks on the egress patch, and each `.pr.md` file holds the text of its pull request. The order is resources first, then trust and tags in either order. To use one, move it to `e2e/k3s/` with a name that sorts after `ax-task-egress.patch`, for example `ax-task-f1-resources.patch`, and run `install.sh ax` again.

`ax-task-resources.patch` applies `spec.resources.limits` of a Task to its actor template, a backport of google/ax#405, which upstream merged after the commit that the lab pins. AX at the pin builds every actor template without resources, so `spec.resources` reaches nothing, and every sandbox keeps the defaults of the runtime. With the patch, `limits.cpu` sets the CPU quota and the vCPU count of the gVisor sentry. `limits.memory` sets the memory limit and the memory that the sandbox reports. `ax apply` then refuses `spec.resources.requests`, because Substrate sizes a sandbox by its limits alone. Before the deploy, the kernel `ax/spawn.go` and the workbench `pools/render.go` must stop passing a `requests` block. Otherwise a child Task and a pool Task fail to start. A Task limit above the 2 CPU and 2Gi of the lab worker cannot resume there.

`ax-task-trust.patch` mounts the trust bundle of the egress gateway in every Task at `/run/ate/egress-trust-bundle/trust-bundle.pem`. The gateway terminates the TLS of an `https` rule with a certificate that its own CA signs. A client in the Task sees that certificate and fails the handshake. Substrate hands the CA to an actor only through a `systemInfo` volume in the template, which AX mounts nowhere. With the patch, every template gets the volume. The docs list the variable of each client, such as `SSL_CERT_FILE` and `GIT_SSL_CAINFO`, for a Task to set in `spec.env`. Until then, the lab uses `http` and `tls` passthrough rules only, and the doctor line `ax trust bundle` reports the absent file as ok.

`ax-task-tags.patch` adds `ax tag task <name> <tag>`, which tags the snapshot of a suspended Task through `CreateTag` of Substrate. It also adds `spec.from.tag`, which starts a new Task from such a tag. The new Task then boots with `/workspace` as the tagged Task left it. A seed Task therefore prepares an environment once, and every Task of a pool starts from it in seconds. Substrate seeds an actor only from a tag taken under its own template. The controller therefore creates the actor under the template of the tag and moves it to the template of the Task before the first resume. The tagged Task must exist as long as Tasks start from its tag, and both Tasks must come from the same AX version. None of the three patches is verified on a cluster yet.

## Tasks created suspended

AX creates every Task suspended, and a Task that nobody resumes never runs. The kernel spawner therefore resumes a child Task right after it creates it and waits until it runs. Then it starts the child run through the router ([Kernel architecture, 11.9](../design/kernel-architecture.md#119-child-runs-and-child-tasks)). The pool reconciler of the front resumes each Task that it creates the same way, and `fw ax up` resumes the Task that it applies. A wake through the router does not move the phase of the Task to Running on the AX API. The front therefore calls `ResumeTask` after every answer of a Task whose phase is not Running ([Workbench architecture, 4.12](../design/workbench-architecture.md#412-the-suspend-controller)). The spawner of the kernel needs `FW_API_TOKEN` in the Task, also with `auth.mode: none`. It starts the child run with the static token of the fleet. Verified on the homelab.

## The ten second gateway cut

agentgateway cuts an MCP call after ten seconds, and a child Task takes longer to boot. A branch with `fork` and `spawn` is therefore placed at once and started in the background. The kernel records the branch at its placement and again at its start. The front answers for it from the source Task as a queued run until the events of the child arrive ([Kernel architecture, 4.7](../design/kernel-architecture.md#47-branches)). The client follows it with `run_status`. The same bound makes `run` with a `member` through MCP return without a wait. Verified on the homelab.

## No GPU in actors

No GPU reaches a Task. Substrate merged CDI-based GPU passthrough on 2026-08-07 and then removed the injection while it designs a per-container device API. gVisor cannot snapshot a live CUDA context, so a Task with an open CUDA context cannot suspend. PyTorch inside a Task is CPU-only today. GPU work belongs to run-to-completion Tasks or to a service outside the sandbox, which is how Strata serves the lab. `e2e/fleet/ax/environment-torch` installs torch for the CPU for that reason.

## VOLUMES fidelity and environments

AX builds every actor template with `VOLUMES` fidelity: a suspend saves `/workspace` and nothing else. The root filesystem is writable in gVisor, but its writes go to an overlay upper layer that a suspend drops. An `apt-get install` or a `pip install` into the image vanishes at the next wake. Scenario 1 saw installed packages carry over between runs only because the Task stayed awake between them. `MEMORY` fidelity keeps the upper layer, at a snapshot cost that grows with the install, and AX does not expose it.

Packages therefore go on the durable volume. The kernel materializes an environment under `/workspace` from the block `environment` of a profile, with `uv` and `pixi`. It does so after `/readyz` and in the background ([Kernel architecture, 18](../design/kernel-architecture.md#18-environments)). A run that needs the environment waits for it. Each registry needs an egress rule, `tls` passthrough for `pypi.org`, `files.pythonhosted.org`, and `conda.anaconda.org`, and `http` for `deb.debian.org`. The golden boot of the template has no network, so the kernel reports ready without it and installs later, with retry. `e2e/fleet/ax/measure-env.sh` takes the cost of a heavy environment on the homelab: the install time, the size of the volume, and the suspend and resume time.

## No pseudo-terminal in the guest process service

The guest services of Substrate carry a process service with a stdin pipe and no pseudo-terminal, which `ax ssh` uses. A person who wants the terminal UI of a hosted agent, such as Claude Code or opencode in a Task, needs a pseudo-terminal. The review proposes a kernel route that runs one command in a pseudo-terminal as the tool user, over a WebSocket. The route sits behind the authentication of the kernel, with the front as its proxy. `spec.debug` is not the answer, because the guest services on port 80 take no authentication inside the cluster. Nothing of this exists yet.

## The capabilities of root in the sandbox

Root inside the gVisor sandbox of Substrate holds only `CAP_KILL`, `CAP_NET_BIND_SERVICE`, and `CAP_AUDIT_WRITE`. A chown fails there, even in `/tmp`, and so does a setuid. Verified on the homelab. The tool user of the kernel, `tools.user`, needs `CAP_CHOWN`, `CAP_DAC_OVERRIDE`, `CAP_KILL`, `CAP_SETGID`, and `CAP_SETUID`. Under ax the kernel therefore falls back to the user of `fw` with a warning ([Kernel architecture, 7.12](../design/kernel-architecture.md#712-tool-processes)). A shell on such a Task reads `FW_HOME`, so a Task that reads untrusted input gets no shell. The workaround in the lab is `FW_TOOLS_USER=none` on the migrator, whose `check-role` needs root anyway. Substrate knows container capabilities in its API, and AX passes none. A patch of the shape of the egress patch can pass them.

## Substrate features that AX does not expose

| Feature of Substrate | What it gives | What AX does |
|---|---|---|
| `Tag` and `source_tag` | The snapshot of a suspended actor under a name, and a new actor that boots from it | Nothing. The tags patch above adds `ax tag task` and `spec.from.tag`. |
| `ImageVolumeSource` | An OCI image mounted as a read-only volume, for a heavy shared layer such as PyTorch or a toolchain | Nothing. The review proposes `spec.volumes[].image`. |
| `ExternalVolumeTemplate` | A CSI volume, RWX where the driver allows it, for a shared package cache | Nothing. The review proposes `spec.volumes[].external`. |
| `SystemInfo` volume | The trust bundle of the egress gateway | Nothing. The trust patch above mounts it. |
| Resources on the template | CPU and memory limits that size the sandbox | Nothing at the pin. The resources patch above passes them. |
| `MEMORY` fidelity | A snapshot that keeps the memory and the upper layer of the root filesystem | Always `VOLUMES`. |
| Container capabilities | Capabilities for root in the sandbox | None. |
| `WatchTask` | A stream of the phase and the conditions of a Task | The front reads `ListTasks` at every interval instead. |
| `MintActorJWT` and `actorJwt` | A workload identity for each actor | Defined, not minted. See above. |

Each item is one small patch of the shape of the egress patch. The kernel and the workbench follow through a replace directive until it merges. The review of 2026-10-20 ranks them.

## Sources

- `featherweight-lab/e2e/k3s/install.sh`
- `featherweight-lab/e2e/k3s/ax-task-egress.patch`
- `featherweight-lab/e2e/k3s/ax-task-egress.pr.md`
- `featherweight-lab/e2e/k3s/ax-task-egress.comment.md`
- `featherweight-lab/e2e/k3s/pending/README.md`
- `featherweight-lab/e2e/k3s/pending/ax-task-resources.pr.md`
- `featherweight-lab/e2e/k3s/pending/ax-task-trust.pr.md`
- `featherweight-lab/e2e/k3s/pending/ax-task-tags.pr.md`
- `featherweight-lab/e2e/README.md`
- `featherweight-lab/e2e/fleet/ax/run.sh`
- `featherweight-lab/e2e/fleet/ax/task.yaml`
- `featherweight-lab/e2e/fleet/ax/egress-apply.sh`
- `featherweight-lab/e2e/fleet/ax/measure-env.sh`
- `featherweight-lab/e2e/fleet/fork.py`
- `featherweight-lab/e2e/fleet/tickets/README.md`
- `featherweight-kernel/docs/ARCHITECTURE.md` (sections 4.7, 7.12, 11.9, 11.11, 18, and 21.4)
- `featherweight-kernel/docs/ROADMAP.md` (stage 5)
- `featherweight-kernel/docs/REVIEW_2026-10-20.md` (sections 4 and 5.1)
- `featherweight-kernel/docs/KERNEL_MAP.md` (section 3)
- `featherweight-kernel/ax/spawn.go`
- `featherweight-kernel/fw/fork.go`
- `featherweight-kernel/cli/doctor_ax.go`
- `featherweight-workbench/docs/ARCHITECTURE.md` (sections 3.1, 4.5, and 4.12)
- `featherweight-workbench/fleet/suspend.go`
- `featherweight-workbench/pools/reconcile.go`
- `ax` (the fork, `git log feat/task-egress-policy`, read-only)
