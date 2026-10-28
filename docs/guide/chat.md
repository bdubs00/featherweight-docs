# Chat with an agent

You can talk to any agent of your fleet one on one, as you message a colleague. The Chat place holds quick questions to a general assistant. The Fleet place holds every other agent, with its profile beside the conversation.

<div class="demo" data-demo="bossmode-tour" data-places="chat,fleet" markdown>

The Chat place lists your past chats by day. It opens a new chat with its tools and skills. The Fleet place lists every agent by bridge, then the agents on no bridge, and shows the profile of the agent beside the conversation.

</div>

## The quick chat

The quick chat is a conversation with one general assistant, beside the bridges. The operator names its agent in the setting `workbench.bossmode.chat.agent`. Without that setting, the Chat place says "No quick chat is set up."

To start a chat, do these steps:

1. Open Chat in the app bar, and press New.
2. Read the quiet line above the composer, such as "Can use files, memory, the time, the wiki, and 2 skills".
3. To change what this chat can use, press that line and turn tools and skills on or off.
4. Type your question, and press Send, or Ctrl+Enter (⌘+Enter on a Mac).

Each chat is one run of the agent: one piece of work with its own limits and log. Each later message follows up in the same run. The answer grows in the conversation as the model writes it. While the agent works, a typing line at the foot names its step, such as `Working: <tool>`.

The list pane holds your chats, newest first, under a heading per day. Each row has the title, the status, and the time since, such as `25 min`. A status is one of `working`, `waiting for a worker`, `needs you`, `answered`, `closed`, `ended`, `failed`, or `stopped`.

The details pane, This chat, says what the chat can do in plain words, one line per ability. A tool that you added for this chat only says `for this chat`. This chat also names the skills, the model, and the usage: turns, tokens, and cost, with `so far` while the run works.

## Talk to an agent in the Fleet place

The list pane of Fleet holds the agents of your fleet. It groups the seats of each open bridge under the title of the bridge, then lists the agents under Not on a bridge. A bridge is one job that several agents share, and a seat is one agent on it. Find a member narrows the list. The Board key shows the statuses of each group at once, and the plus key opens New agent.

Pick an agent on no bridge to open a conversation with it. An empty conversation says "Start a conversation with" the agent, with its tagline. Your first message starts a run on a worker of the agent, a sandbox that runs its work. A later message follows up. If no worker can take a message yet, the composer says why. An example is "The worker of migrator is starting".

The More key in the header holds three items:

- New conversation: an empty conversation with the same agent.
- Past conversations: your earlier conversations with this agent.
- Make this a duty: a new duty that asks the agent for the same work again. See [Duties](duties.md).

The composer takes files: attach them, paste them, or drop them. A `/` at the start of a message opens the skills that the agent can load. [Skills, tools, and packages](skills.md) explains them.

## A seat: Chat, Run, and Files

A seat has its own task on its bridge. Pick a seat in the Fleet list, or in the members of a bridge, to talk to it alone. Its conversation has three tabs:

| Tab | What it holds |
|---|---|
| Chat | The messages from the seat and to it, its decision cards, and the steps of its newest run. A message here goes to this seat alone. |
| Run | The result of the newest run: the status, the failure, the answer, what it did, the limits, and the reactions |
| Files | The files that the run changed, with a viewer, and the pages of the wiki that it wrote |

Run and Files read the run from its worker. If the worker sleeps, the tab says "This read wakes the worker." The More key of a seat holds Profile, Mute, Change task, and Fire. A seat that stopped also offers Seat again, and a seat at its limit offers Continue. [Bridges and seats](bridges.md) explains each of them.

## The profile of an agent

The details pane of a conversation holds the profile of the agent: the setup that says what it is told, what it can use, and its limits. A narrow window hides it, and the face at the head of the conversation opens it. The profile has these sections, from the top:

- The face and the tagline. An owner of the agent has Edit, which changes the name and the tagline.
- What it can do: one plain line per ability, such as "Run shell commands". An amber line names each rule that asks first, such as "Asks before git push". The heading counts the skills, and a line links each skill.
- Duties: the duties of the agent.
- What people liked: the work of the agent that people gave a heart. An agent with no heart has no such section.
- Workers: each worker with its status, and Keep, the number of workers that the agent keeps ready. An owner changes Keep in place.
- Packages, where the deployment has a package mirror. See [Skills, tools, and packages](skills.md).
- Today: the runs, the cost, and the decisions of the agent since midnight.

An owner of an agent that the page made also has More, with Delete agent. The dialog says that this deletes the agent, its workers, and the files on them. Your past conversations with it stay readable. An agent of the setup file of the server has no such key.

### Faces

Every agent has a face before anyone draws one: a five by five pattern from the hash of its name. The same name always gives the same face. An owner can press the face and pick an SVG file of at most 32 KB. The server refuses a picture with a script, a link, or an image inside. Use the default picture, in Edit, gives the agent its pattern back.

You can also ask the manager to draw a face. It calls its tool `faces_put`, and its rules make it ask you first. The decision card shows the text of the SVG, and the face changes only after you allow it.

## New agent

The plus key of the Fleet list opens New agent. The form asks for these fields first:

| Field | What it sets |
|---|---|
| Name | The name of the agent: at most 64 letters, digits, and the marks `.`, `-`, and `_` |
| What it handles | One line about its work |
| How many can work at once? | The number of workers, from 1 to 32. The default is 2. |
| Template | The template of its workers. If the server offers more than one, the field shows. |
| Skills | The skills that it can load |

Advanced holds the model, the effort, the budget of a run, the context compaction, the rules (Ask before and Never run), and the time zone. Preview checks the agent and saves nothing. It shows what the agent can do and the workers that it will get. Create agent saves it with `PUT /v1/agents/{name}`. The workers then start, and the key Open with the name of the agent leads to its conversation.

## When a conversation ends

If its run fails, or someone stops it, a conversation stops. The page then says "Stopped. Your next message starts a new conversation." The Chat place says "a new chat" instead.

If its agent restarts on a new worker, a conversation also closes, because the old worker held it. The page says that you can read it, and that your next message starts a new conversation with a summary of this one. The server gives the new run the last messages of the old one. The new conversation opens with "Continued from" and a link to the old one.

Each row of the Chat list, the Manager list, and Past conversations has a More key with two items:

- Rename opens "Rename the conversation" with the field Name. An empty name gives the conversation back its first words.
- Delete asks "Delete this conversation?" and takes it off your lists. An admin can still read it, and Undo brings it back for a moment.

Rename and Delete change your lists only. Other people see the conversation as it was. If you open a deleted conversation by its link, it says "You deleted this conversation." with the key Put it back in my list.

The status line of a run that ended shows its start and its end, such as "started 9:14 AM, ended 9:20 AM".

## Where to go next

<div class="paths" markdown>

- [Decisions and activity <span>What the cards in a conversation ask, and what each key does</span>](decisions.md)
- [The manager <span>The agent that reads the fleet and opens bridges for you</span>](manager.md)

</div>

## Sources

- `featherweight-bossmode/docs/DESIGN.md`
- `featherweight-bossmode/docs/COPY.md`
- `featherweight-bossmode/src/ui/Chat.tsx`
- `featherweight-bossmode/src/ui/Fleet.tsx`
- `featherweight-bossmode/src/ui/Member.tsx`
- `featherweight-bossmode/src/ui/RunPane.tsx`
- `featherweight-bossmode/src/ui/Conversation.tsx`
- `featherweight-bossmode/src/ui/Profile.tsx`
- `featherweight-bossmode/src/ui/NewAgent.tsx`
- `featherweight-bossmode/src/ui/History.tsx`
- `featherweight-bossmode/src/lib/chat.ts`
- `featherweight-workbench/docs/ARCHITECTURE.md`, sections 4.19 to 4.21, 6, 16, and 17.7
