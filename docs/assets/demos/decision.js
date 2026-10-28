// The decision: the moment that the product is built around. An agent asked
// for a person, its Task went to sleep, and the reader decides. The decision
// wakes the Task, the kernel reads its ledger, and the run goes on where it
// stopped. The steps follow the fleet design: the front sends the decision
// through the router, the router wakes the Task, and the front suspends an
// idle Task after workbench.fleet.suspendAfter (10 minutes by default).

import { h, css, demo, key, ledger, mark, workers, code, wait } from './kit.js';

css('decision', `
.dc-ask { display: flex; flex-direction: column; gap: var(--s-2); }
.dc-who { display: flex; align-items: center; gap: var(--s-2); }
.dc-who strong { font-weight: 700; }
`);

const AGENT = 'migrator-2';
const COMMAND = 'git push origin migrate/nginx';

export default function mount(root) {
  const d = demo(root, {
    title: 'Needs your decision',
    tone: 'amber',
    word: 'needs you',
    wide: true,
    caption: 'A model of one decision in a fleet. Each ledger line is a real event type of the kernel.',
  });

  const ask = h('div', { class: 'dc-ask' },
    h('div', { class: 'dc-who' }, mark(AGENT, 32), h('span', null, h('strong', { text: AGENT }), ' wants to run a command.')),
    h('pre', { class: 'demo-command recess', text: COMMAND }),
    h('span', { class: 'demo-note' }, 'Rule: ask before ', code('git push'))
  );
  const fleet = workers([
    { name: 'migrator-1', state: 'working', word: 'working' },
    { name: AGENT, state: 'asleep', word: 'asleep, waits for you' },
    { name: 'reviewer', state: 'asleep', word: 'asleep' },
  ]);
  const log = ledger({ title: 'The ledger of ' + AGENT, file: '/workspace/ledger.jsonl' });
  d.stage.append(h('div', { class: 'demo-split' }, ask, h('div', { class: 'demo-col' }, h('div', null, h('span', { class: 'demo-label', text: 'The Tasks of the fleet' }), fleet.el), log.el)));

  let busy = false;

  function start() {
    log.clear();
    log.append('fw.run.started', 'Migrate the nginx module');
    log.append('fw.model.responded', 'stop tool_use');
    log.append('fw.approval.requested', 'bash: ' + COMMAND, { tone: 'amber' });
    d.card.classList.remove('decided');
    d.title.textContent = 'Needs your decision';
    d.setStatus('amber', 'needs you');
    fleet.set(AGENT, 'asleep', 'asleep, waits for you');
    d.say('The policy asked for a person, so the run waits. With nothing to do, the Task went to sleep. It costs nothing while it waits.');
    d.setKeys([key('Deny', { onClick: () => decide(false) }), key('Run command', { kind: 'primary', onClick: () => decide(true) })]);
  }

  async function decide(allow) {
    if (busy) return;
    busy = true;
    d.setKeys([]);
    d.card.classList.add('decided');
    d.title.textContent = allow ? 'You allowed it' : 'You denied it';
    d.setStatus('grey', allow ? 'allowed' : 'denied', { still: true });

    fleet.set(AGENT, 'starting', 'waking');
    d.say('The workbench sends your decision through the router. The router wakes the Task, and its /workspace comes back as it was.');
    await wait(1400);

    fleet.set(AGENT, 'working', 'working');
    d.say('The kernel starts, reads ledger.jsonl from the top, and finds the question that it waited on.');
    await wait(1100);

    log.append('fw.approval.decided', allow ? 'allow, by you' : 'deny, by you');
    await wait(450);
    if (allow) {
      log.append('fw.tool.requested', 'bash: ' + COMMAND);
      await wait(450);
      log.append('fw.tool.responded', 'exit 0');
    } else {
      log.append('fw.tool.responded', 'error: denied by you');
    }
    await wait(450);
    log.append('fw.model.responded', 'stop end_turn');
    await wait(450);
    log.append('fw.run.finished', 'outcome completed', { tone: 'grey' });
    fleet.set(AGENT, 'awake', 'idle');
    d.say(allow
      ? 'The run went on from the exact step where it stopped, and finished. After 10 minutes idle, the workbench puts the Task to sleep again.'
      : 'The model read the denial as the result of its call and answered without the push. After 10 minutes idle, the Task sleeps again.');
    await wait(2600);

    fleet.set(AGENT, 'asleep', 'asleep');
    busy = false;
    d.setKeys([key('Ask again', { kind: 'secondary', onClick: start })]);
  }

  start();
}
