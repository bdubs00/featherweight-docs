---
wide: true
---

# Observability

Every Featherweight process counts its runs, model calls, tool calls, and decisions as Prometheus metrics. It can also push them to an OpenTelemetry collector, with its events and its traces. This page says what to scrape, what to push, and what each series means. The ledger of a run stays the exact record of usage: the metrics are for trends, errors, and latency, never for billing.

## Scrape the front, push from the workers

A sleeping Task costs nothing, and a request through the router wakes it. A scrape is a request. The front, the workbench in front of the workers, is always on. So a fleet follows three rules:

1. Never scrape a Task. Do not list one in a static job, do not point a scrape at the router, and never put the label `fw.dev/scrape` on a Task. A scrape every 30 seconds keeps every Task awake.
2. Give every Task `OTEL_EXPORTER_OTLP_ENDPOINT`. A Task pushes while it runs and pushes nothing while it sleeps.
3. Scrape the collector and the processes that are always on, such as the front. The pods of `fw-front` in `examples/agentgateway` carry the label `fw.dev/scrape: "true"`.

The series of the front cover the fleet without a request to a Task. An alert on the queues, the dead letters, and the ends of runs therefore needs no metric of a Task.

## The metrics endpoint

The surface `metrics` serves the registry of one process at `/metrics`, on the same listener as its API. It is on by default: `surfaces: [native, a2a, metrics]`. The key `telemetry.metrics`, or `FW_TELEMETRY_METRICS`, moves the route, and the value must start with `/`.

The route carries no authentication, because a scraper has no token. Keep it inside the monitoring perimeter: the gateway of `examples/agentgateway` does not route it. A `lean` build needs the tag `metrics` for the endpoint and for the push of the metrics. See [Build and images](images.md#choose-the-drivers-of-a-worker).

No label holds a person, a run id, a prompt, a path, or a URL. A label holds a value from a fixed list, or a name that the configuration bounds. Examples of such names are `agent`, `tool`, `server`, `provider`, and `model`. A tool name that a model invents becomes `unknown`. Past 32 model pairs that the configuration does not name, a pair becomes `other`.

## The series of the kernel

| Metric | Type | Labels |
|---|---|---|
| `fw_runs_total` | counter | `agent`, `outcome`, `batch` |
| `fw_runs_queued_total` | counter | `agent`, `origin` (`http`, `a2a`, `mcp`, `bus`, `cli`, `tool`, `other`), `batch` |
| `fw_runs_active` | gauge | `agent` |
| `fw_run_duration_seconds`, `fw_run_turns` | histogram | `agent` |
| `fw_budget_exceeded_total` | counter | `agent`, `limit` (`maxTurns`, `maxTokens`, `maxCostUSD`, `maxToolCalls`, `deadline`, `maxRepeats`, `other`) |
| `fw_loops_total` | counter | `agent`, `action` (`warned`, `failed`) |
| `fw_model_requests_total` | counter | `provider`, `model`, `outcome` (`ok`, `error`, `canceled`) |
| `fw_model_request_duration_seconds` | histogram | `provider`, `model`, with buckets up to 900 seconds |
| `fw_model_tokens_total` | counter | `provider`, `model`, `kind` (`input`, `output`, `cache_read`, `cache_write`) |
| `fw_model_cost_usd_total` | counter | `provider`, `model`, priced tokens only |
| `fw_model_unpriced_tokens_total` | counter | `provider`, `model` |
| `fw_tool_calls_total` | counter | `tool`, `outcome` (`ok`, `error`, `denied`) |
| `fw_tool_call_duration_seconds` | histogram | `tool` |
| `fw_mcp_server_up` | gauge | `server` |
| `fw_approvals_pending`, `fw_approvals_oldest_timestamp_seconds` | gauge | `agent` |
| `fw_approvals_total` | counter | `decision` |
| `fw_bus_messages_total` | counter | `driver`, `direction` (`in`, `out`) |
| `fw_ledger_events_total` | counter | `type` |
| `fw_ledger_append_duration_seconds` | histogram | `driver` |
| `fw_storage_blocked` | gauge | none: 1 after a storage failure stopped the process |
| `fw_build_info` | gauge | `version`, `commit`, `go` |

`batch` is the batch name of a run, from the metadata `fw.batch` that the tool `enqueue` sets. Set the prices of each model per million tokens under `prices` in `fw.yaml`, with a price of zero for a local model. The tokens of a model without a price go to `fw_model_unpriced_tokens_total`. `fw_storage_blocked` stays 1 until the process restarts, because a blocked process writes nothing and runs nothing. See [The ledger](../concepts/ledger.md#fail-stop-on-a-storage-failure).

## Task quality and recovery

A run that completed is not a task that someone checked. Nine series keep execution, model grading, and trusted verification apart. Their unit is a completion episode: the own work of a run up to one `fw.run.finished`.

| Metric | Type | Labels | What it counts |
|---|---|---|---|
| `fw_task_completions_total` | counter | `execution`, `grader_judgment` | Each completion episode, also a failed or canceled one. `grader_judgment` is the verdict of an outcome grader, or `unverified`. |
| `fw_task_verifications_total` | counter | `result` (`accepted`, `satisfied`, `rejected`, `unknown`) | Each final receipt of a trusted integration |
| `fw_operator_interventions_total` | counter | `kind` (`decision`, `followup`, `budget_change`) | Each action of an operator that the ledger records |
| `fw_operator_interventions_per_run` | histogram | `coverage` (`complete`, `partial`) | The actions in each episode, zero included |
| `fw_recovery_duration_seconds` | histogram | `result` | The time from `fw.run.resumed` to the first progress of the run |
| `fw_confirmed_duplicate_effects_total` | counter | none | Extra external effects that an integration reported |
| `fw_ambiguous_tool_retries_total` | counter | none | A new request for a tool call that is still open, such as a rerun after a resume |
| `fw_successful_task_cost_usd` | histogram | `basis` (`accepted`, `satisfied`) | The model cost of an episode with a final good receipt |
| `fw_successful_task_cost_excluded_total` | counter | `reason` (`missing_usage`, `unpriced_tokens`) | The good receipts that the cost histogram leaves out |

Model grading never counts as verification, and a retry never counts as a duplicate effect. Only a receipt of an integration raises `fw_task_verifications_total` and `fw_confirmed_duplicate_effects_total`. The time that a person takes to decide never counts as recovery.

??? note "Under the hood: receipts"
    A trusted integration reports what it checked through `Agent.ObserveQuality` (`fw/quality.go`). The receipt holds a stable id, the sequence number of a completed `fw.run.finished`, a verification, and the count of duplicate effects. The kernel records it as `fw.run.annotated` with a cost snapshot. A retry with the same id and content writes nothing. The call needs the operator role on the run, and no model tool makes it. `go run ./examples/observability/quality` shows one end to end, with no model and no service. See [section 10.1 of the kernel architecture](../design/kernel-architecture.md#101-metrics).

## The series of the front

The front adds the series of the fleet to its registry. It reads what it already holds at scrape time: the last read of the queues, the dead letters, and the view of the egress stream. A scrape therefore sends no request to a Task or to the bus.

| Metric | Type | Labels |
|---|---|---|
| `fw_fleet_queue_pending`, `fw_fleet_queue_ack_pending` | gauge | `queue` |
| `fw_fleet_dead_letters_total` | counter | `queue` |
| `fw_fleet_dead_letter_last_timestamp_seconds` | gauge | `queue` |
| `fw_fleet_runs_finished_total` | counter | `agent`, `member`, `outcome` (`completed`, `failed`, `canceled`, `other`) |
| `fw_fleet_runs_budget_exceeded_total` | counter | `agent`, `member`, `limit` |
| `fw_fleet_approvals_pending`, `fw_fleet_approvals_oldest_timestamp_seconds` | gauge | `agent` |
| `fw_fleet_members_blocked` | gauge | none |
| `fw_bossmode_streams_open` | gauge | none |
| `fw_bossmode_streams_refused_total` | counter | none |

`queue` is a job queue such as `fw.jobs.triage`, and `member` is `<atespace>/<task>`. Each run counter keeps at most 1024 pairs of agent and member. Every replica of the front sees the whole stream, so take the maximum over the replicas, not the sum. `fw_fleet_approvals_pending` counts the runs of other members only. `fw_fleet_members_blocked` counts the members whose last status read said `blocked`.

[Section 4.14 of the workbench architecture](../design/workbench-architecture.md#414-metrics-and-alerts) has five example alert rules for the front: `FwFleetRunFailuresRising`, `FwFleetQueueDeep`, `FwFleetApprovalWaiting`, `FwFleetMemberBlocked`, and `FwFleetDeadLetter`.

## Export over OTLP

A variable turns the export on. No key of `fw.yaml` does.

| Variable | Meaning |
|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | The collector for every signal |
| `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT`, `..._LOGS_ENDPOINT`, `..._TRACES_ENDPOINT` | The collector of one signal |
| `OTEL_METRIC_EXPORT_INTERVAL` | The push interval of the metrics, 60 seconds by default |
| `OTEL_SERVICE_NAME`, `OTEL_RESOURCE_ATTRIBUTES` | The service name, `fw` by default, and more attributes |

The transport is OTLP over HTTP. The resource carries `service.instance.id`, which is the `node` of the process, `ax:<atespace>/<task>` in a Task. The three signals:

- The metrics are the series of the registry, with the same names and labels.
- The logs are the ledger. Each event is one log record, and its event name is its type. Its attributes are `fw.run`, `fw.event`, `fw.seq`, `fw.agent`, `fw.node`, and `fw.source`.
- The traces are the spans of the runs: `fw.run`, a child span per turn, and `chat <model>` and `execute_tool <tool>` under it, with the GenAI attributes of OpenTelemetry.

A log record carries the trace id and the span id of its run. A log store and a trace store therefore meet on the same ids. No span attribute holds a person: `fw.approval.decider_kind` and `fw.budget.by_kind` name only a kind, such as `person`, `token`, or `workload`. `fw doctor` prints `telemetry: exports <signals> over OTLP to <endpoint>`, or `telemetry: no OTLP export`. The egress of a Task must allow the collector.

## The example setup

`examples/observability` of the kernel holds a supported setup, and its README tells how to load each file.

| File | What it holds |
|---|---|
| `prometheus.yml` | Two scrape jobs at 30 seconds: `fw` for fixed addresses, and `fw-pods` for the pods with the label `fw.dev/scrape: "true"` |
| `otel-collector.yaml` | A collector that takes OTLP on 4318 (HTTP) and 4317 (gRPC) and serves the metrics of every pusher to Prometheus on 9464 |
| `alerts.yml` | Fifteen alert rules in the groups `fw` and `fw-task-quality`, such as `FwStorageBlocked`, `FwApprovalWaiting`, and `FwModelErrorRate` |
| `grafana/fw.json` | One dashboard for Grafana 10 or later, with a row of task quality |
| `quality/main.go` | A receipt example that needs no model and no service |

The installer of Agent Substrate puts a collector, a Prometheus, and a Jaeger in the namespace `otel-system`. A fleet can push to `http://opentelemetry-collector.otel-system.svc.cluster.local:4318`. That Prometheus keeps only the series `substrate_*` and `otelcol_*`. To keep the `fw_*` series, change its keep rule in the ConfigMap `otel-system/prometheus-config` to `(substrate|otelcol|fw)_.*|target_info` and restart it. It scrapes the collector, so the label of a pusher is `exported_instance`.

Section 10.1 of the kernel architecture disagrees with the code in two places. It lists `fw_runs_total` without `batch`. It also names the gauges `fw_fleet_member_up`, `fw_fleet_member_last_seen_timestamp_seconds`, and `fw_fleet_runs`, which no code serves. The tables above follow the code.

## Where to go next

<div class="paths" markdown>

- [Debugging a Task <span>Procedures for a run or a Task that misbehaves</span>](../operations/debugging.md)
- [The fleet <span>The suspend controller and the queues that the series count</span>](../concepts/fleet.md)

</div>

## Sources

- `featherweight-kernel/README.md`, section "Observability"
- `featherweight-kernel/docs/ARCHITECTURE.md`, section 10
- `featherweight-kernel/surface/metrics/metrics.go`
- `featherweight-kernel/telemetry/metrics.go`
- `featherweight-kernel/telemetry/quality.go`
- `featherweight-kernel/telemetry/trace.go`
- `featherweight-kernel/telemetry/otlp.go`
- `featherweight-kernel/fw/quality.go`
- `featherweight-kernel/cli/doctor.go`
- `featherweight-kernel/examples/fw.yaml`
- `featherweight-kernel/examples/observability/README.md`
- `featherweight-kernel/examples/observability/prometheus.yml`
- `featherweight-kernel/examples/observability/alerts.yml`
- `featherweight-kernel/examples/observability/otel-collector.yaml`
- `featherweight-workbench/docs/ARCHITECTURE.md`, sections 4.14 and 17.6
- `featherweight-workbench/fleet/metrics.go`
- `featherweight-workbench/bossmode/metrics.go`
- `featherweight-workbench/examples/agentgateway/README.md`
