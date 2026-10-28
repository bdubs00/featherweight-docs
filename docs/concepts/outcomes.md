# Outcomes and check runs

An outcome asks a second model, the grader, to check the answer of a run against a rubric before the run ends. If the grader finds a gap, the run gets one more turn to fix it. A check run is the opposite case: it calls tools and no model, so a duty can look for work without spending tokens.

## An outcome checks the answer

A run can claim work that nobody checked, such as a pull request body that names a test that never ran. An outcome is a block of a profile or of a run request with three keys:

| Key | Meaning | Default |
|---|---|---|
| `rubric` | Plain text that the grader applies. A block without a rubric is off. | empty |
| `grader` | The model of the grader, as a `provider/model` selector or a name from `models`. Empty means the model of the run, so an outcome never picks a paid model by itself. | empty |
| `iterations` | The most grader passes, from 1 to 10. With 1, the grader grades once and never asks for a revision. | `1` |

```yaml
agents:
  migrator:
    outcome:
      rubric: |
        Each claim of the answer names the command that shows it.
        The playbook runs twice without a change.
      iterations: 2
```

The block of a request replaces the block of the profile as a whole, so a request with `outcome: {}` turns the outcome off. A child run never takes the outcome of its profile. Each child of a graded agent therefore pays for no grader of its own. The kernel resolves the outcome at the queue of the run and records it in `fw.run.queued`. The run keeps it for its life.

## How a grader pass works

The grade comes at the end of a successful run only: the last turn ended with an answer, and the run is about to complete. A run that fails, stops at a limit, or is canceled gets no grade.

The grader run is a child of the run, of the same profile, in the same process, because it reads the files of the run. It has its own system prompt and one tool, `files`, which can only view. It works alone: the kernel denies every approval and every question of the grader. Its budget is 6 turns, 24 tool calls, and 10 minutes of working time, within the budget of the run.

The grader reads the rubric, the task of the run, its final answer, and the files that the run changed, each within a bound. The last line of its answer must be one JSON object:

```json
{"verdict": "needs_revision",
 "notes": "The answer claims a clean second run, but no command shows it."}
```

The kernel records each pass as `fw.outcome.evaluated` on the run.

| Verdict | Who says it | What follows |
|---|---|---|
| `satisfied` | the grader | The run completes with its answer. |
| `needs_revision` | the grader | Before the last pass, the run gets one more turn with the notes. |
| `max_iterations` | the kernel | The grader asked for a revision at the last pass. The run completes. |
| `unparsed` | the kernel | The answer of the grader did not parse, or the grader run failed. The run completes. |
| `skipped` | the kernel | No grader started, for example because the budget was used up. The run completes. |

For a revision, the kernel adds a message with the note kind `outcome` that holds the notes of the grader. The next turn starts from it, as from a follow-up, and the end of that turn starts the next pass.

The run completes with its last answer whatever the verdict. The verdict is a grade beside the answer, not a failure. The run object shows the latest pass in the field `outcome`, so every surface shows the verdict next to the answer.

!!! warning
    If a rubric holds a secret or a private fact, every viewer of the run can read it. The rubric enters the ledger: the resolved outcome is part of `fw.run.queued`, and the input of each grader run holds it.

??? note "Under the hood"
    The loop is `fw/outcome.go`, and one call at the end of a successful turn starts it. The grader run has the idempotency key `outcome:<run>:<seq>`, so a restart during a pass takes the same grader run. A hosted agent program starts no grader and records `skipped`. For a workbench that builds runs from the event stream, `bus.egressTypes` of the workers must include `fw.outcome.evaluated`. See [20. Outcomes](../design/kernel-architecture.md#20-outcomes).

## A check run calls no model

A check run makes a few tool calls and calls no model. The workbench of a fleet starts one for the check of a duty. If the check finds work, the workbench wakes the model of the duty. A quiet queue therefore costs no tokens.

A run request takes a `check`. `POST /v1/runs`, a message of the bus intake, and the Go API take the same shape:

```json
{
  "agent": "triage",
  "input": "",
  "check": {
    "steps": [
      {"tool": "servicenow.query_incidents", "input": {"query": "priority<=2"}}
    ],
    "timeout": "30s"
  }
}
```

| Field | Rule | Default |
|---|---|---|
| `steps` | 1 to 5 tool calls, in order. Each step has `tool`, a tool of the agent, and `input`, a JSON object. | required |
| `timeout` | The time limit of the whole check, at most 60 seconds | `30s` |
| `maxBytes` | The most bytes that the output keeps of each result, at most 4 MiB | 1 MiB |

The kernel makes the calls in order, through the same budget, policy, and tool limits as any call, and records `fw.tool.requested` and `fw.tool.responded` for each. Nobody answers a check, so it never waits for a person:

- If the policy asks before the tool of a step, the run fails at once and names the step, the tool, and the rule.
- If the policy denies the tool, or the agent has no such tool, the run fails.
- An error result of a tool does not fail the run. The result has `"isError": true`, and the next step runs.

The output of a completed check run is JSON with one result per step: `{"results": [{"tool", "output", "isError"}]}`. If the text of a result parses as JSON, `output` is that JSON. A result longer than `maxBytes` keeps its start and gets `"cut": true`. The usage of a check run counts tool calls and no tokens.

A check run takes no follow-up and no branch, because a message starts the model, and it has no outcome. A check run that a restart cut off after its first call fails, because the kernel never runs a check twice. The kernel sets the metadata `fw.kind` to `check`. `GET /v1/runs` leaves check runs out, and the query `kind=check` lists them alone.

### How a duty uses a check run

A duty with a check that names a tool of its agent, such as a query of a ticket queue, needs the worker: the worker holds the tool, its credential, and its egress. The workbench puts a check run on the queue of the pool of the agent and waits up to 60 seconds for it. It reads the output, finds the items that hold work, and starts a run of the agent only for new work. See [Duties](../guide/duties.md) and [24.3 A check with a tool of the agent](../design/workbench-architecture.md#243-a-check-with-a-tool-of-the-agent).

## Where to go next

<div class="paths" markdown>

- [Duties <span>Work that an agent starts on its own, on a schedule or an event</span>](../guide/duties.md)
- [Safeguards <span>The policy and the budget that every call goes through</span>](safeguards.md)

</div>

## Sources

- `featherweight-kernel/docs/ARCHITECTURE.md` (sections 20 and 23)
- `featherweight-kernel/fw/outcome.go`
- `featherweight-kernel/fw/turn.go`
- `featherweight-kernel/fw/check.go`
- `featherweight-kernel/surface/native/native.go`
- `featherweight-workbench/docs/ARCHITECTURE.md` (sections 22.6 and 24.3)
