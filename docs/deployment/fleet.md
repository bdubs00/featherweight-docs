# A fleet

A fleet is many agents, each in its own sandbox, behind one workbench that people talk to. The deploy pages call that workbench the front. This page deploys one on a cluster with Agent Substrate and AX. It covers the parts, the configuration of the front, the workers, one public address, and the order of the steps.

<div class="demo" data-demo="deploy-map" markdown>

A fleet has these parts. The front is `fw-workbench`, a Deployment outside the sandboxes. NATS JetStream carries the jobs to the workers and their events back. The AX API lists, suspends, and resumes the Tasks, and the atenet router is the one door into a Task. Each worker Task runs one `fw`. A model proxy holds the model key, and the grant store holds the grants of people. Prometheus scrapes the front, and the workers push their metrics to a collector. A job from Claude Code starts at the tool `enqueue` and waits on the queue `fw.jobs.<agent>`. The front wakes a sleeping worker through the router, and the events of the run come back on `fw.events`.

</div>

## What you need first

- A Kubernetes cluster with Agent Substrate and AX. The project runs a patched AX that creates the egress policy of a Task from `spec.egress`. See [Platform gaps and patches](../operations/platform-gaps.md).
- The images of `fw` and `fw-workbench` in a registry that the cluster reaches, with the digest of each push. See [Build and images](images.md).
- A model server behind a Service in the cluster. An egress host names a DNS name, and Substrate accepts only local names in the `Host` header.
- If people sign in, an OpenID Connect issuer. A developer can use the static token alone.

The worked examples are in the workbench repository. `examples/agentgateway/fleet.yaml` puts NATS, the front, and the routes of a gateway in the namespace `fw-fleet`. `examples/pools/fw.yaml` and `examples/bossmode/fw.yaml` configure a front with pools.

## Configure the front

The front is `fw-workbench serve` with no agents of its own. It reads its configuration once, at its start, from the file in `FW_CONFIG` and from the variables, which win over the file. The block `workbench.fleet` names its sources:

| Key | Variable | What it does | Default |
|---|---|---|---|
| `workbench.fleet.atespaces` | `FW_WORKBENCH_FLEET_ATESPACES` | The atespaces whose Tasks are members, read from the AX API at `ax.server` | none |
| `workbench.fleet.egress` | `FW_WORKBENCH_FLEET_EGRESS` | The subject prefix of the egress stream of the workers | none |
| `workbench.fleet.intake` | `FW_WORKBENCH_FLEET_INTAKE` | The subject prefix of the job queues | none |
| `workbench.fleet.interval` | `FW_WORKBENCH_FLEET_INTERVAL` | The time between two reads of the Task list and the queues | `30s` |
| `workbench.fleet.suspendAfter` | `FW_WORKBENCH_FLEET_SUSPEND_AFTER` | The idle time before the front suspends a Task, or `off` | `10m` with atespaces |
| `workbench.fleet.wakeOnQueue` | `FW_WORKBENCH_FLEET_WAKE_ON_QUEUE` | Whether jobs that wait in a queue wake sleeping Tasks | on with atespaces and intake |
| `workbench.fleet.orphansAfter` | `FW_WORKBENCH_FLEET_ORPHANS_AFTER` | How long an orphan child Task sleeps before the front removes it, or `off` | `24h` with atespaces |
| `workbench.fleet.expire` | `FW_WORKBENCH_FLEET_EXPIRE` | The age after which the view forgets a finished run | `168h` |

`atespaces` or `egress` turns the fleet on. The front also needs the bus (`bus.driver: nats` and `bus.url`), the AX API (`ax.server` or `FW_AX_SERVER`), and the router (`ax.router`). The front and the workers must name the same JetStream stream in `bus.options.stream`, `FW` by default. `workbench.pools` and `workbench.templates` add the workers, as [Pools and templates](pools.md) explains. `workbench.bossmode` adds the page, as [Serve bossmode](bossmode.md) explains.

A front of an AX fleet sets variables such as these in its Deployment:

```yaml
env:
  - {name: FW_HOME, value: /data}
  - {name: FW_CONFIG, value: /etc/fw/fw.yaml}            # the ConfigMap with the pools
  - name: FW_API_TOKEN
    valueFrom: {secretKeyRef: {name: fw-fleet-token, key: FW_API_TOKEN}}
  - {name: FW_AUTH_MODE, value: "oidc,token"}
  - {name: FW_AUTH_OIDC_ISSUER, value: "https://idp.example.com"}
  - {name: FW_AUTH_OIDC_AUDIENCE, value: "https://fleet.example.com/mcp"}
  - {name: FW_AUTH_OIDC_CLIENT_ID, value: "<client id>"}   # turns the browser sign-in on
  - {name: FW_MCP_AUTH_AUDIENCE, value: "https://fleet.example.com/mcp"}
  - name: FW_MCP_STATE_KEY
    valueFrom: {secretKeyRef: {name: fw-front, key: FW_MCP_STATE_KEY}}
  - name: FW_GRANT_KEY
    valueFrom: {secretKeyRef: {name: fw-front, key: FW_GRANT_KEY}}
  - {name: FW_WORKBENCH_GRANTS_DIR, value: /data/grants}   # a PersistentVolumeClaim
  - {name: FW_BUS_DRIVER, value: nats}
  - {name: FW_BUS_URL, value: "nats://nats.fw-fleet.svc.cluster.local:4222"}
  - {name: FW_WORKBENCH_FLEET_ATESPACES, value: default}
  - {name: FW_WORKBENCH_FLEET_EGRESS, value: fw.events}
  - {name: FW_WORKBENCH_FLEET_INTAKE, value: fw.jobs}
  - {name: FW_AX_SERVER, value: "ax-server.ax-system.svc.cluster.local:8080"}
  - {name: OTEL_EXPORTER_OTLP_ENDPOINT, value: "http://opentelemetry-collector.otel-system.svc.cluster.local:4318"}
```

Two replicas can answer any request, on these conditions. Give both the same `FW_MCP_STATE_KEY` and `FW_GRANT_KEY` from one Secret, and the grants on one volume. Give both the same configuration: the front reads it once, so a change of the ConfigMap needs a restart of every replica. A hash of the rendered configuration in an annotation of the pod template does that.

??? note "Event sources"
    `workbench.sources` turns the events of another system into runs: a webhook at `POST /v1/sources/{name}`, or a poll of a URL. At its start, the front copies each entry into the store of the duties, so a person can edit it on the page. An entry with `locked: true` stays as the file says. See [Duties](../guide/duties.md) and [section 22.8 of the workbench architecture](../design/workbench-architecture.md#228-the-sources-as-duties).

## The workers

A worker is a bare `fw` in an AX Task. The usual way to get workers is a pool: the front creates the Tasks and keeps them at a count. A single worker without a pool comes from `fw ax up`, as [One Task on AX](one-task-on-ax.md) shows. Every worker needs these things, and a pool adds most of them for you:

- The bus over WebSocket, such as `bus.url: ws://nats.fw-fleet.svc.cluster.local:8080`. The egress gateway of Substrate carries only HTTP and TLS, so a Task cannot speak `nats://`.
- `bus.intake`, the queue it takes jobs from, and `bus.egress`, the subject of its events. A pool sets both.
- `bus.options.concurrency: 1` on NATS, so one Task holds one job at a time. A pool sets it.
- The static token of the fleet in `FW_API_TOKEN`. A pool copies it from the front.
- For a tool that acts for a person, `tokens.url`, the token broker of the front.

A worker reaches only the hosts of its egress, `spec.egress.hosts`. A name alone is TLS on port 443 that the gateway passes through. `http://` is cleartext HTTP on port 80. A port after the name replaces the default. A worker of a fleet usually needs these hosts:

| Host | Allows |
|---|---|
| `http://nats.fw-fleet.svc.cluster.local:8080` | The WebSocket listener of NATS |
| `http://model-proxy.models.svc.cluster.local:8080` | The model, behind its proxy |
| `http://fw-front.fw-fleet.svc.cluster.local:8080` | The token broker and the MCP server of the front |
| `http://opentelemetry-collector.otel-system.svc.cluster.local:4318` | The push of metrics, logs, and traces |
| `http://ax-server.ax-system.svc.cluster.local:8080` | The AX API, only for `spawn_task` with `spawn.driver: ax` |
| `http://atenet-router.ate-system.svc.cluster.local:80` | The router, through which a parent reaches its child Tasks |
| `github.com` | A clone over TLS |

`spec.egress` holds hosts and no credential. Keep a model key in the proxy, and give a worker any other secret through a variable of the pool with `fromEnv`. A child Task inherits the egress of its parent. The front logs a warning for each address of a worker that no host allows.

## Tokens and audiences

Every process of the fleet shares one static token. The front reads a worker with it, and a worker presents it to the token broker of the front. The token must have eight characters or more. Create it as the Secret `fw-fleet-token` with the key `FW_API_TOKEN`:

```sh
kubectl create namespace fw-fleet
kubectl -n fw-fleet create secret generic fw-fleet-token --from-literal=FW_API_TOKEN="$(openssl rand -hex 32)"
kubectl -n fw-fleet create secret generic fw-front --from-literal=FW_MCP_STATE_KEY="$(openssl rand -hex 32)"
```

If people sign in with OIDC, the audience of their tokens is the public `/mcp` address. Put the same value in four places: the login policy of the gateway, `resourceMetadata.resource` of that policy, `FW_AUTH_OIDC_AUDIENCE`, and `FW_MCP_AUTH_AUDIENCE`. One token then works at the gateway, at the MCP server, and on the routes of the front. The front never forwards that token to a worker. It decides each action for the person, then calls the worker with the static token and names the person in the header `Fw-On-Behalf-Of`. See [Identity](../concepts/identity.md) and [Reaching a run on another worker](../concepts/fleet.md#reaching-a-run-on-another-worker).

## One public address

`examples/agentgateway/README.md` puts a fleet behind agentgateway v1.6.0 on one public URL. The HTTPRoute `fleet-mcp` sends `/mcp` and the MCP documents under `/.well-known` to an MCP backend with a login policy. The HTTPRoute `fleet-http` sends `/ui` and `/v1` to the Service `fw-front`. If the front serves the page, add `/bossmode` to that route. These rules keep the login and the dashboard working:

- Give the MCP backend exactly one target, the front.
- Keep `sessionRouting: Stateful`, the default.
- Keep `backend.auth.passthrough`, so the front learns who the person is.
- Allow the resource `ui://fw/dashboard` in any `traffic.authorization` rule.
- Do not route `/metrics`.

## The order of the steps

1. Build the images and push them. Record the digest of each push, because Substrate pulls an actor image by digest only.
2. If one public URL serves the fleet, install agentgateway v1.6.0 and its CRDs with Helm, as `examples/agentgateway/README.md` says.
3. Create the namespace and the two Secrets of the previous section.
4. Put the model server behind a proxy Service in the cluster.
5. Replace the placeholders at the top of `fleet.yaml` and apply it. It creates NATS, the front, its two Services, and the routes of the gateway.
6. Add the pools to the configuration of the front, review them with `fw-workbench pools render`, and restart the front. See [Pools and templates](pools.md).
7. Run `fw-workbench doctor` with the configuration of the front. The line `fleet` names the atespaces, the stream, the queues, and the pools.
8. Add the server to Claude Code and call the tool `fleet`. The members appear as `live` or `quiet`. See [Use a fleet from Claude Code](../getting-started/from-claude-code.md).

A later change of the image or the configuration of the front rolls the Deployment. When the configuration of a pool changes, the pool replaces its Tasks. A Task of `fw ax up` does not change: run `fw ax down` and `fw ax up` again.

## Where to go next

<div class="paths" markdown>

- [Pools and templates <span>Keep workers at a count, and let people add agents</span>](pools.md)
- [Serve bossmode <span>The page, the manager, bridges, and duties</span>](bossmode.md)
- [Observability <span>What to scrape, what to push, and the metrics</span>](observability.md)

</div>

## Sources

- `featherweight-workbench/README.md`
- `featherweight-workbench/docs/ARCHITECTURE.md`, sections 3.8, 4.6, 4.9, 4.12, 4.13, 11, 14.1, 14.6, and 22.8
- `featherweight-workbench/fleet/config.go`
- `featherweight-workbench/fleet/suspend.go`
- `featherweight-workbench/fleet/metrics.go`
- `featherweight-workbench/connections/config.go`
- `featherweight-workbench/connections/broker.go`
- `featherweight-workbench/bossmode/routes.go`
- `featherweight-workbench/sources/config.go`
- `featherweight-workbench/examples/agentgateway/README.md`
- `featherweight-workbench/examples/agentgateway/fleet.yaml`
- `featherweight-workbench/examples/pools/fw.yaml`
- `featherweight-workbench/examples/bossmode/fw.yaml`
- `featherweight-kernel/ax/manifest.go`
- `featherweight-kernel/fw/config.go`
- `featherweight-kernel/examples/observability/otel-collector.yaml`
