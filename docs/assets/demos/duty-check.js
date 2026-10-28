// Check first: a duty looks for work before the model wakes. The duty is
// triageDuty of duties/check_test.go in the workbench: every 15 minutes it
// reads a queue, keeps the items whose priority is 1 or 2, and wakes the
// agent triage only for items whose number it did not see before. The
// readback, the reasons, and the pause after three failed checks are the
// strings of duties/words.go, check.go, and engine.go. The words of the
// history (finished, slept, check failed, Found 2, woke the agent) are
// runLight and checkLine of src/lib/duties.ts in bossmode.

import { h, css, demo, key, led, code, chip, wait, settle } from './kit.js';

css('duty-check', `
.dk-when { margin-bottom: var(--s-3); }
.dk-when p { margin: 0; font-size: var(--t-control); line-height: var(--t-control-lh); }
.dk-queue { padding: 6px; }
.dk-queue-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--s-2); padding: 2px 6px 6px; font-size: var(--t-meta); line-height: var(--t-meta-lh); font-weight: 600; color: var(--muted); }
.doc .dk-queue-head code { flex: none; padding: 0; background: none; font-size: var(--t-caption); overflow-wrap: normal; }
.doc .dk-items { margin: 0; padding: 0; list-style: none; }
.doc .dk-items > li { display: flex; align-items: center; gap: var(--s-2); min-height: 30px; margin: 0; padding: 2px 6px; font-family: var(--mono); font-size: var(--t-caption); line-height: var(--t-code-lh); }
.dk-items .dk-tag { margin-left: auto; font-family: var(--font); font-size: var(--t-meta); font-weight: 600; color: var(--muted); white-space: nowrap; }
.dk-items li.out { color: var(--muted); }
.dk-items li.out .dk-key { text-decoration: line-through; }
.dk-down { padding: 6px; font-size: var(--t-meta); line-height: var(--t-meta-lh); color: var(--word-red); }
.dk-hist-head { display: flex; align-items: center; gap: var(--s-2); margin-bottom: var(--s-1); }
.dk-hist-head .demo-label { margin: 0; }
.doc .dk-runs { max-height: 330px; margin: 0; padding: 0; list-style: none; overflow-y: auto; }
.doc .dk-runs > li { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px var(--s-2); margin: 0; padding: var(--s-2) 0; border-top: 1px solid var(--line-soft); font-size: var(--t-meta); line-height: var(--t-meta-lh); }
.doc .dk-runs > li:first-child { border-top: 0; }
.dk-at { min-width: 64px; color: var(--muted); }
.dk-found { font-weight: 600; }
.dk-why { flex-basis: 100%; color: var(--muted); }
.doc .dk-gets { flex-basis: 100%; margin: 2px 0 0; padding: 6px 8px; font-family: var(--mono); font-size: var(--t-caption); line-height: var(--t-code-lh); white-space: pre-wrap; overflow-wrap: anywhere; }
.doc .dk-empty { margin: 0; font-size: var(--t-meta); color: var(--muted); }
`);

const READBACK = 'Every 15 minutes, UTC. First it looks at acme.service-now.com/api/queue, where priority is 1 or 2. Only items that it did not see before wake triage. The run gets the list.';
const HOST = 'acme.service-now.com';
const WANT = [1, 2]; // where priority is one of 1 and 2
const BREAKER = 3; // three failed checks in a row pause the duty

const START = [
  { number: 'INC1', priority: 1 },
  { number: 'INC2', priority: 3 },
  { number: 'INC3', priority: 2 },
];

const itemsWords = (n) => (n === 1 ? '1 item' : n + ' items');
const json = (it) => JSON.stringify({ number: it.number, priority: it.priority });

export default function mount(root) {
  const d = demo(root, {
    title: 'A duty that checks first',
    tone: 'grey',
    word: 'not run yet',
    wide: true,
    caption: 'A model of the check of a duty. The duty, the reasons, and the readback come from the tests and the code of the duties package of the workbench, and the words of the history from bossmode.',
  });

  const when = h('div', { class: 'dk-when' }, h('span', { class: 'demo-label', text: 'When' }), h('p', { text: READBACK }));

  const items = h('ul', { class: 'dk-items' });
  const down = h('div', { class: 'dk-down', text: 'The address answers 503.' });
  const seenLine = h('div', { class: 'demo-note' });
  const queue = h('div', { class: 'dk-queue recess' },
    h('div', { class: 'dk-queue-head' }, h('span', { text: 'The answer of the address' }), code('result.records')),
    items,
    down
  );

  const count = chip('0');
  const runs = h('ol', { class: 'dk-runs', 'aria-label': 'History' });
  const empty = h('p', { class: 'dk-empty', text: 'No run yet.' });

  d.stage.append(when, h('div', { class: 'demo-split' },
    h('div', { class: 'demo-col' }, queue, seenLine),
    h('div', null, h('div', { class: 'dk-hist-head' }, h('span', { class: 'demo-label', text: 'History' }), count), empty, runs)
  ));

  let queueItems = [];
  let seen = new Set();
  let failing = false;
  let failedInRow = 0;
  let paused = false;
  let minutes = 0; // after 9:00 AM UTC
  let next = 4;
  let busy = false;
  let history = 0;

  const clock = () => {
    const m = 9 * 60 + minutes;
    const hh = Math.floor(m / 60);
    const mm = String(m % 60).padStart(2, '0');
    return (hh > 12 ? hh - 12 : hh) + ':' + mm + (hh >= 12 ? ' PM' : ' AM');
  };

  function paintQueue() {
    items.textContent = '';
    for (const it of queueItems) {
      const pass = WANT.includes(it.priority);
      const tag = !pass ? 'filtered out' : seen.has(it.number) ? 'seen' : 'new';
      items.append(h('li', { class: pass ? '' : 'out' }, h('span', { class: 'dk-key', text: it.number }), h('span', { text: 'priority ' + it.priority }), h('span', { class: 'dk-tag', text: tag })));
    }
    items.hidden = failing;
    down.hidden = !failing;
    seenLine.textContent = seen.size ? 'Seen keys: ' + [...seen].join(', ') : 'Seen keys: none yet';
  }

  /** row adds one start to the top of the history, as the page of a duty lists it. */
  function row(tone, word, found, why, gets) {
    empty.hidden = true;
    history++;
    count.textContent = String(history);
    const light = led(tone, word, { still: true });
    const li = h('li', null, h('span', { class: 'dk-at', text: clock() }), light, found ? h('span', { class: 'dk-found', text: found }) : null, why ? h('span', { class: 'dk-why', text: why }) : null, gets ? h('pre', { class: 'dk-gets recess', text: gets }) : null);
    runs.prepend(li);
    settle(li);
    runs.scrollTop = 0;
    return light;
  }

  async function pass() {
    if (busy) return;
    busy = true;
    d.setKeys([]);
    minutes += 15;
    if (failing) {
      failedInRow++;
      const reason = 'The check failed, so the model did not wake: ' + HOST + ': the endpoint answered 503.';
      row('grey', 'check failed', '', reason);
      if (failedInRow >= BREAKER) {
        paused = true;
        d.setStatus('grey', 'paused');
        d.say('Paused. ' + failedInRow + ' checks failed in a row, so the duty paused itself. The last one: ' + reason);
      } else {
        d.setStatus('grey', 'check failed');
        d.say('A check that fails costs no model tokens. ' + failedInRow + ' of ' + BREAKER + ' failed checks in a row. The third one pauses the duty.');
      }
    } else {
      failedInRow = 0;
      const matched = queueItems.filter((it) => WANT.includes(it.priority));
      const fresh = matched.filter((it) => !seen.has(it.number));
      if (!fresh.length) {
        const why = matched.length ? 'The check found ' + itemsWords(matched.length) + ', and none is new, so the agent did not wake.' : 'The check found no item, so the agent did not wake.';
        row('grey', 'slept', matched.length ? 'Found ' + matched.length : 'Found nothing', why);
        d.setStatus('grey', 'slept');
        d.say('No new item, so no run went on the queue. The start is in the history, and the agent cost nothing.');
      } else {
        const gets = fresh.map(json).join('\n');
        const light = row('grey', 'waiting for a worker', 'Found ' + fresh.length + ', woke the agent', '', gets);
        d.setStatus('grey', 'waiting for a worker');
        d.say(h('span', null, 'The run of triage went on the queue. Its message takes the new items in place of ', code('{found}'), ', one per line.'));
        for (const it of fresh) seen.add(it.number);
        paintQueue();
        await wait(900);
        light.set('green', 'working', { still: true });
        d.setStatus('green', 'working');
        await wait(1100);
        light.set('grey', 'finished', { still: true });
        d.setStatus('grey', 'finished');
        d.say('The check remembers the numbers of the items that it handed on, so the next check does not wake triage for them again.');
      }
    }
    paintQueue();
    busy = false;
    render();
  }

  function arrive() {
    const pr = next % 2 === 0 ? 1 : 3;
    queueItems = [...queueItems, { number: 'INC' + next, priority: pr }];
    next++;
    paintQueue();
    d.say(pr === 1 ? 'A new incident of priority 1 is in the queue. The next check sees it.' : 'A new incident of priority 3 is in the queue. The filter keeps it out, so it wakes nobody.');
    render();
  }

  function toggle() {
    failing = !failing;
    paintQueue();
    d.say(failing ? 'The address now answers 503. The next check fails.' : 'The address answers again.');
    render();
  }

  function resume() {
    paused = false;
    failedInRow = 0;
    d.setStatus('grey', 'not run yet');
    d.say('Resume ends the row of failed checks. The times of the pause do not run.');
    render();
  }

  function render() {
    if (paused) {
      d.setKeys([key(failing ? 'The address works again' : 'The address fails', { onClick: toggle }), key('Resume', { kind: 'primary', onClick: resume })]);
      return;
    }
    d.setKeys([
      key(failing ? 'The address works again' : 'The address fails', { onClick: toggle }),
      key('A new incident arrives', { onClick: arrive }),
      key('Let 15 minutes pass', { kind: 'primary', onClick: pass }),
    ]);
  }

  function start() {
    queueItems = START.map((x) => ({ ...x }));
    seen = new Set();
    failing = false;
    failedInRow = 0;
    paused = false;
    minutes = 0;
    next = 4;
    history = 0;
    count.textContent = '0';
    runs.textContent = '';
    empty.hidden = false;
    paintQueue();
    d.setStatus('grey', 'not run yet');
    d.say('The duty triage looks at a queue every 15 minutes. Only a new item of priority 1 or 2 wakes the agent.');
  }

  d.reset(() => {
    if (busy) return;
    start();
    render();
  });
  start();
  render();
}
