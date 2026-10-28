# Featherweight

Featherweight turns one request into an agent that works for you, again and again. You strike once. The agent repeats on schedule, splits big work into child runs, keeps going while you are away, and tells you what happened wherever you are.

<div class="demo" data-demo="forge" markdown>

You tell the manager: every weekday at 9, triage the new incidents and send me a summary. The manager shows the duty it will make, and one key saves it. Every weekday at 9, the duty wakes the agent, which does the work and sleeps again. A run can hand parts of its work to child runs, each in a sandbox of its own, within the limits of its tree. While you are away, the manager decides the routine approvals of the duty, and questions and destructive tools wait for you. Reports, failures, and questions reach you by email, Slack, Microsoft Teams, Discord, or your phone. When something needs you, you decide in one click, and the work goes on.

</div>

## What you just watched

Each chapter of the movie is a part of Featherweight that you can use today.

Strike once. You ask the [manager](guide/manager.md) in plain words. For work that repeats, it shows you the [duty](guide/duties.md) it will make, with the schedule read back in words, and saves it when you agree.

It repeats, and it branches. A duty wakes its agent on time, with no one at the keyboard. A run can hand parts of its work to child runs, and each tree of runs stays within its limits. See [Profiles, tools, and skills](concepts/profiles-and-tools.md) and [Safeguards](concepts/safeguards.md).

It works while you are away. A sandbox that waits sleeps for free and wakes where it stopped. For a duty, the manager can decide routine approvals for you, but never a question, a connect, or a destructive tool. See [The fleet](concepts/fleet.md) and [Duties](guide/duties.md).

The news finds you, and you decide in one click. Reports, failures, and questions go to the channels you pick in Where to reach me, with a daily digest. A decision card shows what the agent wants in plain words. See [Decisions and activity](guide/decisions.md).

## Sealed in a sandbox

Every agent runs in its own sandbox: a gVisor container on Google AX, with a wall around its network. The wall lets the agent reach only the hosts on its allow list.

Your credentials stay outside. The workbench keeps your sign-ins to services such as GitHub. When an agent must act as you, the workbench hands it a short-lived token for that one run.

The agent asks before a risky step. A policy decides each tool call: allow, ask a person, or deny. A budget caps the turns, the tool calls, the time, and the cost of each run. See [Safeguards](concepts/safeguards.md) and [Identity](concepts/identity.md).

## One job up close

This scene follows one request through the stack, step by step. It shows the wall of the sandbox, the token that stands in for your sign-in, and the decision that wakes a sleeping agent. Press Play.

<div class="demo" data-demo="stack-hero" data-autoplay="false" markdown>

You ask for twelve Puppet modules to move to Ansible. The workbench queues twelve jobs and wakes three agents, each in its own sandbox. An agent that needs GitHub gets a short-lived token from the workbench, and your sign-in never enters the sandbox. A call to a host that is not on the allow list is blocked at the wall. An agent that wants to push asks you first and sleeps while it waits. The other agents keep going. You press Allow, the agent wakes where it stopped, and the fleet sleeps again. You pressed two keys.

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
- `featherweight-workbench/notify/settings.go`
- `featherweight-workbench/duties/schedule/say_test.go`
- `featherweight-kernel/fw/config.go`
- `featherweight-bossmode/README.md`
