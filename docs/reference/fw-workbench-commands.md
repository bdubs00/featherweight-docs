---
wide: true
---

# fw-workbench commands

The workbench binary is the kernel plus the parts for people: bossmode, the MCP server, the fleet, and the stores of bridges, duties, and the wiki. It takes every command of the [kernel](fw-commands.md) with the same flags. This page lists only what it adds or changes.

The form, the configuration lookup, the global flags, and the exit codes are those of `fw`. A binary started under the name `ax-task-runner` runs `serve`, as `fw` does. The design document describes the build in [section 1.2](../design/workbench-architecture.md#12-build). In a fleet, the workbench is called the [front](../glossary.md#d-to-h), because it stands in front of the workers.

## Commands only the workbench has

`cmd/fw-workbench/main.go` handles these commands before it hands the arguments to the kernel. They take `-config file` and no other global flag. Without a configuration file, they exit with `1` and ask for one. A bad command line exits with `2`.

| Command | What it does | Flags and details |
|---|---|---|
| `fw-workbench pools render [file]` | Prints the Workspaces and the Tasks that the front applies for its pools, as YAML documents in the order of the apply. It shows the pools of `workbench.pools`, then the runtime pools that people created from a template | `-config file`: the configuration of the front. The argument wins, then `-config`, then `$FW_CONFIG`, `./fw.yaml`, or `$FW_HOME/fw.yaml` |
| `fw-workbench pages export <dir>` | Writes each page of the wiki as one file under `dir`, at the path of the page. The index goes to `_index.md`. A file of the same path is replaced, and other files stay | `-config file`. It needs `bus.driver: nats` |
| `fw-workbench pages import <dir>` | Writes each `.md` file under `dir` as a new version of the page at its path. A file that holds the text of its page already changes nothing. It names every file that it leaves out | `-config file`. It needs `bus.driver: nats`. The writer of each version is `local:<user>` |

`pools render` puts a placeholder in place of every value that the front copies from its own environment, such as `FW_API_TOKEN`. It merges the overlay of each pool: the profiles and the rules that people added through the bus. If the overlay cannot be read, the command prints the pool without it and says so on standard error. See [section 14.2](../design/workbench-architecture.md#142-the-dry-run).

Both `pages` commands reach the wiki in the key-value bucket `<stream>_PAGES` of the NATS bus, and each run of a command stops after five minutes. With the bus `mem`, the wiki lives in the memory of the front, so the commands refuse. See [section 15.5](../design/workbench-architecture.md#155-export-and-import).

```sh
fw-workbench pools render -config front.yaml > applied.yaml
fw-workbench pages export -config front.yaml ./wiki-backup
```

## Commands that change

| Command | What changes in the workbench |
|---|---|
| `fw-workbench serve` | It also starts the services of the workbench: the fleet, connections, sources, bossmode, bridges, conversations, duties, faces, notifications, pages, playbooks, and routines. The surface `mcp` joins `surfaces` by default. The routes of the workbench mount on the native API |
| `fw-workbench mcp` | It works. It serves the same MCP server as `/mcp` over standard input and output, as `local:<user>` of kind `local`. Logs go to standard error |
| `fw-workbench agents put <file.yaml>` | It works. It checks the profile, authorizes the local principal, and writes `<home>/agents/<name>.yaml`. It prints `created` or `replaced` |
| `fw-workbench agents delete <name>` | It works. It removes the file and prints `deleted` |
| `fw-workbench doctor` | It adds seven lines after the bus check: `connections`, `fleet`, `sources`, `duties`, `notify`, `bossmode`, and `manager` |
| `fw-workbench whoami` | With `workbench.access.external`, it asks the control plane whether the principal is an admin. If the control plane does not answer, it prints `admin: unknown` and exits with `1` |
| `fw-workbench run`, `events`, `replay` | With `workbench.access.external`, every command acts as the local principal, and the control plane decides for it |

A command that runs one piece of work, such as `run` or `mcp`, starts no service. It therefore never joins a fleet, keeps no connection, and has no wiki. The tool `propose_agent` joins `tools.builtin` by default, but a profile still has to name it.

### fw-workbench agents

The flags are those of `fw agents`: `-json`, and `-name name` for `put`. A put whose file has no `access` block keeps the access block of the profile that it replaces. A new profile names the local principal as its owner. A profile that `fw.yaml` defines cannot change here, because the configuration wins at the next start. A running server reads the change at its next start.

### The doctor lines

| Line | What it checks |
|---|---|
| `connections` | The grant store and each `tools.mcp` entry with `auth.oauth.grant: user` |
| `fleet` | The atespaces and the egress stream that it reads, and the queues. Then the index of the runs, the suspend and orphan timers, the pools, and the templates |
| `sources` | The webhook and poll sources of `workbench.sources` and their secrets |
| `duties` | Where the duties live, the hosts that a check can reach, and the secrets that a duty can name |
| `notify` | Where the notifications of people live, the default ntfy server, the hosts that a channel can reach, and the link of a notification |
| `bossmode` | Whether the page is on, where its files come from, and the stores of the wiki, the faces, and the bridges |
| `manager` | The profile of the manager, the pool that runs it, and its trusted `tools.mcp` entry that reaches the front |

If any line fails, the exit code is `1`, as with `fw doctor`.

## What the workbench leaves out

`cmd/fw-workbench/drivers.go` does not import the packages `env` and `harness` of the kernel. So `fw-workbench env dockerfile` fails with the message that the package `env` is not linked. The blocks `environment` and `harness` of `fw.yaml` have no driver in this binary. A worker of a pool runs `fw`, which has both.

<div class="paths" markdown>

- [Workbench configuration <span>The block workbench</span>](workbench-configuration.md)
- [MCP tools <span>What fw-workbench mcp serves</span>](mcp-tools.md)

</div>

## Sources

- `featherweight-workbench/cmd/fw-workbench/main.go`
- `featherweight-workbench/cmd/fw-workbench/drivers.go`
- `featherweight-workbench/cmd/fw-workbench/pools.go`
- `featherweight-workbench/cmd/fw-workbench/pages.go`
- `featherweight-workbench/agents/agents.go`
- `featherweight-workbench/surface/mcp/mcp.go`
- `featherweight-workbench/tools/builder/propose_agent.go`
- `featherweight-workbench/connections/doctor.go`
- `featherweight-workbench/fleet/doctor.go`
- `featherweight-workbench/sources/doctor.go`
- `featherweight-workbench/duties/doctor.go`
- `featherweight-workbench/notify/doctor.go`
- `featherweight-workbench/bossmode/doctor.go`
- `featherweight-workbench/manager/doctor.go`
- `featherweight-kernel/cli/cli.go`
- `featherweight-kernel/cli/identity.go`
- `featherweight-kernel/cli/doctor.go`
