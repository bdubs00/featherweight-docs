# Build and images

Featherweight ships as two programs: the kernel, the agent in a sandbox, and the workbench, the program for people. This page builds both, puts them in container images that AX can run, and picks the drivers that a worker image carries. A worker is a kernel in one sandbox of a fleet, and the front is the workbench in front of the workers.

## Build the binaries

You need Go 1.27 or newer, `make`, and `git`. The Makefile calls `go` from your `PATH`. To use another toolchain, set `GO`, for example `make GO=/opt/go/bin/go build`.

The workbench builds against the kernel checkout next to it, through the `replace` directive in its `go.mod`. Its page, bossmode, builds from a third checkout with Node 22 and npm. Clone all three into one directory:

```sh
git clone https://github.com/bdubs00/featherweight-kernel
git clone https://github.com/bdubs00/featherweight-workbench
git clone https://github.com/bdubs00/featherweight-bossmode
cd featherweight-kernel && make build      # writes bin/fw
cd ../featherweight-workbench
make page                                  # builds ../featherweight-bossmode into bossmode/static
make build                                 # writes bin/fw-workbench, with the page inside
```

Without `make page`, the workbench binary embeds a placeholder page, and `go build` still works. `make test` runs every test with the race detector in both repositories. `make build` passes `CGO_ENABLED=0`, `-trimpath`, and `-ldflags "-s -w -X main.version=$(VERSION)"`, where `VERSION` is `git describe --tags --always --dirty`, or `dev` outside a checkout.

## The container images

Each repository has two Dockerfiles. Both build the binary in a `golang:1.27` stage and copy it into a small base.

| Image | Base | What it holds | For |
|---|---|---|---|
| `fw:static` | `gcr.io/distroless/static-debian12` | `fw` alone | Agents that use HTTP, MCP, and A2A and need no shell |
| `fw:toolbox` | `debian:bookworm-slim` | `bash`, `git`, `curl`, `jq`, `python3`, network and file programs, and `uv` and `pixi` | Coding agents that use the `bash` tool, and the packages of a pool |
| `fw-workbench:static` | the distroless base | `fw-workbench`, and the page of a build that included it | The front of a fleet |
| `fw-workbench:toolbox` | the Debian base | `bash`, `git`, `curl`, `jq`, `openssh-client`, and `procps` | A workbench that runs its own agents with `bash` |

The Makefile targets are the same in both repositories. `IMAGE` defaults to `ghcr.io/bdubs00/featherweight-kernel` and `ghcr.io/bdubs00/featherweight-workbench`.

```sh
make image            # IMAGE:static and IMAGE:VERSION
make image-toolbox    # IMAGE:toolbox
```

The workbench targets run `docker buildx build --load` with the kernel checkout as a second build context, `kernel`. `PAGE` names a checkout of bossmode, `../featherweight-bossmode` by default. If it holds one, the targets add it as a third build context, `page`, and a Node stage builds the page into the image. By hand:

```sh
docker buildx build --build-context kernel=../featherweight-kernel \
  --build-context page=../featherweight-bossmode --build-arg PAGE=build \
  -t ghcr.io/bdubs00/featherweight-workbench:static .
```

Without the page, leave out both `--build-context page` and `--build-arg PAGE=build`. A build with `PAGE=build` and no build context `page` fails. Add `-f Dockerfile.toolbox` and the tag `:toolbox` for the toolbox image.

Every image runs its binary as the entrypoint with the default command `serve`, and exposes ports 80 and 8080: AX probes port 80, and a plain deployment listens on 8080.

??? note "Under the hood: the runner symlink and the tool user"
    AX starts `/usr/local/bin/ax-task-runner` as PID 1 in every Task. The kernel images link that name to `fw`. When `fw` starts under that name, it serves. The workbench images link both `ax-task-runner` and `fw` to `fw-workbench`, so `ax ssh <task> -- fw events <run>` works there too.

    Both bases hold the user `nonroot`, uid and gid 65532. Under AX, `fw` runs as root. If root has the capabilities for it, `fw` starts the processes of tools as that user, `tools.user`. The gVisor sandbox of Agent Substrate takes them away unless AX passes them, as [Platform gaps and patches](../operations/platform-gaps.md#tool-user-capabilities) explains. The tool user cannot install apt packages, so a heavy toolchain goes in an image built `FROM` the toolbox image.

## Choose the drivers of a worker

Without a build tag, `fw` carries every driver. With the tag `lean`, it carries the core alone: the configuration, the native API, the built-in tools, the MCP client, the token client of the fleet, and the telemetry. Each driver then comes back with its own tag.

| Tag | What it links |
|---|---|
| `anthropic`, `openai`, `gemini` | The model providers. `openai` also speaks to any server of the OpenAI chat API. |
| `nats`, `redis` | The bus drivers |
| `oidc`, `spiffe` | The authentication modes for people and for workloads |
| `metrics` | The Prometheus endpoint and the OTLP push of the metrics |
| `a2a` | The A2A server, the A2A tool source, and `fw card` |
| `env` | The packages on the durable volume: the block `environment`, the tool `env`, and `fw env dockerfile` |
| `harness` | The agent programs opencode and Claude Code inside `fw`, the block `harness` |
| `propose` | `fw routine propose`, which `lean` leaves out |

One more tag adds a capability to either build: `memory_sqlite` adds a SQLite FTS5 index of the memory notes, with no cgo. Without it, a search of the memory scans the notes.

`TAGS` goes to `go build -tags` and to the build argument `TAGS` of the kernel Dockerfiles. A worker of a fleet with OpenAI, NATS, people, metrics, and packages:

```sh
make image-toolbox TAGS=lean,nats,openai,oidc,metrics,env
```

A worker that people call directly with a sign-in token needs `oidc`. The front never forwards the token of a person: it calls a worker with the static token of the fleet and names the person in a header. A worker that pushes metrics needs `metrics`. A worker with packages needs `env`. A configuration that names a driver that the build left out stops at the start with the name of the driver.

On 2026-10-27, a build with Go 1.27.2 and the flags of `make build` gave these sizes. The full `fw` was about 59 MB, the `lean` core about 28 MB, and `lean,nats,openai,oidc` about 29 MB. Section 15 of the kernel architecture gives older sizes.

The workbench Dockerfiles take no `TAGS`. `fw-workbench` links every driver of `fw` except `env` and `harness`. A workbench process therefore has no tool `env`, and it reads no block `harness`.

## Push by digest

Substrate pulls an actor image by digest only, so a Task and a pool name the image as `<registry>/<name>@sha256:<64 hex digits>`. After a push, read the digest and put it in the Task or in the `image` of a pool:

```sh
docker push ghcr.io/example/featherweight-kernel:toolbox
docker inspect --format '{{index .RepoDigests 0}}' ghcr.io/example/featherweight-kernel:toolbox
```

A Task does not change, so a new image needs a new Task. When the image of a pool changes, the pool replaces its Tasks one at a time. See [One Task on AX](one-task-on-ax.md) and [Pools and templates](pools.md).

## Where to go next

<div class="paths" markdown>

- [One Task on AX <span>Run the image as one sandbox, with no fleet</span>](one-task-on-ax.md)
- [A fleet <span>Many Tasks behind one workbench</span>](fleet.md)

</div>

## Sources

- `featherweight-kernel/Makefile`
- `featherweight-kernel/Dockerfile`
- `featherweight-kernel/Dockerfile.toolbox`
- `featherweight-kernel/README.md`
- `featherweight-kernel/cmd/fw/drivers.go`
- `featherweight-kernel/cmd/fw/driver_env.go`
- `featherweight-kernel/cmd/fw/driver_harness.go`
- `featherweight-kernel/docs/ARCHITECTURE.md`, sections 11.2 and 15
- `featherweight-workbench/Makefile`
- `featherweight-workbench/Dockerfile`
- `featherweight-workbench/Dockerfile.toolbox`
- `featherweight-workbench/README.md`
- `featherweight-workbench/cmd/fw-workbench/drivers.go`
- `featherweight-workbench/docs/ARCHITECTURE.md`, section 1.2
