// The kit of the demos. It draws the primitives of bossmode (the card with
// its groove band, the light and its word, the keys, the chips, the marks of
// agents, the recess, the ledger, and the rack of lamps) and mounts each demo
// of a page. README.md in this directory is the guide for the authors of
// demos. A demo builds from these parts and adds no color, radius, shadow, or
// type size of its own.

/** h builds an element. props: class, text, html, on (events), and attributes. */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  for (const c of children.flat(Infinity)) {
    if (c === undefined || c === null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** svg builds an SVG element. */
export function svg(tag, attrs, ...children) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v !== undefined && v !== null) el.setAttribute(k, String(v));
  for (const c of children.flat(Infinity)) if (c) el.append(c);
  return el;
}

/** css adds the styles of one demo once. Use the tokens only. */
export function css(id, text) {
  if (document.getElementById('demo-css-' + id)) return;
  document.head.append(h('style', { id: 'demo-css-' + id, text }));
}

/** reduced is true when the reader asked for reduced motion. */
export const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** wait resolves after ms, or at once under reduced motion. */
export const wait = (ms) => new Promise((r) => setTimeout(r, reduced() ? 0 : ms));

/** settle plays the settle motion on an element that just arrived. */
export function settle(el) {
  if (reduced()) return el;
  el.classList.remove('settle');
  void el.offsetWidth;
  el.classList.add('settle');
  return el;
}

// ---------- the light and its word ----------

/** The tones of a light: green works, amber needs you, red failed, grey is idle, off is a dark lamp. */
const TONES = ['green', 'amber', 'red', 'grey', 'off'];

/**
 * led is a status: a 9-pixel square light and its word. Only amber breathes,
 * and only when still is false: use still for an amber light that waits for
 * nothing the reader can do.
 */
export function led(tone, word, opts = {}) {
  const t = TONES.includes(tone) ? tone : 'grey';
  const light = h('span', { class: 'led led-' + t + (t === 'amber' && !opts.still ? ' breathe' : ''), 'aria-hidden': 'true' });
  const w = h('span', { class: opts.quiet ? 'sr' : 'status-word', text: word });
  const el = h('span', { class: 'status tone-' + t + (opts.struck ? ' struck' : ''), title: opts.quiet ? word : opts.title }, light, w);
  el.set = (tone2, word2, o2 = {}) => {
    const t2 = TONES.includes(tone2) ? tone2 : 'grey';
    el.className = 'status tone-' + t2 + (o2.struck ? ' struck' : '');
    light.className = 'led led-' + t2 + (t2 === 'amber' && !o2.still ? ' breathe' : '');
    w.textContent = word2;
    if (opts.quiet) el.title = word2;
  };
  return el;
}

/** lineLed is the bare light of a line whose text is its word. It never breathes. */
export function lineLed(tone, large) {
  const t = TONES.includes(tone) ? tone : 'grey';
  return h('span', { class: 'led led-' + t + (large ? ' led-l' : ''), 'aria-hidden': 'true' });
}

// ---------- keys, chips, and faces ----------

/**
 * key is a button. kind: primary (the one orange key of a demo), secondary,
 * quiet, or danger. size: m (36) or s (32).
 */
export function key(label, opts = {}) {
  const kind = opts.kind || 'secondary';
  const el = h('button', {
    type: 'button',
    class: 'key key-' + (opts.size || 'm') + ' key-' + kind + (opts.class ? ' ' + opts.class : ''),
    title: opts.title,
    'aria-label': opts.label,
    disabled: !!opts.disabled,
    on: opts.onClick ? { click: opts.onClick } : undefined,
  });
  el.append(label);
  return el;
}

/** chip is a count or a short state: plain, ink, or amber. */
export function chip(text, kind = 'plain') {
  return h('span', { class: 'chip chip-' + kind, text });
}

/** code is inline monospace text: an event, a key, a route, a command. */
export function code(text) {
  return h('code', { text });
}

// The mark of an agent: a 5 by 5 glyph, mirror symmetric, from the hash of
// the name, in one of eight hues. A port of src/lib/mark.ts of bossmode, so a
// name draws the same face here as in bossmode.

function hash32(text, seed = 2166136261) {
  let x = seed >>> 0;
  for (const ch of text) x = Math.imul(x ^ (ch.codePointAt(0) || 0), 16777619) >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x85ebca6b) >>> 0;
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35) >>> 0;
  x ^= x >>> 16;
  return x >>> 0;
}
const lit = (cells) => cells.reduce((n, c) => n + (c ? 1 : 0), 0);
function fill(bits) {
  const cells = new Array(25).fill(false);
  for (let y = 0; y < 5; y++)
    for (let x = 0; x < 3; x++) {
      const on = ((bits >>> (y * 3 + x)) & 1) === 1;
      cells[y * 5 + x] = on;
      cells[y * 5 + (4 - x)] = on;
    }
  return cells;
}
function centered(cells) {
  const rowLit = (y) => cells.slice(y * 5, y * 5 + 5).some(Boolean);
  let top = 0;
  while (top < 5 && !rowLit(top)) top++;
  if (top === 5) return cells;
  let bottom = 0;
  while (!rowLit(4 - bottom)) bottom++;
  const shift = Math.trunc((top - bottom) / 2);
  if (shift === 0) return cells;
  const out = new Array(25).fill(false);
  for (let y = 0; y < 5; y++) {
    const to = y - shift;
    if (to < 0 || to > 4) continue;
    for (let x = 0; x < 5; x++) out[to * 5 + x] = cells[y * 5 + x];
  }
  return out;
}
function markOf(name) {
  const k = String(name || '').toLowerCase();
  const a = hash32(k);
  const b = hash32(k, a ^ 0x9e3779b9);
  let cells = fill(a);
  if (lit(cells) < 6) {
    const more = fill(b);
    cells = cells.map((c, i) => c || more[i]);
  } else if (lit(cells) > 19) {
    const less = fill(b);
    cells = cells.map((c, i) => c && less[i]);
  }
  for (let y = 0; y < 5 && lit(cells) < 6; y++) cells[y * 5 + 2] = true;
  for (let y = 0; y < 5 && lit(cells) > 19; y++) cells[y * 5 + 2] = false;
  return { cells: centered(cells), hue: b % 8 };
}
function markPath(cells) {
  const parts = [];
  for (let y = 0; y < 5; y++) {
    let x = 0;
    while (x < 5) {
      if (!cells[y * 5 + x]) {
        x++;
        continue;
      }
      let w = 1;
      while (x + w < 5 && cells[y * 5 + x + w]) w++;
      parts.push(`M${x} ${y}h${w}v1h-${w}z`);
      x += w;
    }
  }
  return parts.join('');
}

/** markCells returns the 25 cells and the hue of the mark of a name, for a demo that draws a mark itself. */
export function markCells(name) {
  return markOf(name);
}

/** mark is the face of an agent, as bossmode draws it. ink: true for the manager. */
export function mark(name, size = 32, opts = {}) {
  const g = markOf(name);
  const px = Math.max(10, Math.round((size * 0.6) / 5) * 5);
  const glyph = svg('svg', { class: 'mark-glyph ' + (opts.ink ? 'hue-ink' : 'hue-' + g.hue), width: px, height: px, viewBox: '0 0 5 5', 'shape-rendering': 'crispEdges', 'aria-hidden': 'true', focusable: 'false' }, svg('path', { d: markPath(g.cells) }));
  return h('span', { class: 'mark', style: { width: size + 'px', height: size + 'px' }, role: opts.label ? 'img' : undefined, 'aria-label': opts.label, 'aria-hidden': opts.label ? undefined : 'true' }, glyph);
}

/** avatar is a person: initials on an ink square. */
export function avatar(initials, size = 32) {
  return h('span', { class: 'avatar', style: { width: size + 'px', height: size + 'px', fontSize: Math.round(size * 0.38) + 'px' }, 'aria-hidden': 'true', text: initials });
}

// ---------- the frame of a demo ----------

/**
 * demo draws the card of a demo into root and returns its parts:
 * stage (the body), keys (the row of keys at the end), status (the light
 * and its word in the head), say(text) for the line that explains the last
 * step, and reset(fn) to add the quiet Reset key.
 *
 * opts: title, tone and word of the status, caption (one sentence under the
 * card that says what the demo models), wide (true for up to 760 pixels).
 */
export function demo(root, opts) {
  root.textContent = '';
  root.classList.add('demo', 'is-live');
  if (opts.wide) root.classList.add('wide');
  const status = opts.word ? led(opts.tone || 'grey', opts.word) : null;
  const title = h('h3', { class: 'demo-title', text: opts.title });
  const head = h('div', { class: 'demo-head' }, title, status);
  const stage = h('div', { class: 'demo-stage' });
  const line = h('p', { class: 'demo-say', 'aria-live': 'polite' });
  const keys = h('div', { class: 'demo-keys' });
  const card = h('section', { class: 'demo-card', 'aria-label': opts.title }, h('div', { class: 'groove groove-card', 'aria-hidden': 'true' }), head, stage, line, keys);
  root.append(card);
  if (opts.caption) root.append(h('p', { class: 'demo-caption', text: opts.caption }));
  let resetKey = null;
  // A key that the reader pressed is gone once the keys are drawn again. If
  // the focus was in the row of keys, it goes to the new primary key, so a
  // reader on the keyboard can go on with Enter. While a sequence plays and
  // the row is empty, the focus waits on Reset, or, without Reset, the row
  // remembers it until its keys come back. A demo needs no focus code of its
  // own for its keys.
  let keepFocus = false;
  let parked = false;
  return {
    root,
    card,
    head,
    stage,
    keys,
    status,
    title,
    /** say sets the sentence under the stage that explains the last step. */
    say(text) {
      line.textContent = '';
      if (!text) return;
      if (typeof text === 'string') line.textContent = text;
      else line.append(text);
      settle(line);
    },
    /** setKeys replaces the keys. Pass key() elements; a quiet Reset stays at the start. */
    setKeys(list) {
      const active = document.activeElement;
      const onReset = !!resetKey && active === resetKey && !parked;
      const lost = !active || active === document.body;
      const had = (keepFocus && lost) || keys.contains(active);
      parked = false;
      keys.textContent = '';
      if (resetKey) keys.append(resetKey);
      keys.append(h('span', { class: 'demo-keys-gap' }));
      for (const k of list) if (k) keys.append(k);
      if (!had) return;
      // After Reset the focus stays on Reset; after any other key it goes
      // to the new primary key. A row with no other key keeps the focus on
      // Reset until its keys come back.
      let next = onReset ? resetKey : keys.querySelector('.key-primary:not(:disabled)') || keys.querySelector('.key:not(.demo-reset):not(:disabled)');
      if (!next && resetKey) {
        next = resetKey;
        parked = true;
      }
      keepFocus = !next;
      if (next) next.focus();
    },
    /** reset adds the quiet Reset key, which calls fn. */
    reset(fn, label = 'Reset') {
      resetKey = key(label, { kind: 'quiet', onClick: fn, class: 'demo-reset' });
      keys.prepend(resetKey);
    },
    /** focusKeys puts the focus on the primary key, as after a press of a key. */
    focusKeys() {
      const next = keys.querySelector('.key-primary:not(:disabled)') || keys.querySelector('.key:not(:disabled)');
      if (next) next.focus();
    },
    /** setStatus changes the light and the word in the head. */
    setStatus(tone, word, o) {
      if (status) status.set(tone, word, o);
    },
  };
}

// ---------- the ledger ----------

/**
 * ledger is a recess of event lines, one per event, numbered as the ledger
 * numbers them. append(type, detail, opts) adds a line that settles in.
 * opts.tone gives the line a light. onPick(index) makes each line a button,
 * for a demo that reads the ledger up to a line.
 */
export function ledger(opts = {}) {
  const list = h('ol', { class: 'ledger-lines' });
  const empty = h('p', { class: 'ledger-empty', text: opts.empty || 'No events yet.' });
  const el = h('div', { class: 'ledger recess', role: 'log', 'aria-label': opts.label || 'The ledger' }, opts.title ? h('div', { class: 'ledger-title' }, h('span', { text: opts.title }), opts.file ? code(opts.file) : null) : null, empty, list);
  const rows = [];
  let picked = -1;
  function paint() {
    rows.forEach((r, i) => r.el.classList.toggle('picked', i === picked));
    rows.forEach((r, i) => r.el.classList.toggle('after', picked !== -1 && i > picked));
  }
  return {
    el,
    rows,
    append(type, detail, o = {}) {
      empty.hidden = true;
      const seq = rows.length + 1;
      // The type and the detail are one run of text, so a long detail wraps
      // under the type on a narrow card instead of losing its end.
      const text = h('span', { class: 'ledger-text' }, h('span', { class: 'ledger-type', text: type }), detail ? [' ', h('span', { class: 'ledger-detail', text: detail })] : null);
      const inner = [h('span', { class: 'ledger-seq', text: String(seq) }), o.tone ? lineLed(o.tone) : null, text];
      const body = opts.onPick ? h('button', { type: 'button', class: 'ledger-line', title: 'Read the ledger up to line ' + seq, on: { click: () => opts.onPick(rows.indexOf(row)) } }, inner) : h('div', { class: 'ledger-line' }, inner);
      const li = h('li', null, body);
      const row = { el: li, type, detail, data: o.data };
      rows.push(row);
      list.append(li);
      settle(li);
      list.scrollTop = list.scrollHeight;
      return row;
    },
    /** pick marks one line as the end of the reading, or -1 for none. */
    pick(i) {
      picked = i;
      paint();
    },
    clear() {
      rows.length = 0;
      list.textContent = '';
      empty.hidden = false;
      picked = -1;
    },
  };
}

// ---------- the rack of lamps ----------

const LAMP = {
  working: { tone: 'green', cls: 'lamp-working' },
  awake: { tone: 'green', cls: 'lamp-awake' },
  starting: { tone: 'grey', cls: 'lamp-starting' },
  asleep: { tone: 'grey', cls: '' },
  failed: { tone: 'red', cls: 'lamp-failed' },
  needs: { tone: 'amber', cls: 'lamp-needs' },
};

/**
 * workers draws one row per worker: a lamp, the name, and the word of its
 * state, as the readout of the fleet in bossmode. state: working, awake,
 * starting, asleep, failed, or needs. set(name, state, word) changes a row.
 */
export function workers(list) {
  const el = h('ul', { class: 'workers' });
  const by = {};
  for (const w of list) {
    const lamp = h('span', { class: 'lamp', 'aria-hidden': 'true' });
    const word = h('span', { class: 'worker-word' });
    const li = h('li', { class: 'worker' }, lamp, h('span', { class: 'worker-name', text: w.name }), word);
    by[w.name] = { li, lamp, word };
    el.append(li);
  }
  function set(name, state, text) {
    const r = by[name];
    if (!r) return;
    const s = LAMP[state] || LAMP.asleep;
    r.lamp.className = 'lamp ' + s.cls + (state === 'needs' ? ' breathe' : '');
    r.word.className = 'worker-word tone-' + s.tone;
    r.word.textContent = text || state;
    r.li.dataset.state = state;
  }
  for (const w of list) set(w.name, w.state, w.word);
  return { el, set };
}

// ---------- mounting ----------

async function mountOne(el) {
  const name = el.getAttribute('data-demo');
  if (!name || el.dataset.mounted) return;
  el.dataset.mounted = '1';
  try {
    const mod = await import(new URL('./' + name + '.js', import.meta.url).href);
    await mod.default(el, { ...el.dataset });
    // Nothing moves on load: what the demo drew to start with shows at once.
    el.querySelectorAll('.settle').forEach((x) => x.classList.remove('settle'));
  } catch (err) {
    el.dataset.mounted = 'failed';
    console.warn('demo ' + name + ' did not mount', err);
  }
}

function mountAll() {
  document.querySelectorAll('[data-demo]').forEach(mountOne);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountAll);
else mountAll();
