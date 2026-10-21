# The homelab cluster

The homelab cluster is the one machine that runs the k3s loop of the tests, the fleet of the lab, and the ticket soak. This page says what the cluster is and what runs on the workstation next to it. It also says how the installer builds the cluster and which rules keep it safe. The tests are on [Testing](testing.md). The procedures for a Task that misbehaves are on [Debugging a Task](debugging.md). The limits of the platform are on [Platform gaps and patches](platform-gaps.md).

## What the cluster is

The cluster is a single-node k3s on the node `192.168.50.60`. No prebuilt images of Agent Substrate or Google AX exist. The installer therefore builds both from source on the workstation and installs them on the node. Substrate, the sandbox platform, runs every AX Task as an actor, a program in a gVisor sandbox. The installer pins Substrate to the commit `f6a1dc7`, the commit that AX pins, after v0.4.0 and before v0.5.0. It pins AX to the commit `8888435` and applies the lab patch `e2e/k3s/ax-task-egress.patch` to the AX source before the build. The cluster has run that pair since 2026-10-19.

| Namespace | What it holds | Which script creates it |
|---|---|---|
| `ate-system` | Agent Substrate: the atenet router, the egress gateway, atelet, the credential provider, and the Service `kind-registry` | `install.sh substrate` |
| `ax-system` | The AX control plane, `ax-server` and `ax-redis` | `install.sh ax` |
| `ax-workers` | The Substrate WorkerPool `ax` with one worker. Its pod runs every Task, so its log holds the guest output of every Task. | `install.sh pool` |
| `fw-e2e` | The model Service of the k3s loop and the Secret `model` with the key | `install.sh model` |
| `fw-fleet` | The fleet: NATS, the front `fw-front`, the model proxies `ax-model` and `ax-anthropic`, the issuer, Gitea, and the Secrets of the fleet | `fleet/deploy.sh` and the scripts after it |
| `registry` | The image registry on the node | `install.sh registry` |
| `otel-system` | The collector, the Prometheus, and the Jaeger of the Substrate stack | The Substrate installer |
| `agentgateway-system` | The Gateways of agentgateway on the ports 8090, 8091, and 8092 | The fleet manifests place the Gateways there. No lab script installs agentgateway itself. |

The atenet router is the only door into an actor. A request reaches a Task through the Service `atenet-router` in `ate-system` with the header `ate-target-actor: <atespace>/<task>`, and the router wakes a Task that sleeps. The egress gateway denies every connection that the egress policy of the actor does not allow. The WorkerPool runs one active actor at a time per replica, and the pool has one replica. Substrate, AX, and one worker request about 4 GB of memory together.

## What runs on the workstation

The workstation holds the model server, the tunnels, the tools, and the kubeconfig. Nothing of these is in the cluster.

| Part | What it is |
|---|---|
| The model server | An OpenAI-compatible server on localhost. The fleet runs Strata on `127.0.0.1:8080`, which `fw-fleet-tunnel.service` names. The k3s loop reads its address from `E2E_MODEL_ADDR`, with the default `127.0.0.1:5000`. Strata serves one request at a time. |
| The systemd user unit `fw-e2e-tunnel` | One SSH connection to the node that `install.sh tunnel` writes to `~/.config/systemd/user/fw-e2e-tunnel.service`. It forwards `localhost:5001` on the workstation to the registry on the node, and it binds `10.42.0.1:15000` on the node to the model server. `10.42.0.1` is the cni0 bridge of k3s, so pods reach the tunnel and the LAN does not. |
| The systemd user unit `fw-fleet-tunnel` | A second SSH connection for the fleet, from `e2e/fleet/fw-fleet-tunnel.service`. It binds `10.42.0.1:18080` on the node to Strata on `127.0.0.1:8080`. The Service `model` in `fw-fleet` gives it a cluster name. Its comment gives the install steps. |
| The registry push address | `localhost:5001`, the variable `E2E_REGISTRY` and `FLEET_REGISTRY`. The node maps that name to the registry pod through `/etc/rancher/k3s/registries.yaml`. Substrate pulls an actor image by digest only, so every script records the digest of what it pushed. |
| The tools | `install.sh tools` builds `ax` and `kubectl-ate` into `~/.local/bin`, the variable `E2E_BIN`, and installs a missing `kubectl`. The sources go to `~/.cache/fw-e2e/src`, the variable `E2E_SRC`. |
| The kubeconfig | `~/.kube/k3s.yaml` with the context `k3s`. `install.sh kubeconfig` copies it from the node once. |

The `ax` command needs `KUBECONFIG=~/.kube/k3s.yaml` in its environment. Without it, `ax` dials `localhost:8080`, which is Strata on this workstation, and fails. The fleet scripts export the variable themselves. Verified on the homelab.

## The install steps

The installer needs a single-node k3s and a user with sudo on the node, reachable over SSH with a key. On the workstation it needs Docker with the buildx plugin, Go 1.27, and the model server. Put `E2E_NODE_SSH`, `E2E_NODE_SSH_KEY`, and `E2E_MODEL_ADDR` in `e2e/local.env`. Then run `make e2e-k3s-install`, which runs `e2e/k3s/install.sh` with every step in order. Each step is safe to run again, and `e2e/k3s/install.sh <step> [<step> ...]` runs the named steps only.

| Step | What it does |
|---|---|
| `node` | Over SSH with sudo: turns on the k3s feature gates `ClusterTrustBundle`, `ClusterTrustBundleProjection`, and `PodCertificateRequest`, and the API `certificates.k8s.io/v1beta1`. Writes the registry mirror for `localhost:5001`, turns on proxy ARP, and sets `GatewayPorts clientspecified` in sshd for the SSH user. If the gates or the mirror changed, it restarts k3s and then waits up to two minutes for the API server. |
| `kubeconfig` | If `$KUBECONFIG` does not exist, copies `/etc/rancher/k3s/k3s.yaml` of the node to it. Rewrites the server address and renames the context to `k3s`. |
| `registry` | Applies `e2e/k3s/registry.yaml`: a registry pod on the host network at `10.42.0.1:5000`, with its data under `/var/lib/fw-e2e-registry` on the node. |
| `tunnel` | Writes and starts the unit `fw-e2e-tunnel`, then waits until `http://localhost:5001/v2/` answers. |
| `tools` | Clones Substrate and AX into `E2E_SRC`, applies every `e2e/k3s/ax-*.patch` to the AX clone in name order, and builds `ax` and `kubectl-ate`. Installs a missing `kubectl`. If `docker buildx` is missing, stops, because Substrate builds its Envoy image with it. |
| `substrate` | Runs `hack/install-ate-kind.sh --deploy-ate-system` of the Substrate checkout with the Kubernetes Secrets credential provider. Applies `e2e/k3s/kind-registry.yaml`, the Service that maps the name `kind-registry` to the node registry. The first build takes several minutes. |
| `ax` | Resolves `deploy/ax-server.yaml` of AX with `ko`, rewrites the snapshot bucket to `gs://ate-snapshots/ax/`, and applies it with `deploy/redis.yaml`. |
| `pool` | Applies `e2e/k3s/ax-pool.yaml`, the WorkerPool `ax` in `ax-workers`. The pool selects the node by the label `ate.dev/substrate-version`, whose value the installer reads from the Substrate checkout with `git describe`. |
| `model` | Applies `e2e/k3s/model.yaml`, the Service `model` in `fw-e2e` that names the tunnel. Creates the Secret `fw-e2e/model` from `OPENAI_API_KEY` or from the output of `E2E_API_KEY_CMD`. Writes the policy of the credential provider so that the atespace `default` reads the Secrets in `fw-e2e` and `fw-fleet`. |

If a patch does not fit the AX commit, the patch loop of the `tools` step stops, so a stale patch never hides. The e2e README says that the `tools` step installs a missing `docker buildx`. The script does not install it, it stops with a message, and the script wins.

## The variables of local.env

`e2e/local.env` holds the configuration of this machine. Git ignores it, and it holds secrets, so no script prints it and this site never shows a line of it. Every loop script reads it with `source`, and a variable in the environment wins over the same variable in the file. The file holds these names today:

- `E2E_BASE_URL`
- `E2E_CLUSTER_BASE_URL`
- `E2E_KUBE_CONTEXT`
- `E2E_MODEL`
- `E2E_MODEL_ADDR`
- `E2E_NODE_SSH`
- `E2E_NODE_SSH_KEY`
- `KUBECONFIG`

If a line sets them, the scripts read more names from the file: `E2E_API_KEY_CMD` and `E2E_ANTHROPIC_API_KEY_CMD`, commands that print a key, and `FLEET_MODEL`, `FLEET_EFFORT`, and `FLEET_POOL_GENERATIONS` for the fleet. The tables on [Testing](testing.md) give the meaning and the default of each variable of the loops.

## The fleet deployment scripts

The fleet of the lab is fw-workbench as the front in `fw-fleet` and the kernel as workers in AX Tasks ([A fleet](../deployment/fleet.md)). The scripts under `e2e/fleet` deploy it. Run them in this order the first time: `redeploy.sh`, `deploy.sh`, `deploy-oidc.sh`, `ax/run.sh`.

| Script | What it does |
|---|---|
| `redeploy.sh [git-ref]` | Builds the images `static` and `toolbox` of the workbench and the lean kernel worker. It builds from clean git worktrees of `main`, or of the ref, with the kernel ref `E2E_KERNEL_REF`. The worker carries the build tags `lean,nats,openai,oidc,metrics,env,anthropic`. Pushes the three images to `localhost:5001` and writes their digests to `e2e/results/.fleet-images`. Rolls the Deployments onto them and updates the ConfigMap `fw-fleet/ready`. |
| `deploy.sh` | Applies `base.yaml` and creates the missing Secrets among `fw-api-token`, `fw-front-keys`, `fw-lab-hook`, `tickets-hook`, and `gitea-agent`. Applies the model proxies and renders the configuration of the front with `front-config.sh`. Applies `fw.yaml` and `gateway.yaml`, runs `observe.sh`, and writes `fw-fleet/ready`. It writes a token file under `e2e/results/` only at the creation of its Secret. The front reads its configuration once, at its start. The script therefore puts a hash of the rendered configuration on the pod template, which restarts the front. |
| `deploy-oidc.sh` | Builds `oauthlab`, the issuer and the ticket system in one image, and applies `oidc.yaml`: the OIDC front on port 8091 and the issuer, signed with `e2e/results/.fleet-issuer.pem`. Records the audience in `fw-fleet/ready`. Run `ax/run.sh` again after it, so the Tasks accept its tokens. |
| `ax/run.sh` | Reads `fw-fleet/ready` and renders the Workspace, the Task, and the egress policy of each member. Applies them and waits until each member answers `/readyz` through the router. The members are `fw-fleet-alpha`, `fw-fleet-reviewer`, and `FLEET_MIGRATORS` migrators, three by default. `FLEET_ONLY` runs one Task. The e2e README names three workers, and the script runs five by default, so the script wins. A crashed actor gets up to three resumes, because a Task boots before its egress policy lands. |
| `ax/egress-apply.sh` | Creates or updates the egress policy of one actor from a JSON file. `run.sh` calls it to add the GitHub credential injection, which `spec.egress` does not carry. |
| `model.sh` | Sourced by the other scripts. It sets `FLEET_MODEL`, `FLEET_EFFORT`, and `FLEET_PROVIDER` from the environment or from `e2e/local.env`. Without `FLEET_MODEL`, it selects `openai/<modelName of fw-fleet/ready>`, the local Strata model, which costs nothing. Without the Secret `fw-fleet/anthropic`, an `anthropic` model stops the script. |
| `anthropic-key.sh` | Puts the key of the Claude API into the Secret `fw-fleet/anthropic`, which the proxy `ax-anthropic` holds, and checks it with one free request. It never prints the key. `-delete` removes the Secret. |
| `front-config.sh` | Renders `e2e/results/front-config.yaml` from `front-config.yaml` with the worker image, the model, the ticket source, and a generation per pool from `pool-generations.py`. |
| `observe.sh` | Edits the keep rule of the Prometheus in `otel-system` once, so it keeps the `fw_*` series and `target_info`. |
| `restore-results.sh` | Writes the token files of `e2e/results` again from the Secrets of `fw-fleet` after the directory was lost. |
| `migrator/build.sh` | Builds the migrator image on the worker image and records it as `imageMigrator` in `fw-fleet/ready`. |
| `tickets/setup.sh` | Prepares the helpdesk of the ticket soak: Gitea, its users, the repository `lab/helpdesk`, the webhook, and gitea-mcp. |

A paid model is never a default. `model.sh` selects the local model unless `FLEET_MODEL` names another one, and `anthropic-key.sh` must have put the key in the cluster first. To run on the Claude API, run `e2e/fleet/anthropic-key.sh`, then `FLEET_MODEL=anthropic/claude-haiku-5-5 e2e/fleet/deploy.sh` for the pools and the same variable on `e2e/fleet/ax/run.sh` for the named members. To return to the local model, run `deploy.sh` without the variable. If `e2e/local.env` sets `FLEET_MODEL`, remove that line first. The same rule holds for the kernel: an empty model is a refusal, never a built-in paid choice ([Configuration](../reference/configuration.md)).

## The shared node

The node `192.168.50.60` also runs another application of the owner, in the namespaces `jucs` and `cnpg-system`. Verified on the homelab. These rules follow:

- Never reinstall k3s. After a change of the feature gates, the `node` step restarts k3s once, and pods keep running through the restart. Nothing else touches the k3s install.
- Never touch the namespaces `jucs` and `cnpg-system`. No lab script names them.
- Rebuild Substrate and AX inside their own namespaces only: `ate-system`, `ax-system`, and `ax-workers`.
- If the `node` step changes the gates, plan for a short API outage.
- The SSH user of the tunnels is the user of that application. Its key stays on the workstation.

## A fresh install instead of an upgrade in place

An upgrade of Substrate in place from v0.4.0 to a newer version failed on 2026-10-18. The old SandboxConfig CRD has no `versions` field, and the admission policy of the new one requires it. After the upgrade, every actor crashed with the message `sandbox_assets has no assets for architecture amd64`, until the old installer ran again. Verified on the homelab. The cluster was rebuilt fresh on 2026-10-19 on Substrate `f6a1dc7` and AX `8888435`.

Move to a newer Substrate on a fresh install only. Substrate v0.5.0 is out, but AX does not build against it, so the lab follows the pin of AX. To start fresh:

1. Delete the old install with the installer of its own version: `hack/install-ate-kind.sh --delete-ate-system` in its checkout under `E2E_SRC`.
2. Delete the namespaces `ax-system` and `ax-workers`.
3. Run `make e2e-k3s-install` again.

If the new Substrate changes the API that AX calls, `install.sh ax` fails at the build, and the pin of AX decides. See [Platform gaps and patches](platform-gaps.md#the-substrate-pin) for the state of the pin.

## Sources

- `featherweight-lab/README.md`
- `featherweight-lab/Makefile`
- `featherweight-lab/CLAUDE.md`
- `featherweight-lab/e2e/README.md`
- `featherweight-lab/e2e/k3s/install.sh`
- `featherweight-lab/e2e/k3s/ax-pool.yaml`
- `featherweight-lab/e2e/k3s/egress.yaml`
- `featherweight-lab/e2e/k3s/kind-registry.yaml`
- `featherweight-lab/e2e/k3s/model.yaml`
- `featherweight-lab/e2e/k3s/registry.yaml`
- `featherweight-lab/e2e/k3s/task.yaml`
- `featherweight-lab/e2e/k3s/run.sh`
- `featherweight-lab/e2e/local.env` (variable names only)
- `featherweight-lab/e2e/fleet/deploy.sh`
- `featherweight-lab/e2e/fleet/deploy-oidc.sh`
- `featherweight-lab/e2e/fleet/redeploy.sh`
- `featherweight-lab/e2e/fleet/model.sh`
- `featherweight-lab/e2e/fleet/anthropic-key.sh`
- `featherweight-lab/e2e/fleet/front-config.sh`
- `featherweight-lab/e2e/fleet/observe.sh`
- `featherweight-lab/e2e/fleet/restore-results.sh`
- `featherweight-lab/e2e/fleet/fw-fleet-tunnel.service`
- `featherweight-lab/e2e/fleet/gateway.yaml`
- `featherweight-lab/e2e/fleet/base.yaml`
- `featherweight-lab/e2e/fleet/ax/run.sh`
- `featherweight-lab/e2e/fleet/ax/egress-apply.sh`
- `featherweight-lab/e2e/fleet/ax/task.yaml`
- `featherweight-lab/e2e/fleet/migrator/build.sh`
- `featherweight-lab/e2e/fleet/tickets/setup.sh`
- `featherweight-lab/e2e/fleet/tickets/gateway.yaml`
- `featherweight-lab/e2e/fleet/tickets/RUNBOOK.md`
