// The ledger survives the process. A run writes its events; the reader
// kills the process, or cuts the power, in the middle of a step; a new
// process reads the ledger and finds the next step in it alone.
//
// The model follows the kernel:
//   - the cursor and the next step mirror analyze and drive in fw/turn.go;
//   - a tool call with no result runs again when the tool is idempotent,
//     and otherwise asks a person with the reason "rerun after resume"
//     (stepTools in fw/turn.go, rerunSafe in fw/resume.go);
//   - the lines marked fsync are the ones that needsIntentSync in
//     fw/ledger_file.go syncs before the kernel goes on: fw.run.queued, a
//     fw.tool.requested that is not idempotent, the approval events, and
//     fw.run.finished. The file ledger writes each line with one write
//     call, so a killed process loses no line; a crash of the machine can
//     lose the lines after the last fsync.
//   - http is idempotent and files is not (tools/builtin).

import { h, css, demo, key, ledger, code, wait } from './kit.js';

css('ledger-replay', `
.lr-next { padding: 8px 10px; border: 1px solid var(--raised-line); border-radius: var(--r); background: var(--raised); box-shadow: var(--e-row); }
.lr-next .demo-label { margin: 0; }
.lr-next-text { display: block; font-size: var(--t-control); line-height: var(--t-control-lh); font-weight: 700; }
.lr-next[hidden] { display: none; }
.doc .lr-facts { margin: 0; padding: 0; }
.doc .lr-facts > li { min-height: 32px; margin: 0; }
.lr-sync { flex: none; margin-left: auto; padding-left: 8px; font-family: var(--font); font-size: var(--t-caption); line-height: var(--t-caption-lh); font-weight: 700; color: var(--muted); }
.doc .ledger-lines > li.lr-lost .ledger-line { text-decoration: line-through; color: var(--muted); }
.doc .ledger-lines > li.lr-lost .ledger-type { font-weight: 400; }
`);

// What the model answers, by the number of answers in the ledger. The
// model of the demo is deterministic, so a call that runs again gets the
// same answer.
const ANSWERS = [
  { stop: 'tool_use', call: { id: 'toolu_1', tool: 'http', input: 'GET /builds/412/log', idem: true, result: 'status 200' } },
  { stop: 'tool_use', call: { id: 'toolu_2', tool: 'files', input: 'str_replace build/flags.go', idem: false, result: 'edited build/flags.go' } },
  { stop: 'end_turn' },
];

// cursorOf reads the position of the run from its events, as analyze does.
function cursorOf(events) {
  const c = { started: false, terminal: false, turns: 0, turnOpen: false, turnSeq: 0, reqSeq: 0, resp: null, respSeq: 0, calls: null, pending: null, answers: 0 };
  events.forEach((e, i) => {
    const seq = i + 1;
    const r = c.calls && e.data.callId ? c.calls[e.data.callId] : null;
    switch (e.type) {
      case 'fw.run.started':
        c.started = true;
        break;
      case 'fw.turn.started':
        c.turns++;
        c.turnOpen = true;
        c.turnSeq = seq;
        break;
      case 'fw.turn.finished':
        c.turnOpen = false;
        break;
      case 'fw.model.requested':
        c.reqSeq = seq;
        break;
      case 'fw.model.responded':
        c.answers++;
        c.resp = ANSWERS[e.data.n];
        c.respSeq = seq;
        c.calls = {};
        if (c.resp.call) c.calls[c.resp.call.id] = { call: c.resp.call, requestedSeq: 0, responded: false, decision: '', decisionSeq: 0 };
        break;
      case 'fw.tool.requested':
        if (r) r.requestedSeq = seq;
        break;
      case 'fw.tool.responded':
        if (r) r.responded = true;
        break;
      case 'fw.approval.requested':
        c.pending = e.data;
        break;
      case 'fw.approval.decided':
        c.pending = null;
        if (r) {
          r.decision = e.data.decision;
          r.decisionSeq = seq;
        }
        break;
      case 'fw.run.finished':
        c.terminal = true;
        c.pending = null;
        break;
    }
  });
  return c;
}

// nextAction is the next step of a driver that reads this cursor, as the
// switch in drive and stepTools decide it.
function nextAction(c) {
  if (c.terminal) return { kind: 'none', text: 'do nothing: the run is finished' };
  if (c.pending) return { kind: 'wait', text: 'wait for the decision of a person' };
  if (!c.started) return { kind: 'start', text: 'start the run' };
  if (c.turnOpen && c.respSeq < c.turnSeq) {
    return { kind: 'model', text: c.reqSeq > c.turnSeq ? 'send the same model request again' : 'call the model' };
  }
  if (c.turnOpen && c.resp.call) {
    for (const r of Object.values(c.calls)) {
      if (r.responded) continue;
      const t = r.call.tool;
      if (r.decision && r.decisionSeq > r.requestedSeq) {
        return r.decision === 'allow'
          ? { kind: 'run', call: r.call, text: 'run ' + t + ': a person allowed it' }
          : { kind: 'denied', call: r.call, text: 'give the model the denial as the result' };
      }
      if (r.requestedSeq > 0) {
        return r.call.idem
          ? { kind: 'run', call: r.call, text: 'run ' + t + ' again: it is safe to repeat' }
          : { kind: 'ask', call: r.call, text: 'ask a person before ' + t + ' runs again: it is not safe to repeat' };
      }
      return { kind: 'run', call: r.call, text: 'run ' + t + ': the policy allows it' };
    }
    return { kind: 'close', text: 'close the turn' };
  }
  if (c.turnOpen || (c.resp && !c.resp.call)) return { kind: 'finish', text: 'finish the run' };
  return { kind: 'model', text: 'start a turn and call the model' };
}

export default function mount(root) {
  const d = demo(root, {
    title: 'A crash, and the ledger that survives it',
    tone: 'grey',
    word: 'no process yet',
    wide: true,
    caption: 'A model of the kernel. The events, the fsync rule, and the resume rule are the ones in fw/turn.go, fw/resume.go, and fw/ledger_file.go.',
  });

  const rows = {};
  const facts = h('ul', { class: 'demo-rows lr-facts' }, ['Run', 'Model call', 'Tool call'].map((name) => {
    const note = h('span', { class: 'demo-row-note' });
    const li = h('li', null, h('span', { text: name }), note);
    rows[name] = note;
    return li;
  }));
  const nextText = h('span', { class: 'lr-next-text' });
  const next = h('div', { class: 'lr-next', hidden: true }, h('span', { class: 'demo-label', text: 'A new process would' }), nextText);
  const log = ledger({ title: 'The ledger', file: '.fw/runs/<run>/ledger.jsonl', empty: 'Empty. Press Start a run.' });
  d.stage.append(h('div', { class: 'demo-split' },
    h('div', { class: 'demo-col' }, h('div', null, h('span', { class: 'demo-label', text: 'What the ledger says' }), facts), next),
    log.el));

  let events = [];
  let proc = 'none'; // none, live, dead
  let crashed = false;
  let inflight = null; // { kind: 'model' } or { kind: 'tool', call }
  let busy = false;

  function paintLine(e) {
    const row = log.append(e.type, e.detail);
    if (e.synced) {
      row.el.querySelector('.ledger-line').append(h('span', { class: 'lr-sync', text: 'fsync', title: 'On disk before the kernel goes on' }));
      // The word can wrap the line once more, so the list scrolls again to
      // show the whole of the last line.
      const list = row.el.parentElement;
      list.scrollTop = list.scrollHeight;
    }
    return row;
  }


  async function add(type, detail, o = {}) {
    const e = { type, detail, synced: !!o.synced, data: o.data || {} };
    events.push(e);
    paintLine(e);
    paint();
    await wait(240);
  }

  function paint() {
    const c = cursorOf(events);
    rows['Run'].textContent = c.terminal ? 'finished' : c.started ? 'started' : events.length ? 'not started' : 'none';
    let model = 'none open';
    if (c.turnOpen && c.respSeq > c.turnSeq) model = 'answered, ' + (c.resp.call ? 'asks for ' + c.resp.call.tool : 'ends the turn');
    else if (c.turnOpen && c.reqSeq > c.turnSeq) model = 'asked, no answer yet';
    rows['Model call'].textContent = model;
    let tool = 'none open';
    if (c.turnOpen && c.respSeq > c.turnSeq && c.resp.call) {
      const r = c.calls[c.resp.call.id];
      const t = r.call.tool;
      if (r.responded) tool = t + ', has its result';
      else if (c.pending) tool = t + ', waits for a person';
      else if (r.requestedSeq > 0) tool = t + ', no result yet';
      else tool = t + ', not asked yet';
    }
    rows['Tool call'].textContent = tool;
    next.hidden = events.length === 0;
    nextText.textContent = nextAction(c).text;

    if (!events.length) d.setStatus('grey', 'no process yet');
    else if (proc === 'dead') d.setStatus('red', crashed ? 'power cut' : 'process killed');
    else if (c.terminal) d.setStatus('grey', 'run completed');
    else if (c.pending) d.setStatus('amber', 'waits for you');
    else if (inflight && inflight.kind === 'model') d.setStatus('green', 'calling the model');
    else if (inflight) d.setStatus('green', 'running ' + inflight.call.tool);
    else d.setStatus('green', 'new process');
  }

  // drive appends the steps of a driver until the run waits: for the
  // model, for a tool, for a person, or at its end.
  async function drive() {
    for (let guard = 0; guard < 24; guard++) {
      const c = cursorOf(events);
      const a = nextAction(c);
      switch (a.kind) {
        case 'start':
          await add('fw.run.started', 'tools http, files');
          break;
        case 'model':
          if (!c.turnOpen) await add('fw.turn.started', 'turn ' + (c.turns + 1));
          await add('fw.model.requested', '');
          inflight = { kind: 'model' };
          return;
        case 'run':
          await add('fw.tool.requested', a.call.tool + ': ' + a.call.input + (a.call.idem ? ', idempotent' : ''), { synced: !a.call.idem, data: { callId: a.call.id } });
          inflight = { kind: 'tool', call: a.call };
          return;
        case 'ask':
          await add('fw.approval.requested', a.call.tool + ': rerun after resume', { synced: true, data: { callId: a.call.id } });
          return;
        case 'denied':
          await add('fw.tool.responded', 'error: denied by you', { data: { callId: a.call.id } });
          break;
        case 'close':
          await add('fw.turn.finished', 'turn ' + c.turns);
          break;
        case 'finish':
          if (c.turnOpen) await add('fw.turn.finished', 'turn ' + c.turns);
          await add('fw.run.finished', 'outcome completed', { synced: true });
          return;
        default:
          return;
      }
    }
  }

  // arrive ends the call in flight with its answer, and the driver goes on.
  async function arrive() {
    const f = inflight;
    inflight = null;
    if (f.kind === 'model') {
      const n = Math.min(cursorOf(events).answers, ANSWERS.length - 1);
      const a = ANSWERS[n];
      await add('fw.model.responded', 'stop ' + a.stop + (a.call ? ': ' + a.call.tool : ''), { data: { n } });
    } else {
      await add('fw.tool.responded', f.call.result, { data: { callId: f.call.id } });
    }
    await drive();
    explain(f);
  }

  // explain says what the last press did.
  function explain(f) {
    const c = cursorOf(events);
    if (c.terminal) return d.say(h('span', null, 'The model ended its turn, so the run finished. ', code('fw.run.finished'), ' is synced, like every terminal event.'));
    if (inflight && inflight.kind === 'tool' && inflight.call.idem) return d.say(h('span', null, 'The model asked for ', code('http'), '. Its ', code('fw.tool.requested'), ' is not synced, because http is idempotent: a second call does no harm.'));
    if (inflight && inflight.kind === 'tool') return d.say(h('span', null, 'The model asked for ', code('files'), '. The kernel synced ', code('fw.tool.requested'), ' before the edit runs, because files is not idempotent.'));
    if (f && f.kind === 'tool') return d.say(f.call.tool + ' returned. The driver closed the turn and called the model again.');
    d.say('The driver started the run and called the model. Each step is a line in the ledger.');
  }

  async function start() {
    proc = 'live';
    crashed = false;
    await add('fw.run.queued', 'input: fix the failing build', { synced: true });
    await drive();
    explain(null);
  }

  function kill() {
    if (busy) return;
    const doing = inflight ? (inflight.kind === 'model' ? 'a model call' : 'the ' + inflight.call.tool + ' call') : 'a step';
    proc = 'dead';
    crashed = false;
    inflight = null;
    paint();
    d.say('SIGKILL stopped the process in the middle of ' + doing + '. Every line that it wrote is still in the file. A suspend under AX ends the process the same way.');
    render();
  }

  function crash() {
    if (busy) return;
    let last = -1;
    events.forEach((e, i) => { if (e.synced) last = i; });
    const lost = events.length - 1 - last;
    log.rows.forEach((r, i) => r.el.classList.toggle('lr-lost', i > last));
    events = events.slice(0, last + 1);
    proc = 'dead';
    crashed = true;
    inflight = null;
    paint();
    d.say(lost > 0
      ? 'The machine lost power. In the worst case, the ' + lost + ' lines after the last fsync never reached the disk.'
      : 'The machine lost power. Every line was on the disk already.');
    render();
  }

  async function restart() {
    if (crashed) {
      log.clear();
      for (const e of events) paintLine(e);
    }
    proc = 'live';
    const from = events.length;
    await add('fw.run.resumed', 'from seq ' + from);
    crashed = false;
    const a = nextAction(cursorOf(events));
    d.say('A new process read the ledger and appended fw.run.resumed. The ledger alone says what comes next: ' + a.text + '.');
  }

  // step does the next step. With a call in flight, the call answers.
  // Without one, the process just started, and the step comes from the
  // ledger alone.
  async function step() {
    if (inflight) return arrive();
    const c = cursorOf(events);
    const a = nextAction(c);
    await drive();
    switch (a.kind) {
      case 'ask':
        return d.say(h('span', null, 'files is not safe to repeat, and the ledger cannot say whether the edit happened. So the kernel asks a person first, with the reason ', code('rerun after resume'), '.'));
      case 'run':
        return d.say(h('span', null, a.call.tool + ' is safe to repeat, so the new process runs the call again at once, with a second ', code('fw.tool.requested'), ' for the same call.'));
      case 'model':
        return d.say(c.turnOpen
          ? 'The model call had no answer in the ledger, so the new process sends the same request again.'
          : 'Every call of the last turn has its result, so the new process starts the next turn.');
      case 'start':
        return d.say('The ledger holds only the start of the run, so the new process starts it from the beginning and calls the model.');
      case 'close':
        return d.say('Every call of the turn has its result, so the new process closes the turn and calls the model.');
      default:
        return explain(null);
    }
  }

  async function decide(decision) {
    const c = cursorOf(events);
    await add('fw.approval.decided', decision + ', by you', { synced: true, data: { callId: c.pending.callId, decision } });
    await drive();
    d.say(decision === 'allow'
      ? 'The decision is an event too. The kernel runs the edit again, and the run goes on.'
      : 'The model reads the denial as the result of its call, and the run goes on with the next turn.');
  }

  async function act(fn) {
    if (busy) return;
    busy = true;
    d.setKeys([]);
    await fn();
    busy = false;
    render();
  }

  function clearAll() {
    events = [];
    proc = 'none';
    crashed = false;
    inflight = null;
    log.clear();
    paint();
  }

  function render() {
    const c = cursorOf(events);
    const keys = [];
    if (!events.length) keys.push(key('Start a run', { kind: 'primary', onClick: () => act(start) }));
    else if (proc === 'dead') keys.push(key('Start a new process', { kind: 'primary', onClick: () => act(restart) }));
    else if (c.terminal) keys.push(key('Start a new run', { kind: 'primary', onClick: () => act(async () => { clearAll(); await start(); }) }));
    else if (c.pending) keys.push(key('Deny', { onClick: () => act(() => decide('deny')) }), key('Allow the rerun', { kind: 'primary', onClick: () => act(() => decide('allow')) }));
    else keys.push(
      key('Kill the process', { kind: 'danger', onClick: kill }),
      key('Cut the power', { kind: 'danger', onClick: crash }),
      key('Next step', { kind: 'primary', onClick: () => act(step) }));
    d.setKeys(keys);
  }

  d.reset(() => {
    if (busy) return;
    clearAll();
    d.say('');
    render();
  });
  paint();
  render();
}
