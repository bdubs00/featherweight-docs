# Safeguards

A run spends money, calls tools, and changes files, often with nobody watching. The kernel bounds all three. A policy decides every tool call, a budget caps the run, and a redactor keeps secrets out of the ledger and away from the model.

<div class="demo" data-demo="policy" markdown>

The policy of this demo denies `bash: git push*` and `bash: rm -rf*`. It asks before `bash: git commit*`. It allows `bash: git status`, `bash: git diff*`, and `bash: go test ./...`, and it asks for everything else. Type a command to see the verdict and the rule that matched. `git diff && git push` is denied: the allow rule matches the whole command, but the deny rule matches the part `git push`, and deny wins.

</div>

## The policy rules

The policy decides each tool call before it runs: `allow`, `ask`, or `deny`. An `ask` holds the call until a person decides. A `deny` gives the model the error `denied by policy:` and the reason, and the call never runs. The rules come from `policy:` in `fw.yaml`, from the profile of the run, and from the profiles of every ancestor of the run.

The default is `default: allow` with `ask: [destructive]`. Of the built-in tools, only `bash` has the flag `destructive`, so it asks a person first. An A2A peer has the flag too. An MCP tool has it unless its server marks it read-only or not destructive. A rule takes one of four forms:

| Form | Example | What it matches |
|---|---|---|
| A flag | `destructive` | Every tool with that flag: `readonly`, `idempotent`, `destructive`, or `parallel` |
| A tool name | `git.*` | The tool name, with `*` as a wildcard |
| A tool and a command | `bash: git push*` | The field `command` of the input |
| A tool, a field, and a pattern | `files: path=*.env` | That field of the input |

In a command or a field pattern, `*` matches any text and `?` matches one character. The kernel reads the lists in a fixed order: deny first, then ask, then allow. The first rule that matches decides. If no rule matches, the default decides. The order of the lines in the file does not matter.

### Commands with many parts

A model often joins commands, as in `cd /work && git push`. So a deny or an ask rule also matches each part of a command. The kernel splits the text at `&&`, `||`, `;`, `|`, `&`, and a new line, but not inside quotes. It also reads the text inside `$( )` and backquotes. It reads the command after a runner such as `sudo`, `env`, `xargs`, or `bash -c`. And it reads the command after a variable assignment such as `FOO=1`.

An allow rule matches the whole command only. One part never allows the other parts, so `bash: git status` does not allow `git status && make`. A trailing `*` in an allow rule matches the rest of the text, so `bash: git diff*` matches `git diff && make` too. A deny or an ask rule on a part still wins over it.

A command pattern guards against the plain forms of a command, and it is not a sandbox. `git push*` does not match `git -C repo push`, a command in a variable, or a script that runs `git push`. A limit that must hold also needs a missing credential, a narrower tool, or the egress policy of the Task.

### Profiles and outside decisions

A profile adds its own `policy` block, and the stricter verdict wins. A profile can tighten the rules of the process but never loosen them, and the same holds for the profile of a parent run. When a person allows a call that waited, the kernel checks the profile rules again, and a deny rule that arrived meanwhile wins.

With `policy.external`, a control plane outside the process decides every call in place of the rules of `policy:`. It answers over MCP, with the keys `mcp` and `tool` (default `decide`), or over the bus, with the key `bus`. A block sets exactly one of the two. If no answer comes within `timeout`, 5 seconds by default, the kernel denies the call. The rules of the profiles can still only make the verdict stricter. See [section 13.5](../design/kernel-architecture.md#135-external-decisions) of the kernel architecture.

??? note "Under the hood"
    The rules are `Rules` in `fw/policy.go`, and the split of a command is `commandForms` in `fw/command.go`. A command that passes a bound of the split, 8 levels of nesting or 16 MiB of parts, matches every deny and ask rule. The key `all` holds clauses that each decide alone, and the strictest verdict wins (`fw.MergeRules`). The `files` tool gives the policy the real path of a file (`fw.Resolver`). A deny or an ask rule matches the path of the model or the real path, and an allow rule matches the real path only. So `docs/../secrets/a` does not pass `allow: ["files: path=docs/*"]`. The demo above runs a port of these functions in the browser.

## Approvals

A verdict of `ask` appends `fw.approval.requested` with the tool, the input, and the reason, such as `rule: ask bash: git commit*`. The run moves to `input-required`, and no process waits for it. Bossmode shows a decision card, and Claude Code sees the run in the state `input-required`. A decision appends `fw.approval.decided` with the name of the person, so every action has a name on it. Deciding needs the operator role on the run. [The run lifecycle](run-lifecycle.md#waiting-for-a-person) follows the wait.

The kernel gives each call a label for the key that allows it. `bash` has `Run command`, `http` has `Send request`, `spawn_task` has `Hand off task`, and `send` has `Send message`. A tool of an MCP server with `trusted: true` takes the title of the tool. Every other tool gets a neutral label. Bossmode words some keys itself, such as Hand off for `spawn_task` (see [Decisions and activity](../guide/decisions.md#an-approval-of-a-tool-call)).

## The budget

A budget has seven limits. The defaults are in `budget:` of `fw.yaml`.

| Limit | Default | Counts | What it stops |
|---|---|---|---|
| `maxTurns` | 200 | the run | A run that calls the model again and again |
| `maxTokens` | 2,000,000 | the tree | A run and its child runs that read too much |
| `maxCostUSD` | 0, off | the tree | Spend above a price. It needs a price table under `prices:`. |
| `deadline` | 2h | the lineage | A run that works too long. Time spent waiting does not count. |
| `maxToolCalls` | 1000 | the tree | A run and its child runs that call tools without end |
| `maxCallsPerTurn` | 32 | the run | One answer that asks for too many tool calls |
| `maxRepeats` | 5 | the run | The same call, or the same short cycle of calls, again and again |

The tree of a run is the run and every run under it, also in other processes. A limit of the tree counts the use of all of them, and the children share what their parent has left. The lineage is the run and its ancestors. If the child or any ancestor runs out of working time, the child stops.

A run takes its budget from the request, then from the profile, then from `fw.yaml`. The kernel resolves the budget once, at the start of the run. A later change of the configuration therefore reaches new runs only. A zero field means no limit for that field. Before every model call, the kernel compares the use with the budget.

<div class="demo" data-demo="budget" markdown>

A run with `budget.maxTurns: 10`. Before turn 8, the kernel adds a budget note at 75 percent. Before turn 9, a note at 90 percent asks the model to wrap up. If the run goes on, the next model call past turn 10 stops it. The kernel appends `fw.budget.exceeded` and makes one more call without tools for a report. The run finishes as `failed`, with the report as its output.

</div>

## Notes and the final report

A model does not see its budget. So before a model call, the kernel checks the use of each limit. When the use passes 75 percent, it adds a note that asks the model to plan the rest of the work. When the use passes 90 percent, a second note asks the model to finish its step and report. Each note is a `fw.message.received` event with the role `system` and the note kind `budget`. It comes once for each limit and threshold, and never on the first model call.

At a limit of turns, tool calls, or working time, the kernel appends `fw.budget.exceeded` and makes one last model call without tools. The model reports what it did, what is left, and where its work is. That text becomes the output of the run, which still finishes as `failed`, with an error such as `budget exceeded: maxTurns`. A limit of tokens or cost stops the run at once, because a report call spends more money.

| Field | Default | What it does |
|---|---|---|
| `finalReport` | `true` | `false` stops the run at once at every limit |
| `reportMaxTokens` | 1024 | The output cap of the report call |
| `reportTimeout` | 2m | The time limit of the report call |

A person gives a run more room with `PATCH /v1/runs/{id}/budget`, the MCP tool `run_budget`, or a follow-up with a `budget`. The kernel appends `fw.budget.changed`, and the next model call carries a note with the new limits. Every limit counts the whole run. So a run that failed after 45 minutes at a deadline of 45 minutes gets 30 more minutes from `deadline: 75m`.

??? note "Under the hood"
    The notes and the report are in `fw/budget.go`: the thresholds are `notePlan` and `noteWrapUp`, and the report is `stepReport`. The report call needs room: the whole context and its output cap must fit what is left of `maxTokens` and `maxCostUSD`. A run makes one report for each budget, so a follow-up without a change fails again at once with the same report. If a tree reaches a limit, the kernel cancels every open run under the run that holds the limit. A new child in a spent tree is refused (`fw.ErrTreeBudget`). The check is live, not a reservation: each run that works at the same time can pass a limit by one model call and its tool calls. See [section 5.2](../design/kernel-architecture.md#52-budget).

## The loop guard and the tool limits

A model in a loop makes the same tool call with the same input again and again. After each answer, the kernel looks for a cycle of one, two, or three calls at the end of the run. One repeat before `maxRepeats`, it appends `fw.loop.detected` with the action `warned` and adds a note:

```
You have made the same tool call (bash) 4 times in a row with the same input. Repeating it will not change the result. Change your approach, or stop and report what blocks you. If you repeat it once more, this run ends.
```

At `maxRepeats`, the run fails with `fw.loop.detected` with the action `failed`, and `fw.budget.exceeded` for the limit `maxRepeats`. Calls that ran, calls that the policy denied, and calls that failed all count. A profile that polls on purpose raises `maxRepeats`, and `0` turns the guard off.

Every tool call also passes through three limits of `tools.limits`, which `tools.limits.perTool` changes for one tool name or pattern:

| Limit | Default | Effect |
|---|---|---|
| `maxInputBytes` | 256 KB | A larger input does not run, and the model reads an error |
| `maxOutputBytes` | 100 KB | A larger result keeps its head and its tail. The full text goes to `.fw-tool/<call id>.txt` in the directory of the run. |
| `timeout` | 10m | A longer call ends with an error result |

The limits hold for the built-in tools, for MCP tools, and for A2A peers alike.

## The redaction of secrets

Before the kernel appends an event, it replaces every secret in the data with `[redacted]`. The model builds its history from the stored events, so the model does not see the secret either. A secret is one of these:

- A value that `fw` resolved as a secret, such as a model API key or `FW_API_TOKEN`.
- The value of a variable with a secret name. Such a name holds a word like `KEY`, `TOKEN`, `SECRET`, `PASSWORD`, `PAT`, or `CREDENTIAL`. A name that ends in a word like `FILE`, `PATH`, `URL`, or `ID` says where a secret is, so its value stays.
- Text with the shape of a secret: a PEM private key, a token of a known provider, a JWT, a bearer token, or the user part of a URL.

A value shorter than eight characters stays. The raw blocks of the provider stay unchanged, because the provider signs them, and so do images and documents. The same rules clean the log lines and the full text of a cut tool result. See [section 13.4](../design/kernel-architecture.md#134-rules) for the other security rules.

<div class="paths" markdown>

- [Profiles, tools, and skills <span>Where a profile sets its policy and its budget</span>](profiles-and-tools.md)
- [Identity <span>Who the caller is, and how an agent acts for a person</span>](identity.md)

</div>

## Sources

- `featherweight-kernel/fw/policy.go`
- `featherweight-kernel/fw/command.go`
- `featherweight-kernel/fw/external.go`
- `featherweight-kernel/fw/turn.go`
- `featherweight-kernel/fw/budget.go`
- `featherweight-kernel/fw/tree.go`
- `featherweight-kernel/fw/run.go`
- `featherweight-kernel/fw/config.go`
- `featherweight-kernel/fw/limits.go`
- `featherweight-kernel/fw/redact.go`
- `featherweight-kernel/fw/event.go`
- `featherweight-kernel/tools/builtin/builtin.go`
- `featherweight-kernel/tools/builtin/bash.go`
- `featherweight-kernel/tools/builtin/http.go`
- `featherweight-kernel/tools/mcp/mcp.go`
- `featherweight-kernel/tools/a2a/a2a.go`
- `featherweight-kernel/examples/fw.yaml`
- `featherweight-kernel/docs/ARCHITECTURE.md` (sections 5.2, 5.7, 7.5, 7.7, 13)
