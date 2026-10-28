// The four layers: one job walks down and up the stack, one step at a
// time. Each step lights the layers that act, puts the thing that moved in
// the layer that holds it, and names the real tool, route, or event.
//
// The steps follow the code of the workbench and the kernel: the MCP tool
// enqueue puts fw.run.request messages on the queue of a profile
// (fleet/enqueue.go), a job wakes a sleeping Task through a read of
// GET /v1/status over the atenet router and then ResumeTask (fleet/suspend.go),
// the token broker answers POST /v1/tokens (connections/broker.go), the
// suspend controller calls SuspendTask after workbench.fleet.suspendAfter,
// 10 minutes by default (fleet/types.go), and a decision reaches the Task
// through the router with the header ate-target-actor (fleet/forward.go).

import { h, css, demo, key, chip, code, mark, avatar, settle } from './kit.js';

css('layers', `
.ly-wrap { display: flex; flex-direction: column; gap: var(--s-3); }
.doc .ly-stack { display: flex; flex-direction: column; gap: var(--s-2); margin: 0; padding: 0; list-style: none; }
.doc .ly-group { margin: 0; }
.ly-group > .demo-label { margin: 0 0 2px 2px; }
.doc .ly-band { margin: 0; }
.ly-band { display: flex; align-items: center; gap: var(--s-3); min-height: 52px; padding: 6px 10px; border: 1px solid var(--line); border-radius: var(--r); background: var(--paper); }
.ly-band.on { background: var(--raised); border-color: var(--raised-line); box-shadow: var(--e-row); }
.ly-band.dim { color: var(--muted); }
.ly-face { flex: none; display: inline-flex; width: 28px; justify-content: center; }
.ly-text { display: flex; flex-direction: column; min-width: 0; flex: 1 1 auto; }
.ly-name { font-size: var(--t-control); line-height: var(--t-control-lh); font-weight: 700; }
.ly-name code { font-size: var(--t-caption); font-weight: 600; white-space: nowrap; }
.ly-role { font-size: var(--t-meta); line-height: var(--t-meta-lh); color: var(--muted); }
.ly-slot { flex: none; display: flex; align-items: center; gap: var(--s-2); }
.ly-band.inside { border-style: dashed; }
.ly-steps-row { display: flex; align-items: center; gap: var(--s-3); }
.doc .ly-steps-row .demo-steps { flex: 1 1 auto; margin: 0; padding: 0; }
.ly-count { flex: none; font-size: var(--t-meta); line-height: var(--t-meta-lh); font-weight: 600; color: var(--muted); font-variant-numeric: tabular-nums; }
`);

// The layers, top to bottom, in their groups.
const LAYERS = [
  { group: 'People', id: 'you', name: 'You', role: 'in bossmode, Claude Code, or an IDE', face: () => avatar('YOU', 28) },
  { group: 'Outside the sandboxes', id: 'bench', name: 'The workbench', bin: 'fw-workbench', role: 'signs people in, queues jobs, wakes and suspends Tasks' },
  { group: 'Inside one sandbox', id: 'kernel', name: 'The kernel', bin: 'fw', role: 'one agent in the AX Task migrator-1, with its ledger in /workspace', face: () => mark('migrator-1', 28), inside: true },
  { group: 'The platform', id: 'ax', name: 'Google AX', role: 'hands out Tasks: apply, suspend, resume' },
  { group: 'The platform', id: 'sub', name: 'Agent Substrate', role: 'gVisor sandboxes that sleep, and the atenet router' },
];

// One step: the layers that act, where the thing that moved lands, the
// state of the Task, and the sentence with the real names.
const STEPS = [
  {
    lit: ['you', 'bench'], at: 'bench', what: '12 jobs', task: ['grey', 'Task asleep'],
    say: () => ['You ask Claude Code to migrate twelve Puppet modules. It calls the MCP tool ', code('enqueue'), ', and the workbench puts twelve ', code('fw.run.request'), ' jobs on the queue of the migrator profile, each in your name.'],
  },
  {
    lit: ['bench', 'ax', 'sub'], at: 'sub', what: 'wake', task: ['grey', 'Task waking'],
    say: () => ['A sleeping Task reads no queue. The workbench sends ', code('GET /v1/status'), ' through the atenet router, the router wakes the sandbox, and the workbench tells AX with ', code('ResumeTask'), '.'],
  },
  {
    lit: ['sub', 'kernel'], at: 'kernel', what: 'job 1', task: ['green', 'Task working'],
    say: () => ['Substrate restores ', code('/workspace'), ' in a fresh sandbox. The kernel starts, reads its ledger, takes one job from the queue, and appends ', code('fw.run.queued'), '.'],
  },
  {
    lit: ['kernel', 'bench'], at: 'kernel', what: 'token', task: ['green', 'Task working'],
    say: () => ['A tool must act as you at GitHub. The kernel asks the workbench for a short-lived token with ', code('POST /v1/tokens'), '. Your refresh token stays in the workbench.'],
  },
  {
    lit: ['kernel', 'bench', 'ax', 'sub'], at: 'you', what: 'decision', task: ['amber', 'Task asleep, needs you'],
    say: () => ['The policy asks before ', code('git push'), '. The kernel appends ', code('fw.approval.requested'), ' and reports idle. After 10 idle minutes, the workbench calls ', code('SuspendTask'), ', and Substrate saves ', code('/workspace'), '.'],
  },
  {
    lit: ['you', 'bench', 'sub', 'kernel'], at: 'kernel', what: 'allow', task: ['green', 'Task working'],
    say: () => ['You press Allow. The workbench sends the decision to the Task with the header ', code('ate-target-actor'), ', the router wakes it, and the kernel appends ', code('fw.approval.decided'), ' and goes on.'],
  },
  {
    lit: ['kernel', 'bench', 'you'], at: 'you', what: 'result', task: ['grey', 'Task idle'],
    say: () => ['The run appends ', code('fw.run.finished'), ', and the event goes out on the egress stream. You read the result with ', code('run_result'), '. After 10 idle minutes, the Task sleeps again.'],
  },
];

export default function mount(root) {
  const d = demo(root, {
    title: 'One job through the four layers',
    tone: 'grey',
    word: 'Task asleep',
    caption: 'A model of one job in a fleet. The tools, routes, and events are the real ones of the workbench and the kernel.',
  });

  // The stack, in its groups.
  const bands = {};
  const groups = [];
  let current = null;
  for (const l of LAYERS) {
    if (!current || current.name !== l.group) {
      current = { name: l.group, list: h('ul', { class: 'ly-stack' }) };
      groups.push(h('li', { class: 'ly-group' }, h('span', { class: 'demo-label', text: l.group }), current.list));
    }
    const slot = h('span', { class: 'ly-slot' });
    const name = h('span', { class: 'ly-name' }, l.name, l.bin ? [' ', code(l.bin)] : null);
    const band = h('li', { class: 'ly-band' + (l.inside ? ' inside' : ''), 'data-layer': l.id },
      h('span', { class: 'ly-face' }, l.face ? l.face() : null),
      h('span', { class: 'ly-text' }, name, h('span', { class: 'ly-role', text: l.role })),
      slot);
    bands[l.id] = { band, slot };
    current.list.append(band);
  }
  const stack = h('ul', { class: 'ly-stack' }, groups);

  const bar = h('ol', { class: 'demo-steps', 'aria-hidden': 'true' }, STEPS.map(() => h('li')));
  const count = h('span', { class: 'ly-count' });
  d.stage.append(h('div', { class: 'ly-wrap' }, h('div', { class: 'ly-steps-row' }, bar, count), stack));

  let step = 0; // 0 is the start; 1 to 7 are the steps

  function paint() {
    const s = STEPS[step - 1];
    for (const [id, b] of Object.entries(bands)) {
      const on = !!s && s.lit.includes(id);
      b.band.classList.toggle('on', on);
      b.band.classList.toggle('dim', !!s && !on);
      b.slot.textContent = '';
    }
    [...bar.children].forEach((li, i) => li.classList.toggle('done', i < step));
    count.textContent = step === 0 ? 'Start' : 'Step ' + step + ' of ' + STEPS.length;
    if (s) {
      const c = chip(s.what, 'ink');
      bands[s.at].slot.append(c);
      settle(c);
      d.setStatus(s.task[0], s.task[1]);
      d.say(h('span', null, s.say()));
    } else {
      d.setStatus('grey', 'Task asleep');
      d.say('The migrator Task sleeps, and its sandbox costs nothing. Press Next to send it work.');
    }
    const back = key('Back', { onClick: () => go(step - 1), disabled: step === 0 });
    const next = step < STEPS.length
      ? key('Next', { kind: 'primary', onClick: () => go(step + 1) })
      : key('Start over', { kind: 'primary', onClick: () => go(0) });
    d.setKeys([back, next]);
  }

  function go(n) {
    step = Math.max(0, Math.min(STEPS.length, n));
    paint();
  }

  d.reset(() => go(0));
  paint();
}
