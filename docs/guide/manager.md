# The manager

The manager is an agent that helps you run the fleet. It reads what the fleet does, opens bridges, writes reports into the wiki, and decides what you hand over to it. You talk to it in the Manager place, as you talk to a colleague who knows the whole floor.

## Talk to the manager

Open Manager in the app bar. The list pane holds your conversations with the manager, newest first, with New and Find a conversation. The main pane holds the conversation. A new conversation says "Ask about the fleet, or ask for a bridge."

The manager sleeps between messages, so your first message wakes it. The typing line then says `Waking up` for a few seconds. After that, the answer grows in the conversation as the model writes it. When the manager answers in a conversation that you do not have open, a dot shows on the Manager place.

The composer works as in any conversation. It takes files, and a `/` at the start of a message opens the skills that the manager can load. More in the header holds Make this a duty, which turns the conversation into a duty of the manager. Rename and Delete sit in the More key of each row of the list. [Chat with an agent](chat.md#when-a-conversation-ends) explains them.

If the place says "No manager is set up.", the server names no manager. The operator names its agent in the setting `workbench.bossmode.manager`. The example setup of the workbench, `examples/bossmode`, holds a pool and a profile for it.

## What it asks you first

The manager asks you before it spends or changes anything. In the example setup, its rules let it read without a question and ask before these calls. The rules name each tool with the prefix `front.`, such as `front.bridge_open`.

| Call | What the manager wants to do |
|---|---|
| `bridge_open`, `bridge_remove_member` | Open a bridge, or fire a seat |
| `run`, `enqueue` | Start a run, or send a batch of jobs, one run each |
| `approve`, `cancel`, `run_budget` | Decide for another run, stop it, or change its budget |
| `agent_put`, `agent_delete` | Create, change, or delete an agent |
| `faces_put` | Set the face of an agent |
| `routine_standing` | Move a routine, such as a sign-off |

Each such call shows as a decision card in the conversation and in Activity. A call of `bridge_open` reads "manager wants to open a bridge". The card shows the title, the goal, and the seats of the bridge, and the key Open bridge. [Decisions and activity](decisions.md) explains the keys. A write to the wiki runs without a question, because the wiki keeps every older version.

The example gives one conversation a budget of 400 turns, 8 hours of working time, and 2000 tool calls.

## Why it runs in a sandbox

The manager is one more agent of the fleet, with a Task of its own. A Task is the sandbox in which an agent runs on Google AX. The workbench was the other place for the manager. A Task is better on four points:

- A Task has one address in the fleet, so every message of a conversation reaches the same ledger. A replica of the workbench has no such address.
- The workbench holds no agent with a shell, so it stays a window onto the fleet.
- A Task already has a model, a key to it through the model proxy, and a durable home for its ledger.
- A Task gets every tool of the workbench through its MCP server, with no second copy of the tools.

The manager therefore sleeps at no cost between messages and keeps its ledger on its own disk. The price is one wake of a few seconds for the first message. In the example, one Task serves four conversations at once.

## It acts for you

The manager reaches the tools of the workbench with the token of the fleet, a credential that only workers hold. Each call also names the run that makes it and the person of that run. The workbench then acts for you, not for the token.

The workbench checks each call for both. If you can make the call, and the token can make it too, the call passes. Otherwise it fails. So the manager sees what you see and does what you can do, and never more. Two limits follow from this rule:

- A rule that names you by a group does not match through the manager, because the call carries no groups.
- A conversation that someone started with the token alone acts as the token.

The tools of the wiki and of the faces write with the rights of the token. Anyone who can talk to the manager can therefore write a page through it.

??? note "Under the hood"

    The `tools.mcp` entry of the manager sends the static token and is marked `trusted`. The kernel of the worker fills `_meta` of each call from the ledger of the run, with the run and the person. The package `manager` of the workbench turns that into the actor of the call (`manager.OnBehalf`). `manager.Guard` decides each check for the person and for the token. `fw-workbench doctor` has a line `manager` that checks the pool, the entry, and its `trusted` flag. See [section 19 of the workbench architecture](../design/workbench-architecture.md#19-the-manager).

## Its name on what it does

Everything that the manager does carries its name and yours, so a reader of the record knows who asked:

- A decision of the manager names you as the decider. Its note reads `by manager run 01K... for alice:` and then the note of the manager.
- A message of the manager to another run starts with the line `From the manager run 01K... for alice.`
- A run that the manager starts carries the metadata `fw.via` with the value `manager:` and the id of its run.

## What you hand over in a bridge

Inside a bridge, the manager can act for you only where you allow it. Open the bridge, press More, and pick What the manager can do. New bridge offers the same switches:

| Switch | What the manager can then do in this bridge |
|---|---|
| Decide for members | Allow or deny the decisions of the seats |
| Change the budgets of members | Give a seat more room, or less |
| Add and remove members | Seat a member, fire one, or stop the run of a seat |
| Write a report on close | Write the report of the bridge at its close |

Without the switch, the call fails, and the manager reads that you did not hand that action over. It then tells you. Outside a bridge, only the rules of the manager bind it. For a duty, the manager can also decide some decisions while you are away. [Decisions while away](decisions.md#decisions-while-away) says which ones.

## What to ask it

The manager reads before it acts, and it builds on a bridge that already does the work. Some requests that fit its tools:

- "What is the fleet doing right now?"
- "Open a bridge for the release notes of 2.4, with scribe and a reviewer."
- "Write a report of the nginx migration into the wiki."
- "Create an agent that triages the support queue."
- "Draw a face for scribe."

A bridge that finishes or goes quiet does not wake the manager. So the manager never promises a later report. After it opens a bridge, it names the bridge, and you follow the work there.

## Where to go next

<div class="paths" markdown>

- [Bridges and seats <span>The work that the manager opens for you</span>](bridges.md)
- [Decisions and activity <span>The cards that the manager shows before it acts</span>](decisions.md)

</div>

## Sources

- `featherweight-bossmode/docs/COPY.md`
- `featherweight-bossmode/src/ui/Manager.tsx`
- `featherweight-bossmode/src/ui/Channel.tsx`
- `featherweight-bossmode/src/ui/NewBridge.tsx`
- `featherweight-bossmode/src/lib/words.ts`
- `featherweight-bossmode/src/lib/decision.ts`
- `featherweight-workbench/docs/ARCHITECTURE.md`, sections 17.4 and 19
- `featherweight-workbench/examples/bossmode/README.md`
- `featherweight-workbench/examples/bossmode/fw.yaml`
- `featherweight-workbench/manager/actor.go`
- `featherweight-workbench/manager/delegate.go`
- `featherweight-workbench/bridges/types.go`
