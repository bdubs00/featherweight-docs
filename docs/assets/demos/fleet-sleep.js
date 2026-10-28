// The fleet sleeps: the worker Tasks of one pool, the queue of the pool,
// and the clock of the front. The reader enqueues jobs. The rules are the
// rules of the code:
//
//   - After an enqueue, the front wakes every sleeping Task that takes the
//     queue, with one read of GET /v1/status through the router (WakeFor in
//     fleet/suspend.go of the workbench). A sleeping Task reads no queue.
//   - A Task takes one job at a time: maxRuns is 1 under ax
//     (ax.ApplyToConfig in the kernel), and the intake takes a message only
//     for a free slot (intakeGate in fw/intake.go).
//   - A run that waits for a person has no driver, so its slot is free.
//   - At every interval (workbench.fleet.interval, 30s), the suspend
//     controller reads the status of each running Task whose newest run
//     update, or last start, is older than workbench.fleet.suspendAfter
//     (10 minutes by default, fleet.DefaultSuspendAfter), and calls
//     SuspendTask when the body says idle (suspendIdle in fleet/suspend.go).
//   - A decision goes through the router, which wakes a sleeping Task.
//
// The clock runs fast: one step of the clock is one interval of 30 seconds.

import { h, css, demo, key, ledger, workers, chip, code, wait } from './kit.js';

css('fleet-sleep', `
.fs-head { display: flex; align-items: center; gap: var(--s-2); margin-bottom: var(--s-1); }
.fs-head .demo-label { margin: 0; }
.fs-queue { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; min-height: 36px; padding: 6px; }
.fs-empty { padding: 0 4px; font-size: var(--t-meta); line-height: var(--t-meta-lh); color: var(--muted); }
.fs-clock { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px var(--s-2); font-size: var(--t-meta); line-height: var(--t-meta-lh); color: var(--muted); }
.fs-time { font-family: var(--mono); font-size: var(--t-control); line-height: var(--t-control-lh); font-weight: 600; color: var(--ink); }
.fs-keys { display: flex; flex-wrap: wrap; gap: 4px var(--s-2); }
.fs-keys code { font-size: var(--t-caption); }
`);

const INTERVAL = 30; // workbench.fleet.interval, in seconds
const SUSPEND_AFTER = 600; // workbench.fleet.suspendAfter, in seconds
const WORK = 180; // the work of one job in this model, in seconds
const ASK_AFTER = 60; // the job that asks a person asks after this much work
const AFTER_ALLOW = 60; // the work that is left after the decision
const TICK_MS = 170; // one interval of the clock, in real time
const START = 9 * 3600; // the clock starts at 09:00
const NAMES = ['migrator-0', 'migrator-1', 'migrator-2'];
const QUEUE = 'fw.jobs.migrator';

const clock = (s) => {
  const hh = String(Math.floor(s / 3600) % 24).padStart(2, '0');
  const mm = String(Math.floor(s / 60) % 60).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return hh + ':' + mm + ':' + ss;
};

export default function mount(root) {
  const d = demo(root, {
    title: 'Tasks that sleep until there is work',
    tone: 'grey',
    word: 'asleep',
    wide: true,
    caption: 'A model of the suspend controller and the wakes of the front. The clock runs about 175 times faster than real time. The names are those of fleet/suspend.go of the workbench and fw/intake.go of the kernel.',
  });

  const rack = workers(NAMES.map((name) => ({ name, state: 'asleep', word: 'asleep' })));
  const count = chip('0', 'plain');
  const queue = h('div', { class: 'fs-queue recess', 'aria-live': 'off' });
  const time = h('span', { class: 'fs-time', text: clock(START) });
  const log = ledger({ title: 'What the front and the Tasks do', empty: 'Nothing yet. Every Task is asleep and costs nothing.' });

  const side = h('div', { class: 'demo-col' },
    h('div', null, h('span', { class: 'demo-label', text: 'The Tasks of the pool migrator' }), rack.el),
    h('div', null, h('div', { class: 'fs-head' }, h('span', { class: 'demo-label' }, 'The queue ', code(QUEUE)), count), queue),
    h('div', { class: 'fs-clock' }, h('span', null, 'Clock of the front'), time, h('span', null, 'one step is 30 seconds')),
    h('div', { class: 'fs-keys' }, code('suspendAfter: 10m'), code('interval: 30s'), code('maxRuns: 1'))
  );
  d.stage.append(h('div', { class: 'demo-split' }, side, log.el));

  let t, tasks, jobs, pending, busy;

  function init() {
    t = START;
    jobs = 0;
    pending = [];
    busy = false;
    tasks = NAMES.map((name) => ({ name, phase: 'asleep', job: null, waiting: [], idleRef: START, decide: null }));
  }

  const line = (type, detail, tone) => log.append(type, detail, tone ? { tone } : {});

  function paint() {
    time.textContent = clock(t);
    queue.textContent = '';
    if (!pending.length) queue.append(h('span', { class: 'fs-empty', text: 'Empty' }));
    for (const j of pending) queue.append(chip(j.id, 'ink'));
    count.textContent = String(pending.length);
    for (const k of tasks) {
      const asks = k.waiting.filter((w) => !w.allowed).map((w) => w.id);
      if (k.phase === 'asleep') rack.set(k.name, 'asleep', asks.length ? 'asleep, ' + asks[0] + ' waits for you' : 'asleep');
      else if (k.phase === 'waking') rack.set(k.name, 'starting', 'waking');
      else if (k.job) rack.set(k.name, 'working', 'works on ' + k.job.id);
      else if (asks.length) rack.set(k.name, 'needs', asks[0] + ' waits for you');
      else {
        const m = Math.floor((t - k.idleRef) / 60);
        rack.set(k.name, 'awake', m < 1 ? 'idle' : 'idle ' + m + ' min');
      }
    }
    const asking = tasks.some((k) => k.waiting.some((w) => !w.allowed));
    if (tasks.some((k) => k.job || k.phase === 'waking')) d.setStatus('green', 'working');
    else if (asking) d.setStatus('amber', 'needs you');
    else if (tasks.some((k) => k.phase === 'running')) d.setStatus('grey', 'idle');
    else d.setStatus('grey', 'asleep');
  }

  // wakeFor wakes every sleeping Task of the pool, as WakeFor does.
  function wakeFor(cause) {
    let n = 0;
    for (const k of tasks) {
      if (k.phase !== 'asleep') continue;
      k.phase = 'waking';
      line('wake', k.name + ', cause ' + cause);
      n++;
    }
    return n;
  }

  // step moves the clock one interval and applies the rules in order.
  function step(notes) {
    t += INTERVAL;
    for (const k of tasks) {
      if (k.phase !== 'waking') continue;
      k.phase = 'running';
      k.idleRef = t;
      if (k.decide) {
        line('fw.approval.decided', k.decide.id + ', allow, by you');
        k.decide.allowed = true;
        k.decide = null;
      }
    }
    for (const k of tasks) {
      const j = k.job;
      if (!j) continue;
      j.done += INTERVAL;
      if (j.asks && !j.asked && j.done >= ASK_AFTER) {
        j.asked = true;
        k.job = null;
        k.waiting.push({ id: j.id, allowed: false });
        k.idleRef = t;
        line('fw.approval.requested', j.id + ': bash git push', 'amber');
        notes.asked = { job: j.id, task: k.name };
      } else if (j.done >= j.work) {
        k.job = null;
        k.idleRef = t;
        line('fw.run.finished', j.id + ' completed');
        if (j.resumed) notes.resumed = { job: j.id, task: k.name };
      }
    }
    // A decided run takes the slot before a new job does.
    for (const k of tasks) {
      if (k.phase !== 'running' || k.job) continue;
      const i = k.waiting.findIndex((w) => w.allowed);
      if (i < 0) continue;
      const w = k.waiting.splice(i, 1)[0];
      k.job = { id: w.id, work: AFTER_ALLOW, done: 0, resumed: true };
      k.idleRef = t;
      line('fw.tool.responded', w.id + ': git push, exit 0');
    }
    for (const k of tasks) {
      if (k.phase !== 'running' || k.job || !pending.length) continue;
      const j = pending.shift();
      k.job = { id: j.id, work: WORK, done: 0, asks: j.asks };
      k.idleRef = t;
      line('fw.run.queued', j.id + ' on ' + k.name);
      if (notes.asked && notes.asked.task === k.name) notes.tookAfterAsk = { job: j.id, task: k.name };
      if (pending.length) notes.waited = true;
    }
    for (const k of tasks) {
      if (k.phase !== 'running' || k.job || k.waiting.some((w) => w.allowed)) continue;
      if (t - k.idleRef < SUSPEND_AFTER) continue;
      k.phase = 'asleep';
      line('SuspendTask', k.name + ', idle 10 min');
      notes.slept = (notes.slept || 0) + 1;
    }
    paint();
  }

  const settled = () => !pending.length && tasks.every((k) => k.phase !== 'waking' && !k.job && !k.waiting.some((w) => w.allowed));

  async function run(fn, steps) {
    if (busy) return;
    busy = true;
    d.setKeys([]);
    const notes = {};
    fn(notes);
    paint();
    await wait(TICK_MS * 2);
    for (let i = 0; i < 80; i++) {
      if (steps !== undefined ? i >= steps : settled()) break;
      step(notes);
      await wait(TICK_MS);
    }
    busy = false;
    d.say(sentence(notes));
    render();
  }

  function sentence(n) {
    const parts = [];
    if (n.woke && n.cause === 'enqueue') parts.push('The front woke ' + (n.woke === 3 ? 'all three sleeping Tasks' : n.woke === 1 ? 'the sleeping Task' : 'the ' + n.woke + ' sleeping Tasks') + ', because a sleeping Task reads no queue.');
    if (n.woke && n.cause === 'decision') parts.push('Your decision went through the router, which woke ' + n.wokeTask + '.');
    if (n.waited) parts.push('Each Task runs one job at a time, so a job waited in the queue.');
    if (n.asked) parts.push(n.asked.job + ' asked before git push. Its run waits without a process, so its slot is free.');
    if (n.tookAfterAsk) parts.push(n.tookAfterAsk.task + ' took ' + n.tookAfterAsk.job + ' meanwhile.');
    if (n.resumed) parts.push('The run of ' + n.resumed.job + ' went on from its ledger and finished.');
    if (n.slept) parts.push('The front read GET /v1/status of ' + (n.slept === 1 ? 'one idle Task' : n.slept + ' idle Tasks') + '. The body said idle, so it called SuspendTask. A sleeping Task costs nothing.');
    if (n.pass && !n.slept) parts.push('No Task was idle for 10 minutes yet, so the front suspended none.');
    if (n.single && !n.slept) parts.push('One Task took the job. An idle Task stays awake until the front suspends it.');
    return parts.join(' ');
  }

  function enqueue(n) {
    run((notes) => {
      const first = jobs + 1;
      for (let i = 0; i < n; i++) {
        jobs++;
        pending.push({ id: 'job-' + jobs, asks: n > 1 && i === 2 });
      }
      line('enqueue', (n === 1 ? 'job-' + first : 'job-' + first + ' to job-' + jobs) + ' on ' + QUEUE);
      notes.woke = wakeFor('enqueue');
      notes.cause = 'enqueue';
      if (n > 1) notes.batch = true;
      else notes.single = true;
    });
  }

  function allow() {
    run((notes) => {
      const k = tasks.find((x) => x.waiting.some((w) => !w.allowed));
      if (!k) return;
      const w = k.waiting.find((x) => !x.allowed);
      line('approve', w.id + ', through the router');
      if (k.phase === 'asleep') {
        k.phase = 'waking';
        k.decide = w;
        notes.woke = 1;
        notes.wokeTask = k.name;
        notes.cause = 'decision';
      } else {
        line('fw.approval.decided', w.id + ', allow, by you');
        w.allowed = true;
      }
    });
  }

  function pass() {
    run((notes) => {
      notes.pass = true;
    }, SUSPEND_AFTER / INTERVAL);
  }

  function render() {
    const waitingTask = tasks.find((k) => k.waiting.some((w) => !w.allowed));
    const idleAwake = tasks.some((k) => k.phase === 'running' && !k.job);
    let primary = 'enqueue';
    if (idleAwake) primary = 'pass';
    else if (waitingTask) primary = 'allow';
    const kind = (name) => (name === primary ? 'primary' : 'secondary');
    const list = [];
    const first = waitingTask && waitingTask.waiting.find((w) => !w.allowed);
    if (primary !== 'enqueue') list.push(key('Enqueue a job', { kind: 'secondary', onClick: () => enqueue(1) }));
    list.push(key('Enqueue four jobs', { kind: 'secondary', onClick: () => enqueue(4) }));
    if (first && primary !== 'allow') list.push(key('Allow ' + first.id, { kind: 'secondary', onClick: allow }));
    if (idleAwake && primary !== 'pass') list.push(key('Let 10 minutes pass', { kind: 'secondary', onClick: pass }));
    if (primary === 'enqueue') list.push(key('Enqueue a job', { kind: kind('enqueue'), onClick: () => enqueue(1) }));
    if (primary === 'pass') list.push(key('Let 10 minutes pass', { kind: kind('pass'), onClick: pass }));
    if (primary === 'allow') list.push(key('Allow ' + first.id, { kind: kind('allow'), onClick: allow }));
    d.setKeys(list);
  }

  d.reset(() => {
    if (busy) return;
    init();
    log.clear();
    paint();
    d.say('');
    render();
  });

  init();
  paint();
  render();
}
