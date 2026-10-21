# Testing

The lab holds the tests of Featherweight: two end-to-end loops, a set of fleet checks, and a ticket soak. The loops drive one kernel with a real model over the native HTTP API. The fleet checks drive the front and its workers on the homelab cluster through agentgateway. The soak runs the fleet as a helpdesk for hours. This page says how to run each one, what each one reads, and where the results land. The cluster itself is on [The homelab cluster](homelab.md).

## The two loops

The end-to-end tests live in `featherweight-lab/e2e`. They use the native API only ([HTTP API](../reference/http-api.md)), so the same tests run against a local `fw serve` and against an fw Task under AX. The tests carry the build tag `e2e`, so a plain `go test ./...` never calls a real model, and `make vet` compiles them without a server. The scripts build from the checkouts next to the lab, `../featherweight-kernel` and `../featherweight-workbench`. `E2E_KERNEL_DIR` and `E2E_WORKBENCH_DIR` point them elsewhere.

```sh
make vet                                  # compile the tests without a server
make e2e                                  # the local loop once
make e2e-k3s                              # the k3s loop once
e2e/loop.sh local -run TestScenarios/bash # one scenario
e2e/loop.sh k3s -watch                    # again after each change, Ctrl-C stops it
```

`e2e/loop.sh` runs one loop once, or again after each change with `-watch`. In watch mode it reads the files that git tracks or does not ignore, in the lab and in the kernel checkout, every two seconds. After each run it prints one line with the count of passed scenarios and the results directory. Its exit status is the status of the tests.

## The local loop

`e2e/local.sh` builds `bin/fw` from the kernel checkout and copies `e2e/fw.yaml` and `e2e/skills` into a temporary `FW_HOME`. It serves `fw` on a free port of `127.0.0.1`, waits for `/readyz`, runs the tests, and stops the server. The workspace of the files tool sits next to `FW_HOME`, not inside it. An `anthropic/*` model needs `ANTHROPIC_API_KEY` and no base URL. Any other model needs `E2E_BASE_URL`.

To run it the first time:

1. Start an OpenAI-compatible model server, for example vLLM, Ollama, or tabbyAPI.
2. Write `E2E_MODEL`, `E2E_BASE_URL`, and a key source into `e2e/local.env`.
3. Run `make e2e`.

| Variable | What | Default |
|---|---|---|
| `E2E_MODEL` | The model selector, for example `openai/qwen3-32b` or `anthropic/claude-haiku-5-5` | required |
| `E2E_BASE_URL` | The base URL of the model server, ending in `/v1` | required for an `openai` model |
| `OPENAI_API_KEY` | The key of the model server | none |
| `E2E_API_KEY_CMD` | A command that prints the key. The loop runs it without `OPENAI_API_KEY`. | none |
| `ANTHROPIC_API_KEY` | The key of the Claude API, for an `anthropic` model | none |
| `E2E_ANTHROPIC_API_KEY_CMD` | A command that prints that key. The loop runs it without `ANTHROPIC_API_KEY`. | none |
| `E2E_RUN` | A `-run` pattern for `go test` | every test |
| `E2E_RESULTS` | The results directory | `e2e/results/<timestamp>` |
| `E2E_TIMEOUT` | The time limit of one scenario | `10m` |
| `E2E_KEEP_HOME` | `1` keeps the temporary `FW_HOME` after the run | removed |
| `E2E_KERNEL_DIR` | The kernel checkout that the loop builds | `../featherweight-kernel` |
| `GO` | The Go command | `go` |

The loop never prints a key. The server reads it from the environment, and `fw` keeps it out of the ledger and the log.

## The k3s loop

`e2e/k3s/run.sh` runs the same tests against `fw` as an AX Task on the homelab cluster. The cluster must exist first: `make e2e-k3s-install` runs the installer of [The homelab cluster](homelab.md#the-install-steps). The loop then does these steps:

1. Builds the image from `Dockerfile.toolbox` of the kernel, pushes it to the node registry, and records its digest in `e2e/results/.k3s-image`.
2. Renders `e2e/k3s/task.yaml` with `e2e/fw.yaml` and `e2e/skills` as Workspace files under `/workspace/.fw`.
3. Deletes the old Task `fw-e2e`, applies the new one, and waits for its actor.
4. Creates the egress policy of the actor from `e2e/k3s/egress.yaml`, which allows HTTP to the model Service only and injects the key.
5. Forwards a port to `svc/atenet-router` in `ate-system` and waits for `/readyz` through it, up to `E2E_READY_TIMEOUT` seconds.
6. Runs `go test` with `FW_E2E_HEADERS=ate-target-actor=default/fw-e2e`.
7. Suspends the Task with `ax suspend`, wakes it with a request through the router, and makes sure that every run is still in the ledger.

After the run, the Task sleeps until a request wakes it. A new image needs a new actor, so the next run replaces the Task. The model server stays on the workstation, and the egress gateway puts the key into each request, so the sandbox never holds it.

| Variable | What | Default |
|---|---|---|
| `E2E_MODEL` | The model selector | required |
| `KUBECONFIG` | The kubeconfig of the cluster | `~/.kube/k3s.yaml` for `install.sh` |
| `E2E_KUBE_CONTEXT` | The kubeconfig context | `k3s` for `install.sh`, the current context for `run.sh` |
| `E2E_REGISTRY` | The push address of the node registry on the workstation | `localhost:5001` |
| `E2E_ATESPACE`, `E2E_TASK` | The atespace of the Task and its name | `default`, `fw-e2e` |
| `E2E_CLUSTER_BASE_URL` | The model URL inside the cluster | `http://model.fw-e2e.svc.cluster.local:5000/v1` |
| `E2E_READY_TIMEOUT` | Seconds to wait for the Task | `600` |
| `E2E_SKIP_BUILD` | `1` reuses the image of the last run | build |
| `E2E_SKIP_RESUME` | `1` skips the suspend and resume step | run it |
| `E2E_RUN`, `E2E_TIMEOUT` | As in the local loop | every test, `10m` |
| `E2E_RESULTS` | The results directory | `e2e/results/k3s-<timestamp>` |
| `E2E_KERNEL_DIR` | The kernel checkout whose `Dockerfile.toolbox` the loop builds | `../featherweight-kernel` |
| `E2E_NODE_SSH`, `E2E_NODE_SSH_KEY` | `user@host` of the node and its SSH key, for `install.sh` | required by `node`, `kubeconfig`, `tunnel` |
| `E2E_MODEL_ADDR` | `host:port` of the model server on the workstation, for `install.sh` | `127.0.0.1:5000` |
| `E2E_TUNNEL_HOST`, `E2E_TUNNEL_PORT` | The node address of the tunnel, for `install.sh` | `10.42.0.1`, `15000` |
| `E2E_REGISTRY_PORT` | The node port of the registry, for `install.sh` | `5000` |
| `E2E_SUBSTRATE_VERSION`, `E2E_AX_REF` | The Substrate tag or commit and the AX commit that `install.sh` builds | `f6a1dc7`, `8888435` |
| `E2E_SRC`, `E2E_BIN` | Where `install.sh` puts the sources and the tools | `~/.cache/fw-e2e/src`, `~/.local/bin` |

The e2e README gives `e2e/results/<timestamp>` as the default results directory of both loops. `e2e/loop.sh` names the directory `e2e/results/<local or k3s>-<timestamp>`, and `run.sh` alone uses the prefix `k3s-`. The scripts win.

## The scenario format

A scenario is one YAML file under `e2e/scenarios`, and the tests run them in file name order. A scenario gives the agent a small task and checks the end of the run: the state, the output, the tools that the model called, and the events in the ledger. An unknown key is an error, so a typo does not pass in silence. This is `07-approval-allow.yaml` of the lab:

```yaml
# A policy ask rule stops a bash call for an approval. The test allows it.
name: approval-allow
input: >-
  Use the bash tool to run exactly this command: echo APPROVE-ME-6612. Then reply
  with the output of the command and nothing else.
profile:
  policy:
    ask: ["bash: echo APPROVE*"]
approve: allow
budget:
  maxTurns: 5
expect:
  output:
    contains: [APPROVE-ME-6612]
  tools: [bash]
  events: [fw.approval.requested, fw.approval.decided]
```

| Key | Meaning |
|---|---|
| `name` | Unique. The name of the subtest. |
| `input` | The input of the run. |
| `agent` | The profile. Empty is the default profile. |
| `instructions` | Text for this run alone. |
| `profile` | An inline profile in the shape of the native API, for example a `policy` block. |
| `budget` | The budget of the run in the shape of the native API. |
| `approve` | `allow` or `deny` for every approval. Empty fails the scenario at an approval. |
| `expect.state` | The end state. The default is `completed`. |
| `expect.output.contains` | Words that the output holds, case-insensitive. |
| `expect.output.matches` | A Go regular expression on the output. |
| `expect.tools` | Tools that the model called at least once. |
| `expect.notTools` | Globs that no call matches. `"*"` forbids every tool. |
| `expect.events` | Event types that appear in the ledger. |
| `expect.maxTurns` | The most turns. |

Ask the model for a fixed word in its answer, such as `PINEAPPLE` or `PRODUCT=1591`, and check for that word. A fixed word is a stable check for a small model, and a check on free text is not. The eight scenarios of the lab cover a plain answer, `bash`, `files`, `memory`, `spawn_task`, and a skill. Two more cover an approval that is allowed and one that is denied.

## The tests

`TestSurfaces` checks that each surface answers: `/healthz`, `/readyz`, the A2A agent card, `GET /v1/tools`, `GET /v1/skills`, and `/metrics`. With `FW_E2E_MCP=1` it also sends an MCP `tools/list`. Only fw-workbench serves MCP, and both loops test the kernel, so the loops leave it off.

`TestScenarios` runs the scenarios one at a time, because a local model server takes few requests at once. For each scenario it starts a run with `POST /v1/runs` and polls `GET /v1/runs/{id}`. No request is held open for the whole run, so a port-forward or a router between the test and `fw` does not cut it. When the run reaches `input-required` with a pending approval, the test answers with `POST /v1/runs/{id}/approvals/{approval}` and the `approve` value. At the end it reads the ledger with `GET /v1/runs/{id}/events` and checks the expectation.

| Variable | What | Default |
|---|---|---|
| `FW_E2E_URL` | The base URL of `fw`. Without it, every test skips. | none |
| `FW_E2E_TOKEN` | A bearer token for `fw` | none |
| `FW_E2E_HEADERS` | Extra headers on every request, as `name=value` pairs with commas | none |
| `FW_E2E_TIMEOUT` | The time limit of one scenario | `10m` |
| `FW_E2E_REPORT` | A path for a JSON report of every scenario | none |
| `FW_E2E_MCP` | `1` also checks the MCP server of a workbench | off |

To run the tests against a server that already runs:

```sh
FW_E2E_URL=http://127.0.0.1:8080 go test -tags e2e ./e2e -v -count=1
```

## Where the results land

Each run of a loop writes one directory under `e2e/results/`. Git ignores the directory, and it holds secrets, so never print its files on a channel that others read.

| Loop | Directory | Files |
|---|---|---|
| local | `e2e/results/local-<timestamp>` | `server.log`, `test.log`, `report.json`, and the ledgers under `runs/` |
| k3s | `e2e/results/k3s-<timestamp>` | `build.log`, `apply.log`, the rendered `task.yaml` and `egress.yaml`, `task.describe` from `ax describe task`, `actor.log` from `kubectl-ate logs actors`, `port-forward.log`, `test.log`, and `report.json` |
| soak | `e2e/results/tickets-<timestamp>` | `RESULTS.md`, `state.json`, and `timeline.txt` |
| fleet scripts | `e2e/results/` and `e2e/fleet/ax/results/` | The rendered manifests of each member, the digests in `.fleet-images`, and `front-config.yaml` |

`report.json` has one entry per scenario. An entry holds `name`, `pass`, `runId`, `state`, `turns`, `toolCalls`, and `tools`. It also holds `inputTokens`, `outputTokens`, `seconds`, `output`, and `failure`.

The directory also holds the token files of the fleet as hidden files: `.fleet-token`, `.lab-hook-token`, `.tickets-hook-key`, `.gitea-agent-token`, `.fleet-issuer.pem`, `.gitea-admin`, `.gitea-agent`, and `.anthropic-key`. `deploy.sh` writes a file only at the creation of its Secret, so a lost file never comes back on its own. `e2e/fleet/restore-results.sh` writes the first five again from the Secrets of `fw-fleet`, keeps a file that exists, and never prints a value. `.fleet-images` comes back from `redeploy.sh`, and the Gitea files come back from `tickets/setup.sh`, which sets new passwords for users that exist.

## The fleet checks

The checks under `e2e/fleet` run against the deployed fleet ([A fleet](../deployment/fleet.md)) through the public URL of agentgateway, `http://192.168.50.60:8090` by default. Run each Python script with `python3 -I`. Every script reads the token from `e2e/results/.fleet-token` and never prints it, and each check prints `PASS` or `FAIL` with a short piece of evidence.

| Check | What it does |
|---|---|
| `ax/verify.sh` | Both named members are in the fleet view. An approval on the reviewer crosses the gateway and the router. A sleeping member wakes for an approval. |
| `verify.py [url]` | Phase 1: the fleet through agentgateway with the static token. |
| `verify-workbench.py [url] [member] [agent]` | The workbench revision on a run of another member: its result, its files, and its approval cross the router. |
| `verify-oidc.py MINT [url]` | Phase 2: OIDC through agentgateway on port 8091. `MINT` is the signer: `go build -o e2e/results/mint ./e2e/fleet/mint` builds it, and it signs the tokens of alice and bob with `.fleet-issuer.pem`. |
| `batch.py [url] [agent] [count]` | Sends a small job with the MCP tools `enqueue` and `batch` and follows it. The front wakes a sleeping worker for it. |
| `connect.py MINT [url]` | The broker exercise: alice connects the ticket system on the front, and the Task gets her token. bob gets a connect request of his own. |
| `fork.py [url]` | Branches a run of alpha twice with `fork`: once in the same Task and once with `spawn` into a child Task. |
| `features.py [url]` | The features of 2026-10-20: the tool sandbox, the final report at a turn limit, and the webhook source `lab-hook`. Also the wake on queue depth, a dead letter, and the pool `lab-pool`. |
| `features2.py [url]` | The environment of the migrator, and an add through the tool `env` with its approval. Also the profiles and an approval rule of a pool, and an outcome. `FEATURES2_ONLY=3,4,5` selects checks. |
| `check-export.sh` | Reads the `fw_*` series back from the Prometheus of `otel-system` and lists the services of Jaeger. It fails without `fw_runs_total` or `fw_fleet_queue_pending`. |
| `pool-generations.py CONFIG STATE` | Gives each pool of a rendered front configuration a generation that rises with every change. `front-config.sh` runs it. |
| `scenario1b.py [--out DIR] MODULE ...` | Drives batch scenario1-b: one job per Puppet module on the queue of the migrator, with the approval of each pull request. |
| `ax/measure-env.sh` | Takes the three numbers of a heavy environment on the throwaway Task `fw-env-measure`: the install of torch with a cold and a warm cache, the size of the volume, and the suspend and resume time. It deletes the Task at the end. |

Run the checks after `redeploy.sh`, `deploy.sh`, `deploy-oidc.sh`, and `ax/run.sh`, in the order of the table. Run `features2.py` after `features.py`, and run `measure-env.sh` alone, because Strata serves one request at a time.

## The ticket soak

The ticket soak runs the fleet the way a helpdesk uses it. Gitea runs in the cluster as the ticket system, and gitea-mcp gives the agent its tools. A signed webhook, or a poll, starts one run of the agent `triage` per new ticket on a pool of two workers. The helpdesk is a standing system. A person opens it at `http://192.168.50.60:8092/`, and a seeded history makes it look used. The CronJob `tickets-sweeper` delivers a ticket that the webhook missed again, every five minutes.

The driver `e2e/fleet/tickets/tickets.py` creates tickets over hours in bursts and quiet periods and denies every approval. With `--chaos front,mcp,suspend` it breaks things on purpose. It checks thirteen invariants. Among them: every ticket started exactly one run, every run completed, and every ticket lost `status/new` and got one status label. No ticket was closed or edited, and every approval asked to update a ticket. The latency stayed under `--sla`, every Task of the pool slept in each quiet period, and the cost stayed under `--cost-cap`. The dead-letter counter did not grow. `make tickets` runs it, and `TICKETS="--tickets 40 --shape trickle"` passes options. A systemd user timer runs it every night at 03:00.

The repository `https://github.com/bdubs00/featherweight-lab` is private, so these links need access. The README of the soak is at `e2e/fleet/tickets/README.md` in that repository, with the parts, the setup, the options, and the checks. The runbook for the person who runs the lab is at `e2e/fleet/tickets/RUNBOOK.md`. The findings of each run, with the product changes that answered them, are in `e2e/fleet/tickets/FINDINGS.md`. The dead letter and its redrive are on [Debugging a Task](debugging.md#a-job-in-the-dead-letter).

## Sources

- `featherweight-lab/README.md`
- `featherweight-lab/Makefile`
- `featherweight-lab/e2e/README.md`
- `featherweight-lab/e2e/loop.sh`
- `featherweight-lab/e2e/local.sh`
- `featherweight-lab/e2e/fw.yaml`
- `featherweight-lab/e2e/k3s/run.sh`
- `featherweight-lab/e2e/k3s/install.sh`
- `featherweight-lab/e2e/k3s/task.yaml`
- `featherweight-lab/e2e/k3s/egress.yaml`
- `featherweight-lab/e2e/scenarios/01-plain.yaml` through `08-approval-deny.yaml`
- `featherweight-lab/e2e/e2e_test.go`
- `featherweight-lab/e2e/fleet/verify.py`
- `featherweight-lab/e2e/fleet/verify-workbench.py`
- `featherweight-lab/e2e/fleet/verify-oidc.py`
- `featherweight-lab/e2e/fleet/batch.py`
- `featherweight-lab/e2e/fleet/connect.py`
- `featherweight-lab/e2e/fleet/fork.py`
- `featherweight-lab/e2e/fleet/features.py`
- `featherweight-lab/e2e/fleet/features2.py`
- `featherweight-lab/e2e/fleet/pool-generations.py`
- `featherweight-lab/e2e/fleet/scenario1b.py`
- `featherweight-lab/e2e/fleet/check-export.sh`
- `featherweight-lab/e2e/fleet/restore-results.sh`
- `featherweight-lab/e2e/fleet/deploy.sh`
- `featherweight-lab/e2e/fleet/mint/main.go`
- `featherweight-lab/e2e/fleet/ax/verify.sh`
- `featherweight-lab/e2e/fleet/ax/measure-env.sh`
- `featherweight-lab/e2e/fleet/tickets/README.md`
- `featherweight-lab/e2e/fleet/tickets/RUNBOOK.md`
- `featherweight-lab/e2e/fleet/tickets/FINDINGS.md`
- `featherweight-lab/e2e/fleet/tickets/tickets.py`
- `featherweight-lab/e2e/fleet/tickets/fw-tickets-soak.timer`
