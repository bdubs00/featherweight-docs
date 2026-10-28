# Skills, tools, and packages

A skill is a page of instructions that an agent loads for a task. In bossmode you see every skill and tool of the fleet. You add a skill without a restart, and you hand a skill to a running conversation with a slash command. You also give the workers of an agent extra software, and save a bridge as a playbook to open again.

<div class="demo" data-demo="skills-slash" markdown>

You type `/release-notes v2.4` in a chat. The workbench reads the `SKILL.md` of the skill, puts `v2.4` in place of `$ARGUMENTS`, and sends the result as a pinned message. When the context of the run fills, a summary replaces the history, and the pinned skill follows the summary word for word. The same words pasted as a plain message go into the summary.

</div>

## The Skills place

Skills is a place of the app bar. Its list pane holds the skills in groups by origin: Imported, Local, and one group for each tool server. Below them, under Tools, come the tools: Built in, then one group for each server. A Find a skill field shows once the list holds more than ten items.

Pick a skill, and the main pane shows its description and the line that calls it, such as `/release-notes [version]`. A skill that only a model loads shows no such line. The text of its `SKILL.md` follows, and then Agents that can load it, each a link to the agent in Fleet. The details pane holds the key Copy, which copies the slash command, and Remove for an imported skill.

The list holds every skill that the workbench knows, the catalog. It holds the skills in the skills directories of the workbench, and the skills of each MCP server in `tools.mcp`, named `<server>/<name>`. It also holds the skills that an admin imported. The workbench reads the front matter of each `SKILL.md`, and four keys change what bossmode offers:

| Key | What it does | Default |
|---|---|---|
| `user-invocable` | `false` keeps the skill out of the slash menu | `true` |
| `disable-model-invocation` | `true` asks that a model never load the skill on its own | `false` |
| `argument-hint` | The words after the name in the slash menu, such as `[version]` | empty |
| `arguments` | Names for the arguments, so the body can say `$version` | none |

### Which agents can load a skill

The `skills` list of a profile decides it. No list allows every skill, an empty list allows none, and each entry is a name or a glob. The glob `github/*` allows every skill of the server `github`.

New agent shows Skills as a list of check boxes outside Advanced. An agent that you make there loads only the skills that you tick. A whole server ticks on as its glob, so a skill that the server adds later is on too. The profile of an agent counts its skills beside What it can do, and names each skill as a link.

### Tools

A tool row leads with its plain phrase, such as Run a shell command, and its name, such as `bash`, follows small. The main pane names the tool as code and lists Agents that can use it: each agent whose tool list gives the tool by its name, its server, or a glob such as `front.*`. The tools come from the kernel. This place shows them and does not change them. [Profiles, tools, and skills](../concepts/profiles-and-tools.md) explains how a profile grants a tool.

??? note "Under the hood"
    The page reads the catalog from `GET /v1/bossmode/skills` and the tools from `GET /v1/tools` of the kernel. It reads the skills of each agent from `GET /v1/agents/{name}/skills`, which resolves the list of the profile with the matching of the kernel, `fw.SkillAllowed`. The route and the MCP tool `skills_list` exist with `workbench.bossmode.enabled`, for a caller who can start an agent.

## Hand a skill to a run

Type `/` at the start of a message. The menu Commands then lists the skills that the agent can load and that a person can call. The menu sits in the composer of each one-on-one conversation: a chat in Chat, a conversation with an agent in Fleet, the Chat tab of a seat, and the manager. The shared composer of a bridge, Message the bridge, has no slash menu. While you type the arguments, the address line shows the hint, such as `/release-notes [version]`.

The workbench reads `SKILL.md` at the moment of use and fills its placeholders:

- `$ARGUMENTS` takes the whole text after the name.
- `$0`, `$1`, and `$ARGUMENTS[0]` take one word, counted from 0.
- `$version` takes the argument at the place of `version` in the list `arguments`.

If the body fills no placeholder, the workbench adds the line `ARGUMENTS: <args>` at its end. The message starts with the line `Skill: <name>`, then a blank line and the body. It holds at most 64 KB. A command takes no files, so send files in a message of their own.

The message goes out pinned. A pinned message survives every compaction, the step that replaces the history of a run with a summary. The skill therefore stays in the context for the rest of the run. The pinned messages of one run hold at most 64 KB together, and the kernel refuses a message past that bound. In a bridge, the entry carries a quiet chip with the word pinned. The channel shows `Skill: <name>` and one line that sums up the skill.

The message carries the whole body of the skill, so a worker that does not hold the skill still gets its instructions. A worker is a sandbox that runs the work of an agent, and a pool is the set of workers of one agent. The other files of the skill, such as scripts, do not travel with it. A skill that needs its files on a worker must ship with the pool. Only a person sends a slash command: a run never hands a skill to another run.

??? note "Under the hood"
    A conversation outside a bridge takes the command at `POST /v1/bossmode/runs/{id}/skill` with `{"name", "args", "text"}`, and answers 202. A seat takes it at `POST /v1/bridges/{id}/messages` with `skill: {"name", "args"}` and `to` set to the seat. A client such as Claude Code uses the MCP tool `skill_send`. The workbench sends the message with `pinned: true` on `POST /v1/runs/{id}/messages`, and the ledger records `fw.message.received` with `pinned`. The workbench refuses an unknown skill with 404 and a skill with `user-invocable: false` with 400. A message over 64 KB gets 413, and a `SKILL.md` that the workbench cannot read now gets 502.

## Add or remove a skill

An admin, a person that `access.admins` names, sees the key Add skill. It opens a chooser in the main pane, at `#skills/add`, with four tabs:

| Tab | What you give |
|---|---|
| From a marketplace | A skill from a list that the configuration names |
| From an address | An `https` address of a `SKILL.md`, of the folder of a skill in a repository, or of a zip file |
| Paste a SKILL.md | The whole text of one `SKILL.md` |
| Upload files | Pick files or Pick a folder: at most 64 text files, 1 MB together |

Each tab ends in a preview, and nothing is written before Install. The preview shows the fields of the skill, the body that every agent will read, and the files with their sizes. It also lists each problem. A red light with the word blocks stops the install. A grey light with the word note says what the import leaves out, such as a binary file. Read the body before Install, as you read a change of a system prompt.

Install writes the skill into the first skills directory of the workbench. The catalog lists it as imported at once, and the next run of each agent that allows it can load it, with no restart. If an imported skill holds the name, the preview says replaces and the name, and Install takes its place. An install never replaces a skill of the configuration or of a server. To remove an imported skill, pick it and press Remove. The dialog warns that no agent can load the skill after that.

!!! warning
    If the profiles of a pool allow a skill, an install or a removal of that skill replaces the workers of the pool. The pool replaces each worker once it is idle. A replaced worker starts with an empty `/workspace`. If the workbench runs more than one replica, give each replica the same imported skills, or they replace the workers of each other.

The marketplaces come from `workbench.bossmode.marketplaces`. Each one is a JSON list of skills or a repository whose folders `skills/<name>` hold a `SKILL.md`. Without the key, the first tab says that no marketplace is set up.

```yaml
workbench:
  bossmode:
    enabled: true
    marketplaces:
      - {name: team, url: "https://skills.example.com/index.json"}
      - {name: public, url: "https://github.com/example/skills"}
```

??? note "Under the hood"
    The routes are `POST /v1/bossmode/skills/preview`, `POST /v1/bossmode/skills` with the `digest` of the preview, and `DELETE /v1/bossmode/skills/{name}`. The MCP tools are `skill_preview` and `skill_install`, and both refuse a call from a run. The workbench writes `$FW_HOME/skills/<name>/` and the marker `.origin.json` beside `SKILL.md`. It never runs a file of a skill, and it fetches only from public addresses, for at most 30 seconds and 4 MB. The variable `FW_WORKBENCH_BOSSMODE_MARKETPLACES` sets the list as `name=url,name=url`.

## Packages for the workers of an agent

A package is extra software for the workers of one agent: a Python package, or a Program such as `nodejs` or `iproute2`. Each worker installs its packages on the durable volume of its sandbox, so a sleep keeps them. A package that you add reaches every worker of the pool.

Open the profile of an agent that a pool runs, and find the section Packages. While packages are off, it says that the agent has only the programs that it came with. An owner of the agent presses Turn on packages, which also lets the agent ask for packages. Then type a name in the field, pick Python package or Program, and press Add.

Each list shows the version that a ready worker installed. A line says how far the change got, such as "Ready on 2 of 2 workers." A change replaces no worker. The workers take it in about a minute, and work in progress does not stop.

The switch "The agent can ask for a package. You approve each one." lets the agent add or remove a package with its tool `env`. Each add and each remove is a decision for a person. Once you allow it, the workbench writes the change into the pool, so every worker gets it.

Without a package mirror in the configuration of the deployment, the section does not show. A worker reaches only that mirror for packages, so the mirror must need no credential. [Pools and templates](../deployment/pools.md#packages) shows the setting `workbench.packages`.

??? note "Under the hood"
    The section reads and writes `GET` and `PUT /v1/pools/{name}/packages`, and the MCP tools are `packages_get` and `packages_put`. A pool, a template, or the overlay of a pool takes `packages: {on, ask, python, tools}`. The workbench sends a change to each running worker with `PUT /v1/environment`, and the workers report with `fw.env.ready`, `fw.env.failed`, and `fw.env.changed`. Before it saves a new Python package, the workbench asks the mirror. A name that the mirror does not know gets the answer "There is no Python package named X." See [section 14.11 of the workbench architecture](../design/workbench-architecture.md#1411-packages).

## Playbooks

A playbook is a bridge that you saved to open again: its goal, its seats, the placement, the caps, and what the manager can do. It has no title. Open More on a bridge and pick Save as playbook. The name starts from the title of the bridge. The dialog shows the short name that it saves, such as weekly-patching. A name holds 1 to 63 characters: a to z, 0 to 9, `-`, and `_`.

New bridge offers Start from a playbook, which fills its form. A duty can open a bridge from a playbook on a schedule, such as weekly patching, as [Duties](duties.md) explains. The playbooks live in the Duties place, on the tab Playbooks, at `#playbooks`. The page of a playbook shows its goal, its seats, How its bridge runs, and Duties that open it. Its keys are Make a duty, and Rename and Delete under More. If you delete a playbook, each duty that opens it stops until you pick another playbook.

??? note "Under the hood"
    The routes are `GET /v1/playbooks` and `GET`, `PUT`, and `DELETE /v1/playbooks/{name}`. The MCP tools are `playbooks_list`, `playbook_get`, `playbook_put`, and `playbook_delete`. The workbench checks a playbook as it checks the body of `POST /v1/bridges`. It keeps the playbooks in the bucket `<stream>_PLAYBOOKS`, with the last ten values of each. On a bus other than NATS or `mem`, the playbooks are off, and the page says so.

## Where to go next

<div class="paths" markdown>

- [Bridges and seats <span>The channel where seats get your messages and your slash commands</span>](bridges.md)
- [Duties <span>Work that an agent starts on its own, and the bridges that a playbook opens</span>](duties.md)
- [Profiles, tools, and skills <span>How the kernel grants a tool and lists a skill</span>](../concepts/profiles-and-tools.md)

</div>

## Sources

- `featherweight-workbench/docs/ARCHITECTURE.md`, sections 14.11, 20, and 24.2
- `featherweight-workbench/skills/skills.go`
- `featherweight-workbench/skills/expand.go`
- `featherweight-workbench/skills/import.go`
- `featherweight-workbench/skills/market.go`
- `featherweight-workbench/bossmode/skills.go`
- `featherweight-workbench/bossmode/slash.go`
- `featherweight-workbench/bossmode/imports.go`
- `featherweight-workbench/bossmode/config.go`
- `featherweight-workbench/surface/web/agents.go`
- `featherweight-workbench/pools/packages.go`
- `featherweight-workbench/fleet/environment.go`
- `featherweight-workbench/workers/routes.go`
- `featherweight-workbench/workers/tools.go`
- `featherweight-workbench/playbooks/routes.go`
- `featherweight-workbench/playbooks/tools.go`
- `featherweight-kernel/fw/skills.go`
- `featherweight-kernel/fw/message.go`
- `featherweight-kernel/docs/ARCHITECTURE.md`, sections 5.4 and 5.5
- `featherweight-kernel/examples/fw.yaml`
- `featherweight-bossmode/src/ui/Skills.tsx`
- `featherweight-bossmode/src/ui/AddSkill.tsx`
- `featherweight-bossmode/src/ui/SkillPicker.tsx`
- `featherweight-bossmode/src/ui/NewAgent.tsx`
- `featherweight-bossmode/src/ui/Profile.tsx`
- `featherweight-bossmode/src/ui/Composer.tsx`
- `featherweight-bossmode/src/ui/Chat.tsx`
- `featherweight-bossmode/src/ui/Member.tsx`
- `featherweight-bossmode/src/ui/Packages.tsx`
- `featherweight-bossmode/src/ui/Playbooks.tsx`
- `featherweight-bossmode/src/lib/catalog.ts`
- `featherweight-bossmode/src/lib/packages.ts`
- `featherweight-bossmode/src/lib/playbooks.ts`
- `featherweight-bossmode/src/state/people.ts`
- `featherweight-bossmode/docs/COPY.md`
