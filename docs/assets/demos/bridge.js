// A bridge: a channel of agents on one goal. The reader posts to one seat
// or to everyone, sees which seats get the message, wake, and answer, and
// sees the cap maxPairMessages stop two agents that keep handing work to
// each other. The rules follow fanPlan and recipients in bridges/fanout.go
// of the workbench: a message without an address reaches every member that
// is not fired or muted, an answer reaches another seat only when its first
// words address that seat, and two agents exchange at most maxPairMessages
// messages (6 by default) until a person writes. The words of the system
// lines and of the statuses are the words of the page: lineWords in
// src/lib/lines.ts and PRESENCE in src/lib/presence.ts of bossmode. The
// sentence of the backend sits in the tooltip of a line, as on the page.

import { h, css, demo, key, led, lineLed, chip, mark, avatar, code, wait, settle } from './kit.js';

css('bridge', `
.doc .br-roster { display: flex; flex-direction: column; gap: 2px; margin: 0; padding: 0; list-style: none; }
.doc .br-roster > li { margin: 0; }
.br-seat { display: grid; grid-template-columns: 28px minmax(0, 1fr); column-gap: var(--s-2); align-items: center; min-height: 44px; padding: 4px 8px; border: 1px solid transparent; border-radius: var(--r); }
.br-seat.lit { background: var(--raised); border-color: var(--raised-line); box-shadow: var(--e-row); }
.br-seat-head { display: flex; flex-wrap: wrap; align-items: center; gap: 2px var(--s-2); min-width: 0; }
.br-handle { font-size: var(--t-control); line-height: var(--t-control-lh); font-weight: 700; }
.br-mention { font-weight: 700; }
.br-task { grid-column: 2; font-size: var(--t-meta); line-height: var(--t-meta-lh); color: var(--muted); overflow-wrap: anywhere; }
.br-cap { padding: var(--s-2) 10px; border-top: 1px solid var(--line-soft); }
.br-cap-head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--s-2); margin-bottom: var(--s-2); }
.br-cap-head code { font-size: var(--t-meta); }
.br-cap-count { font-size: var(--t-meta); line-height: var(--t-meta-lh); font-weight: 600; white-space: nowrap; }
.br-cap-note { margin-top: var(--s-1); font-size: var(--t-meta); line-height: var(--t-meta-lh); color: var(--muted); }
.br-channel { display: flex; flex-direction: column; min-width: 0; border: 1px solid var(--line); border-radius: var(--r); background: var(--paper); }
.br-entries { height: 312px; overflow-y: auto; padding: var(--s-1) 0; }
.br-goal { margin: 0 12px var(--s-1); padding: 6px 0 8px; border-bottom: 1px solid var(--line-soft); font-size: var(--t-meta); line-height: var(--t-meta-lh); color: var(--muted); }
.br-msg { display: grid; grid-template-columns: 24px minmax(0, 1fr); column-gap: var(--s-2); padding: 6px 12px; }
.br-msg-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 var(--s-2); }
.br-msg-head b { font-size: var(--t-control); line-height: var(--t-control-lh); font-weight: 700; }
.br-text { font-size: var(--t-control); line-height: var(--t-control-lh); overflow-wrap: anywhere; }
.br-reach { margin-top: 2px; font-size: var(--t-meta); line-height: var(--t-meta-lh); color: var(--muted); }
.br-reach.held { color: var(--ink); font-weight: 600; }
.br-sys { padding: 4px 12px; text-align: center; font-size: var(--t-meta); line-height: var(--t-meta-lh); color: var(--muted); overflow-wrap: anywhere; }
.br-sys .led { margin-right: var(--s-2); vertical-align: 0; }
.br-sys.ev-cap { color: var(--ink); font-weight: 600; }
.br-composer { padding: var(--s-2) 12px var(--s-3); border-top: 1px solid var(--line); }
.br-box { margin-top: var(--s-1); min-height: 38px; padding: 8px 10px; font-size: var(--t-control); line-height: var(--t-control-lh); overflow-wrap: anywhere; }
.br-box.empty { color: var(--muted); }
`);

const TITLE = 'Migrate logrotate';
const GOAL = 'Migrate the logrotate module of the Puppet tree to an Ansible role.';
const CAP = 6; // workbench.bridges.maxPairMessages, the default of caps.maxPairMessages

// The seats: a handle, the agent behind it (its mark), and its task.
const SEATS = [
  { handle: 'migrator-1', agent: 'migrator', task: 'Port the logrotate class to a role' },
  { handle: 'migrator-2', agent: 'migrator', task: 'Port the cron jobs of the module' },
  { handle: 'reviewer', agent: 'reviewer', task: 'Review each role before it lands' },
  { handle: 'scribe', agent: 'scribe', task: 'Keep the notes page of the bridge', muted: true },
];

// The status of a seat, as PRESENCE of bossmode words it.
const STATUS = {
  asleep: ['grey', 'asleep'],
  working: ['green', 'working'],
  idle: ['grey', 'idle'],
};

// The answers of each seat to a status request of the person.
const STATUS_ANSWERS = {
  'migrator-1': 'The logrotate role is written. It waits for review.',
  'migrator-2': 'The cron jobs are ported. Nothing blocks me.',
  reviewer: 'No role reached me yet.',
};

// The review loop: each answer starts with the handle of the other seat, so
// it hands the work on. The seventh message meets the cap.
const LOOP = [
  ['reviewer', 'migrator-1', 'The role has no handler for the reload.'],
  ['migrator-1', 'reviewer', 'Added a handler. Look again.'],
  ['reviewer', 'migrator-1', 'The handler restarts the service. It must reload it.'],
  ['migrator-1', 'reviewer', 'It reloads now.'],
  ['reviewer', 'migrator-1', 'The template test fails on Debian.'],
  ['migrator-1', 'reviewer', 'Fixed the template. Look again.'],
  ['reviewer', 'migrator-1', 'One more point: the file mode.'],
];

const list = (xs) => (xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1]);

export default function mount(root) {
  const d = demo(root, {
    title: 'A bridge, and who gets each message',
    tone: 'grey',
    word: 'open',
    wide: true,
    caption: 'A model of the fan-out of a bridge. The rules and the cap come from bridges/fanout.go of the workbench, and the words of the lines and statuses from bossmode.',
  });

  // ---------- the members ----------
  const seats = {};
  const roster = h('ul', { class: 'br-roster', 'aria-label': 'Members' },
    SEATS.map((s) => {
      const status = led('grey', 'asleep');
      const li = h('li', { class: 'br-seat' },
        mark(s.agent, 28),
        h('div', { class: 'br-seat-head' }, h('span', { class: 'br-handle', text: s.handle }), status, s.muted ? chip('muted') : null),
        h('span', { class: 'br-task', text: s.task })
      );
      seats[s.handle] = { ...s, li, status, state: 'asleep' };
      return li;
    })
  );

  // ---------- the cap ----------
  const capCount = h('span', { class: 'br-cap-count' });
  const capBar = h('ol', { class: 'demo-steps', 'aria-hidden': 'true' }, Array.from({ length: CAP }, () => h('li')));
  const capNote = h('div', { class: 'br-cap-note' });
  const capBox = h('div', { class: 'br-cap' },
    h('div', { class: 'br-cap-head' }, code('maxPairMessages'), capCount),
    capBar,
    capNote
  );

  // ---------- the channel ----------
  const entries = h('div', { class: 'br-entries', role: 'log', 'aria-label': 'Messages of ' + TITLE });
  const addr = h('div', { class: 'demo-note', text: 'To everyone' });
  const box = h('div', { class: 'br-box recess empty', text: 'Message the bridge' });
  const channel = h('div', { class: 'br-channel' }, entries, h('div', { class: 'br-composer' }, addr, box));

  d.stage.append(h('div', { class: 'demo-split' },
    h('div', { class: 'demo-col' }, h('div', null, h('span', { class: 'demo-label', text: 'Members' }), roster), capBox),
    channel
  ));

  let busy = false;
  let pair = 0; // messages between reviewer and migrator-1 since the last message of a person

  function paintCap() {
    capCount.textContent = pair + ' of ' + CAP;
    [...capBar.children].forEach((li, i) => li.classList.toggle('done', i < pair));
    capNote.textContent = pair >= CAP ? 'reviewer and migrator-1 get nothing more from each other until a person writes.' : 'Messages between two agents since the last message of a person.';
  }

  function scroll(el) {
    settle(el);
    entries.scrollTop = entries.scrollHeight;
  }

  /** sys adds a system line: the words of the page, the light of its event, and the sentence of the backend in the tooltip. */
  function sys(event, words, sentence, tone = 'grey') {
    const el = h('div', { class: 'br-sys ev-' + event, title: sentence && sentence !== words ? sentence : undefined }, lineLed(tone), h('span', { text: words }));
    entries.append(el);
    scroll(el);
  }

  /** msg adds a message of a person or a seat, and a line under it that says which seats it reached. */
  function msg(from, text, to, reach) {
    const face = from === 'You' ? avatar('AL', 24) : mark(seats[from].agent, 24);
    const head = h('div', { class: 'br-msg-head' }, h('b', { text: from }), to.length ? h('span', { class: 'demo-note', text: 'to ' + list(to) }) : null);
    // A handle at the start of the text reads in bold, as a mention does on the page.
    const words = /^((?:@\S+\s+)+)(.*)$/.exec(text);
    const lines = [h('div', { class: 'br-text' }, words ? [h('span', { class: 'br-mention', text: words[1] }), words[2]] : text)];
    if (reach) lines.push(h('div', { class: 'br-reach' + (reach.held ? ' held' : ''), text: reach.text }));
    const el = h('div', { class: 'br-msg' }, face, h('div', null, head, lines));
    entries.append(el);
    scroll(el);
  }

  function setSeat(handle, state) {
    const s = seats[handle];
    s.state = state;
    s.status.set(...STATUS[state]);
  }

  function light(handles) {
    for (const s of Object.values(seats)) s.li.classList.toggle('lit', handles.includes(s.handle));
  }

  /** wake starts the next turn of a seat: a seat whose worker sleeps wakes first, and the channel says so. */
  async function wake(handle) {
    if (seats[handle].state === 'asleep') {
      sys('started', handle + ' woke up', '', 'green');
      await wait(260);
    }
    setSeat(handle, 'working');
  }

  /** type shows the draft in the composer with its address line, then sends it. */
  async function type(text, to) {
    box.classList.remove('empty');
    box.textContent = text;
    addr.textContent = to.length ? 'To ' + list(to) : 'To everyone';
    await wait(700);
    box.classList.add('empty');
    box.textContent = 'Message the bridge';
    addr.textContent = 'To everyone';
  }

  /** active is every seat that is not fired or muted: the seats that a message to everyone reaches. */
  const active = () => SEATS.filter((s) => !s.muted).map((s) => s.handle);

  async function toEveryone() {
    await run(async () => {
      const text = 'Where are you? One line each.';
      await type(text, []);
      pair = 0;
      paintCap();
      d.setStatus('grey', 'open');
      const got = active();
      msg('You', text, [], { text: 'Reached ' + list(got) + '. scribe is muted, so it got nothing.' });
      light(got);
      d.say('A message without an @ handle goes to every seat that is not fired or muted. scribe is muted, so it stays asleep.');
      await wait(500);
      for (const hd of got) await wake(hd);
      await wait(600);
      for (const hd of got) {
        msg(hd, STATUS_ANSWERS[hd], [], { text: 'Reached no seat.' });
        setSeat(hd, 'idle');
        await wait(420);
      }
      light([]);
      d.say('Each answer reached the channel. No answer starts with an @ handle, so none of them woke another seat.');
    });
  }

  async function toReviewer() {
    await run(async () => {
      const text = '@reviewer Review the role of migrator-1.';
      await type(text, ['reviewer']);
      pair = 0;
      paintCap();
      d.setStatus('grey', 'open');
      msg('You', text, ['reviewer'], { text: 'Reached reviewer.' });
      light(['reviewer']);
      d.say('The @ handle addresses one seat. Only reviewer gets the message, as a follow-up to its run.');
      await wait(500);
      await wake('reviewer');
      await wait(500);
      for (const [from, to, words] of LOOP) {
        const held = pair >= CAP;
        msg(from, '@' + to + ' ' + words, [to], held ? { held: true, text: to + ' got nothing: the cap holds it.' } : { text: 'Reached ' + to + '.' });
        setSeat(from, 'idle');
        if (held) {
          sys('cap', from + ' and ' + to + ' reached their cap', from + ' and ' + to + ' exchanged ' + CAP + ' messages without a person');
          light([]);
          d.setStatus('grey', 'held at a cap', { still: true });
          d.say('The seventh message stays in the channel, and migrator-1 does not get it. The two seats stop until a person writes.');
          return;
        }
        pair++;
        paintCap();
        light([to]);
        await wait(320);
        await wake(to);
        await wait(380);
      }
    });
  }

  async function toBoth() {
    await run(async () => {
      const text = '@migrator-1 Set the file mode, then stop. @reviewer No more rounds after that.';
      const to = ['migrator-1', 'reviewer'];
      await type(text, to);
      pair = 0;
      paintCap();
      d.setStatus('grey', 'open');
      msg('You', text, to, { text: 'Reached migrator-1 and reviewer.' });
      light(to);
      d.say('A message of a person ends every exchange between two agents, so the count of the cap starts again at 0.');
      await wait(500);
      for (const hd of to) await wake(hd);
      await wait(600);
      msg('migrator-1', 'Set the file mode to 0644.', [], { text: 'Reached no seat.' });
      setSeat('migrator-1', 'idle');
      await wait(420);
      msg('reviewer', 'The role passes review.', [], { text: 'Reached no seat.' });
      setSeat('reviewer', 'idle');
      light([]);
      d.say('Both answers address nobody, so the work stops here and waits for you.');
    });
  }

  async function nap() {
    await run(async () => {
      const idle = Object.values(seats).filter((s) => s.state === 'idle');
      for (const s of idle) {
        sys('asleep', s.handle + ' went to sleep', '');
        setSeat(s.handle, 'asleep');
        await wait(260);
      }
      d.say('A worker that stays quiet for 30 seconds goes to sleep, and the channel says so once. The next message wakes it.');
    });
  }

  async function run(fn) {
    if (busy) return;
    busy = true;
    d.setKeys([]);
    await fn();
    busy = false;
    render();
  }

  function render() {
    const capped = pair >= CAP;
    const anyIdle = Object.values(seats).some((s) => s.state === 'idle');
    const k = [];
    if (anyIdle) k.push(key('Wait 30 seconds', { onClick: nap }));
    if (capped) {
      k.push(key('Post to everyone', { onClick: toEveryone }));
      k.push(key('Write to both', { kind: 'primary', onClick: toBoth }));
    } else if (started) {
      k.push(key('Post to everyone', { onClick: toEveryone }));
      k.push(key('Post to @reviewer', { kind: 'primary', onClick: toReviewer }));
    } else {
      k.push(key('Post to @reviewer', { onClick: toReviewer }));
      k.push(key('Post to everyone', { kind: 'primary', onClick: toEveryone }));
    }
    started = true;
    d.setKeys(k);
  }

  let started = false;

  function start() {
    entries.textContent = '';
    entries.append(h('div', { class: 'br-goal', text: GOAL }));
    sys('opened', 'You opened the bridge', 'alice opened the bridge with 4 members');
    for (const s of Object.values(seats)) {
      setSeat(s.handle, 'asleep');
      s.li.classList.remove('lit');
    }
    pair = 0;
    paintCap();
    d.setStatus('grey', 'open');
    d.say('Four seats did their first tasks, and their workers went to sleep. Post a message and watch who wakes.');
  }

  d.reset(() => {
    if (busy) return;
    started = false;
    start();
    render();
  });
  start();
  render();
}
