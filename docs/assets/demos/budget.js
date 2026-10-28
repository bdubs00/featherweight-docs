// The budget of a run, by turns: the notes at 75% and 90% of maxTurns, and
// the final report at the limit. The model follows fw/budget.go and
// fw/turn.go of the kernel:
//   - before each model call, the turn of that call counts as used
//     (budgetUses); a note comes once per limit, limit value, and
//     threshold, and never on the first model call (budgetNotes);
//   - the texts of the notes and of the report instruction are the
//     sentences of budgetNoteText and reportPrompt;
//   - the next model call past maxTurns stops the run (overBudget): the
//     kernel appends fw.budget.exceeded with report true, the report note,
//     one model call without tools, and fw.run.finished with the outcome
//     failed, the error "budget exceeded: maxTurns", and the report as the
//     output (stopOver, stepReport, finishReport);
//   - a follow-up with a budget appends fw.budget.changed before the
//     message, and every limit counts the whole run.

import { h, css, demo, key, ledger, code, wait } from './kit.js';

css('budget', `
.doc .bg-meter { display: grid; gap: 3px; margin: 0; padding: 0; list-style: none; }
.doc .bg-meter > li { margin: 0; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.bg-cell { height: 14px; border-radius: 2px; background: var(--line); }
.bg-meter > li.used .bg-cell { background: var(--ink); }
.doc .bg-caps { display: block; margin-top: var(--s-1); }
.bg-count { font-size: var(--t-control); line-height: var(--t-control-lh); font-weight: 700; font-variant-numeric: tabular-nums; }
.doc .bg-read { margin: 0; padding: 8px 10px; font-size: var(--t-meta); line-height: var(--t-meta-lh); min-height: 72px; }
.bg-read.empty { color: var(--muted); }
`);

const REPORT = 'I fixed 6 of the 9 failing tests. Left: the three tests in api/auth_test.go. My work is on the branch fix/tests, in two commits.';

export default function mount(root) {
  const d = demo(root, {
    title: 'A run near its limit of turns',
    tone: 'grey',
    word: 'no run yet',
    wide: true,
    caption: 'A model of the budget of the kernel, with budget.maxTurns: 10. The notes, the events, and the texts are the ones in fw/budget.go and fw/turn.go.',
  });

  const meter = h('ol', { class: 'bg-meter', 'aria-hidden': 'true' });
  const count = h('span', { class: 'bg-count' });
  const caps = h('span', { class: 'demo-note bg-caps' });
  const readLabel = h('span', { class: 'demo-label', text: 'What the model reads' });
  const read = h('p', { class: 'bg-read recess empty' });
  const log = ledger({ title: 'The ledger', file: 'ledger.jsonl', empty: 'Empty. Press Start a run.' });
  d.stage.append(h('div', { class: 'demo-split' },
    h('div', { class: 'demo-col' }, h('div', null, h('span', { class: 'demo-label', text: 'Model turns' }), count), h('div', null, meter, caps), h('div', null, readLabel, read)),
    log.el));

  let max = 10;
  let turns = 0;
  let answered = false;
  let noted = {}; // the highest threshold of a note, by limit value
  let changed = false; // a change of the budget that no note covered yet
  let reportSinceChange = false;
  let lastReport = '';
  let state = ''; // '', running, completed, failed
  let busy = false;

  function paintMeter() {
    meter.textContent = '';
    meter.style.gridTemplateColumns = 'repeat(' + max + ', minmax(0, 1fr))';
    const at75 = Math.ceil(max * 0.75);
    const at90 = Math.ceil(max * 0.9);
    for (let n = 1; n <= max; n++) meter.append(h('li', { class: n <= turns ? 'used' : '' }, h('span', { class: 'bg-cell' })));
    count.textContent = 'Turn ' + turns + ' of ' + max;
    caps.textContent = 'The notes come before turn ' + at75 + ' (75%) and turn ' + at90 + ' (90%).';
  }

  function show(label, text) {
    readLabel.textContent = label;
    read.textContent = text || 'No note yet. The model does not see its budget.';
    read.classList.toggle('empty', !text);
  }

  async function add(type, detail, fast) {
    log.append(type, detail);
    await wait(fast ? 40 : 160);
  }

  function setState(s) {
    state = s;
    if (s === 'running') d.setStatus('green', 'running');
    else if (s === 'completed') d.setStatus('grey', 'completed');
    else if (s === 'failed') d.setStatus('red', 'failed');
    else d.setStatus('grey', 'no run yet');
  }

  function plural(n, one, many) {
    return n === 1 ? '1 ' + one : n + ' ' + many;
  }

  // noteFor is the budget note before the model call of turn next, or ''.
  function noteFor(next) {
    if (!answered) return '';
    const f = next / max;
    const pct = f >= 0.9 ? 90 : f >= 0.75 ? 75 : 0;
    if (!pct || (noted[max] || 0) >= pct) return '';
    noted[max] = pct;
    const used = Math.floor((next / max) * 100);
    const left = Math.max(max - next, 0);
    let text = 'Budget note: this is model turn ' + next + ' of the ' + max + ' that the budget of this run allows (budget.maxTurns, ' + used + '% used). ';
    text += left <= 0 ? 'This is the last turn.' : plural(left, 'turn is', 'turns are') + ' left after this one.';
    if (pct < 90) return text + ' Plan the rest of the work to fit in what is left.';
    return text + ' Wrap up now: finish the step that you are on, then end your turn with a report of what you did, what is left, and where your work is (files, branches). If the run reaches the limit first, the kernel asks you for that report in one last call without tools.';
  }

  // turn runs one model turn. done ends it with an answer instead of a
  // tool call. It returns whether a note came.
  async function turn(done, fast) {
    const next = turns + 1;
    if (next > max) return stop();
    const notes = [];
    if (changed && answered) {
      changed = false;
      notes.push(['budget changed', 'Budget note: the budget of this run changed. The limits now: ' + max + ' model turns (this call is turn ' + next + '); … Plan the rest of the work with these limits; a note about a limit before the change no longer holds.']);
    }
    const n = noteFor(next);
    if (n) notes.push(['budget ' + (noted[max]) + '%', n]);
    turns = next;
    paintMeter();
    await add('fw.turn.started', 'turn ' + next, fast);
    for (const [detail, text] of notes) {
      await add('fw.message.received', 'system, ' + detail, fast);
      show('What the model reads', text);
    }
    await add('fw.model.requested', '', fast);
    answered = true;
    if (done) {
      await add('fw.model.responded', 'stop end_turn', fast);
      await add('fw.turn.finished', 'turn ' + next, fast);
      await add('fw.run.finished', 'outcome completed', fast);
      setState('completed');
      d.say('The model followed the note and ended its turn with a report, so the run completed inside its budget.');
      return false;
    }
    await add('fw.model.responded', 'stop tool_use: bash', fast);
    await add('fw.tool.requested', 'bash: go test ./...', fast);
    await add('fw.tool.responded', 'exit 1', fast);
    await add('fw.turn.finished', 'turn ' + next, fast);
    if (notes.length) d.say(h('span', null, 'Before the model call of turn ' + next + ', the kernel appended a budget note: ', code('fw.message.received'), ' with the role system and the note kind budget.'));
    else if (next === 1) d.say('Turn 1 gets no note. The model does not see its budget until a note tells it.');
    else if (next === max) d.say('Turn ' + next + ' is the last turn that the budget allows. The next model call would pass the limit.');
    else d.say('Turn ' + next + ' used ' + Math.floor((next / max) * 100) + '% of maxTurns. ' + ((noted[max] || 0) >= 75 ? 'Each note comes once.' : 'No note comes below 75%.'));
    return notes.length > 0;
  }

  // stop is the next model call past the limit, as stopOver and stepReport
  // do it at a limit of turns.
  async function stop() {
    const report = !reportSinceChange;
    await add('fw.budget.exceeded', 'maxTurns ' + turns + ' of ' + max + (report ? ', report' : ''));
    if (report) {
      const prompt = 'Final report: this run reached its limit of ' + max + ' model turns (budget.maxTurns), so it ends now. Do not call any tool; this call runs none. Reply with text only, in at most about 300 words, for the person who started the run: (1) what you did, (2) what is left to do, and (3) where your work is: the files that you changed, the branches and commits, and any other place to look. A person can continue this run later with a follow-up message and a larger budget.';
      await add('fw.message.received', 'system, report');
      show('What the model reads', prompt);
      await wait(500);
      await add('fw.model.requested', 'report, no tools');
      await add('fw.model.responded', 'stop end_turn');
      reportSinceChange = true;
      lastReport = REPORT;
    }
    await add('fw.run.finished', 'outcome failed, budget exceeded: maxTurns');
    show('The output of the run', lastReport);
    setState('failed');
    d.say(report
      ? 'The next model call would pass the limit. The kernel made one more call without tools for the report, which is the output of the run. The run still failed.'
      : 'A follow-up without more turns fails at once again. The earlier report stays the output.');
    return true;
  }

  async function act(fn) {
    if (busy) return;
    busy = true;
    d.setKeys([]);
    await fn();
    busy = false;
    render();
  }

  async function start() {
    log.clear();
    max = 10;
    turns = 0;
    answered = false;
    noted = {};
    changed = false;
    reportSinceChange = false;
    lastReport = '';
    paintMeter();
    show('What the model reads', '');
    await add('fw.run.queued', 'input: make the tests pass, budget maxTurns 10');
    await add('fw.run.started', 'tools bash, files');
    setState('running');
    d.say('The run started with a budget of 10 model turns. Press Next turn.');
  }

  async function toNote() {
    for (let i = 0; i < max + 1 && state === 'running'; i++) {
      const noted2 = await turn(false, true);
      if (noted2 || state !== 'running') break;
    }
  }

  async function followUp() {
    max = 15;
    changed = true;
    reportSinceChange = false;
    await add('fw.budget.changed', 'maxTurns 15');
    await add('fw.message.received', 'user: go on');
    paintMeter();
    setState('running');
    show('What the model reads', '');
    d.say(h('span', null, 'A follow-up with a budget appends ', code('fw.budget.changed'), ' first. Every limit counts the whole run, so 15 turns leave 5 more.'));
  }

  function render() {
    const keys = [];
    if (state === '' ) keys.push(key('Start a run', { kind: 'primary', onClick: () => act(start) }));
    else if (state === 'running') {
      keys.push(key('Model answers', { onClick: () => act(() => turn(true)) }));
      keys.push(key('Run to the next note', { onClick: () => act(toNote) }));
      keys.push(key('Next turn', { kind: 'primary', onClick: () => act(() => turn(false)) }));
    } else if (state === 'failed' && max === 10) keys.push(key('Follow up with maxTurns: 15', { kind: 'primary', onClick: () => act(followUp) }));
    else keys.push(key('Start again', { kind: 'primary', onClick: () => act(start) }));
    d.setKeys(keys);
  }

  d.reset(() => {
    if (busy) return;
    log.clear();
    max = 10;
    turns = 0;
    setState('');
    paintMeter();
    show('What the model reads', '');
    d.say('');
    render();
  });
  paintMeter();
  show('What the model reads', '');
  render();
}
