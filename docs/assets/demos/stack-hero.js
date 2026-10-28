// The opening of the home page: one job through the stack, as a narrated
// scene that plays on its own. It shows the three things that the stack
// gives a person: it is easy to drive, every agent is sealed in its own
// sandbox, and one person gets more done. The owner asked for this motion on
// 2026-10-27, so it is the one demo that starts by itself (DESIGN.md, 4.4).
// It has a Pause key, it stops when it leaves the window, and under reduced
// motion it waits for the reader to step through it.
//
// The names in the scene are real: the batch and enqueue tools of the
// workbench queue the jobs, the front wakes a sleeping Task for a job, the
// token broker of the front hands a worker the token of a person for one run
// (POST /v1/tokens), the egress policy of each Task holds the hosts that it
// can reach, the policy of the kernel asks before a risky call, and the front
// suspends an idle Task.

import { h, css, key, mark, avatar, reduced, settle } from './kit.js';

css('stack-hero', `
.doc > .demo.hero { max-width: 960px; margin-top: var(--s-5); }
.hero-card { container-type: inline-size; }
.hero-head { display: flex; flex-direction: column; gap: var(--s-3); padding: var(--s-4) var(--s-5) 0; }
.doc .hero-say { margin: 0; min-height: 84px; }
.hero-line { display: block; font-size: 24px; line-height: 30px; font-weight: 800; font-stretch: 110%; letter-spacing: -0.02em; }
.hero-more { display: block; margin-top: 4px; font-size: var(--t-doc); line-height: 24px; color: var(--muted); }
.doc .hero-values { display: flex; flex-wrap: wrap; gap: var(--s-2); margin: 0; padding: 0; list-style: none; }
.doc .hero-values li { display: inline-flex; align-items: center; gap: 8px; margin: 0; padding: 4px 10px 4px 8px; border: 1px solid var(--line); border-radius: var(--r); font-size: var(--t-control); font-weight: 600; color: var(--muted); }
.doc .hero-values li.on { color: var(--ink); background: var(--raised); border-color: var(--raised-line); box-shadow: var(--e-row); font-weight: 700; }

.hero-stage { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.55fr) minmax(0, 0.8fr); gap: var(--s-4); align-items: start; padding: var(--s-4) var(--s-5); }
.hero-col { display: flex; flex-direction: column; gap: var(--s-2); min-width: 0; }
.hero-col > .demo-label { margin: 0; }
.hero-you-head { display: flex; align-items: center; gap: var(--s-2); font-weight: 700; font-size: var(--t-control); }
.hero-composer { display: flex; flex-direction: column; gap: var(--s-2); padding: 8px 10px; min-height: 96px; font-size: var(--t-control); line-height: 20px; }
.hero-typed { flex: 1; min-height: 40px; overflow-wrap: anywhere; }
.hero-typed:empty::before { content: 'Message the fleet'; color: var(--muted); }
.hero-composer .key { align-self: flex-end; }
.hero-composer .key.pressed, .hero-decision .key.pressed { top: 1px; box-shadow: none; }

.hero-decision { display: flex; flex-direction: column; border: 1px solid var(--edge); border-radius: var(--r); background: var(--card); box-shadow: var(--e-card); overflow: hidden; font-size: var(--t-control); line-height: 20px; }
.hero-decision.quiet { border-color: var(--line); box-shadow: none; }
.hero-decision-body { display: flex; flex-direction: column; gap: 6px; padding: 8px 10px 10px; }
.hero-decision-title { display: flex; align-items: center; gap: 8px; font-weight: 800; }
.hero-decision code { font-size: 12px; overflow-wrap: anywhere; }
.hero-decision-keys { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 6px; margin-top: 2px; }

.hero-panel { display: flex; flex-direction: column; gap: var(--s-3); padding: 10px; border: 1px solid var(--line); border-radius: var(--r); font-size: var(--t-control); line-height: 20px; }
.hero-panel-row { display: flex; flex-direction: column; gap: 4px; }
.hero-panel-row > span:first-child { font-size: var(--t-meta); line-height: var(--t-meta-lh); font-weight: 600; color: var(--muted); }
.hero-slot { display: inline-flex; align-items: center; gap: 8px; align-self: flex-start; padding: 3px 8px; border: 1px solid var(--line); border-radius: var(--r); background: var(--paper); font-weight: 600; }
.hero-queue { display: grid; grid-template-columns: repeat(6, 9px); gap: 3px; align-self: flex-start; padding: 4px; border-radius: var(--r); background: var(--recess); box-shadow: var(--e-recess); max-width: 100%; }
.hero-queue .lamp { background: transparent; box-shadow: inset 0 0 0 1px var(--led-grey); }
.hero-queue .lamp.lit { background: var(--ink); box-shadow: none; }

.hero-wall { display: flex; flex-direction: column; border: 2px solid var(--muted); border-radius: var(--r); background: var(--paper); overflow: hidden; }
.hero-wall .groove { border-bottom-color: var(--line); }
.doc .hero-cells { display: flex; flex-direction: column; gap: 6px; margin: 0; padding: 8px; list-style: none; }
.doc .hero-cell { display: flex; align-items: center; gap: 8px; min-width: 0; margin: 0; padding: 6px 8px; border: 1px solid var(--line); border-radius: var(--r); background: var(--recess); box-shadow: var(--e-recess); }
.hero-cell-name { font-size: var(--t-control); font-weight: 700; white-space: nowrap; }
.hero-cell .status { margin-left: auto; min-width: 0; }
.hero-cell .status-word { overflow: hidden; text-overflow: ellipsis; }

.doc .hero-hosts { display: flex; flex-direction: column; gap: 6px; margin: 0; padding: 0; list-style: none; }
.doc .hero-host { display: flex; flex-direction: column; gap: 2px; margin: 0; padding: 6px 8px; border: 1px dashed var(--line); border-radius: var(--r); font-size: var(--t-control); line-height: 20px; }
.hero-host-name { font-family: var(--mono); font-size: 12.5px; font-weight: 600; overflow-wrap: anywhere; }

.hero-layer { position: absolute; inset: 0; pointer-events: none; overflow: visible; }
.hero-packet { position: absolute; left: 0; top: 0; display: inline-flex; align-items: center; height: 22px; padding: 0 8px; border-radius: var(--r); background: var(--ink); color: var(--on-ink); font-size: var(--t-caption); font-weight: 700; white-space: nowrap; will-change: transform; }
.hero-packet.amber { background: var(--led-amber); color: #000000; }
.hero-packet.red { background: var(--led-red); color: #ffffff; }
.hero-impact { position: absolute; left: 0; top: 0; width: 14px; height: 14px; border-radius: var(--r-led); background: var(--led-red); box-shadow: 0 0 8px var(--led-red), var(--led-ring); }

.hero-foot { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s-3) var(--s-4); padding: var(--s-2) var(--s-5) var(--s-4); border-top: 1px solid var(--line-soft); }
.doc .hero-readout { display: flex; flex-wrap: wrap; gap: 4px var(--s-5); margin: 0; font-size: var(--t-control); }
.hero-readout div { display: flex; flex-direction: column; }
.hero-readout dt { font-size: var(--t-meta); line-height: var(--t-meta-lh); color: var(--muted); }
.hero-readout dd { margin: 0; font-size: 20px; line-height: 26px; font-weight: 800; font-stretch: 106%; font-variant-numeric: tabular-nums; }
.hero-controls { display: flex; align-items: center; gap: var(--s-2); margin-left: auto; }
.doc .hero-steps { display: flex; gap: 4px; width: 100%; margin: 0; padding: 0; list-style: none; }
.doc .hero-steps li { flex: 1 1 0; margin: 0; }
.hero-steps button { display: block; width: 100%; height: 20px; padding: 8px 0; border: 0; background: none; cursor: pointer; }
.hero-steps button::before { content: ''; display: block; height: 4px; border-radius: 2px; background: var(--line); }
.hero-steps button.done::before { background: var(--muted); }
.hero-steps button.now::before { background: var(--ink); }
.hero-steps button:hover::before { background: var(--ink); }

@container (max-width: 760px) {
  .hero-stage { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
  .hero-col-box { grid-column: 1 / -1; }
  .hero-col-net { grid-column: 1 / -1; }
  .doc .hero-hosts { flex-direction: row; flex-wrap: wrap; }
  .doc .hero-host { flex: 1 1 140px; }
}
@container (max-width: 480px) {
  .hero-stage { grid-template-columns: minmax(0, 1fr); padding: var(--s-3) var(--s-4); }
  .hero-head { padding: var(--s-3) var(--s-4) 0; }
  .hero-foot { padding: var(--s-2) var(--s-4) var(--s-4); }
  .hero-line { font-size: 21px; line-height: 27px; }
  .doc .hero-say { min-height: 108px; }
  .hero-controls { margin-left: 0; width: 100%; }
}
`);

const AGENTS = ['migrator-1', 'migrator-2', 'migrator-3', 'reviewer'];
const VALUES = [
  ['easy', 'Easy to drive'],
  ['sealed', 'Sealed in a sandbox'],
  ['more', 'More done per person'],
];
const REQUEST = 'Migrate the 12 Puppet modules to Ansible.';

class Stopped extends Error {}

export default function mount(root) {
  root.textContent = '';
  root.classList.add('demo', 'is-live', 'hero');

  // ---------- the head: the line that tells, and the three values ----------
  const line = h('strong', { class: 'hero-line' });
  const more = h('span', { class: 'hero-more' });
  const say = h('p', { class: 'hero-say', 'aria-live': 'polite' }, line, more);
  const valueEls = {};
  const values = h('ul', { class: 'hero-values', 'aria-label': 'What this step shows' }, VALUES.map(([id, word]) => {
    const lamp = h('span', { class: 'led led-grey', 'aria-hidden': 'true' });
    const li = h('li', null, lamp, h('span', { text: word }));
    valueEls[id] = { li, lamp };
    return li;
  }));

  // ---------- the stage ----------
  const typed = h('span', { class: 'hero-typed' });
  const send = key('Send', { kind: 'primary', size: 's', onClick: () => jump(1) });
  const composer = h('div', { class: 'hero-composer recess' }, typed, send);
  const allow = key('Allow', { kind: 'primary', size: 's', onClick: () => jump(6) });
  const deny = key('Deny', { size: 's', onClick: () => denied() });
  const decisionTitle = h('span', { text: 'Needs your decision' });
  const decisionLed = h('span', { class: 'led led-amber breathe', 'aria-hidden': 'true' });
  const decisionKeys = h('div', { class: 'hero-decision-keys' }, deny, allow);
  const decision = h('div', { class: 'hero-decision', hidden: true },
    h('div', { class: 'groove groove-card', 'aria-hidden': 'true' }),
    h('div', { class: 'hero-decision-body' },
      h('span', { class: 'hero-decision-title' }, decisionLed, decisionTitle),
      h('span', null, h('strong', { text: 'migrator-2' }), ' wants to run ', h('code', { text: 'git push' })),
      decisionKeys));
  const you = h('div', { class: 'hero-col hero-col-you' },
    h('span', { class: 'demo-label', text: 'You' }),
    h('div', { class: 'hero-you-head' }, avatar('AL', 24), h('span', { text: 'Alice' })),
    composer, decision);

  const slotLamp = h('span', { class: 'led led-grey', 'aria-hidden': 'true' });
  const slot = h('span', { class: 'hero-slot' }, slotLamp, h('span', { text: 'GitHub sign-in' }));
  const queueLamps = Array.from({ length: 12 }, () => h('span', { class: 'lamp', 'aria-hidden': 'true' }));
  const queue = h('span', { class: 'hero-queue', role: 'img', 'aria-label': 'The queue' }, queueLamps);
  const front = h('div', { class: 'hero-panel' },
    h('div', { class: 'hero-panel-row' }, h('span', { text: 'Kept here, never in a sandbox' }), slot),
    h('div', { class: 'hero-panel-row' }, h('span', { text: 'The queue' }), queue));
  const frontCol = h('div', { class: 'hero-col hero-col-front' }, h('span', { class: 'demo-label', text: 'The workbench' }), front);

  const cells = {};
  const cellList = h('ul', { class: 'hero-cells' }, AGENTS.map((name) => {
    const light = h('span', { class: 'led led-grey', 'aria-hidden': 'true' });
    const word = h('span', { class: 'status-word', text: 'asleep' });
    const status = h('span', { class: 'status' }, light, word);
    const li = h('li', { class: 'hero-cell' }, mark(name, 24), h('span', { class: 'hero-cell-name', text: name }), status);
    cells[name] = { li, light, word, status };
    return li;
  }));
  const wall = h('div', { class: 'hero-wall' }, h('div', { class: 'groove', 'aria-hidden': 'true' }), cellList);
  const boxCol = h('div', { class: 'hero-col hero-col-box' }, h('span', { class: 'demo-label', text: 'Sandboxes on AX, one per agent' }), wall);

  const hosts = {};
  const hostList = h('ul', { class: 'hero-hosts' }, [['github.com', 'on the allow list'], ['pastebin.com', 'not on the list']].map(([name, word]) => {
    const st = h('span', { class: 'status' }, h('span', { class: 'led led-grey', 'aria-hidden': 'true' }), h('span', { class: 'status-word', text: word }));
    const li = h('li', { class: 'hero-host' }, h('span', { class: 'hero-host-name', text: name }), st);
    hosts[name] = { li, st, word };
    return li;
  }));
  const netCol = h('div', { class: 'hero-col hero-col-net' }, h('span', { class: 'demo-label', text: 'The internet' }), hostList);

  const layer = h('div', { class: 'hero-layer', 'aria-hidden': 'true' });
  const stage = h('div', { class: 'hero-stage' }, you, frontCol, boxCol, netCol, layer);

  // ---------- the foot: the readout, the steps, and the keys ----------
  const figures = {};
  const readout = h('dl', { class: 'hero-readout' }, [['done', 'Modules done'], ['awake', 'Agents awake'], ['blocked', 'Calls blocked'], ['keys', 'Keys you pressed']].map(([id, label]) => {
    const dd = h('dd', { text: '0' });
    figures[id] = dd;
    return h('div', null, h('dt', { text: label }), dd);
  }));
  const playKey = key('Pause', { onClick: () => toggle() });
  const replay = key('Replay', { kind: 'quiet', onClick: () => jump(0, true) });
  const tryKey = h('a', { class: 'key key-m key-primary', href: '#try-the-moment-that-matters', hidden: true, text: 'Try a decision yourself' });
  const stepButtons = [];
  const steps = h('ol', { class: 'hero-steps', 'aria-label': 'Steps' });
  const foot = h('div', { class: 'hero-foot' }, readout, h('div', { class: 'hero-controls' }, replay, playKey, tryKey), steps);

  const card = h('section', { class: 'demo-card hero-card', 'aria-label': 'One job through the stack' },
    h('div', { class: 'groove groove-card', 'aria-hidden': 'true' }), h('div', { class: 'hero-head' }, say, values), stage, foot);
  root.append(card, h('p', { class: 'demo-caption', text: 'A model of one job, sped up. The parts and their names are real: the queue and the token broker of the workbench, the allow list of each Task on AX, and the approvals of the kernel.' }));

  // ---------- the state ----------
  const state = { done: 0, awake: 0, blocked: 0, keys: 0 };
  function figure(id, n) {
    state[id] = n;
    figures[id].textContent = id === 'done' ? n + ' of 12' : id === 'awake' ? n + ' of 4' : String(n);
  }
  function agent(name, kind, word) {
    const c = cells[name];
    const tone = { working: 'green', starting: 'grey', needs: 'amber', asleep: 'grey', waiting: 'grey' }[kind];
    c.light.className = 'led led-' + tone + (kind === 'needs' ? ' breathe' : '') + (kind === 'starting' ? ' led-off' : '');
    c.status.className = 'status tone-' + tone;
    c.word.textContent = word || { working: 'working', starting: 'waking', needs: 'needs you', asleep: 'asleep', waiting: 'waits for you' }[kind];
    c.state = kind;
    figure('awake', AGENTS.filter((n) => ['working', 'starting', 'needs'].includes(cells[n].state)).length);
  }
  function host(name, tone, word) {
    const x = hosts[name];
    x.st.className = 'status tone-' + tone;
    x.st.firstChild.className = 'led led-' + tone;
    x.st.lastChild.textContent = word || x.word;
  }
  function lit(ids) {
    for (const [id] of VALUES) {
      const on = ids.includes(id);
      valueEls[id].li.classList.toggle('on', on);
      valueEls[id].lamp.className = 'led led-' + (on ? 'green' : 'grey');
    }
  }
  function queued(n) {
    queueLamps.forEach((l, i) => l.classList.toggle('lit', i < n));
    queue.setAttribute('aria-label', 'The queue: ' + n + ' jobs waiting');
  }
  function resetState() {
    typed.textContent = '';
    send.disabled = false;
    send.classList.replace('key-secondary', 'key-primary');
    send.classList.remove('pressed');
    allow.classList.remove('pressed');
    decision.hidden = true;
    decision.classList.remove('quiet');
    decisionLed.className = 'led led-amber breathe';
    decisionTitle.textContent = 'Needs your decision';
    decisionKeys.hidden = false;
    slotLamp.className = 'led led-grey';
    queued(0);
    for (const n of AGENTS) agent(n, 'asleep');
    host('github.com', 'grey');
    host('pastebin.com', 'grey');
    for (const id of Object.keys(state)) figure(id, 0);
    layer.textContent = '';
    tryKey.hidden = true;
  }

  // ---------- time: a clock that stops on Pause and on a jump ----------
  let instant = false;
  let paused = false;
  let hiddenNow = false;
  let run = 0;
  const flying = new Set();
  const still = () => paused || hiddenNow;

  async function sleep(ms, my) {
    if (instant) return;
    let left = ms;
    while (left > 0) {
      if (my !== run) throw new Stopped();
      await new Promise((r) => setTimeout(r, 50));
      if (!still()) left -= 50;
    }
    if (my !== run) throw new Stopped();
  }

  function center(el) {
    const s = stage.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { x: r.left - s.left + r.width / 2, y: r.top - s.top + r.height / 2, rect: { l: r.left - s.left, t: r.top - s.top, r: r.right - s.left, b: r.bottom - s.top } };
  }

  // fly moves a small chip from one element to another. to can be a point.
  async function fly(from, to, label, my, tone) {
    if (instant) return;
    const a = from.x !== undefined ? from : center(from);
    const b = to.x !== undefined ? to : center(to);
    const p = h('span', { class: 'hero-packet' + (tone ? ' ' + tone : ''), text: label });
    layer.append(p);
    const w = p.offsetWidth / 2;
    const anim = p.animate(
      [
        { transform: `translate(${a.x - w}px, ${a.y - 11}px) scale(0.85)`, opacity: 0 },
        { transform: `translate(${a.x - w}px, ${a.y - 11}px) scale(1)`, opacity: 1, offset: 0.12 },
        { transform: `translate(${b.x - w}px, ${b.y - 11}px) scale(1)`, opacity: 1, offset: 0.88 },
        { transform: `translate(${b.x - w}px, ${b.y - 11}px) scale(0.85)`, opacity: 0 },
      ],
      { duration: 1100, easing: 'cubic-bezier(.45,0,.25,1)', fill: 'forwards' }
    );
    flying.add(anim);
    if (still()) anim.pause();
    try {
      await new Promise((resolve, reject) => {
        anim.onfinish = resolve;
        anim.oncancel = () => reject(new Stopped());
      });
    } finally {
      flying.delete(anim);
      p.remove();
    }
    if (my !== run) throw new Stopped();
  }

  // impact marks the place where a call hits the wall.
  function impact(pt) {
    if (instant) return;
    const m = h('span', { class: 'hero-impact' });
    m.style.transform = `translate(${pt.x - 7}px, ${pt.y - 7}px)`;
    layer.append(m);
    const anim = m.animate([{ opacity: 1 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }], { duration: 1600, fill: 'forwards' });
    anim.onfinish = () => m.remove();
  }

  // edge is the point of the wall nearest to a host: where its call stops.
  function edge(target) {
    const w = center(wall).rect;
    const t = center(target);
    return { x: Math.min(Math.max(t.x, w.l), w.r), y: Math.min(Math.max(t.y, w.t), w.b) };
  }

  async function typeOut(text, my) {
    if (instant) {
      typed.textContent = text;
      return;
    }
    for (let i = 1; i <= text.length; i++) {
      typed.textContent = text.slice(0, i);
      await sleep(34, my);
    }
  }

  async function press(k, my) {
    if (instant) return;
    k.classList.add('pressed');
    await sleep(180, my);
    k.classList.remove('pressed');
  }

  // ---------- the beats ----------
  const beats = [
    {
      line: 'You ask in plain words.',
      more: 'From bossmode, from Claude Code, or from an IDE. No YAML, no pipeline.',
      values: ['easy'],
      async run(my) {
        await sleep(500, my);
        await typeOut(REQUEST, my);
        await sleep(350, my);
        await press(send, my);
        figure('keys', 1);
        send.disabled = true;
        send.classList.replace('key-primary', 'key-secondary');
        await fly(composer, front, '12 jobs', my);
      },
    },
    {
      line: 'One request becomes twelve jobs.',
      more: 'The workbench queues them and wakes three agents at once, each in a sandbox of its own.',
      values: ['more'],
      async run(my) {
        for (let i = 1; i <= 12; i++) {
          queued(i);
          await sleep(55, my);
        }
        let left = 12;
        for (const n of ['migrator-1', 'migrator-2', 'migrator-3']) {
          left -= 1;
          queued(left);
          agent(n, 'starting');
          await fly(queue, cells[n].li, 'job', my);
          agent(n, 'working');
        }
      },
    },
    {
      line: 'Your sign-ins stay outside.',
      more: 'migrator-1 needs GitHub, so the workbench hands it a short-lived token for this one run. The sign-in itself never enters a sandbox.',
      values: ['sealed'],
      async run(my) {
        agent('migrator-1', 'working', 'needs GitHub');
        await fly(cells['migrator-1'].li, slot, 'token?', my);
        slotLamp.className = 'led led-green';
        await fly(slot, cells['migrator-1'].li, 'token', my);
        agent('migrator-1', 'working', 'working');
        await fly(cells['migrator-1'].li, hosts['github.com'].li, 'git fetch', my);
        host('github.com', 'green', 'allowed');
        slotLamp.className = 'led led-grey';
      },
    },
    {
      line: 'The wall holds.',
      more: 'Each sandbox reaches only the hosts on its allow list. A call anywhere else never leaves it.',
      values: ['sealed'],
      async run(my) {
        const pt = edge(hosts['pastebin.com'].li);
        await fly(cells['migrator-3'].li, pt, 'upload', my, 'red');
        impact(pt);
        host('pastebin.com', 'red', 'blocked');
        figure('blocked', 1);
      },
    },
    {
      line: 'Risky steps wait for you.',
      more: 'migrator-2 asks before it pushes. Its run waits and its sandbox goes to sleep, so the wait costs nothing.',
      values: ['sealed', 'easy'],
      async run(my) {
        agent('migrator-2', 'needs');
        await fly(cells['migrator-2'].li, composer, 'git push?', my, 'amber');
        decision.hidden = false;
        if (!instant) settle(decision);
        await sleep(900, my);
        agent('migrator-2', 'waiting');
      },
    },
    {
      line: 'The other agents keep going.',
      more: 'Modules land while you are in a meeting, and the reviewer wakes to check them. You are not in the loop for any of it.',
      values: ['more'],
      async run(my) {
        let left = 9;
        agent('reviewer', 'starting');
        await sleep(300, my);
        agent('reviewer', 'working');
        for (let i = 1; i <= 9; i++) {
          figure('done', i);
          if (left > 0 && i % 2 === 0) queued(--left);
          if (i === 7) agent('migrator-1', 'asleep');
          await sleep(320, my);
        }
        queued(1);
      },
    },
    {
      line: 'One key, and it picks up where it stopped.',
      more: 'Your decision wakes the sandbox of migrator-2. The kernel reads its ledger and goes on from the same step.',
      values: ['easy'],
      async run(my) {
        await press(allow, my);
        figure('keys', 2);
        decision.classList.add('quiet');
        decisionLed.className = 'led led-grey';
        decisionTitle.textContent = 'Allowed by you';
        decisionKeys.hidden = true;
        await fly(decision, front, 'allow', my);
        agent('migrator-2', 'starting');
        await fly(front, cells['migrator-2'].li, 'allow', my);
        agent('migrator-2', 'working');
        queued(0);
        for (let i = 10; i <= 12; i++) {
          await sleep(420, my);
          figure('done', i);
        }
      },
    },
    {
      line: 'Twelve modules. You pressed two keys.',
      more: 'The fleet goes back to sleep until the next job, and every step it took is in a ledger you can read.',
      values: ['easy', 'sealed', 'more'],
      async run(my) {
        for (const n of ['migrator-3', 'migrator-2', 'reviewer']) {
          agent(n, 'asleep');
          await sleep(260, my);
        }
        if (!instant) tryKey.hidden = false;
      },
    },
  ];

  beats.forEach((b, i) => {
    const btn = h('button', { type: 'button', 'aria-label': 'Step ' + (i + 1) + ': ' + b.line, title: b.line, on: { click: () => jump(i, true) } });
    stepButtons.push(btn);
    steps.append(h('li', null, btn));
  });

  function show(i) {
    const b = beats[i];
    line.textContent = b.line;
    more.textContent = b.more;
    if (!instant) settle(say);
    lit(b.values);
    stepButtons.forEach((s, k) => {
      s.classList.toggle('done', k < i);
      s.classList.toggle('now', k === i);
      s.setAttribute('aria-current', k === i ? 'step' : 'false');
    });
  }

  // jump puts the scene at the start of beat i and plays on from there.
  // Under reduced motion, it shows the end of beat i and waits.
  async function jump(i, byReader) {
    const my = ++run;
    for (const a of flying) a.cancel();
    layer.textContent = '';
    if (byReader && reduced()) paused = true;
    resetState();
    instant = true;
    for (let k = 0; k < i; k++) await beats[k].run(my);
    instant = false;
    if (reduced()) {
      instant = true;
      show(i);
      await beats[i].run(my);
      instant = false;
      tryKey.hidden = i !== beats.length - 1;
      setPlayKey();
      return;
    }
    setPlayKey();
    try {
      for (let k = i; k < beats.length; k++) {
        show(k);
        await beats[k].run(my);
        await sleep(k === beats.length - 1 ? 6000 : 2400, my);
      }
      jump(0);
    } catch (e) {
      if (!(e instanceof Stopped)) throw e;
    }
  }

  // denied stops the scene on the other answer: the agent goes on without the push.
  function denied() {
    run++;
    for (const a of flying) a.cancel();
    layer.textContent = '';
    paused = true;
    decision.classList.add('quiet');
    decisionLed.className = 'led led-grey';
    decisionTitle.textContent = 'Denied by you';
    decisionKeys.hidden = true;
    figure('keys', 2);
    agent('migrator-2', 'working');
    line.textContent = 'Deny works too.';
    more.textContent = 'migrator-2 reads the denial as the result of its call and goes on without the push. Try both answers in the demo below.';
    settle(say);
    tryKey.hidden = false;
    playKey.textContent = reduced() ? 'Start again' : 'Play';
    keyKind(false);
  }

  // Under reduced motion, Next step is the orange key, except where the
  // scene shows its own: Allow on the decision, and the link at the end.
  function keyKind(primary) {
    playKey.classList.toggle('key-primary', primary);
    playKey.classList.toggle('key-secondary', !primary);
  }
  function setPlayKey() {
    if (reduced()) {
      const now = stepButtons.findIndex((s) => s.classList.contains('now'));
      playKey.textContent = now >= beats.length - 1 ? 'Start again' : 'Next step';
      keyKind(now < beats.length - 1 && (decision.hidden || decisionKeys.hidden));
    } else {
      playKey.textContent = paused ? 'Play' : 'Pause';
      keyKind(false);
    }
  }

  function toggle() {
    // After Deny, the key starts the scene again.
    if (paused && !flying.size && decisionTitle.textContent === 'Denied by you') {
      paused = false;
      jump(0, reduced());
      return;
    }
    if (reduced()) {
      const now = stepButtons.findIndex((s) => s.classList.contains('now'));
      jump(now >= beats.length - 1 ? 0 : now + 1, true);
      return;
    }
    paused = !paused;
    for (const a of flying) paused ? a.pause() : a.play();
    setPlayKey();
  }

  // The scene stops while it is out of sight or the tab is hidden.
  function sync() {
    for (const a of flying) still() ? a.pause() : a.play();
  }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      hiddenNow = !entries[0].isIntersecting || document.hidden;
      sync();
    }, { threshold: 0.25 }).observe(card);
  }
  document.addEventListener('visibilitychange', () => {
    hiddenNow = document.hidden;
    sync();
  });

  jump(0);
}
