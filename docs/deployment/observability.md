# Observability

`fw` serves Prometheus metrics at `/metrics`, and it pushes its metrics, its ledger, and its traces to an OpenTelemetry collector when the standard `OTEL_*` variables name one. This page lists the metric families, the rule for their labels, the series of the front, the export, the example setup of the kernel, and the checks of the lab. The ledger, an append-only log of the run, stays the exact record of usage. Prometheus is for trends, errors, and latency, never for billing.

## The metrics endpoint

The surface `metrics` serves the Prometheus registry of one process on the same listener as its API. It is on by default, as `surfaces: [native, a2a, metrics]` in `examples/fw.yaml` shows. The key `telemetry.metrics`, or the variable `FW_TELEMETRY_METRICS`, moves the route. The value must start with `/`:

```yaml
surfaces: [native, a2a, metrics]
telemetry:
  metrics: /metrics
  log: info
```

The route carries no authentication, because a scraper has no token. Keep it inside the monitoring perimeter: do not route it through a public gateway, and allow the port of `fw` to Prometheus and to the clients of `fw` only. The registry also holds the Go runtime and process collectors. A lean build needs the tag `metrics` for the surface, and also for the OTLP push of metrics, because the push reads the registry of the surface. See [Build and images](images.md#build-tags).

## The metric families

`telemetry/metrics.go` builds these families. See [the kernel architecture, section 10.1](../design/kernel-architecture.md#101-metrics) for how each one counts.

| Metric | Type | Labels |
|---|---|---|
| `fw_runs_total` | counter | `agent`, `outcome`, `batch` |
| `fw_runs_queued_total` | counter | `agent`, `origin` (`http`, `a2a`, `mcp`, `bus`, `cli`, `tool`, `other`), `batch` |
| `fw_runs_active` | gauge | `agent` |
| `fw_run_duration_seconds` | histogram | `agent` |
| `fw_run_turns` | histogram | `agent` |
| `fw_budget_exceeded_total` | counter | `agent`, `limit` (`maxTurns`, `maxTokens`, `maxCostUSD`, `maxToolCalls`, `deadline`, `maxRepeats`, `other`) |
| `fw_model_requests_total` | counter | `provider`, `model`, `outcome` (`ok`, `error`, `canceled`) |
| `fw_model_request_duration_seconds` | histogram | `provider`, `model` |
| `fw_model_tokens_total` | counter | `provider`, `model`, `kind` (`input`, `output`, `cache_read`, `cache_write`) |
| `fw_model_cost_usd_total` | counter | `provider`, `model` |
| `fw_model_unpriced_tokens_total` | counter | `provider`, `model` |
| `fw_tool_calls_total` | counter | `tool`, `outcome` (`ok`, `error`, `denied`) |
| `fw_tool_call_duration_seconds` | histogram | `tool` |
| `fw_mcp_server_up` | gauge | `server` |
| `fw_approvals_pending` | gauge | `agent` |
| `fw_approvals_oldest_timestamp_seconds` | gauge | `agent` |
| `fw_approvals_total` | counter | `decision` |
| `fw_loops_total` | counter | `agent`, `action` (`warned`, `failed`) |
| `fw_bus_messages_total` | counter | `driver`, `direction` (`in`, `out`) |
| `fw_ledger_events_total` | counter | `type` |
| `fw_ledger_append_duration_seconds` | histogram | `driver` |
| `fw_build_info` | gauge | `version`, `commit`, `go` |

The table of section 10.1 of the kernel architecture lists `fw_runs_total` with `agent` and `outcome` alone. The code adds `batch`, the job of the run from the metadata `fw.batch`, so the code wins. `fw_model_cost_usd_total` counts priced tokens only. Set the prices per million tokens under `prices` in `fw.yaml`, with a price of zero for a local model, and the tokens of a model without a price go to `fw_model_unpriced_tokens_total`. The model latency histogram has buckets up to 900 seconds.

## The rule for labels

No label holds a person, a run id, a prompt, a path, or a URL. Tests of the kernel feed a principal, a run id, and secret text into the events and make sure that no label holds them. A label holds a name that the configuration bounds, or a value from a fixed list:

- `agent`: the profiles of `fw.yaml` and the profiles that authorized people create.
- `tool`: the tools that the kernel resolved. A tool name that the model invents becomes `unknown`.
- `server`: the MCP servers under `tools.mcp`.
- `provider` and `model`: the models of the configuration keep their names, and at most 32 other pairs do. Each pair after that, and a name longer than 128 bytes, gets `other`.
- `driver`: the bus and ledger drivers.
- `batch`: the name of a job, which `enqueue` of the workbench sets. A run of no job has an empty value.

`outcome`, `origin`, `limit`, `kind`, `decision`, `action`, `direction`, and `type` come from fixed lists. An origin or a limit that this version does not know becomes `other`.

## The series of the front

The package `fleet` of the workbench adds the series of the fleet to the registry of the front through `metrics.RegisterCollector`. The collector reads what the front already holds at scrape time: the last read of the queues, the dead letters, and the view of the egress stream. A scrape sends no request to a Task or to the bus, so it wakes nobody.

| Metric | Type | Labels |
|---|---|---|
| `fw_fleet_queue_pending` | gauge | `queue` |
| `fw_fleet_queue_ack_pending` | gauge | `queue` |
| `fw_fleet_dead_letters_total` | counter | `queue` |
| `fw_fleet_dead_letter_last_timestamp_seconds` | gauge | `queue` |
| `fw_fleet_runs_finished_total` | counter | `agent`, `member`, `outcome` (`completed`, `failed`, `canceled`, `other`) |
| `fw_fleet_runs_budget_exceeded_total` | counter | `agent`, `member`, `limit` |
| `fw_fleet_approvals_pending` | gauge | `agent` |
| `fw_fleet_approvals_oldest_timestamp_seconds` | gauge | `agent` |

`queue` is `<workbench.fleet.intake>.<agent>`, and `member` is `<atespace>/<task>` for a Task. Each run counter keeps at most 1024 pairs of agent and member, and the pairs past that bound count under `other`. The run counters count the ends that the front saw since it started, and every replica sees the whole stream, so take the maximum over the replicas, not the sum. `fw_fleet_approvals_pending` counts the runs of other members only. [Section 4.14 of the workbench architecture](../design/workbench-architecture.md#414-metrics-and-alerts) has four example alert rules: `FwFleetRunFailuresRising`, `FwFleetQueueDeep`, `FwFleetApprovalWaiting`, and `FwFleetDeadLetter`. Load them beside the rules of the kernel.

Section 10.1 of the kernel architecture names the fleet gauges `fw_fleet_member_up`, `fw_fleet_member_last_seen_timestamp_seconds`, and `fw_fleet_runs`, and says that the rules and the dashboard of `examples/observability` name them. The code of `fleet/metrics.go` has the eight series above, and the example files name no `fw_fleet_*` series. The code wins.

## Export over OTLP

A Prometheus scrape is a request, and a request through the router wakes a Task that sleeps. A worker therefore pushes. The service `Export` of the package `telemetry` starts when a variable names a collector, and no key of `fw.yaml` turns it on:

| Variable | Meaning |
|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | The collector for every signal |
| `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT`, `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT`, `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | The collector of one signal |
| `OTEL_METRIC_EXPORT_INTERVAL` | The push interval of the metrics, 60 seconds by default |
| `OTEL_SERVICE_NAME` | Replaces the service name `fw` |
| `OTEL_RESOURCE_ATTRIBUTES` | Adds attributes to the resource |
| the other `OTEL_EXPORTER_OTLP_*` variables | Headers, the certificate, and the rest, as the OpenTelemetry SDK reads them |

The transport is OTLP over HTTP. The resource carries `service.name`, `service.version`, and `service.instance.id`, which is the `node` of the process, `ax:<atespace>/<task>` in a Task. The three signals:

- The metrics are the series of the registry, pushed as they are through the Prometheus bridge of the SDK, with the same names and labels. The push starts as soon as the metrics surface mounts.
- The logs are the ledger. Every event goes out as one log record: the body is the data of the event, the event name is its type, and the attributes are `fw.run`, `fw.event`, `fw.seq`, `fw.agent`, `fw.node`, and `fw.source`. The record carries the trace id and the span id of the run, so a log store and a trace store meet on the same ids. A failed run and a budget stop are errors, a loop and a suspend are warnings, and the rest is information.
- The traces are the spans of the runs: `fw.run` for a run, a child span per turn, and `chat <model>` and `execute_tool <tool>` under it, with the GenAI attributes of OpenTelemetry.

`fw doctor` prints one line, `telemetry: exports <signals> over OTLP to <endpoint>`, or `telemetry: no OTLP export`. The egress policy of a Task must allow the collector. See [the kernel architecture, section 10.5](../design/kernel-architecture.md#105-export-over-otlp).

## A sleeping Task

A Task that sleeps stops pushing, and nothing scrapes it through the router. Do these things under ax:

1. Do not scrape a Task. Do not list one in a static job, do not point a scrape at the router, and never put the label `fw.dev/scrape` on a Task. Scrapes every 30 seconds keep every Task awake and remove the benefit of suspend.
2. Give every Task `OTEL_EXPORTER_OTLP_ENDPOINT`. A Task pushes while it runs and pushes nothing while it sleeps. A collector that keeps the last value of a gauge shows it as it was.
3. Scrape the collector and the processes that are always on, such as the front.

The series of the front cover the fleet without a request to a Task, so an alert on the queues, the dead letters, and the run ends needs no metric of a Task.

## The example setup

`examples/observability` of the kernel holds a supported setup. Its README tells how to load each file.

| File | What it holds |
|---|---|
| `prometheus.yml` | Two scrape jobs at 30 seconds. `fw` scrapes fixed addresses. `fw-pods` keeps the Kubernetes pods with the label `fw.dev/scrape: "true"` and the container port named `http`, and reads the annotation `fw.dev/metrics-path` for another path. |
| `otel-collector.yaml` | An OpenTelemetry collector that receives OTLP on 4318 (HTTP) and 4317 (gRPC), serves the metrics of every pusher to Prometheus on port 9464 with `service.instance.id` as the label `instance` and an expiration of 15 minutes, and sends the logs and the traces to a log store and a trace store that you name. |
| `alerts.yml` | Eight alert rules: `FwTargetDown`, `FwApprovalWaiting`, `FwRunFailuresRising`, `FwBudgetStops`, `FwLoops`, `FwMCPServerDown`, `FwModelErrorRate`, and `FwModelLatencyHigh`. The thresholds are starting points. |
| `grafana/fw.json` | One dashboard for Grafana 10 or later. It reads the variable `Data source`, and `Agent` filters the panels with an agent label. |

Section 10.1 of the kernel architecture says that `alerts.yml` has ten rules. The file has eight, so the file wins. With the Prometheus Operator, copy the groups into a `PrometheusRule`. `promtool check config prometheus.yml` tests both files. The pods of `fw-front` in `examples/agentgateway` carry the label `fw.dev/scrape: "true"`, and the gateway does not route `/metrics`.

## The lab checks

The installer of Agent Substrate puts a collector, a Prometheus, and a Jaeger in the namespace `otel-system`. The front and every worker of the lab push to `http://opentelemetry-collector.otel-system.svc.cluster.local:4318`, and the egress of each worker allows it. Two scripts of the lab work with that stack.

`e2e/fleet/observe.sh` lets the Prometheus of the stack keep the `fw` series. Its keep rule drops every series that is not `substrate_*` or `otelcol_*`, so the script changes the regex in the ConfigMap `otel-system/prometheus-config` to `(substrate|otelcol|fw)_.*|target_info` and restarts Prometheus when the rule changed. `target_info` carries the version of each pusher. `deploy.sh` runs the script, and it is safe to run twice.

`e2e/fleet/check-export.sh` reads back what the fleet pushed and changes nothing:

1. It prints the lines of the front that say which sources it reads and what it exports.
2. It forwards the port of `svc/prometheus` in `otel-system` and queries `fw_runs_total` by `exported_instance`, `agent`, `outcome`, and `batch`, then `fw_ledger_events_total`, `fw_build_info`, `fw_fleet_queue_pending`, and `fw_fleet_runs_finished_total`.
3. It forwards the port of `svc/jaeger` and lists the services that Jaeger knows.
4. It fails when `fw_runs_total` or `fw_fleet_queue_pending` has no series.

```sh
export KUBECONFIG=~/.kube/k3s.yaml
e2e/fleet/observe.sh
e2e/fleet/check-export.sh
```

The Prometheus of the stack scrapes the collector, so the label of a pusher is `exported_instance`, not `instance`. See [Testing](../operations/testing.md) for the other checks of the lab.

## Sources

- `featherweight-kernel/README.md` (section "Observability")
- `featherweight-kernel/docs/ARCHITECTURE.md` (section 10)
- `featherweight-kernel/surface/metrics/metrics.go`
- `featherweight-kernel/telemetry/metrics.go`
- `featherweight-kernel/telemetry/otlp.go`
- `featherweight-kernel/cli/doctor.go`
- `featherweight-kernel/cmd/fw/driver_metrics.go`
- `featherweight-kernel/examples/fw.yaml`
- `featherweight-kernel/examples/observability/README.md`
- `featherweight-kernel/examples/observability/prometheus.yml`
- `featherweight-kernel/examples/observability/alerts.yml`
- `featherweight-kernel/examples/observability/otel-collector.yaml`
- `featherweight-kernel/examples/observability/grafana/fw.json`
- `featherweight-workbench/docs/ARCHITECTURE.md` (section 4.14)
- `featherweight-workbench/fleet/metrics.go`
- `featherweight-workbench/examples/agentgateway/README.md`
- `featherweight-lab/e2e/fleet/check-export.sh`
- `featherweight-lab/e2e/fleet/observe.sh`
- `featherweight-lab/e2e/fleet/deploy.sh`
- `featherweight-lab/e2e/fleet/fw.yaml`
- `featherweight-lab/e2e/fleet/ax/run.sh`
- `featherweight-lab/e2e/fleet/ax/egress.json`
