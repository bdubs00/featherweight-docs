# Featherweight

Featherweight runs agents as durable, sandboxed workers on Google AX and Agent Substrate. An agent runs inside one sandbox, keeps an append-only record of everything it does, sleeps at no cost while it waits for a person, and wakes up where it left off. A person drives a whole fleet of such agents from Claude Code, an IDE, or a browser.

The project is two repositories and one patched platform:

| Repository | Binary | What it is |
|---|---|---|
| [featherweight-kernel](https://github.com/bdubs00/featherweight-kernel) | `fw` | One agent inside one AX Task. The run loop, the budget, the policy, the ledger. |
| [featherweight-workbench](https://github.com/bdubs00/featherweight-workbench) | `fw-workbench` | The front for people, outside the sandboxes. The web page, the sign-in, the MCP server, the fleet view, the connections, the pools. |
| [bdubs00/ax](https://github.com/bdubs00/ax) | `ax` | A fork of google/ax with the egress patch that the project runs until it lands upstream. |

## Where to start

If you want to understand the system, read [The four layers](concepts/layers.md) first. It explains Substrate, AX, the kernel, and the workbench in one page, with one job traced through all four. Then read [The run lifecycle](concepts/run-lifecycle.md) and [The ledger](concepts/ledger.md).

If you want to run something, pick the page that matches your goal.

| Goal | Page |
|---|---|
| Run one agent on your laptop | [Run the kernel on your machine](getting-started/kernel-local.md) |
| Add the web page and the MCP server | [Run the workbench on your machine](getting-started/workbench-local.md) |
| Drive a fleet from Claude Code | [Use a fleet from Claude Code](getting-started/from-claude-code.md) |
| Put one agent in an AX Task | [One Task on AX](deployment/one-task-on-ax.md) |
| Deploy a fleet with a front, a queue, and workers | [A fleet](deployment/fleet.md) |
| Find a verb, a flag, a key, a route, or a tool | [Reference](reference/fw-commands.md) |
| Work out why a Task or a run misbehaves | [Debugging a Task](operations/debugging.md) |

The [Design documents](design/index.md) are the full architecture of the kernel and the workbench, copied from the repositories. They are the source of truth for a design question. The pages of this site explain and point; they do not replace them.

## The idea in four sentences

AX gives an agent a sandbox with a folder that survives a freeze, a router that wakes a sleeping sandbox, and a wall around its network. AX does not know what happens inside the sandbox. The kernel is the process inside: it runs the agent, writes every step to a ledger in that folder, says when it is idle, and keeps every child and every tool call within a budget and a policy. The workbench is the front desk outside: it signs people in, holds their credentials, serves Claude Code and the browser, and freezes and wakes the sandboxes.

## Status

As of 2026-10-20, stages 1 to 4 of the [kernel roadmap](design/kernel-roadmap.md) are done and verified on a cluster, together with stage 5 items 1 and 3. Stage 5 item 2, workload identity for a Task, waits on Agent Substrate. The [platform gaps](operations/platform-gaps.md) page lists what the platforms do not do yet and how the project works around each gap.
