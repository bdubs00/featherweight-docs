# One Task on AX

This page tells how to run one kernel as one AX Task without a front. You write a Workspace and a Task, apply them with `ax`, resume the Task, and send it work through the atenet router. The page also covers the `fw ax` verbs, which do the same in one command, and the tools that look inside a Task.

You need a cluster with Agent Substrate and AX, the `ax` command, `kubectl`, and an image of `fw` by digest in a registry that the cluster reaches. See [Build and images](images.md) for the image and [The homelab cluster](../operations/homelab.md) for the cluster of the lab.

## What ax gives a Task

ax starts `/usr/local/bin/ax-task-runner` as PID 1 in the container of a Task. The image links that name to `fw`, so `fw` is the runner and serves. ax passes the Task as YAML in `AX_TASK_YAML` and every bound Workspace in `AX_WORKSPACES_YAML`, sets each `spec.env` entry in the environment, and mounts `/workspace`, a durable volume that survives a suspend. It probes `GET /readyz` and `GET /healthz` on port 80. See [the kernel architecture, section 11](../design/kernel-architecture.md#11-running-inside-googleax) for the whole contract.

Three facts of the platform shape every step below:

- ax creates every Task suspended. A resume starts it.
- The atenet router, `atenet-router.ate-system.svc.cluster.local`, is the only door into a Task. A request through it wakes a sleeping Task.
- Substrate denies every outbound connection of an actor that has no egress policy. The lab runs a patched AX that creates the policy from `spec.egress` before the first run. A stock AX needs the policy from `kubectl-ate`. See [Platform gaps and patches](../operations/platform-gaps.md).

## The Workspace manifest

A Workspace is the durable content of a Task. `spec.files` writes inline files under the workspace path. `fw` reads its configuration from `/workspace/.fw/fw.yaml`, because `FW_HOME` is `/workspace/.fw` under ax, and it reads profile files from `.fw/agents/*.yaml`. A Workspace can also clone `spec.git` repositories, create `spec.skills.path`, and name `spec.mcp.servers`, which join `tools.mcp` of the configuration. `fw` skips `spec.mcp.registries` and `spec.skills.registries` with a warning.

This Workspace comes from `e2e/fleet/ax/hello.yaml` of the lab. It names a local model behind the proxy `ax-model` and gives the agent a child Task for each `spawn_task`:

```yaml
apiVersion: ax.io/v1alpha1
kind: Workspace
metadata:
  name: fw-hello-ws
  atespace: default
spec:
  files:
    - path: .fw/fw.yaml
      content: |
        auth:
          mode: token           # the bearer token in FW_API_TOKEN
        model: openai/<model>
        effort: low
        providers:
          openai:
            baseUrl: http://ax-model.fw-fleet.svc.cluster.local:8080/v1
            apiKeyEnv: OPENAI_API_KEY
        tools:
          builtin: [bash, files, clock, spawn_task, await_task]
          files:
            root: /workspace
        spawn:
          driver: ax
          maxChildren: 4
        budget:
          maxTurns: 12
          deadline: 15m
```

## The Task manifest

The Task names the image, the environment, the Workspaces, and the egress. Leave `spec.command` empty, so `fw` serves and waits for work.

```yaml
apiVersion: ax.io/v1alpha1
kind: Task
metadata:
  name: fw-hello
  atespace: default
spec:
  image: "<registry>/featherweight-kernel@sha256:<digest>"
  env:
    - name: OPENAI_API_KEY
      value: strata-needs-no-key      # the local model takes no key
    - name: FW_API_TOKEN
      value: "<token>"                # the bearer token of the native API
  workspaces:
    - name: fw-hello-ws
      path: /workspace
  egress:
    rules:
      - http: {hostnames: ["ax-model.fw-fleet.svc.cluster.local"], ports: [8080]}
      - http: {hostnames: ["ax-server.ax-system.svc.cluster.local"], ports: [8080]}
      - http: {hostnames: ["atenet-router.ate-system.svc.cluster.local"], ports: [80]}
  debug: false
```

| Field | What it does |
|---|---|
| `spec.image` | The image by digest. Substrate refuses an image without one. |
| `spec.env` | Variables of the process: `FW_API_TOKEN` when `auth.mode` holds `token`, the key variable of each model provider, and the OTLP endpoints. A shell gets no variable that holds a secret. |
| `spec.workspaces` | Each binding has `name` and `path`. Bind the Workspace with the configuration at `/workspace`. A binding with `goal` runs the `bootstrap` profile once. |
| `spec.egress.rules` | One protocol per rule, `http`, `https`, or `tls`, with `hostnames` and `ports`. A rule without ports takes the default port of its protocol. A child Task inherits the rules. |
| `spec.debug` | `true` turns on the guest services of `ax ssh`. See the warning below. |
| `spec.resources` | `requests` and `limits`, each with `cpu` and `memory`. |

The three rules of the example allow what this agent dials: the model proxy, the ax API server for `spawn_task`, and the router, through which the parent reaches its children. Add one rule for each other endpoint of the configuration: the bus, the token broker, an OTLP collector, and each MCP server. An `https` rule needs the trust bundle of the egress gateway, which ax does not mount in a Task yet, so write `http` and `tls` rules. A rule names a DNS name, never an IP address, and Substrate accepts only local names in the `Host` header. That is why the lab reaches its model through a proxy Service in the cluster.

## Apply and resume

Render the manifest with the image and a token, apply it, and resume the Task:

```sh
export KUBECONFIG=~/.kube/k3s.yaml
export IMAGE="$(kubectl -n fw-fleet get cm ready -o jsonpath='{.data.imageWorker}')"
export TOKEN="$(head -c 24 /dev/urandom | base64 | tr -d '/+=')"
envsubst '$IMAGE $TOKEN' <e2e/fleet/ax/hello.yaml | ax -a default apply -f -
ax -a default resume task fw-hello
ax -a default describe task fw-hello
```

If the cluster runs a stock AX without the egress patch, the Task has no network after this step. Wait until the actor exists, then create the policy from a file in the format of `kubectl-ate`:

```sh
kubectl-ate get actors fw-hello -a default
kubectl-ate create egress-policy fw-hello -a default -f egress.yaml
```

`e2e/k3s/egress.yaml` of the lab is such a file. Its one rule allows HTTP to the model Service and tells the gateway to replace the `Authorization` header with a key from a Kubernetes Secret, so the Task holds a placeholder and never the key. The actor boots before the policy takes effect, and `fw` stops when it cannot reach its bus at the start. The scripts of the lab resume a Task that crashed at boot. `fw ax up` does the same.

## Reach the Task through the router

Every request to a Task goes through the router with the header `ate-target-actor: <atespace>/<task>`. Inside the cluster the address is `http://atenet-router.ate-system.svc.cluster.local`. From a laptop, forward its port first:

```sh
kubectl -n ate-system port-forward svc/atenet-router 8001:80 &
curl -s -H 'ate-target-actor: default/fw-hello' http://127.0.0.1:8001/readyz
curl -s -H 'ate-target-actor: default/fw-hello' -H "Authorization: Bearer $TOKEN" \
     -H 'Content-Type: application/json' \
     -d '{"input": "Say hello in five words.", "wait": true}' http://127.0.0.1:8001/v1/runs
curl -s -H 'ate-target-actor: default/fw-hello' -H "Authorization: Bearer $TOKEN" \
     http://127.0.0.1:8001/v1/status
```

`/readyz` and `/healthz` take no token. The native API takes the bearer token of `FW_API_TOKEN`. `GET /v1/status` answers a JSON body with `usage`, `pendingApproval`, `runs` (`active`, `inputRequired`, `total`), `idle`, and `idleSince`. After a storage failure, it adds `blocked: true` and `blockedReason`. See [the kernel architecture, section 11.8](../design/kernel-architecture.md#118-status-for-the-control-plane).

For a run that starts children, send `"wait": false` and read `GET /v1/runs/<id>` until it ends, because a long request through a port-forward can break. The routes are in [HTTP API](../reference/http-api.md).

## How fw boots in a Task

[The kernel map, section 3](../design/kernel-map.md#3-deployment-inside-ax) draws the boot order, and [the kernel architecture, section 11.3](../design/kernel-architecture.md#113-boot-sequence-under-ax) lists it. In short:

1. `fw` reads `AX_TASK_YAML` and `AX_WORKSPACES_YAML` and sets `FW_HOME` to `/workspace/.fw`.
2. It listens on port 80 and answers `/healthz`. It serves the metadata endpoints on `127.0.0.1:8099`, or on the port of `fw serve --metadata-port`. With `spec.debug`, it starts the guest services.
3. For each binding, in order, it writes `spec.files`, clones `spec.git`, and creates `spec.skills.path`. It writes a marker at `$FW_HOME/ax/initialized-<path>` and skips a binding whose marker exists.
4. If a binding has a `goal` and a model credential is present, it runs the `bootstrap` profile with that goal, under `AX_BOOTSTRAP_TIMEOUT`, ten minutes by default.
5. It answers `/readyz` with 200, resumes the unfinished runs of the ledger, and serves.

The merge of the Task into the configuration sets `listen` to `:80`, `maxRuns` to 1, and `tools.files.root` to the first binding. It turns `tools.files.perRun` on, and it sets `tools.memory.scope` to `principal` when the key is empty. It also sets `node` to `ax:<atespace>/<task>` and `FW_ATESPACE`. `tools.user` becomes `65532` only when root has the capabilities for it, which the gVisor sandbox of Substrate does not give.

The metadata endpoints serve the Task and the Workspaces as YAML to a process inside the sandbox, at the URL in `AX_METADATA_URL`:

```sh
curl http://127.0.0.1:8099/metadata/v1alpha1/ax/task
curl http://127.0.0.1:8099/metadata/v1alpha1/ax/workspaces
```

They carry no authentication, and only the loopback address reaches them. The value of each secret `spec.env` entry comes back as `***`, and the user part of each `spec.git` URL is removed.

A suspend pauses the sandbox, saves `/workspace`, and kills `fw` with `SIGKILL`. On resume, `fw` boots again, finds the markers, and resumes the runs from the ledger. See [the kernel architecture, section 11.5](../design/kernel-architecture.md#115-suspend-and-resume) and [The run lifecycle](../concepts/run-lifecycle.md).

## The fw ax verbs

`fw ax` takes one profile file and does the steps above in one command. The profile file is a fragment of `fw.yaml`, such as `policy`, `access`, and `agents`, in the shape of `e2e/fleet/ax/profiles/*.yaml` of the lab. `render` starts from the configuration of the caller, reduced to `model`, `models`, `effort`, `providers`, `bus`, `tokens`, and `tools.mcp`, lays the profile file on top, and derives one egress rule for each endpoint. See [the kernel architecture, section 21](../design/kernel-architecture.md#21-fw-ax-and-the-doctor-in-a-task).

| Verb | Does | Flags |
|---|---|---|
| `fw ax render` | Prints the Workspace and the Task, with `<secret: NAME>` in place of each secret | `-f`, `--name`, `--atespace`, `--image`, `--egress`, `--env`, `--workspace-file`, `--debug` |
| `fw ax up` | Applies the Workspace, creates and resumes the Task, and waits for `/readyz` through the router | the flags of `render`, `--server`, `--router`, `--timeout` |
| `fw ax status` | Prints the phase and the conditions of the Task, and `GET /v1/status` of its kernel while it runs | `--name`, `--atespace`, `--server`, `--router` |
| `fw ax events` | Prints the ledger of a run through the router, `--format jsonl` or `text` | `--name`, `--atespace`, `--router`, `--format` |
| `fw ax down` | Deletes the Task, waits until ax forgets it, and deletes the Workspace `<name>-ws` | `--name`, `--atespace`, `--server` |

The verbs dial the ax API at `--server`, else `AX_SERVER`, else `ax.server` (`FW_AX_SERVER`), and the router at `--router`, else `ax.router`. The defaults are the addresses inside the cluster, so a laptop forwards the ports first and passes them:

```sh
kubectl -n ax-system port-forward svc/ax-server 8080:8080 &
kubectl -n ate-system port-forward svc/atenet-router 8001:80 &
export FW_API_TOKEN="$TOKEN"
fw ax render -f agents/reviewer.yaml --name reviewer --image "$IMAGE" --egress deb.debian.org:80
fw ax up     -f agents/reviewer.yaml --name reviewer --image "$IMAGE" --server 127.0.0.1:8080 --router 127.0.0.1:8001
fw ax status --name reviewer --server 127.0.0.1:8080 --router 127.0.0.1:8001
fw ax events --name reviewer --router 127.0.0.1:8001 <run-id>
fw ax down   --name reviewer --server 127.0.0.1:8080
```

`--egress` takes `host:port` for an `http` rule, `tls:host:port`, `https:host:port`, or a URL. A child Task, an A2A peer, and an OIDC issuer need such a rule, because the configuration does not name them as endpoints. `--env NAME=VALUE` adds a `spec.env` entry, and a secret takes its value from `--env` or from the secrets of the caller. `up` refuses to start until every secret has a value. It also refuses a Task that exists, because a Task does not change: run `down` first. While it waits, `up` resumes a Task that ax reports as `Suspended` or `Failed`, up to three times. `status` does not read the kernel of a Task that sleeps, because the read wakes it.

## ax ssh and spec.debug

`ax ssh <task> -- <command>` runs a command in the sandbox and prints its output. It needs `spec.debug: true` on the Task, or `--debug` on `fw ax`. `fw` then serves the guest services of Substrate on port 80 over gRPC, from step 2 of the boot, so a boot that hangs on a clone or a goal is still open to inspection.

```sh
ax ssh reviewer -- ls -la /workspace
ax ssh reviewer -- fw events <run-id>
```

`fw:static` has no shell, so a bare `ax ssh <task>` opens a shell in `fw:toolbox` only. `fw` is on the `PATH` of both images, and `fw events` finds the ledger under `/workspace/.fw`.

!!! warning
    If you set `spec.debug` on a Task whose environment or workspace holds keys, any caller that reaches port 80 of the sandbox can run a process and read them. The guest services carry no authentication, the router reaches port 80 too, and a tool process inside the sandbox reaches it as well. The authentication, the access roles, and the policy of `fw` do not apply to these calls. `fw` logs a warning at boot when the services are on.

See [the kernel architecture, section 11.12](../design/kernel-architecture.md#1112-guest-services-and-ax-ssh) and [Debugging a Task](../operations/debugging.md).

## fw doctor inside a Task

Run the doctor through `ax ssh`:

```sh
ax ssh reviewer -- fw doctor
```

Inside a Task, `fw doctor` adds four lines, because the sandbox hides facts that the configuration does not show. Outside ax it prints one line, `ax: not under ax`.

| Line | What it checks |
|---|---|
| `ax reach` | Each endpoint of the configuration through the egress gateway, with the MCP servers of the Workspaces. A 403 with the body `egress denied` fails. No probe sends a credential. |
| `ax trust bundle` | The bundle at `/run/ate/egress-trust-bundle/trust-bundle.pem`, which `https` rules need. An absent file passes with a note, because nobody in the Task can change it. |
| `ax tools user` | The user that runs the tools, and whether it is a separate user from the one of `fw`. |
| `ax durable` | `FW_HOME` is under `/workspace` and writable, `/workspace` is a mount, and every binding is under it. |

Without `AX_TASK_YAML`, as under `ax ssh`, the lines read the manifests from the metadata endpoints at `AX_METADATA_URL`. See [the kernel architecture, section 21.4](../design/kernel-architecture.md#214-the-doctor-in-a-task).

## Sources

- `featherweight-kernel/README.md` (section "Inside google/ax")
- `featherweight-kernel/docs/ARCHITECTURE.md` (sections 11 and 21)
- `featherweight-kernel/cli/ax.go`
- `featherweight-kernel/cli/doctor_ax.go`
- `featherweight-kernel/cli/serve.go`
- `featherweight-kernel/cmd/fw/main.go`
- `featherweight-kernel/ax/config.go`
- `featherweight-kernel/surface/view/status.go`
- `featherweight-kernel/ax/manifest.go`
- `featherweight-kernel/surface/axmeta/axmeta.go`
- `featherweight-kernel/examples/ax/reviewer.yaml`
- `featherweight-kernel/examples/fw.yaml`
- `featherweight-lab/e2e/fleet/ax/hello.yaml`
- `featherweight-lab/e2e/fleet/ax/task.yaml`
- `featherweight-lab/e2e/fleet/ax/run.sh`
- `featherweight-lab/e2e/k3s/task.yaml`
- `featherweight-lab/e2e/k3s/egress.yaml`
- `featherweight-lab/e2e/k3s/run.sh`
- `featherweight-lab/e2e/k3s/ax-task-egress.comment.md`
