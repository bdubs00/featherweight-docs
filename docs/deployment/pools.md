# Pools and templates

A pool keeps a number of agent sandboxes that run one agent, and the workbench creates, replaces, and removes them for you. A template goes one step further: people add a new agent with its own workers from bossmode, and they never see an image digest or an egress rule.

## A pool in the configuration

A pool is an entry of `workbench.pools` in the `fw.yaml` of the front, the workbench in front of the workers. At every `workbench.fleet.interval`, the front makes the Tasks of each pool match its entry. Each Task is named `<name>-<index>` and has a Workspace `<name>-<index>-ws`.

| Key | What it does | Default |
|---|---|---|
| `name` | The name of the pool and the prefix of its Tasks | required |
| `replicas` | The number of Tasks. `0` deletes them once they are idle. | required |
| `image` | The worker image by digest, `<image>@sha256:<64 hex digits>` | required |
| `egress` | `hosts`: the only hosts that the Tasks can reach | required |
| `fw` | The `fw.yaml` of each worker: the agents, the policy, the model, the providers, and the tools | required |
| `agent` | The profile whose jobs the workers take | the only profile of `fw.agents` |
| `template` | A template. The pool takes each key of the template that it does not set. | none |
| `atespace` | One of `workbench.fleet.atespaces` | the only atespace |
| `intake` | The job queue of the pool | `fw.jobs.<agent>` for a pool named after its agent, else `fw.jobs.<name>` |
| `generation` | A number that orders the configurations of the pool. Raise it with every change. | `0` |
| `revision` | Free text. A new value replaces every Task. | none |
| `env` | Variables, each with `value`, or with `fromEnv`, a variable of the front | none |
| `resources`, `files` | The CPU and memory of each Task, and extra files of its Workspace | none |
| `packages` | Extra software for the workers (see below) | off |

`examples/pools/fw.yaml` of the workbench keeps three workers of the profile `triage`. This is its pool, cut to the keys that matter:

```yaml
workbench:
  fleet: {atespaces: [default], egress: fw.events, intake: fw.jobs}
  pools:
    - name: triage
      replicas: 3
      generation: 1
      image: ghcr.io/bdubs00/featherweight-kernel@sha256:<64 hex digits>
      env:
        - {name: OPENAI_API_KEY, value: the-proxy-holds-the-key}
        - {name: TICKETS_TOKEN, fromEnv: TICKETS_TOKEN}
      egress:
        hosts:
          - http://nats.agents.svc.cluster.local:8080
          - http://model-proxy.models.svc.cluster.local:8080
          - https://tickets-mcp.example.com
      fw:
        model: openai/example-model
        bus: {url: "ws://nats.agents.svc.cluster.local:8080"}
        providers:
          openai: {baseUrl: "http://model-proxy.models.svc.cluster.local:8080/v1", apiKeyEnv: OPENAI_API_KEY}
        policy: {default: allow, ask: [tickets.update_ticket]}
        agents:
          triage:
            tools: [files, tickets.search_tickets, tickets.get_ticket, tickets.update_ticket]
```

The front adds the keys that tie a worker to the fleet: `bus.intake`, `bus.egress`, the event types of the stream, `auth.mode: token`, and `bus.options.concurrency: 1` on NATS. It copies the static token of the fleet into each Task. A pool has no default model: the front refuses a pool without one.

Write a secret with `fromEnv`, never as `${NAME}`. The front expands `${NAME}` in its own file, so the value lands in the configuration and in the dry run. For a variable that the worker expands, write `$${NAME}`. A pool cannot set a variable `FW_*` or `AX_*`.

## Review a change with the dry run

The front checks every pool at its start, and a problem stops the start with the key and the fix, for example `image "ghcr.io/example/fw:latest" has no digest`. Before you restart the front, print what it will apply:

```sh
fw-workbench pools render -config fw.yaml
```

The output is the Workspaces and the Tasks, in the order of the apply. A comment before each pool names its queue, its hash, and the variables that the front copies:

```text
# Pool triage: 3 Tasks of the agent triage in the atespace default, on the queue fw.jobs.triage.
# Each Task carries FW_POOL=triage, FW_POOL_SPEC=8acf44b3d5385045, and FW_POOL_GENERATION=1. ...
# The server copies the variable FW_API_TOKEN from its own environment; this output shows a placeholder.
```

Each copied secret shows as a placeholder, such as `<secret: FW_API_TOKEN of the server>`, so the output holds no secret. The command also reads the profiles and the rules that people added to the pool from the bus. If the bus does not answer within five seconds, it says so and prints the pool without them.

!!! warning
    Do not apply the output of `pools render`. A placeholder is not a value, and the front replaces a Task that holds one.

## What a pass does

The front owns a Task on two conditions: its name is `<pool>-<index>`, and its variable `FW_POOL` names the pool. The front never touches another Task, such as a Task that a person made with the same name. At each pass, for each pool, the front does these things:

1. It creates the missing Tasks at the lowest free names, writes their Workspaces, and resumes them, because AX creates every Task suspended.
2. It deletes the Tasks above `replicas`, the idle ones first.
3. It replaces the Tasks of an older configuration, one at a time, each once it is idle. The pool keeps its workers while it rolls.
4. It puts aside a Task that failed after it ran, and asks a person to delete it, because such a Task can hold runs.

Before a delete, the front asks the Task, and the Task must answer that it holds no active run. A run that waits for a person is active. The front never deletes a Task that does not answer.

The state of each pool is in `GET /v1/fleet`, the MCP tool `fleet`, and the Fleet place of bossmode. It gives the counts `wanted`, `actual`, and `ready`, and each Task with its phase. It also gives `gaps`, one reason for each difference, such as `triage-1 runs an older configuration and holds the active run 01K..., so the pool replaces it once it is idle`.

## Change a pool safely

Every replica of the front runs every pass, with no leader. During a rolling update, two replicas can hold two configurations. Without an order, they replace each other's Tasks at every interval. `generation` gives the order:

- Raise `generation` with every change of a pool. A replica that sees a Task of a higher generation changes nothing and says `superseded`.
- A Task of the same generation with another configuration is a conflict. Neither replica changes the pool until a deploy raises the generation.
- A rollback is a new, higher generation too.

A new value of a variable of the front, such as a new static token, makes every Task older. To rotate the token, change the Secret of the front and restart it. The pool then replaces its Tasks one at a time.

To remove a pool, set `replicas: 0`, wait until its Tasks are gone, and then remove the entry. The front cannot tell a removed pool from a pool of another front, so a removed entry leaves its Tasks as they are.

!!! warning
    A replaced Task comes back with an empty `/workspace`. The ledgers and the files of the old Task are gone. On a NATS bus, the front keeps an archive of the runs from the egress stream. The run lists show such a run as `archived`. Such a run is read-only. A person who writes in it starts a new run that continues it, with a summary of the earlier conversation.

## Templates and runtime pools

A template says once what a worker is: the image, the egress, the variables, and the base `fw`, without an agent. It is an entry of `workbench.templates`, with the keys of a pool except `replicas`, `agent`, and `intake`. Two keys are its own: `default: true` makes it the template of a new agent, and `fw` names no `agents`. A template needs `kind:token` in `fw.access.admins`, so the static token can read the runs of an agent that a person owns.

```yaml
workbench:
  templates:
    - name: general
      default: true
      generation: 1
      image: ghcr.io/bdubs00/featherweight-kernel@sha256:<64 hex digits>
      egress:
        hosts: [http://nats.agents.svc.cluster.local:8080, http://model-proxy.models.svc.cluster.local:8080]
      fw:
        model: openai/example-model
        bus: {url: "ws://nats.agents.svc.cluster.local:8080"}
        providers:
          openai: {baseUrl: "http://model-proxy.models.svc.cluster.local:8080/v1", apiKeyEnv: OPENAI_API_KEY}
        policy: {default: allow}
        access: {admins: ["kind:token"]}
```

With a template, a person creates a runtime pool while the front runs. Bossmode creates an agent with `PUT /v1/agents/{name}`. The front then makes a pool named after the agent, with two workers from the default template. The same works with the MCP tool `agent_put` and `workers`, with `pool_put`, and with `POST /v1/pools`. The runtime pools live in the NATS bucket `FW_POOLS`, so every replica sees them.

| Route | MCP tool | What it does |
|---|---|---|
| `GET /v1/pools`, `GET /v1/pools/{name}` | `pools_list` | The pools that you can see, of the file and of the store |
| `POST /v1/pools` | `pool_put` with `agent` | Creates a runtime pool from a template |
| `PATCH /v1/pools/{name}` | `pool_put` | Changes `replicas`, `env`, `resources`, or `template` |
| `DELETE /v1/pools/{name}` | `pool_delete` | Scales the pool to 0, then removes it |
| `GET /v1/templates` | `templates_list` | The templates, with no image, variable, or egress |

A pool of the file cannot change through these routes: change `fw.yaml` instead. A change of `replicas` replaces no worker that stays.

## Profiles and rules of a pool

The front owns the profiles that its workers run. On a front with pools, `agent_put`, `agent_delete`, and the builder of bossmode write to the overlay of the pool: profiles and allow rules that the front merges into the `fw.yaml` of the workers. Always allow on a decision card adds an allow rule there. The overlay lives in the NATS bucket `FW_POOL_<pool>`. A change of the overlay changes the hash of the pool. The pool then replaces each Task once it is idle, and the front needs no restart.

The front also ships its local skills to the workers. A skill under `$FW_HOME/skills` of the front goes into the Workspace of each pool whose profiles allow it, at most 1 MB per pool.

## Packages

A pool can give its workers Python packages and Programs, such as `ansible-lint` or `iproute2`. The kernel of each worker installs them on `/workspace`, so a suspend keeps them. The feature needs a package mirror in the cluster, which the deployer names once:

```yaml
workbench:
  packages:
    mirrors:
      python: http://pkg-cache.fw-fleet.svc.cluster.local:8080/pypi/simple
      tools: http://pkg-cache.fw-fleet.svc.cluster.local:8080/conda-forge
    egress: [http://pkg-cache.fw-fleet.svc.cluster.local:8080]
```

A pool, a template, or the overlay then holds `packages` with `on`, `ask`, `python`, and `tools`. With `ask: true`, the agent can ask for a package with the tool `env`, and a person approves each add and each remove. A change of the setting replaces no worker: the front sends it to each running worker with `PUT /v1/environment`. People change it on the page, with `PUT /v1/pools/{name}/packages`, or with the MCP tool `packages_put`. See [Skills, tools, and packages](../guide/skills.md) and [section 14.11 of the workbench architecture](../design/workbench-architecture.md#1411-packages).

## Where to go next

<div class="paths" markdown>

- [Serve bossmode <span>The page that creates agents from your templates</span>](bossmode.md)
- [A fleet <span>The front, the bus, and the egress of a worker</span>](fleet.md)

</div>

## Sources

- `featherweight-workbench/docs/ARCHITECTURE.md`, sections 14.1 to 14.11
- `featherweight-workbench/pools/config.go`
- `featherweight-workbench/pools/template.go`
- `featherweight-workbench/pools/packages.go`
- `featherweight-workbench/pools/reconcile.go`
- `featherweight-workbench/pools/render.go`
- `featherweight-workbench/workers/tools.go`
- `featherweight-workbench/cmd/fw-workbench/pools.go`
- `featherweight-workbench/examples/pools/fw.yaml`
- `featherweight-workbench/examples/bossmode/fw.yaml`
