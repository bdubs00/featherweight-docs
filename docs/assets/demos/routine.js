// The standings of one routine: the reader moves a routine with the keys
// that the Routines place of bossmode offers in each standing, or sends a
// move straight to the route. The moves and the refusals follow the table
// of routines/standing.go of the workbench, and the text of a refusal is
// the text of MoveError in routines/store.go. A rehearsing routine is
// ready, so it needs you, when it chose to act on at least 200 tickets
// (readyAfter) and agreed with the agent on at least 95 percent of them
// (readyAgreement), as Evidence.Ready in routines/evidence.go decides.
// The words of the list row and of the card come from src/lib/routines.ts
// and src/ui/Routines.tsx of bossmode.

import { h, css, demo, key, led, lineLed, ledger, code, wait } from './kit.js';

css('routine', `
.rt-route { display: flex; flex-wrap: wrap; gap: var(--s-1); }
.rt-route .key { font-family: var(--mono); font-weight: 400; }
.rt-row { display: flex; flex-direction: column; gap: 2px; padding: 8px 10px; border: 1px solid var(--line); border-radius: var(--r); }
.rt-row.need { background: var(--wash-need); }
.rt-row-head { display: flex; flex-wrap: wrap; align-items: center; gap: 2px var(--s-2); font-size: var(--t-control); line-height: var(--t-control-lh); font-weight: 700; }
.rt-card { display: flex; flex-direction: column; gap: var(--s-2); padding: 10px 12px; border: 1px solid var(--line); border-radius: var(--r); }
.rt-card.need { background: var(--wash-need); }
.rt-card-title { display: flex; align-items: center; gap: var(--s-2); font-size: var(--t-control); line-height: var(--t-control-lh); font-weight: 700; }
.doc .rt-figs { display: flex; flex-wrap: wrap; gap: var(--s-2) var(--s-4); margin: 0; }
.rt-figs div { display: flex; flex-direction: column-reverse; }
.rt-figs dt { font-size: var(--t-meta); line-height: var(--t-meta-lh); color: var(--muted); }
.rt-figs dd { margin: 0; font-size: var(--t-control); line-height: var(--t-control-lh); font-weight: 800; }
.rt-col .ledger-title > span { flex: none; }
`);

const AGENT = 'triage';
const NAME = 'acknowledge-a-new-ticket';
const TITLE = 'Acknowledge a new ticket';
const RUNBOOK = 'agents/' + AGENT + '/routines/' + NAME + '.md';
const READY_AFTER = 200;
const READY_AGREEMENT = 0.95;

// The table of routines/standing.go: the standings that each one can move to.
const MOVES = {
  proposed: ['rehearsing', 'retired'],
  rehearsing: ['live', 'paused', 'retired'],
  live: ['paused', 'retired'],
  paused: ['rehearsing', 'live'],
  retired: [],
};
const ORDER = ['proposed', 'rehearsing', 'live', 'paused', 'retired'];
const ROWS = {
  proposed: ['Proposed', 'reaches no run'],
  rehearsing: ['Rehearsing', 'beside the agent'],
  live: ['Live', 'in place of the model'],
  paused: ['Paused', 'reaches no run'],
  retired: ['Retired', 'reaches no run'],
};

// movesText words the allowed moves as MoveError does.
function movesText(from) {
  const list = MOVES[from];
  if (list.length === 0) return 'no standing, because a retired routine stays retired';
  if (list.length === 1) return list[0];
  return list.slice(0, -1).join(', ') + ' or ' + list[list.length - 1];
}

// The status of the page: needs you for a rehearsing routine that is ready.
const STATUS = {
  'needs-you': ['amber', 'needs you'],
  live: ['green', 'live'],
  rehearsing: ['grey', 'rehearsing'],
  proposed: ['grey', 'proposed'],
  paused: ['grey', 'paused'],
  retired: ['grey', 'retired'],
};

const num = (n) => Math.round(n).toLocaleString('en-US');
const pct = (x) => String(Math.round(x * 1000) / 10) + '%';
const units = (n) => (n === 1 ? '1 ticket' : num(n) + ' tickets');

// Two weeks of rehearsal, as the totals of the evidence after each week.
const WEEKS = [
  { decided: 162, acted: 150, agreed: 146, handed: 12 },
  { decided: 1480, acted: 1432, agreed: 1397, handed: 48 },
];

export default function mount(root) {
  const d = demo(root, {
    title: 'One routine, from a proposal to a sign-off',
    tone: 'grey',
    word: 'proposed',
    wide: true,
    caption: 'A model of the standings of a routine. The moves, the refusals, and the rule of a ready routine are those of the routines package of the workbench. The words of the row and the card are those of the Routines place.',
  });

  // The five standings, with what each one does to the runs of the agent.
  const rows = {};
  const list = h('ul', { class: 'demo-rows' }, ORDER.map((s) => {
    const light = lineLed('grey');
    const li = h('li', null, light, h('span', { text: ROWS[s][0] }), h('span', { class: 'demo-row-note', text: ROWS[s][1] }));
    rows[s] = { li, light };
    return li;
  }));

  // The keys that send a move straight to the route, as an API caller does.
  const route = h('div', { class: 'rt-route' }, ORDER.map((s) => key(s, { kind: 'secondary', size: 's', label: 'Send the move ' + s + ' to the route', onClick: () => ask(s) })));

  const rowEl = h('div', { class: 'rt-row' });
  const cardEl = h('div');
  const log = ledger({ title: 'The record', file: AGENT + '/' + NAME });

  d.stage.append(h('div', { class: 'demo-split' },
    h('div', { class: 'demo-col rt-col' },
      h('div', null, h('span', { class: 'demo-label', text: 'The standings' }), list),
      h('div', null, h('span', { class: 'demo-label', text: 'Send a move to the route' }), route)),
    h('div', { class: 'demo-col rt-col' },
      h('div', null, h('span', { class: 'demo-label', text: 'The row in the list' }), rowEl),
      h('div', null, h('span', { class: 'demo-label', text: 'The card on the tab Steps' }), cardEl),
      log.el)));

  let st;
  let busy = false;

  function fresh() {
    st = { standing: 'proposed', version: 1, ev: null, week: 0, applied: 0, ready: false, signed: false, runbook: false, later: false, confirm: false, history: ['proposed'], moved: '2 d' };
  }

  const status = () => (st.standing === 'rehearsing' && st.ready ? 'needs-you' : st.standing);
  const isReady = (ev) => !!ev && ev.acted >= READY_AFTER && ev.agreed >= READY_AGREEMENT * ev.acted;

  // meta is the meta line of the row, as metaOf words it.
  function meta() {
    const s = status();
    if (s === 'needs-you') return AGENT + ', rehearsed ' + units(st.ev.decided);
    if (s === 'live') return AGENT + ', ' + num(st.applied) + ' this week';
    if (s === 'rehearsing') return st.ev && st.ev.acted > 0 ? AGENT + ', ' + pct(st.ev.agreed / st.ev.acted) + ' agreed over ' + units(st.ev.acted) : AGENT;
    return AGENT + ', ' + st.moved;
  }

  function card() {
    const s = status();
    const box = (cls, tone, title, ...body) => h('div', { class: 'rt-card' + (cls ? ' ' + cls : '') }, h('div', { class: 'rt-card-title' }, lineLed(tone), h('span', { text: title })), body);
    if (s === 'needs-you' && st.later) return box('', 'grey', 'Kept for later');
    if (s === 'needs-you') {
      const fig = (n, words) => h('div', null, h('dt', { text: words }), h('dd', { text: n }));
      return box('need', 'amber', 'Needs your sign-off', h('dl', { class: 'rt-figs' },
        fig(pct(st.ev.agreed / st.ev.acted) + ' of ' + num(st.ev.acted), 'agreed with the agent'),
        fig(num(st.ev.handed), 'handed to the agent'),
        fig('0', 'sent back')));
    }
    if (s === 'proposed') return box('', 'grey', 'Proposed from 212 tickets');
    if ((s === 'live' || s === 'paused') && st.signed) return box('', 'green', 'Signed off', h('p', { class: 'demo-note', text: 'By you, today.' }));
    const none = { retired: 'No card. A retired routine stays retired.', paused: 'No card while it is paused.' };
    return h('p', { class: 'demo-note', text: none[s] || 'No card while it rehearses and is not ready.' });
  }

  function paint() {
    const s = status();
    const [tone, word] = STATUS[s];
    for (const k of ORDER) {
      const on = k === st.standing;
      rows[k].li.classList.toggle('on', on);
      rows[k].light.className = 'led led-' + (on ? tone : 'grey');
    }
    d.setStatus(tone, word, { struck: s === 'retired', still: st.later });
    rowEl.className = 'rt-row' + (s === 'needs-you' ? ' need' : '');
    rowEl.textContent = '';
    rowEl.append(
      h('span', { class: 'rt-row-head' }, h('span', { text: TITLE }), led(tone, word, { struck: s === 'retired', still: true })),
      h('span', { class: 'demo-note', text: meta() }));
    cardEl.textContent = '';
    cardEl.append(card());
    keys();
  }

  // move changes the standing as Store.Move does, and writes the history.
  function move(to, by) {
    st.standing = to;
    st.history.push(to);
    st.later = false;
    st.moved = 'now';
    st.ready = to === 'rehearsing' && isReady(st.ev);
    if (to === 'live') {
      st.signed = true;
      st.runbook = true;
    }
    log.append(to, 'by ' + by + ', version ' + st.version);
    if (st.runbook) log.append('runbook', RUNBOOK);
  }

  // resumeTo is the standing before the pause, as Resume of the page picks it.
  function resumeTo() {
    for (let i = st.history.length - 1; i > 0; i--) if (st.history[i] === 'paused') return st.history[i - 1] === 'live' ? 'live' : 'rehearsing';
    return st.signed ? 'live' : 'rehearsing';
  }

  async function act(fn) {
    if (busy) return;
    busy = true;
    d.setKeys([]);
    await fn();
    busy = false;
    paint();
  }

  const k = (label, kind, fn) => key(label, { kind, onClick: () => act(fn) });

  const rehearse = () => {
    move('rehearsing', 'you');
    d.say('The routine now runs beside the agent on each new ticket, without acting. The workbench counts where the two agree.');
  };
  const sign = () => {
    move('live', 'you');
    d.say(h('span', null, 'Signed off. The routine now acts in place of the model when its answers are sure enough. The workbench wrote its runbook to ', code(RUNBOOK), '.'));
  };
  const pause = () => {
    move('paused', 'you');
    d.say('Paused. The routine reaches no run, and the agent handles every ticket.');
  };
  const resume = () => {
    const to = resumeTo();
    move(to, 'you');
    d.say('Resume moves the routine back to the standing that it had before the pause: ' + to + '.');
  };
  const retireAsk = () => {
    st.confirm = true;
    d.say('Retire ' + TITLE + '? A retired routine stays retired.');
  };
  const retire = () => {
    st.confirm = false;
    move('retired', 'you');
    d.say('Retired. No move leaves this standing.');
  };

  async function week() {
    if (st.standing === 'live') {
      st.applied = 41;
      log.append('evidence', 'applied 41 this week');
      d.say('The routine completed 41 tickets with no model call. A small share of the runs still goes to the agent, for comparison.');
      return;
    }
    const w = WEEKS[Math.min(st.week, WEEKS.length - 1)];
    st.week += 1;
    st.ev = { ...w };
    log.append('evidence', 'acted ' + num(w.acted) + ', agreed ' + num(w.agreed) + ', handed ' + num(w.handed));
    await wait(300);
    if (isReady(st.ev)) {
      st.ready = true;
      log.append('ready', 'true', { tone: 'amber' });
      d.say('It chose to act on ' + num(w.acted) + ' tickets and agreed with the agent on ' + pct(w.agreed / w.acted) + ' of them. That passes 200 tickets and 95 percent, so it needs your sign-off.');
    } else {
      d.say('It agreed with the agent on ' + pct(w.agreed / w.acted) + ', but it chose to act on only ' + w.acted + ' tickets. A sign-off waits for 200.');
    }
  }

  function newBody() {
    st.version += 1;
    st.signed = false;
    st.ev = null;
    st.week = 0;
    st.applied = 0;
    st.standing = 'rehearsing';
    st.history.push('rehearsing');
    st.ready = false;
    st.moved = 'now';
    log.append('rehearsing', 'new body, version ' + st.version);
    d.say(h('span', null, 'A new body, sent with ', code('routine_put'), ' or the route, is a new version. The routine rehearses again, loses its sign-off, and its evidence starts again.'));
  }

  // ask sends a move to the route, which answers as the code does.
  function ask(to) {
    if (busy || st.confirm) return;
    const from = st.standing;
    if (from === to) {
      log.append('200', 'already ' + to + ', no change');
      d.say('A move to the standing that the routine has changes nothing, and the route answers 200.');
      return;
    }
    if (!MOVES[from].includes(to)) {
      const detail = 'a ' + from + ' routine cannot move to ' + to + '. It can move to ' + movesText(from);
      log.append('409', detail, { tone: 'red' });
      d.say('The route answered 409: "' + detail + '". The page never offers this move.');
      return;
    }
    act(() => {
      const early = from === 'rehearsing' && to === 'live' && !st.ready;
      if (to === 'paused') pause();
      else if (to === 'retired') retire();
      else if (to === 'live') sign();
      else if (to === 'rehearsing') rehearse();
      if (early) d.say('The route allows a sign-off before the routine is ready. The page offers Sign off only on the card of a routine that needs you.');
    });
  }

  // keys gives the keys that the page offers for the status, as Routines.tsx does.
  function keys() {
    const s = status();
    if (st.confirm) return d.setKeys([k('Cancel', 'secondary', () => { st.confirm = false; d.say(''); }), k('Retire', 'danger', retire)]);
    const by = {
      proposed: [k('Retire', 'danger', retireAsk), k('Rehearse', 'primary', rehearse)],
      rehearsing: [k('Pause', 'secondary', pause), k('Retire', 'danger', retireAsk), k('Let a week pass', 'primary', week)],
      'needs-you': st.later
        ? [k('Pause', 'secondary', pause), k('Open it again', 'primary', () => { st.later = false; d.say('A new visit of the routine shows the card again.'); })]
        : [k('Pause', 'secondary', pause), k('Not yet', 'secondary', () => { st.later = true; d.say('Not yet sends nothing. The card goes for this visit, and the row keeps needs you.'); }), k('Sign off', 'primary', sign)],
      live: [k('Pause', 'secondary', pause), k('Retire', 'danger', retireAsk), k('Send a new version', 'secondary', newBody), k('Let a week pass', 'primary', week)],
      paused: [k('Send a new version', 'secondary', newBody), k('Resume', 'primary', resume)],
      retired: [],
    };
    d.setKeys(by[s] || []);
  }

  d.reset(() => {
    if (busy) return;
    fresh();
    log.clear();
    log.append('proposed', 'by fw routine propose, version 1');
    d.say('');
    paint();
  });

  fresh();
  log.append('proposed', 'by fw routine propose, version 1');
  paint();
}
