# fw-workbench commands

`fw-workbench` is the kernel with the workbench for people: the page at `/ui`, the browser sign-in, the MCP server, the fleet, the connections, the pools, and the agent builder. The binary links the package `cli` of the kernel, so it takes every verb of `fw` with the same flags. Read the [fw commands](fw-commands.md) page for the verbs and the flags. This page lists only what the workbench adds or changes.

The form is the same: `fw-workbench [global flags] <verb> [flags] [arguments]`. The configuration lookup, the exit codes, and the global flags are the same too. A binary started under the name `ax-task-runner` runs `serve`, as `fw` does. The design document describes the build in [section 1.2](../design/workbench-architecture.md#12-build).

## What every verb gains

`cmd/fw-workbench/drivers.go` links every driver of the kernel binary, and the packages of the workbench on top. The packages change the verbs in these ways:

- The verb `mcp` works, because the package `surface/mcp` sets `cli.ServeMCPStdio`.
- The verbs `agents put` and `agents delete` write profiles, because the package `agents` sets `cli.AgentsPut` and `cli.AgentsDelete`.
- The verb `doctor` adds three lines: `connections`, `fleet`, and `sources`. The ax lines of the kernel stay.
- Every verb that builds an agent adds the control plane of `workbench.access.external`, through `cli.AgentOptions`. With that block, `whoami` reports `acts: always`, and the control plane decides every request instead of `access.admins`.
- The verb `card` works, because the binary links the A2A surface.
- The block `workbench` of `fw.yaml` loads, because the packages `teams` and `titles` claim it with `fw.RegisterExtension`.

Two verbs of `fw` lose a function. `drivers.go` of the workbench does not import the package `env` or the package `harness` of the kernel. `fw-workbench env dockerfile` therefore fails with the message that the package `env` is not linked, and the block `harness` of `fw.yaml` has no driver in this binary.

## fw-workbench serve

Serves every surface of the kernel and the surfaces of the workbench on one listener. The flags are the flags of `fw serve`. The package `surface/mcp` registers a default, so `surfaces` of the configuration gains `mcp` without a change to the file. The package `surface/web` mounts its routes as an extension of the native API. The [HTTP API](http-api.md) page lists them.

```sh
fw-workbench serve [flags]
```

The verb also starts the services that the packages register with `fw.RegisterService`: the fleet, the connections, and the sources. The fleet runs the reconciler of the pools. A verb that runs one piece of work, such as `run` or `mcp`, starts no service. It therefore never joins a fleet and keeps no connection. The run annotator of the package `teams` writes the teams of a person into the metadata of each run. The package `titles` asks a model for a title the first time the workbench shows a run without one.

## fw-workbench mcp

Serves the MCP server over standard input and output, for a desktop client or an editor. Every call acts as the local principal `local:<user>` of kind `local`. A profile that the client creates names that principal as its owner. The entries `local:*` and `kind:local` in `access.admins` give it the admin role.

```sh
fw-workbench mcp
```

The verb has no flags of its own. Logs go to standard error, because standard output carries the protocol. The server is the same server as the one at `/mcp`. The [MCP tools](mcp-tools.md) page lists its tools, resources, and prompts. The key that signs an approval retry comes from `FW_MCP_STATE_KEY`, else from the file `mcp-state.key` under the home directory.

## fw-workbench agents

Lists the agent profiles, prints one, or puts and deletes one. The flags and the arguments are those of `fw agents`. The difference is that `put` and `delete` work.

```sh
fw-workbench agents [flags] [<name> | put <file.yaml> | delete <name>]
```

| Flag | Meaning | Default |
|---|---|---|
| `-json` | Print the profiles as JSON | off, a table or YAML |
| `-name name` | `put`: the profile name, in place of the one in the file | the `name` field, else the file name |

`put` reads the file with `config.LoadProfile` and checks the profile with the kernel. Then it authorizes the local principal and writes `<home>/agents/<name>.yaml` through the profile store of the package `config`. `delete` removes that file. A running server reads the change at its next start. A profile that `fw.yaml` defines cannot change here, because the configuration wins at the next start. A put whose file has no `access` block keeps the access block of the profile that it replaces. A new profile names the local principal as its owner. The verb prints `created`, `replaced`, or `deleted` with the directory.

On a front with pools, the package `agents` writes to a place: the store of the process, or the overlay of the pool whose workers run the profile. The verb uses the store of the process. See [section 14.9](../design/workbench-architecture.md#149-profiles-and-rules-of-a-pool).

## fw-workbench pools

Prints the Workspaces and the Tasks that the front applies for the pools under `workbench.pools`. The kernel does not know this verb, so `cmd/fw-workbench/main.go` handles it before it hands the arguments to the kernel. The only subverb is `render`.

```sh
fw-workbench pools render [-config file] [file]
```

| Flag | Meaning | Default |
|---|---|---|
| `-config file` | The configuration file of the front | the argument, else `$FW_CONFIG`, `./fw.yaml`, or `$FW_HOME/fw.yaml` |

The output is a stream of YAML documents in the order of the apply, one Workspace and one Task per worker. Every value that the front copies from its own environment, such as `FW_API_TOKEN`, is a placeholder. The verb merges the overlay of each pool into the output. The overlay holds the profiles and the rules that people added through the key-value store of the bus. The output therefore shows what the front applies. If the overlay cannot be read, the verb prints the pool without it and says so on standard error.

The verb does not take the global flags of the kernel. The exit code is `0` on success. A configuration that does not load, or a pool that does not fit, gives `1`. A bad command line gives `2`. Without a configuration file, it exits with `1` and asks for one. The design document describes the dry run in [section 14.2](../design/workbench-architecture.md#142-the-dry-run).

## fw-workbench doctor

Runs the checks of `fw doctor` and the three checks of the workbench. The flag is the flag of `fw doctor`.

```sh
fw-workbench doctor [flags]
```

| Flag | Meaning | Default |
|---|---|---|
| `-timeout limit` | The limit of each check that reaches a provider or a server | `10s` |

| Line | What it checks |
|---|---|
| `connections` | The store of the grants and the conditions of each `tools.mcp` entry with `auth.oauth.grant: user` |
| `fleet` | The configuration of the fleet, the ax API, and the pools |
| `sources` | The webhook and poll sources of `workbench.sources` |

If any line fails, the exit code is `1`, as with `fw doctor`.

## fw-workbench whoami and run

`whoami` prints the same principal as `fw whoami`. With `workbench.access.external`, the verb asks the control plane whether the principal has the admin role. If the control plane does not answer, the verb prints `admin: unknown` and exits with `1`. The last line then reads `acts: always`.

`run`, `events`, and `replay` take the same flags as in `fw`. With `workbench.access.external`, every run acts as the local principal, and the control plane decides for it. Without that block, the rules of `access` decide, as in `fw`.

## Sources

- `featherweight-workbench/cmd/fw-workbench/main.go`
- `featherweight-workbench/cmd/fw-workbench/drivers.go`
- `featherweight-workbench/cmd/fw-workbench/pools.go`
- `featherweight-workbench/agents/agents.go`
- `featherweight-workbench/access/config.go`
- `featherweight-workbench/fleet/fleet.go`
- `featherweight-workbench/fleet/config.go`
- `featherweight-workbench/connections/connections.go`
- `featherweight-workbench/sources/sources.go`
- `featherweight-workbench/teams/teams.go`
- `featherweight-workbench/titles/titles.go`
- `featherweight-workbench/surface/mcp/mcp.go`
- `featherweight-workbench/surface/mcp/state.go`
- `featherweight-workbench/surface/web/web.go`
- `featherweight-workbench/README.md`
- `featherweight-kernel/cli/cli.go`
- `featherweight-kernel/cli/identity.go`
- `featherweight-kernel/cli/verbs.go`
- `featherweight-kernel/cli/env.go`
- `featherweight-kernel/cmd/fw/driver_env.go`
- `featherweight-kernel/cmd/fw/driver_harness.go`
