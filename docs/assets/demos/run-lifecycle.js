// The run lifecycle: the reader drives a run with keys, each key appends
// the events that the kernel appends, and the state of the run is read from
// the ledger, as Run.Apply in fw/projection.go of the kernel reads it. A
// click on a ledger line reads the ledger only up to that line.

import { h, css, demo, key, ledger, lineLed, wait } from './kit.js';

css('run-lifecycle', `
.rl-states { display: flex; flex-direction: column; gap: var(--s-2); }
.rl-group .demo-label { margin: 0 0 2px 10px; }
.rl-back { margin-top: var(--s-2); align-self: flex-start; }
`);

// The seven states of fw/run.go, in three groups, with the tone of the light
// that bossmode gives each one.
const GROUPS = [
  ['Working', [['queued', 'grey', 'waits for a free slot'], ['running', 'green', 'a driver works on it']]],
  ['Waiting', [['input-required', 'amber', 'waits for a person'], ['suspended', 'grey', 'got SIGTERM']]],
  ['Ended', [['completed', 'grey', 'answered'], ['failed', 'red', 'an error or a limit'], ['canceled', 'grey', 'someone stopped it']]],
];
const TERMINAL = ['completed', 'failed', 'canceled'];

// project reads the state of a run from its events, after Run.Apply.
function project(events) {
  let state = '';
  let pending = false;
  for (const e of events) {
    switch (e.type) {
      case 'fw.run.queued':
        state = 'queued';
        break;
      case 'fw.run.started':
      case 'fw.run.resumed':
      case 'fw.turn.started':
        if (TERMINAL.includes(state)) break;
        state = pending ? 'input-required' : 'running';
        break;
      case 'fw.message.received':
        if (pending) break;
        state = 'running';
        break;
      case 'fw.approval.requested':
        pending = true;
        state = 'input-required';
        break;
      case 'fw.approval.decided':
        pending = false;
        if (!TERMINAL.includes(state)) state = 'running';
        break;
      case 'fw.run.suspended':
        state = 'suspended';
        break;
      case 'fw.run.finished':
        pending = false;
        state = e.data.outcome;
        break;
    }
  }
  return state;
}

export default function mount(root) {
  const d = demo(root, {
    title: 'A run, read from its ledger',
    tone: 'grey',
    word: 'no run yet',
    caption: 'A model of the kernel. The event names and the states are the ones in fw/run.go and fw/projection.go.',
  });

  const rows = {};
  const groups = GROUPS.map(([name, states]) =>
    h('div', { class: 'rl-group' },
      h('span', { class: 'demo-label', text: name }),
      h('ul', { class: 'demo-rows' }, states.map(([s, tone, note]) => {
        const light = lineLed('grey');
        const li = h('li', { 'data-state': s }, light, h('span', { text: s }), h('span', { class: 'demo-row-note', text: note }));
        rows[s] = { li, light, tone };
        return li;
      }))
    )
  );
  const back = key('Read to the end', { kind: 'quiet', size: 's', class: 'rl-back', onClick: () => { const had = document.activeElement === back; pick(-1); if (had) d.focusKeys(); } });
  back.hidden = true;

  const log = ledger({ title: 'The ledger', file: 'ledger.jsonl', empty: 'Empty. Press Start a run.', onPick: (i) => pick(i) });
  d.stage.append(h('div', { class: 'demo-split' }, h('div', { class: 'rl-states' }, groups, back), log.el));

  let events = [];
  let busy = false;
  let picked = -1;


  function paint(state) {
    for (const [s, r] of Object.entries(rows)) {
      const on = s === state;
      r.li.classList.toggle('on', on);
      r.light.className = 'led led-' + (on ? r.tone : 'grey') + (on && r.tone === 'amber' ? ' breathe' : '');
    }
    if (!state) d.setStatus('grey', 'no run yet');
    else {
      const tone = rows[state].tone;
      d.setStatus(tone, state);
    }
  }

  function pick(i) {
    picked = i;
    log.pick(i);
    back.hidden = i === -1;
    const upto = i === -1 ? events : events.slice(0, i + 1);
    paint(project(upto));
    if (i !== -1) d.say(h('span', null, 'The state after line ' + (i + 1) + ' of the ledger. The kernel stores no state: it reads the events again.'));
    else render();
  }

  async function append(list, sentence) {
    if (busy) return;
    busy = true;
    if (picked !== -1) pick(-1);
    d.setKeys([]);
    for (const [type, detail, data] of list) {
      events.push({ type, data: data || {} });
      log.append(type, detail);
      paint(project(events));
      await wait(260);
    }
    busy = false;
    d.say(sentence);
    render();
  }

  // The keys for the state that the ledger shows now.
  function render() {
    const state = project(events);
    const k = (label, kind, list, sentence) => key(label, { kind, onClick: () => append(list, sentence) });
    const keys = {
      '': [k('Start a run', 'primary', [['fw.run.queued', 'input: tidy the README']], 'POST /v1/runs appended fw.run.queued. The run is accepted and waits for a free slot.')],
      queued: [k('Give it a slot', 'primary', [['fw.run.started', 'model, tools, brief']], 'A driver took the run. Every later step is one more event.')],
      running: [
        k('Stop the process', 'secondary', [['fw.run.suspended', 'reason shutdown']], 'The process got SIGTERM while the run worked, so the kernel appended fw.run.suspended. The ledger keeps the place.'),
        k('Fail', 'secondary', [['fw.error', 'the model call failed'], ['fw.run.finished', 'outcome failed', { outcome: 'failed' }]], 'An error ended the run. A failed run is not dead: a follow-up opens it again.'),
        k('Model answers', 'secondary', [['fw.turn.started', ''], ['fw.model.requested', ''], ['fw.model.responded', 'stop end_turn'], ['fw.turn.finished', ''], ['fw.run.finished', 'outcome completed', { outcome: 'completed' }]], 'The model ended its turn with an answer, so the run completed.'),
        k('Model asks for bash', 'primary', [['fw.turn.started', ''], ['fw.model.requested', ''], ['fw.model.responded', 'stop tool_use'], ['fw.approval.requested', 'bash: git push']], 'The policy answered ask for bash. The run waits for a person, and no process waits with it.'),
      ],
      'input-required': [
        k('Cancel', 'secondary', [['fw.run.finished', 'outcome canceled', { outcome: 'canceled' }]], 'A person canceled the run while it waited.'),
        k('Deny', 'secondary', [['fw.approval.decided', 'deny'], ['fw.tool.responded', 'error: denied by you'], ['fw.turn.finished', '']], 'The command never ran. The model reads the denial as the result of its call, and the run goes on.'),
        k('Allow', 'primary', [['fw.approval.decided', 'allow'], ['fw.tool.requested', 'bash'], ['fw.tool.responded', 'exit 0'], ['fw.turn.finished', '']], 'The decision is an event too. The kernel ran the call, and the next step is the next model call.'),
      ],
      suspended: [k('Start the process again', 'primary', [['fw.run.resumed', 'from line ' + events.length]], 'The new process read the ledger and took up the run at the step where it stopped.')],
    };
    const done = [k('Send a follow-up', 'primary', [['fw.message.received', 'one more thing']], 'A message opens an ended run again. The same ledger goes on.')];
    d.setKeys(TERMINAL.includes(state) ? done : keys[state] || []);
  }

  d.reset(() => {
    if (busy) return;
    events = [];
    log.clear();
    pick(-1);
    d.say('');
  });
  paint('');
  render();
}
