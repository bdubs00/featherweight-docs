# Safeguards

A run spends money, calls tools, and changes files. The kernel bounds all three. This page names each safeguard and its default: the budget, the loop guard, the tool limits, the policy, the external decision point, approvals, and the redaction of secrets.

## The budget

A budget has seven limits (the type `Budget` in `fw/run.go`). Four bound the size of a run, and three bound its shape. The defaults come from `DefaultConfig` in `fw/config.go`, and `examples/fw.yaml` shows them under `budget:`.

| Limit | Default | Holds for | What it stops |
|---|---|---|---|
| `maxTurns` | 200 | the run | A run that calls the model again and again |
| `maxTokens` | 2,000,000 | the tree | A run, with its child runs, that reads more than the context can hold |
| `maxCostUSD` | 0 (off) | the tree | Spend above a price. It needs a price table under `prices:`. |
| `deadline` | 2h | the lineage | A run that works too long. It counts working time, not the time that the run waits. |
| `maxToolCalls` | 1000 | the tree | A run, with its child runs, that calls tools without end |
| `maxCallsPerTurn` | 32 | the run | One response that fans out into too many calls |
| `maxRepeats` | 5 | the run | The same call, or the same cycle of calls, again and again |

A run takes its budget from the request, then from the profile, then from `budget:` in `fw.yaml`. When it queues the run, the kernel resolves the budget once and records it in `fw.run.queued`. A later change of the configuration reaches new runs only. A zero field means no limit for that field. Before every model call, and before the tool calls of a response, the kernel compares the usage with the budget. At a limit it appends `fw.budget.exceeded` with the limit, the value, and the limit value. The design document gives the rules in [section 5.2](../design/kernel-architecture.md#52-budget).

## The notes at 75 and 90 percent

A model does not see its budget. Before a model call, the kernel measures the use of each limit. When the use passes 75 percent, the kernel adds a note that asks the model to plan the rest of the work. When the use passes 90 percent, a second note asks the model to wrap up. The thresholds are the constants `notePlan` and `noteWrapUp` in `fw/budget.go`. A note for `maxTurns` at 90 percent reads like this:

```
Budget note: this is model turn 180 of the 200 that the budget of this run allows (budget.maxTurns, 90% used). 20 turns are left after this one. Wrap up now: finish the step that you are on, then end your turn with a report of what you did, what is left, and where your work is (files, branches). If the run reaches the limit first, the kernel asks you for that report in one last call without tools.
```

A note is a `fw.message.received` event with the role `system`, the origin `kernel`, and the note kind `budget`. Its field `budget` names the limit, the threshold, the use, and the limit value. If an ancestor holds the limit, the field names that run too. Each note comes once for each limit, limit value, run, and threshold. A use that jumps past 90 percent gets the 90 percent note alone. The first model call of a run gets no note. A resume and a branch read the notes from the ledger and give none twice.

## The final report

A run that stops at a limit without a word leaves an empty output. Three fields of the budget shape the report that fills it.

| Field | Default | What it does |
|---|---|---|
| `finalReport` | `true` | At a limit of turns, tool calls, or working time, one more model call writes the report. `false` stops the run at once. |
| `reportMaxTokens` | 1024 | The output cap of the report call. Zero takes the default. |
| `reportTimeout` | 2m | The time limit of the report call. Zero takes the default. |

The report call has the prefix of a turn, so it reads the prompt cache of the run. Its history ends with a system note of the kind `report`: report what the run did, what is left, and where the work is, with text only. The kernel runs no tool call of the answer. The text becomes the output of the run, which still finishes as `failed` with an error such as `budget exceeded: deadline`. The call is not a turn: its `fw.model.requested` carries `report`, and the count of turns does not grow. Its tokens and its cost count in the usage of the run.

The call comes only at `maxTurns`, `maxToolCalls`, or `deadline`, and never at `maxTokens` or `maxCostUSD`, because it spends money. The kernel also checks the room for the call (`reportFits`). The whole context plus the output cap must fit what the run and its lineage have left of tokens and cost. A run that stops at a limit that an ancestor holds for its tree stops at once, and the ancestor reports. A run makes one report for each budget: a follow-up without a change of the budget fails at once again, with the earlier report as its output. A call that fails or takes too long appends `fw.error`, and the run finishes with no output.

## A change of the budget

A person changes the budget of a run with `PATCH /v1/runs/{id}/budget`, with the tool `run_budget` of the workbench, or with `Agent.ChangeBudget`. A follow-up with the field `budget` on `POST /v1/runs/{id}/messages`, or the tool `send` with a budget, changes it before the message. Each field that the change sets replaces the same field of the budget of the run. A zero field keeps the field as it was. The kernel records the change as `fw.budget.changed` with the fields, the subject of the person, and the origin. A change needs the operator role on the run.

Every limit counts the whole run. A run that failed after 45 minutes at a deadline of 45 minutes gets 30 more minutes from `deadline: 75m`, not 75. A running run reads the new budget at its next check. Its next model call carries a note that lists the limits now and the use of each. A change of a finished run leaves it finished, and a follow-up starts it with the new budget. The parent of a child in another process refuses a change of the child with a 400 that names the process.

## The budget of a tree

A run and every run under it are the tree of the run. The limits hold in three ways:

- `maxTokens`, `maxCostUSD`, and `maxToolCalls` hold for the tree. The usage of the run and of every run under it counts against the budget of each run above them. Runs in other processes count too.
- `maxTurns`, `maxCallsPerTurn`, and `maxRepeats` hold for each run alone.
- The `deadline` counts the working time of the run and of each ancestor. If a child or any of its ancestors uses up its working time, the child stops.

The children of a run share what it has left. No child gets a grant up front, so children that work at the same time draw on one pool. A child also gets the budget of its parent as a cap on its own limits (`Budget.Cap`). A child alone therefore never outgrows its parent. A child whose parent turns the final report off gets no report either.

When a tree reaches a limit, the run that sees it first appends `fw.budget.exceeded`. The event carries the scope `tree` and the run whose budget holds the limit. That run finishes as `failed`. The kernel then cancels every open run under that run, at any depth, in this process and in other processes. A new child in a tree with nothing left is refused (`fw.ErrTreeBudget`), and `spawn_task` tells the model which limit ran out. The check is live, not a reservation. Each run that works at the same time can therefore pass a limit by one model call and the tool calls of one response.

## The loop guard

A model that loops makes the same tool call with the same input again and again. Every tool call of every response has a fingerprint: the tool name and the input as canonical JSON. After each response, `stepTools` in `fw/turn.go` looks at the end of the fingerprint list for a cycle of one, two, or three calls. It counts how many times in a row the cycle appears.

One repeat before `maxRepeats`, the kernel appends `fw.loop.detected` with the action `warned` and adds a system note of the kind `loop`:

```
You have made the same bash call 4 times in a row with the same input. Repeating it will not change the result. Change your approach, or stop and report what blocks you. If you repeat it once more, this run ends.
```

At `maxRepeats`, the kernel appends `fw.loop.detected` with the action `failed`, then `fw.budget.exceeded` with the limit `maxRepeats`. The run finishes as `failed` with the text of the last response as its output. The error names the tool and the count. `maxRepeats: 0` turns the guard off. The guard counts calls that ran, calls that the policy denied, and calls that failed alike. A profile that polls on purpose raises `maxRepeats`. See [section 5.7](../design/kernel-architecture.md#57-loop-guard).

## The tool limits

Every tool call goes through the middleware `fw.LimitTools` in `fw/limits.go`. The configuration `tools.limits` sets the defaults, and `tools.limits.perTool` overrides them per tool name or glob. An exact name wins over a glob, and the first glob in sorted order wins among globs.

| Limit | Default | Effect |
|---|---|---|
| `maxInputBytes` | 262144 (256 KB) | A larger input does not run. The model reads an error that names the limit. |
| `maxOutputBytes` | 102400 (100 KB) | A larger result keeps its head and its tail, two thirds and one third. A note at the cut says how many bytes are gone. |
| `timeout` | 10m | A call that runs longer gets an error result, and its context ends. |

In a run, the kernel writes the full text of a cut result to `.fw-tool/<call id>.txt` in the directory of the run. It replaces every secret in that file and records `fw.file.changed`. The note at the cut names the file, so the model reads the part that it needs with the `files` tool and a line range. An image or a document in a result counts with its size. If it does not fit, the kernel drops it with a note. The middleware wraps every tool outermost. The limits therefore apply to the built-in tools, to MCP tools, to A2A peers, and to tools from Go options alike. See [section 7.7](../design/kernel-architecture.md#77-tool-limits).

`maxCallsPerTurn` is a limit of the budget, not of the middleware. A call past it does not run. The model reads an error result that asks for fewer calls per response.

## The policy rules

The policy decides whether a tool call runs: `allow`, `deny`, or `ask`. The rules come from three places: `policy:` in `fw.yaml`, the profile of the run, and the profiles of every ancestor. The type is `Rules` in `fw/policy.go`. The default is `default: allow` with `ask: [destructive]`, so `bash` and every other destructive tool ask a person first.

```yaml
policy:
  default: allow
  ask: [destructive]
  deny: ["bash: git push*", "files: path=*.env"]
```

A rule is one of four forms:

| Form | Example | Matches |
|---|---|---|
| a flag | `destructive` | every tool with that flag: `readonly`, `idempotent`, `destructive`, or `parallel` |
| a tool glob | `git.*` | the tool name |
| a tool and a command pattern | `bash: git push*` | the `command` field of the input |
| a tool, a field, and a pattern | `files: path=*.env` | that string field of the input |

In a command or field pattern, `*` matches any text, slashes included, and `?` matches one character. If the input holds the named field, the field form applies. Otherwise the text matches the command, so `bash: FOO=bar*` still matches a command. A tool can resolve its input before the policy decides (`fw.Resolver`): the `files` tool gives the real path of the file, relative to its root. A deny or an ask rule matches the path of the model or the resolved path. An allow rule matches only the resolved path, so `docs/../secrets/a` does not pass `allow: ["files: path=docs/*"]`.

Deny wins over ask, and ask wins over allow. If no rule matches, `default` applies. An empty `default` means `allow`. The key `all` holds independent clauses. Each clause decides by itself, and the strictest verdict wins. `fw.MergeRules` builds such a conjunction from two sets of rules, so no list is flattened.

A profile adds its own `policy` block. The kernel joins it with the rules of every ancestor of the run (`runRules` in `fw/turn.go`). The stricter verdict wins against the policy of the process. A profile can therefore tighten the rules but not loosen them, and an inline profile on a request can only tighten too. A run keeps the rules that it was queued with, and the rules that its profile has now apply on top. A rule that a person adds to a profile therefore takes effect at once on the runs that are going. When a person allows a waiting call, the kernel checks these rules again, and a deny that arrived meanwhile wins. See [section 7.5](../design/kernel-architecture.md#75-policy).

## The external decision point

With `policy.external`, a control plane outside the process decides every tool call in place of the rules of `policy:`. The block has four fields, from the type `ExternalPolicyConfig` in `fw/config.go`:

| Field | Meaning | Default |
|---|---|---|
| `mcp` | The name of a `tools.mcp` entry. Its endpoint, TLS, and authentication apply. | none |
| `tool` | The tool on that server | `decide` |
| `bus` | The bus subject that receives the requests | none |
| `timeout` | The limit of one request | `5s` |

A block sets exactly one of `mcp` and `bus`, or the process stops at start. The request is a JSON object with `kind: policy` and `version: 1`. It holds the tool and its flags, the call id, the input, the resolved input, and the run. The answer is one verdict, `allow`, `deny`, or `ask`, with an optional reason. If the control plane does not answer in time, the kernel denies the call. An unknown verdict is denied too, and the model reads the reason. The rules of the profile and of the ancestors still apply and can only make the verdict stricter.

Over MCP, the kernel calls the tool with the request as its arguments and reads the answer from `structuredContent`. The model never sees the tools of that server. Over the bus, the kernel publishes `fw.decision.requested` with a reply subject, and a responder publishes `fw.decision.answered`. `fw doctor` prints one line per decision point. The requests, the answers, and the authorization decisions of the workbench are in [section 13.5](../design/kernel-architecture.md#135-external-decisions).

## Approvals

A verdict of `ask` appends `fw.approval.requested` with the tool, the call id, the input, and the reason of the rule. The run moves to `input-required`, and the driver exits. Every surface shows the pending approval, and every surface accepts a decision: `POST /v1/runs/{id}/approvals/{approval}`, the tool `approve` of the workbench, or the terminal of `fw run`. A decision appends `fw.approval.decided` with the decider, so every action has a name on it. A decision needs the operator role on the run. The flow is on [The run lifecycle](../concepts/run-lifecycle.md#waiting-for-a-person).

A surface shows a button for an approval. A tool whose calls all mean one thing sets the label (`Action` in `ToolSpec`): `bash` sets `Run command`, `http` sets `Send request`, `spawn_task` sets `Hand off task`, and `send` sets `Send message`. A tool of an MCP server with `trusted: true` takes its label from the title of the tool. Every other tool gets a neutral label.

## The redaction of secrets

Before the kernel appends an event, the redactor in `fw/redact.go` replaces each secret in the data with `[redacted]`. The model builds its history from the stored events, so the model does not see the secret either. A secret is one of these:

- A value that `fw` resolved through `Secrets`, such as a model API key or `FW_API_TOKEN`.
- The value of a variable with a secret name. Such a name holds `API_KEY`, `KEY`, `TOKEN`, `SECRET`, `PASSWORD`, `PASSWD`, `PASS`, `PAT`, or `CREDENTIAL`. Some last words mark a name as not secret, because such a name says where a secret is. They are `FILE`, `PATH`, `DIR`, `ENV`, `NAME`, `ID`, `MODE`, `TYPE`, `URL`, and `HEADER`.
- Text with the shape of a secret. The shapes are a PEM private key, a provider token, a JWT, and the user information of a URL. A bearer token counts too, on the same line as the word `Bearer`. The provider tokens are those of Anthropic, OpenAI, GitHub, GitLab, Slack, AWS, Google, Hugging Face, and npm.

A value of fewer than eight characters is not replaced. The raw provider blocks stay unchanged, because the provider signs them, and so do the bytes of an image or a document. `a.Redact` applies the same rules to a log line, and the full text of a cut tool result is redacted in the same way. The rules of section 13 of the design document hold the rest: tool results are data and not instructions, the `files` tool never opens the home of `fw`, and `auth.mode: none` must stay off a reachable listener. See [section 13.4](../design/kernel-architecture.md#134-rules).

## Sources

- `featherweight-kernel/fw/run.go`
- `featherweight-kernel/fw/budget.go`
- `featherweight-kernel/fw/config.go`
- `featherweight-kernel/fw/turn.go`
- `featherweight-kernel/fw/kernel.go`
- `featherweight-kernel/fw/limits.go`
- `featherweight-kernel/fw/policy.go`
- `featherweight-kernel/fw/external.go`
- `featherweight-kernel/fw/redact.go`
- `featherweight-kernel/fw/event.go`
- `featherweight-kernel/tools/builtin/builtin.go`
- `featherweight-kernel/examples/fw.yaml`
- `featherweight-kernel/docs/ARCHITECTURE.md` (sections 5.2, 5.7, 7.5, 7.7, and 13)
