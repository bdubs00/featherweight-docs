// Compaction of the context: each turn adds to the history that the next
// model call sends. Before each call, the kernel estimates the size of the
// request (fw/compact.go). When the estimate reaches compaction.at,
// 262,144 tokens by default (DefaultCompactAt in fw/config.go), the kernel
// asks the model for a summary first and starts a new epoch with it
// (fw.context.compacted). The system prompt is not part of the history. A
// pinned message follows the summary word for word, and the index of the
// memory notes comes back at the start of the first message
// (docs/ARCHITECTURE.md sections 5.4 and 7.8.2). The sizes of the turns are
// a model: one turn reads three files, each result under the output limit
// of a tool call (tools.limits.maxOutputBytes, 100 KB).

import { h, css, demo, key, ledger, lineLed, code, wait } from './kit.js';

css('context-compaction', `
.cc-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(290px, 1fr)); gap: var(--s-4); align-items: start; }
.cc-read { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 2px var(--s-2); margin-bottom: 6px; }
.cc-value { font-family: var(--mono); font-size: var(--t-control); line-height: var(--t-control-lh); font-weight: 600; }
.cc-meter { position: relative; height: 14px; overflow: visible; }
.cc-fill { position: absolute; left: 0; top: 0; bottom: 0; border-radius: var(--r); background: var(--ink); }
.cc-mark { position: absolute; top: -5px; bottom: -5px; width: 2px; background: var(--muted); }
.cc-scale { display: flex; justify-content: flex-end; margin-top: 6px; font-size: var(--t-meta); line-height: var(--t-meta-lh); color: var(--muted); }
.doc .cc-scale code { font-size: var(--t-caption); }
.doc .cc-rows > li { min-height: 32px; margin: 0; }
.cc-rows .cc-text { min-width: 0; }
.doc .cc-outside { margin-top: var(--s-2); }
`);

const AT = 262144; // compaction.at
const SCALE = 300000; // the right end of the meter
const SYSTEM = 12000; // the system prompt, the tools, and the list of skills
const INDEX = 600; // the index of the memory notes
const TASK = 900; // the task of the run
const PIN = 2000; // a pinned skill
const SUMMARY = 3800; // the summary of a compaction
const TURNS = [46000, 58000, 49000, 62000, 55000, 51000, 47000, 60000]; // three file reads each, with the answer

const fmt = (n) => n.toLocaleString('en-US');

export default function mount(root) {
  const d = demo(root, {
    title: 'A history that outgrows the window',
    tone: 'grey',
    word: 'epoch 0',
    wide: true,
    caption: 'A model of the compaction of a run. The threshold is the default of compaction.at in fw/config.go, and the events are those of the kernel ledger. The sizes of the turns are made up.',
  });

  const value = h('span', { class: 'cc-value' });
  const fill = h('span', { class: 'cc-fill' });
  const meter = h('div', { class: 'cc-meter recess', role: 'img' }, fill, h('span', { class: 'cc-mark', style: { left: (AT / SCALE) * 100 + '%' } }));
  const rows = h('ul', { class: 'demo-rows cc-rows' });
  const epochLabel = h('span', { class: 'demo-label' });
  const log = ledger({ title: 'The ledger of the run', file: 'ledger.jsonl', empty: 'Empty. Press Next turn.' });

  const side = h('div', { class: 'demo-col' },
    h('div', null,
      h('div', { class: 'cc-read' }, h('span', { class: 'demo-label', text: 'Estimate of the next call' }), value),
      meter,
      h('div', { class: 'cc-scale' }, h('span', null, code('compaction.at'), ' ' + fmt(AT)))),
    h('div', null, epochLabel, rows,
      h('p', { class: 'demo-note cc-outside' }, 'Not part of the history: the system prompt, the tools, and the list of skills, ' + fmt(SYSTEM) + ' tokens.'))
  );
  d.stage.append(h('div', { class: 'cc-grid' }, side, log.el));

  let epoch, history, turn, pinned, busy;


  function init() {
    epoch = 0;
    turn = 0;
    pinned = false;
    busy = false;
    history = [{ text: 'First message: memory index and task', tokens: INDEX + TASK }];
  }

  const estimate = () => SYSTEM + history.reduce((n, m) => n + m.tokens, 0);

  function paint(fresh) {
    const e = estimate();
    value.textContent = fmt(e) + ' tokens';
    fill.style.width = Math.min(100, (e / SCALE) * 100) + '%';
    meter.setAttribute('aria-label', 'Estimate ' + fmt(e) + ' of ' + fmt(AT) + ' tokens');
    epochLabel.textContent = 'The history of epoch ' + epoch;
    rows.textContent = '';
    history.forEach((m, i) => {
      const li = h('li', null, lineLed('grey'), h('span', { class: 'cc-text', text: m.text }), h('span', { class: 'demo-row-note', text: fmt(m.tokens) }));
      if (fresh && i >= history.length - fresh) li.classList.add('on');
      rows.append(li);
    });
    d.setStatus('grey', 'epoch ' + epoch);
  }

  async function next() {
    if (busy) return;
    busy = true;
    d.setKeys([]);
    let sentence;
    let e = estimate();
    if (e >= AT) {
      d.say('The estimate is ' + fmt(e) + ' tokens, past compaction.at. The model writes a summary first.');
      await wait(700);
      epoch++;
      const kept = history.filter((m) => m.pinned);
      history = [{ text: 'First message: memory index and the summary', tokens: INDEX + SUMMARY }, ...kept.map((m) => ({ ...m, text: m.text.replace(' (pinned)', '') + ' (pinned, kept)' }))];
      log.append('fw.context.compacted', 'epoch ' + epoch + ', summary of ' + fmt(SUMMARY) + ' tokens');
      paint(history.length);
      await wait(700);
      e = estimate();
      sentence = 'The estimate reached compaction.at, so the kernel asked the model for a summary before the call. The summary replaced the whole history, and epoch ' + epoch + ' started.' +
        (kept.length ? ' The pinned message followed the summary word for word.' : '') +
        ' The memory index came back at the start of the first message. The ledger before the new epoch stays as it was.';
    }
    log.append('fw.model.requested', fmt(e) + ' estimated');
    await wait(400);
    log.append('fw.model.responded', 'stop tool_use, 3 calls');
    await wait(400);
    const size = TURNS[turn % TURNS.length];
    turn++;
    log.append('fw.tool.responded', 'files: 3 views');
    history.push({ text: 'Turn ' + turn + ': three files read', tokens: size });
    paint(1);
    if (!sentence) {
      const after = estimate();
      sentence = 'The kernel estimated ' + fmt(e) + ' tokens before the call, below compaction.at, so the call went out as it was. The model read three files, and the history grew to ' + fmt(after) + '.' +
        (after >= AT ? ' The next call is over the threshold.' : '');
    }
    busy = false;
    d.say(sentence);
    render();
  }

  async function pin() {
    if (busy || pinned) return;
    busy = true;
    pinned = true;
    d.setKeys([]);
    log.append('fw.message.received', 'pinned: Skill: release-notes');
    history.push({ text: 'Skill: release-notes (pinned)', tokens: PIN, pinned: true });
    paint(1);
    await wait(300);
    busy = false;
    d.say('A pinned follow-up survives every compaction word for word. A slash command in bossmode sends a skill this way.');
    render();
  }

  function render() {
    const list = [];
    if (!pinned) list.push(key('Pin a skill', { kind: 'secondary', onClick: pin }));
    list.push(key(estimate() >= AT ? 'Next turn, over the threshold' : 'Next turn', { kind: 'primary', onClick: next }));
    d.setKeys(list);
  }

  d.reset(() => {
    if (busy) return;
    init();
    log.clear();
    paint(0);
    d.say('');
    render();
  });

  init();
  paint(0);
  render();
}
