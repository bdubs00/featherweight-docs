# Observability

`fw` serves Prometheus metrics at `/metrics`, and it pushes its metrics, its ledger, and its traces to an OpenTelemetry collector when the standard `OTEL_*` variables name one. This page lists the metric families, the measures of task quality, and the rule for their labels. It also covers the series of the front, the export, the example setup of the kernel, and the telemetry stack of Substrate. The ledger, an append-only log of the run, stays the exact record of usage. Prometheus is for trends, errors, and latency, never for billing.

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
| `fw_task_completions_total` | counter | `execution`, `grader_judgment` |
| `fw_task_verifications_total` | counter | `result` |
| `fw_operator_interventions_total` | counter | `kind` |
| `fw_operator_interventions_per_run` | histogram | `coverage` |
| `fw_recovery_duration_seconds` | histogram | `result` |
| `fw_confirmed_duplicate_effects_total` | counter | none |
| `fw_ambiguous_tool_retries_total` | counter | none |
| `fw_successful_task_cost_usd` | histogram | `basis` |
| `fw_successful_task_cost_excluded_total` | counter | `reason` |
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
| `fw_storage_blocked` | gauge | none |

`fw_storage_blocked` is 1 after a storage failure stopped the process, and 0 otherwise. A storage failure is a failed append, flush, or read of the ledger. The gauge stays 1 until the process restarts, because the process then writes nothing and runs nothing. The metrics read it from `Agent.RuntimeError` at each scrape and at each OTLP push, so the gauge needs no event. See [The ledger](../concepts/ledger.md#fail-stop-on-a-storage-failure).

The table of section 10.1 of the kernel architecture lists `fw_runs_total` with `agent` and `outcome` alone. The code adds `batch`, the job of the run from the metadata `fw.batch`, so the code wins. `fw_model_cost_usd_total` counts priced tokens only. Set the prices per million tokens under `prices` in `fw.yaml`, with a price of zero for a local model, and the tokens of a model without a price go to `fw_model_unpriced_tokens_total`. The model latency histogram has buckets up to 900 seconds.

## Task quality and recovery

A run that completed is not a task that someone verified. Nine series of `telemetry/quality.go` keep execution, model grading, and trusted verification apart. They also count the actions of operators, the time of a recovery, duplicate effects, and the cost of a successful task. Their unit is a completion episode, the own work of a run up to one `fw.run.finished`. A follow-up starts another episode of the same run, and the copied history of a branch counts for nothing. The series also go out over OTLP, and their labels come from fixed lists only.

| Metric | Type | Labels | What it counts |
|---|---|---|---|
| `fw_task_completions_total` | counter | `execution` (`completed`, `failed`, `canceled`), `grader_judgment` | Each completion episode, also a failed or canceled one. `grader_judgment` is the latest verdict of an outcome grader (`satisfied`, `needs_revision`, `max_iterations`, `unparsed`, `skipped`, `unknown`), or `unverified` without one |
| `fw_task_verifications_total` | counter | `result` (`accepted`, `satisfied`, `rejected`, `unknown`) | Each final receipt of a trusted integration for a completed episode |
| `fw_operator_interventions_total` | counter | `kind` (`decision`, `followup`, `budget_change`) | Each concrete action of an operator that the ledger records |
| `fw_operator_interventions_per_run` | histogram | `coverage` (`complete`, `partial`) | The actions in each completion episode, zero included. `partial` means that the observer did not see the whole history of the run |
| `fw_recovery_duration_seconds` | histogram | `result` (`progress`, `input_required`, `completed`, `failed`, `canceled`, `interrupted`) | The time from `fw.run.resumed` of a run that was queued or running to its first progress: a model response, a tool response, or tool progress. The clock also stops at an approval request, the end, or the next stop of the run |
| `fw_confirmed_duplicate_effects_total` | counter | none | The additional external effects that a trusted integration confirmed |
| `fw_ambiguous_tool_retries_total` | counter | none | Each new request for a tool call id that is still open, such as a rerun after a resume |
| `fw_successful_task_cost_usd` | histogram | `basis` (`accepted`, `satisfied`) | The own model cost of an episode with a final `accepted` or `satisfied` receipt and complete, priced usage |
| `fw_successful_task_cost_excluded_total` | counter | `reason` (`missing_usage`, `unpriced_tokens`) | The `accepted` and `satisfied` receipts that the cost histogram leaves out |

An intervention of the kind `decision` is an approval decision whose decider is neither the kernel nor the parent run. A decision on a run that the kernel started itself, such as a grader run, does not count. A `followup` is a user message from the origin `http`, `cli`, or `mcp`. A `budget_change` is a change of the budget by a named person from one of those origins. These are actions that the runtime recorded, not proof that a person sat at the keyboard.

A recovery that a crash cut ends at the last event of the old attempt, so the time leaves out the downtime of the process. The histogram therefore does not measure the whole outage. A run that waited for input at the interruption, with a pending approval, waits for a person before and after the restart. It gets no sample, and its next suspend or resume adds none either. The result `input_required` means that the run reached a question for a person. The time that a person takes to decide therefore never counts.

### Receipts from an integration

A trusted integration reports what it checked through `Agent.ObserveQuality` (`fw/quality.go`). The receipt `fw.QualityObservation` holds a stable `ID` of at most 128 bytes, a `Completion`, a `Verification`, and `DuplicateEffects`. `Completion` is the sequence number of an own `fw.run.finished` with the outcome `completed`. `accepted` means that a person accepted the result, and `satisfied` means that an external verifier checked it. A receipt with effects alone has no completion and no verification, and it can arrive at any time.

The kernel records the receipt as `fw.run.annotated`, with a cost snapshot that it computes from the ledger. A retry with the same id and the same content writes nothing, also after a restart. A conflicting receipt, or a second final verification of one completion, is refused. The call needs the operator role on the run when the context carries a principal, and no model tool makes it. Send the receipt after the cost annotations of the episode, because the receipt freezes its cost snapshot.

Model grading never counts as verification, and a retry never counts as a duplicate effect. A grader verdict of `satisfied` stays in the label `grader_judgment` of the completions. A repeated tool request goes to `fw_ambiguous_tool_retries_total`, because it proves another attempt, not another effect. Only a receipt raises `fw_task_verifications_total` and `fw_confirmed_duplicate_effects_total`. A completion without a receipt stays unverified, and a receipt of `unknown` is no success. See [the kernel architecture, section 10.1](../design/kernel-architecture.md#task-quality-and-recovery).

## The rule for labels

No label holds a person, a run id, a prompt, a path, or a URL. Tests of the kernel feed a principal, a run id, and secret text into the events and make sure that no label holds them. A label holds a name that the configuration bounds, or a value from a fixed list:

- `agent`: the profiles of `fw.yaml` and the profiles that authorized people create.
- `tool`: the tools that the kernel resolved. A tool name that the model invents becomes `unknown`.
- `server`: the MCP servers under `tools.mcp`.
- `provider` and `model`: the models of the configuration keep their names, and at most 32 other pairs do. Each pair after that, and a name longer than 128 bytes, gets `other`.
- `driver`: the bus and ledger drivers.
- `batch`: the name of a job, which `enqueue` of the workbench sets. A run of no job has an empty value.

`outcome`, `origin`, `limit`, `kind`, `decision`, `action`, `direction`, and `type` come from fixed lists. So do the labels of the task-quality series: `execution`, `grader_judgment`, `result`, `coverage`, `basis`, and `reason`. An origin or a limit that this version does not know becomes `other`.

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
| `fw_fleet_members_blocked` | gauge | none |

`queue` is `<workbench.fleet.intake>.<agent>`, and `member` is `<atespace>/<task>` for a Task. Each run counter keeps at most 1024 pairs of agent and member, and the pairs past that bound count under `other`. The run counters count the ends that the front saw since it started. Every replica sees the whole stream, so take the maximum over the replicas, not the sum. `fw_fleet_approvals_pending` counts the runs of other members only.

`fw_fleet_members_blocked` counts the members whose status said `blocked` when the suspend controller read it. A member counts until its next event. Only a replica that read the status marks the member, so take the maximum over the replicas. The front suspends such a Task, and the next request restarts it (see [The fleet](../concepts/fleet.md#idle-and-the-suspend-controller)).

[Section 4.14 of the workbench architecture](../design/workbench-architecture.md#414-metrics-and-alerts) has five example alert rules: `FwFleetRunFailuresRising`, `FwFleetQueueDeep`, `FwFleetApprovalWaiting`, `FwFleetMemberBlocked`, and `FwFleetDeadLetter`. Load them beside the rules of the kernel. `FwFleetMemberBlocked` fires when `max(fw_fleet_members_blocked) > 0`, with the severity `warning`.

Section 10.1 of the kernel architecture names the fleet gauges `fw_fleet_member_up`, `fw_fleet_member_last_seen_timestamp_seconds`, and `fw_fleet_runs`. It says that the rules and the dashboard of `examples/observability` name them. The code of `fleet/metrics.go` has the nine series above, and the example files name no `fw_fleet_*` series. The code wins.

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

A span names its run in `gen_ai.conversation.id`, and the run span also in `fw.run.id`. No span attribute holds a person, the id of another run, or free text of an integration. These attributes name who acted as a kind only (`telemetry/trace.go` and `telemetry/quality_trace.go`):

| Attribute | Where | Value |
|---|---|---|
| `fw.approval.decider_kind` | event `fw.approval.decided` | `person`, `parent`, `token`, `workload`, `local`, `kernel`, or `none` |
| `fw.budget.by_kind` | event `fw.budget.changed` | the same kinds |
| `fw.outcome.graded` | event `fw.outcome.evaluated` | true when a grader run started. The id of the grader run stays in the ledger |
| `fw.quality.receipt_sha256` | event `fw.run.annotated` and span `fw.quality.observation` | the SHA-256 of the receipt id in hex, so a trace store matches one receipt without its id |

The kind comes from the shape of the subject. A SPIFFE URI is a `workload`, a run id is a `parent`, and the static token is a `token`. `local` is the local user or `fw run`, and any other subject is a `person`. The ledger keeps the subject itself. These names replace `fw.approval.decider`, `fw.budget.by`, `fw.outcome.grader`, and `fw.quality.receipt`. The span `fw.quality.observation` names its run in `gen_ai.conversation.id`, in place of `fw.run.id`.

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
| `alerts.yml` | Fifteen alert rules in two groups. The group `fw-task-quality` holds `FwVerifiedCompletionRateLow`, `FwOperatorInterventionsHigh`, `FwRecoverySlow`, `FwConfirmedDuplicateEffects`, `FwSuccessfulTaskCostUnknown`, and `FwSuccessfulTaskCostHigh`. The group `fw` holds `FwStorageBlocked`, `FwTargetDown`, `FwApprovalWaiting`, `FwRunFailuresRising`, `FwBudgetStops`, `FwLoops`, `FwMCPServerDown`, `FwModelErrorRate`, and `FwModelLatencyHigh`. The thresholds are starting points. |
| `grafana/fw.json` | One dashboard for Grafana 10 or later. It reads the variable `Data source`, and `Agent` filters the panels with an agent label. The row of task quality covers every agent and ignores `Agent`. Its seven panels show the verified completion ratio, the completions and the receipts, the interventions per episode, and the recovery p95 by result. They also show the confirmed duplicates beside the ambiguous retries, the own cost per successful task, and the cost coverage. |
| `quality/main.go` | A receipt example that needs no model provider and no external service: `go run ./examples/observability/quality`. A faulty delivery tool commits two rows. The integration counts the rows and reports one `satisfied` completion with one confirmed duplicate effect, twice, and the metrics count it once. |

`FwStorageBlocked` fires when `fw_storage_blocked` is 1 for one minute, with the severity `critical`. Its description tells the operator to repair the storage, such as a full disk, and to restart the process.

The README of the directory has a section on the five task-quality measures, with the PromQL queries of each measure and the receipt API. `config_test.go` makes sure that the dashboard and the alert rules parse. With the Prometheus Operator, copy the groups into a `PrometheusRule`. `promtool check config prometheus.yml` tests both files. The pods of `fw-front` in `examples/agentgateway` carry the label `fw.dev/scrape: "true"`, and the gateway does not route `/metrics`.

## The stack of Substrate

The installer of Agent Substrate puts a collector, a Prometheus, and a Jaeger in the namespace `otel-system`. A fleet on Substrate can push to `http://opentelemetry-collector.otel-system.svc.cluster.local:4318`, if the egress of each worker allows it. Two facts of that stack matter.

The Prometheus of the stack keeps the series `substrate_*` and `otelcol_*` only. To keep the `fw_*` series and `target_info`, change the keep rule in the ConfigMap `otel-system/prometheus-config` to `(substrate|otelcol|fw)_.*|target_info` and restart Prometheus. `target_info` carries the version of each pusher.

The Prometheus of the stack scrapes the collector, so the label of a pusher is `exported_instance`, not `instance`. To make sure that the export works, forward the port of `svc/prometheus` in `otel-system` and query `fw_runs_total` and `fw_fleet_queue_pending`. Then forward the port of `svc/jaeger` and list the services that Jaeger knows.

## Sources

- `featherweight-kernel/README.md` (section "Observability")
- `featherweight-kernel/docs/ARCHITECTURE.md` (section 10)
- `featherweight-kernel/surface/metrics/metrics.go`
- `featherweight-kernel/telemetry/metrics.go`
- `featherweight-kernel/telemetry/quality.go`
- `featherweight-kernel/telemetry/quality_trace.go`
- `featherweight-kernel/telemetry/trace.go`
- `featherweight-kernel/fw/quality.go`
- `featherweight-kernel/telemetry/otlp.go`
- `featherweight-kernel/cli/doctor.go`
- `featherweight-kernel/cmd/fw/driver_metrics.go`
- `featherweight-kernel/examples/fw.yaml`
- `featherweight-kernel/examples/observability/README.md`
- `featherweight-kernel/examples/observability/prometheus.yml`
- `featherweight-kernel/examples/observability/alerts.yml`
- `featherweight-kernel/examples/observability/otel-collector.yaml`
- `featherweight-kernel/examples/observability/grafana/fw.json`
- `featherweight-kernel/examples/observability/quality/main.go`
- `featherweight-kernel/examples/observability/config_test.go`
- `featherweight-workbench/docs/ARCHITECTURE.md` (section 4.14)
- `featherweight-workbench/fleet/metrics.go`
- `featherweight-workbench/fleet/suspend.go`
- `featherweight-workbench/examples/agentgateway/README.md`
