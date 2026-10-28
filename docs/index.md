# Featherweight

Featherweight lets one person run a fleet of AI agents safely. You ask in plain words. Each agent works in a sealed sandbox, asks you before a risky step, and sleeps for free while it waits.

<div class="demo" data-demo="stack-hero" markdown>

You ask for twelve Puppet modules to move to Ansible. The workbench queues twelve jobs and wakes three agents, each in its own sandbox. An agent that needs GitHub gets a short-lived token from the workbench, and your sign-in never enters the sandbox. A call to a host that is not on the allow list is blocked at the wall. An agent that wants to push asks you first and sleeps while it waits. The other agents keep going. You press Allow, the agent wakes where it stopped, and the fleet sleeps again. You pressed two keys.

</div>

## Sealed in a sandbox

Every agent runs in its own sandbox: a gVisor container on Google AX, with a wall around its network. The wall lets the agent reach only the hosts on its allow list.

Your credentials stay outside. The workbench keeps your sign-ins to services such as GitHub. When an agent must act as you, the workbench hands it a short-lived token for that one run.

The agent asks before a risky step. A policy decides each tool call: allow, ask a person, or deny. A budget caps the turns, the tool calls, the time, and the cost of each run. See [Safeguards](concepts/safeguards.md) and [Identity](concepts/identity.md).

## Easy to drive

You talk to agents the way you talk to a team. [Bossmode](guide/index.md), the web page of the workbench, is a chat client whose members are agents. Claude Code and other MCP clients reach the same fleet through MCP tools.

A decision is one key. A card shows what the agent wants to do in plain words, and you allow it or deny it from wherever you are. Every step that an agent took is in its ledger, an append-only log that you can read. See [Decisions and activity](guide/decisions.md).

## More done per person

One request can fan out to many agents at once. They work in parallel, each in its own sandbox, and they keep going while you are away.

A waiting agent costs nothing. When a run waits for a person, its sandbox goes to sleep. A decision, a new job, or a message wakes it. The run goes on from the exact step where it stopped, also after a crash or a restart. Agents can also start work on their own, on a schedule, through [duties](guide/duties.md). See [The fleet](concepts/fleet.md).

## Try the moment that matters

The scene above has one moment that the rest depends on: an agent waits for you, and your answer wakes it. Here it is to try. Press either key.

<div class="demo" data-demo="decision" markdown>

A sleeping agent, `migrator-2`, asks to run `git push origin migrate/nginx`. Its run waits, and its sandbox is suspended. If you allow the command, the workbench sends the decision to the sandbox, and the sandbox wakes. The kernel reads its ledger, and the run goes on from the step where it stopped.

</div>

## The parts

Featherweight is two programs and one web page, on top of two platforms.

| Part | What it is |
|---|---|
| The kernel, `fw` | One agent inside one sandbox. It runs the model loop and keeps the ledger. It checks every tool call against the policy and the budget. It also tells the platform that it is idle. |
| The workbench, `fw-workbench` | The program for people, outside the sandboxes. It signs people in, keeps their credentials, queues jobs, serves MCP, and puts sandboxes to sleep and wakes them. |
| Bossmode | The web page of the workbench. You answer decisions, run [bridges](guide/bridges.md) of agents, and set duties there. |
| Google AX and Agent Substrate | The platforms. Substrate makes the sealed sandboxes that can sleep. AX hands them out as Tasks. The project runs a [patched AX](operations/platform-gaps.md). |

[The four layers](concepts/layers.md) traces one job through all of them.

## Where to start

<div class="paths" markdown>

- [Understand the system <span>The four layers, with one job traced through them</span>](concepts/layers.md)
- [Use bossmode <span>The places of the page and what each one is for</span>](guide/index.md)
- [Run one agent on your laptop <span>Build fw and start a run</span>](getting-started/kernel-local.md)
- [Drive a fleet from Claude Code <span>The MCP tools that start, watch, and decide runs</span>](getting-started/from-claude-code.md)
- [Deploy a fleet <span>A workbench, a queue, and workers on AX</span>](deployment/fleet.md)
- [Look up a fact <span>Commands, configuration, routes, and tools</span>](reference/fw-commands.md)

</div>

## Sources

- `featherweight-kernel/README.md`
- `featherweight-kernel/fw/projection.go`
- `featherweight-kernel/fw/turn.go`
- `featherweight-workbench/README.md`
- `featherweight-workbench/docs/ARCHITECTURE.md`
- `featherweight-workbench/fleet/types.go`
- `featherweight-bossmode/README.md`
