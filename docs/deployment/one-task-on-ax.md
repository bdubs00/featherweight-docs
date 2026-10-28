# One Task on AX

This walk-through runs one agent in one sandbox on AX, with no workbench in front of it. At the end, you send the agent a task through the router, read its log of events, and look inside its sandbox. It is the smallest real deployment, and the place to test an image or a profile before it joins a fleet.

## What you need first

- A cluster with Agent Substrate and AX, and the patched AX that turns `spec.egress` into an egress policy. See [Platform gaps and patches](../operations/platform-gaps.md).
- `kubectl` and `ax`, with `KUBECONFIG` set to the cluster. Without it, `ax` dials `localhost:8080` and fails.
- An image of `fw` by digest in a registry that the cluster reaches. See [Build and images](images.md).
- A model behind a Service in the cluster, such as a proxy that holds the key.
- `fw` on your machine, for the verbs `fw ax`.

## What AX gives a Task

A Task is the AX object that runs one sandbox from an image. AX starts `/usr/local/bin/ax-task-runner` as PID 1, and the image links that name to `fw`, so `fw` serves. AX passes the Task in `AX_TASK_YAML` and its Workspaces in `AX_WORKSPACES_YAML`, and it sets each `spec.env` entry. It mounts `/workspace`, a volume that survives a suspend. Three facts of the platform shape every step:

- AX creates every Task suspended. A resume starts it.
- The atenet router is the only door into a Task. A request through it carries the header `ate-target-actor: <atespace>/<task>`, and it wakes a sleeping Task.
- A Task reaches only the hosts of its `spec.egress`. A Task without it has no network.

## Run one Task with fw ax

`fw ax` takes one profile file, a fragment of `fw.yaml` such as `agents` and `policy`, and does the work in one command. It starts from your own configuration: `model`, `models`, `effort`, `providers`, `bus`, `tokens`, and `tools.mcp`. It adds one egress host for each endpoint, so none is forgotten.

1. Forward the ports of the AX API and the router, because the verbs dial them directly:

    ```sh
    kubectl -n ax-system port-forward svc/ax-server 8080:8080 &
    kubectl -n ate-system port-forward svc/atenet-router 8001:80 &
    export IMAGE="<registry>/featherweight-kernel@sha256:<digest>"
    export FW_API_TOKEN="$(openssl rand -hex 24)"
    ```

2. Print what `up` will apply, and read the warnings in its first comment:

    ```sh
    fw ax render -f agents/reviewer.yaml --name reviewer --image "$IMAGE" --egress github.com
    ```

    The output is a Workspace `reviewer-ws` with `.fw/fw.yaml`, and a Task `reviewer`. Each secret shows as `<secret: NAME>`. `render` refuses an image without a digest and a profile without a model.

3. Apply it, resume the Task, and wait until the kernel is ready:

    ```sh
    fw ax up -f agents/reviewer.yaml --name reviewer --image "$IMAGE" --egress github.com \
      --server 127.0.0.1:8080 --router 127.0.0.1:8001
    ```

    `up` waits for `/readyz` through the router, up to `--timeout`, 10 minutes by default. It resumes a Task that crashes at boot, up to three times. At the end, it prints the router and the header to use.

4. Read the state of the Task:

    ```sh
    fw ax status --name reviewer --server 127.0.0.1:8080 --router 127.0.0.1:8001
    ```

    It prints the phase and the conditions of the Task. While the Task runs, it also prints `GET /v1/status` of the kernel, with `idle` and `idleSince`. It does not read a sleeping Task, because the read wakes it.

5. Send the agent a task, and follow its events. The next section shows the request. Then read the ledger of the run:

    ```sh
    fw ax events --name reviewer --router 127.0.0.1:8001 <run-id>
    ```

6. At the end, delete the Task and its Workspace:

    ```sh
    fw ax down --name reviewer --server 127.0.0.1:8080
    ```

`--egress` adds one host as `spec.egress.hosts` takes it: a name alone for TLS on port 443, `http://host[:port]`, `https://host[:port]`, or a `ws`, `wss`, or `rediss` URL. A child Task, an A2A peer, and an OIDC issuer need such a host. `--env NAME=VALUE` adds a variable, and `--debug` sets `spec.debug`. A Task does not change, so `up` refuses a Task that exists: run `down` first.

## Send it work through the router

Every request to a Task goes through the router. `/readyz` and `/healthz` take no token. The native API takes the bearer token of `FW_API_TOKEN`.

```sh
curl -s -H 'ate-target-actor: default/reviewer' http://127.0.0.1:8001/readyz
curl -s -H 'ate-target-actor: default/reviewer' -H "Authorization: Bearer $FW_API_TOKEN" \
     -H 'Content-Type: application/json' \
     -d '{"input": "Say hello in five words.", "wait": false}' http://127.0.0.1:8001/v1/runs
curl -s -H 'ate-target-actor: default/reviewer' -H "Authorization: Bearer $FW_API_TOKEN" \
     http://127.0.0.1:8001/v1/runs/<run-id>
```

The answer of `POST /v1/runs` is the run object, with its `id` and `state`. Send `"wait": false` and read the run later, because a long request through a port-forward can break. `GET /v1/status` answers `usage`, `pendingApproval`, `runs` with `active`, `inputRequired`, and `total`, `idle`, and `idleSince`. After a storage failure, it adds `blocked: true` and `blockedReason`.

## Write the manifests by hand

`fw ax render` prints manifests that you can keep and apply with `ax`. A hand-written pair looks like this. The Workspace ships `fw.yaml` to `/workspace/.fw/fw.yaml`, where `fw` reads it under AX:

```yaml
apiVersion: ax.io/v1alpha1
kind: Workspace
metadata: {name: fw-hello-ws, atespace: default}
spec:
  files:
    - path: .fw/fw.yaml
      content: |
        auth: {mode: token}
        model: openai/<model>
        providers:
          openai: {baseUrl: "http://ax-model.fw-fleet.svc.cluster.local:8080/v1", apiKeyEnv: OPENAI_API_KEY}
        tools:
          builtin: [bash, files, clock]
---
apiVersion: ax.io/v1alpha1
kind: Task
metadata: {name: fw-hello, atespace: default}
spec:
  image: "<registry>/featherweight-kernel@sha256:<digest>"
  env:
    - {name: OPENAI_API_KEY, value: the-proxy-holds-the-key}
    - {name: FW_API_TOKEN, value: "<token>"}
  workspaces:
    - {name: fw-hello-ws, path: /workspace}
  egress:
    hosts:
      - http://ax-model.fw-fleet.svc.cluster.local:8080
```

Leave `spec.command` empty, so `fw` serves and waits for work. Apply the file and resume the Task:

```sh
ax -a default apply -f hello.yaml
ax -a default resume task fw-hello
ax -a default describe task fw-hello
```

A Workspace can also clone `spec.git`, create `spec.skills.path`, and name `spec.mcp.servers`, which join `tools.mcp`. A binding with `goal` runs the profile `bootstrap` once with that goal. `examples/ax/reviewer.yaml` of the kernel shows each one.

??? note "Under the hood: how fw boots in a Task"
    1. `fw` reads `AX_TASK_YAML` and `AX_WORKSPACES_YAML`, and sets `FW_HOME` to `/workspace/.fw`.
    2. It listens on port 80 and answers `/healthz`. It serves the metadata of the Task on `127.0.0.1:8099`. With `spec.debug`, it starts the guest services of `ax ssh`.
    3. For each binding, it writes `spec.files`, clones `spec.git`, and creates `spec.skills.path`, then writes a marker at `$FW_HOME/ax/initialized-<path>`. A resume skips a binding whose marker exists.
    4. If a binding has a `goal` and a model credential is present, it runs the profile `bootstrap`, within `AX_BOOTSTRAP_TIMEOUT`, ten minutes by default.
    5. It answers `/readyz` with 200, resumes the unfinished runs of the ledger, and serves.

    Under AX, the kernel sets `listen` to `:80`, `maxRuns` to 1, `tools.files.root` to the first binding, and `tools.files.perRun` on. An empty `tools.memory.scope` becomes `principal`, and `node` becomes `ax:<atespace>/<task>`. A suspend saves `/workspace` and kills `fw`. On resume, `fw` boots again, finds its markers, and resumes the runs from the ledger. See [section 11 of the kernel architecture](../design/kernel-architecture.md#11-running-inside-googleax).

## Look inside a Task

`ax ssh <task> -- <command>` runs a command in the sandbox. It needs `spec.debug: true` on the Task, or `--debug` on `fw ax`. `fw` is on the `PATH` of both images, and `fw events` finds the ledger under `/workspace/.fw` on its own. `fw:static` has no shell, so a bare `ax ssh <task>` opens a shell in `fw:toolbox` only.

```sh
ax ssh reviewer -- ls -la /workspace
ax ssh reviewer -- fw events <run-id>
ax ssh reviewer -- fw doctor
```

!!! warning
    Do not set `spec.debug` on a Task whose environment or workspace holds keys. Any caller that reaches port 80 of the sandbox can run a process and read them. The guest services carry no authentication, and a tool process inside the sandbox reaches them too. Use debug on a throwaway Task only.

Inside a Task, `fw doctor` adds four lines. Outside AX it prints one line, `ax: not under ax`.

| Line | What it checks |
|---|---|
| `ax reach` | Each endpoint of the configuration, through the egress gateway, with no credential. A 403 with the body `egress denied` fails. |
| `ax trust bundle` | The bundle at `/run/ate/egress-trust-bundle/trust-bundle.pem`, which an `https://` host needs. An absent file passes with a note. |
| `ax tools user` | The user that runs the tools, and whether it is a user other than the one of `fw` |
| `ax durable` | `FW_HOME` is under `/workspace` and writable, and every binding is on the volume |

## Where to go next

<div class="paths" markdown>

- [A fleet <span>Many Tasks behind one workbench</span>](fleet.md)
- [Debugging a Task <span>Where to look for a Task that misbehaves</span>](../operations/debugging.md)

</div>

## Sources

- `featherweight-kernel/README.md`, section "Inside google/ax"
- `featherweight-kernel/docs/ARCHITECTURE.md`, sections 11 and 21
- `featherweight-kernel/cli/ax.go`
- `featherweight-kernel/cli/doctor_ax.go`
- `featherweight-kernel/cli/serve.go`
- `featherweight-kernel/ax/config.go`
- `featherweight-kernel/ax/manifest.go`
- `featherweight-kernel/surface/view/status.go`
- `featherweight-kernel/surface/axmeta/axmeta.go`
- `featherweight-kernel/examples/ax/reviewer.yaml`
