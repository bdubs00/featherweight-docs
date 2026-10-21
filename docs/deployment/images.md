# Build and images

This page tells how to build the two binaries, `fw` and `fw-workbench`, how to build their container images, which build tags select the drivers of `fw`, and how the lab builds and publishes the images that its fleet runs.

## The binaries

Both repositories need Go 1.27 or newer and `make`. The Makefile calls `go` from your `PATH`. To use another toolchain, set `GO`:

```sh
make build                      # writes bin/fw, or bin/fw-workbench
make test                       # runs every test with the race detector
make GO=/opt/go/bin/go build    # the same build with another toolchain
```

`make build` runs `go build` with `CGO_ENABLED=0`, `-trimpath`, and `-ldflags "-s -w -X main.version=$(VERSION)"`. `VERSION` is `git describe --tags --always --dirty`, or `dev` outside a checkout. The Makefile also has `vet`, `fmt`, `run`, and `clean`. `make run` builds and starts `serve`.

The workbench builds against the kernel checkout next to it. The `replace` directive in its `go.mod` points the module `github.com/bdubs00/featherweight-kernel` at `../featherweight-kernel`. Clone both repositories into one directory:

```sh
git clone https://github.com/bdubs00/featherweight-kernel
git clone https://github.com/bdubs00/featherweight-workbench
cd featherweight-workbench && make build
```

If the kernel is in another place, set `KERNEL` for the images and change the `replace` directive.

## The container images

Each repository has two Dockerfiles. Both build the binary in a `golang:1.27` stage and copy it into a small base.

| Image | Dockerfile | Base | For |
|---|---|---|---|
| `fw:static` | `Dockerfile` | `gcr.io/distroless/static-debian12` | Agents that use HTTP, MCP, and A2A and need no shell |
| `fw:toolbox` | `Dockerfile.toolbox` | `debian:bookworm-slim` with `bash`, `ca-certificates`, `curl`, `git`, `jq`, `openssh-client`, and `procps` | Coding agents that use the `bash` tool |
| `fw-workbench:static` | `Dockerfile` | the same distroless base | The front of a fleet |
| `fw-workbench:toolbox` | `Dockerfile.toolbox` | the same Debian base | A workbench that runs agents with `bash` |

The Makefile targets are the same in both repositories:

```sh
make image            # IMAGE:static and IMAGE:VERSION
make image-toolbox    # IMAGE:toolbox
```

`IMAGE` defaults to `ghcr.io/bdubs00/featherweight-kernel` and `ghcr.io/bdubs00/featherweight-workbench`. The kernel targets run `docker build` with the build arguments `VERSION` and `TAGS`. The workbench targets run `docker buildx build --load` with the kernel checkout as a second build context named `kernel`, because its `go.mod` replaces the kernel module with that checkout:

```sh
docker buildx build --build-context kernel=../featherweight-kernel \
  -t ghcr.io/bdubs00/featherweight-workbench:static .
```

The workbench Dockerfiles take no `TAGS` argument, so a workbench image carries every driver.

Both images of each repository `EXPOSE 80 8080`: ax probes port 80, and a plain deployment listens on 8080. The entrypoint is the binary, and the default command is `serve`.

### The runner symlink

ax starts `/usr/local/bin/ax-task-runner` as PID 1 in every Task container. Both Dockerfiles of the kernel link that name to `fw`. When the base name of its own program is `ax-task-runner`, `fw` puts `serve` in front of its arguments and serves. The workbench Dockerfiles link `ax-task-runner` and `fw` to `fw-workbench`, so ax starts the binary and `ax ssh <task> -- fw events <run>` works in a workbench image too.

### The tool user

The distroless base holds the user `nonroot`, uid and gid 65532. `Dockerfile.toolbox` creates the same user. Under ax, `fw` runs as root and starts the processes of tools as that user (`tools.user`) when the sandbox gives root the capabilities for it. The gVisor sandbox of Agent Substrate does not, so there the tools run as the user of `fw`. See [the kernel architecture, section 7.12](../design/kernel-architecture.md#712-tool-processes). The tool user cannot install packages. An agent that needs a toolchain gets it in an image built `FROM` the toolbox image.

## Build tags

`cmd/fw/drivers.go` links the core that every build carries: the configuration loader, the native API, the built-in tools, the MCP client, the token client of the fleet, and the telemetry. Each file `cmd/fw/driver_*.go` links one driver under the build constraint `!lean || <tag>`. Without a tag the binary carries every driver. With the tag `lean` it carries the core alone, and each driver comes back with its own tag.

| Tag | What it links |
|---|---|
| `a2a` | The A2A server surface, the A2A tool source, and the agent card of `fw card` |
| `anthropic` | The model provider `anthropic` |
| `env` | The package environment on the durable volume: the block `environment`, the tool `env`, and `fw env dockerfile` |
| `gemini` | The model provider `gemini` |
| `harness` | The hosted harnesses opencode and Claude Code, the block `harness` |
| `metrics` | The surface `metrics`, the Prometheus endpoint |
| `nats` | The bus driver `nats` |
| `oidc` | The authentication mode `oidc`, which verifies the tokens of people |
| `openai` | The model provider `openai`, which also speaks to any OpenAI-compatible server |
| `redis` | The bus driver `redis` |
| `spiffe` | The authentication mode `spiffe` and the TLS provider `spiffe` |

The README of the kernel and section 15 of its architecture list the tags without `env` and `harness`. The code of `cmd/fw/driver_env.go` and `cmd/fw/driver_harness.go` has them, so the code wins.

A configuration that names a driver that the build left out stops at the start with the name of the driver. A surface or a built-in tool that the build left out is skipped with a warning. A worker that pushes its metrics over OTLP still needs the tag `metrics`, because the push reads the registry of the metrics surface (see [Observability](observability.md)). A worker that people reach through the front needs `oidc`, because the front forwards their credentials.

The variable `TAGS` goes to `go build -tags` in the Makefile and to the build argument `TAGS` in the Dockerfiles. This builds a lean worker image with the drivers that the lab uses, on the toolbox base:

```sh
make image-toolbox TAGS=lean,nats,openai,oidc,metrics,env,anthropic
```

The same selection by hand:

```sh
go build -tags lean,nats,openai,oidc ./cmd/fw
docker build --build-arg TAGS=lean,nats,openai,oidc -t fw:worker .
```

Section 15 of the kernel architecture gives the sizes: about 82 MB for the full binary, about 38 MB for the lean core, and about 41 MB for a worker with `nats`, `openai`, and `oidc`. See [the kernel architecture, section 15](../design/kernel-architecture.md#15-dependencies).

## How the lab builds and publishes images

The lab pushes its images to a registry on the k3s node. The push goes through a tunnel to `localhost:5001`, which the user service `fw-e2e-tunnel` opens:

```sh
systemctl --user start fw-e2e-tunnel
e2e/fleet/redeploy.sh            # builds from main of both repositories
e2e/fleet/redeploy.sh my-branch  # builds the workbench from a git ref
```

`e2e/fleet/redeploy.sh [git-ref]` does these steps:

1. It checks that the registry answers, and that the workbench and the kernel checkouts exist. `E2E_WORKBENCH_DIR` and `E2E_KERNEL_DIR` name them. The defaults are the two directories next to the lab.
2. It makes a temporary git worktree of the workbench ref, `main` by default, and one of the kernel ref `E2E_KERNEL_REF`, also `main` by default. Edits in a working tree never leak into an image.
3. It builds `featherweight-workbench:fleet` from `Dockerfile` and `featherweight-workbench:fleet-toolbox` from `Dockerfile.toolbox`, both with the kernel worktree as the build context `kernel` and the short commit as `VERSION`.
4. It builds `featherweight-kernel:fleet-worker` from the kernel `Dockerfile.toolbox` with `TAGS=lean,nats,openai,oidc,metrics,env,anthropic`. This is the worker image of the fleet. It has the tools of the toolbox, because the agents of the lab use `bash`.
5. It pushes the three images and reads the digest of each one with `docker inspect`. Substrate pulls an actor image by digest only.
6. It writes `e2e/results/.fleet-images` with the variables `FLEET_IMAGE_STATIC`, `FLEET_IMAGE_TOOLBOX`, `FLEET_IMAGE_WORKER`, and `FLEET_COMMIT`. `deploy.sh` and `front-config.sh` read that file.
7. If the namespace `fw-fleet` exists, it renders the configuration of the front again with the new worker image, applies the ConfigMap `fw-front-config`, and patches the annotation `fw.dev/front-config` of the Deployment `fw-front` with a hash of it, so the front restarts. It sets the image of each Deployment with the label `fw.dev/image=static` or `fw.dev/image=toolbox`, waits for every rollout, and patches the ConfigMap `fw-fleet/ready` with `imageStatic`, `imageToolbox`, `imageWorker`, and `commit`.

The README of the lab names the tags of the worker as `lean,nats,openai,oidc,metrics,env`. The script adds `anthropic`, so the worker reaches the Claude API through the proxy `ax-anthropic`. The script wins.

`e2e/fleet/deploy.sh` creates the ConfigMap `ready` without `imageWorker`. `redeploy.sh` adds the key only when the ConfigMap exists. On a new cluster, run `redeploy.sh` again after the first `deploy.sh`. Otherwise `e2e/fleet/ax/run.sh` falls back to `imageToolbox`, the workbench image. The worker image of the fleet comes from the ConfigMap:

```sh
export KUBECONFIG=~/.kube/k3s.yaml
kubectl -n fw-fleet get cm ready -o jsonpath='{.data.imageWorker}'
```

The k3s loop of the end-to-end tests builds its own image. `e2e/k3s/run.sh` builds `featherweight-kernel:e2e` from the kernel `Dockerfile.toolbox` without tags, pushes it, and keeps the digest in `e2e/results/.k3s-image`. `E2E_SKIP_BUILD=1` reuses it. See [Testing](../operations/testing.md).

## Sources

- `featherweight-kernel/Makefile`
- `featherweight-kernel/Dockerfile`
- `featherweight-kernel/Dockerfile.toolbox`
- `featherweight-kernel/README.md`
- `featherweight-kernel/cmd/fw/main.go`
- `featherweight-kernel/cmd/fw/drivers.go`
- `featherweight-kernel/cmd/fw/driver_a2a.go`
- `featherweight-kernel/cmd/fw/driver_anthropic.go`
- `featherweight-kernel/cmd/fw/driver_env.go`
- `featherweight-kernel/cmd/fw/driver_gemini.go`
- `featherweight-kernel/cmd/fw/driver_harness.go`
- `featherweight-kernel/cmd/fw/driver_metrics.go`
- `featherweight-kernel/cmd/fw/driver_nats.go`
- `featherweight-kernel/cmd/fw/driver_oidc.go`
- `featherweight-kernel/cmd/fw/driver_openai.go`
- `featherweight-kernel/cmd/fw/driver_redis.go`
- `featherweight-kernel/cmd/fw/driver_spiffe.go`
- `featherweight-kernel/docs/ARCHITECTURE.md` (sections 11.2 and 15)
- `featherweight-kernel/telemetry/otlp.go`
- `featherweight-workbench/Makefile`
- `featherweight-workbench/Dockerfile`
- `featherweight-workbench/Dockerfile.toolbox`
- `featherweight-workbench/README.md`
- `featherweight-workbench/docs/ARCHITECTURE.md` (section 1.2)
- `featherweight-lab/e2e/fleet/redeploy.sh`
- `featherweight-lab/e2e/fleet/deploy.sh`
- `featherweight-lab/e2e/fleet/ax/run.sh`
- `featherweight-lab/e2e/k3s/run.sh`
- `featherweight-lab/e2e/README.md`
