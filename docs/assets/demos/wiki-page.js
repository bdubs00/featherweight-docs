// A page of the wiki and its versions. The reader edits a page, and an
// agent can write the same page first. A save names the hash of the text
// that the editor read, so a stale save gets 412 and the conflict card of
// bossmode. Then the reader restores an old version, removes the page, and
// puts it back. The routes, the headers, and the answers follow
// pages/routes.go and pages/store.go of the workbench. The words on the
// keys and the cards follow src/ui/Pages.tsx of bossmode. The hashes are
// the real SHA-256 of the texts, when the browser offers crypto.subtle.

import { h, css, demo, key, ledger, lineLed, chip, wait } from './kit.js';

css('wiki-page', `
.wk-page { display: flex; flex-direction: column; gap: var(--s-2); min-width: 0; }
.wk-title { font-size: var(--t-control); line-height: var(--t-control-lh); font-weight: 800; }
.doc .wk-parts { display: flex; flex-wrap: wrap; gap: 2px var(--s-3); margin: 0; font-size: var(--t-meta); line-height: var(--t-meta-lh); color: var(--muted); }
.wk-parts .wk-by { color: var(--ink); font-weight: 600; }
.doc .wk-body { margin: 0; padding-left: 22px; font-size: var(--t-control); line-height: var(--t-control-lh); }
.doc .wk-body > li { margin: 0 0 2px; }
.doc .wk-text { margin: 0; padding: 8px 10px; font-family: var(--mono); font-size: var(--t-code); line-height: var(--t-code-lh); white-space: pre-wrap; overflow-wrap: anywhere; }
.wk-new { display: block; margin: 0 -4px; padding: 0 4px; border-radius: var(--r); background: var(--raised); box-shadow: inset 0 0 0 1px var(--raised-line); }
.wk-field { padding: 6px 10px; font-size: var(--t-control); line-height: var(--t-control-lh); }
.wk-conflict { display: flex; flex-direction: column; gap: var(--s-1); padding: var(--s-2) var(--s-3); border: 1px solid var(--line); border-radius: var(--r); background: var(--wash-need); }
.wk-conflict-head { display: flex; align-items: flex-start; gap: var(--s-2); font-weight: 700; font-size: var(--t-control); line-height: var(--t-control-lh); }
.wk-conflict-head .led { margin-top: 5px; }
.doc .wk-conflict p, .doc .wk-note { margin: 0; font-size: var(--t-control); line-height: var(--t-control-lh); }
.wk-note { color: var(--muted); }
.wk-conflict .key { align-self: flex-start; }
.wk .demo-rows .wk-meta { display: inline-flex; flex-wrap: wrap; justify-content: flex-end; gap: 0 var(--s-2); text-align: right; }
.wk .demo-rows > li { flex-wrap: wrap; }
.wk .ledger-detail { display: block; }
`);

const PATH = 'runbooks/deploy.md';
const ROUTE = '/v1/pages/' + PATH;
const TITLE = 'Deploy the front';
const READER = 'alice';

const T1 = '# Deploy the front\n\n1. Build the image.\n2. Roll the pods.\n';
const T2 = T1 + '3. If a pod fails, roll back.\n';
const MINE = T2 + '4. Check /healthz on each pod.\n';
const THEIRS = T2 + '4. Post the release notes.\n';
const MINE_SUMMARY = 'Add the health check';

// The hash of a page is the SHA-256 of its whole text, in hex.
const HASH = {};
async function hashAll() {
  const subtle = window.crypto && window.crypto.subtle;
  for (const t of [T1, T2, MINE, THEIRS]) {
    if (!subtle) {
      HASH[t] = '';
      continue;
    }
    const buf = await subtle.digest('SHA-256', new TextEncoder().encode(t));
    HASH[t] = Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
  }
}
const tag = (t) => (HASH[t] ? '"' + HASH[t].slice(0, 8) + '…"' : 'the hash');

// The lines of a text after its heading, as the page shows them.
const steps = (t) => t.split('\n').map((l) => /^\d+\. (.*)$/.exec(l)).filter(Boolean).map((m) => m[1]);

export default async function mount(root) {
  await hashAll();
  root.classList.add('wk');
  const d = demo(root, {
    title: 'One page, two writers',
    tone: 'grey',
    word: 'saved',
    wide: true,
    caption: 'A model of one page of the wiki. The routes, the headers, and the answers are the ones of the workbench, and the words are the words of the Wiki place.',
  });

  const page = h('div', { class: 'wk-page', 'aria-live': 'off' });
  const history = h('ul', { class: 'demo-rows' });
  const log = ledger({ title: 'What the page sends', label: 'Requests', empty: 'No request yet. Press Edit.' });
  d.stage.append(
    h('div', { class: 'demo-split' },
      h('div', { class: 'demo-col' }, h('span', { class: 'demo-label', text: PATH }), page),
      h('div', { class: 'demo-col' }, h('div', null, h('span', { class: 'demo-label', text: 'History of ' + TITLE }), history), log.el)
    )
  );

  let versions = [];
  let rev = 0;
  let mode = 'read';
  let base = '';
  let draft = '';
  let reading = null;
  let theirsOpen = false;
  let busy = false;

  const kept = () => versions.filter((v) => !v.deleted);
  const newest = () => versions[versions.length - 1];
  const current = () => (newest().deleted ? null : newest());
  const numberOf = (v) => kept().indexOf(v) + 1;

  function add(by, summary, text) {
    rev += 3 + (rev % 4);
    const v = { rev, by, at: 'now', summary, text };
    versions.forEach((o) => { if (o.at === 'now') o.at = '1 min'; });
    versions.push(v);
    return v;
  }

  function paintHistory() {
    history.textContent = '';
    const list = versions.slice().reverse();
    list.forEach((v, i) => {
      if (v.deleted) {
        history.append(h('li', null, lineLed('grey'), h('span', { text: 'Removed' }), h('span', { class: 'demo-row-note', text: v.at })));
        return;
      }
      const li = h('li', { class: reading === v ? 'on' : (i === 0 ? '' : 'dim') },
        h('span', { text: 'Version ' + numberOf(v) }),
        i === 0 ? chip('current') : null,
        h('span', { class: 'demo-row-note wk-meta' }, h('span', { text: v.by }), h('span', { text: v.at }), h('span', { text: v.summary }))
      );
      history.append(li);
    });
  }

  function body(text) {
    return h('ol', { class: 'wk-body' }, steps(text).map((s) => h('li', { text: s })));
  }

  function editor() {
    const lines = draft.split('\n');
    const baseLines = new Set(T2.split('\n'));
    return [
      h('span', { class: 'demo-label', text: 'Text' }),
      h('pre', { class: 'wk-text recess' }, lines.map((l) => (l && !baseLines.has(l) ? h('span', { class: 'wk-new', text: l }) : l + '\n'))),
      h('span', { class: 'demo-label', text: 'What changed' }),
      h('div', { class: 'wk-field recess', text: draft === MINE ? MINE_SUMMARY : '' }),
    ];
  }

  function paintPage() {
    page.textContent = '';
    const cur = current();
    if (mode === 'removed') {
      page.append(h('span', { class: 'wk-title', text: TITLE }), h('p', { class: 'wk-note', text: 'This page was removed. Its history keeps its versions, and Restore brings one back.' }));
      return;
    }
    if (mode === 'old') {
      page.append(
        h('span', { class: 'wk-title', text: TITLE }),
        h('p', { class: 'wk-note', text: 'Version ' + numberOf(reading) + ', by ' + reading.by + ', ' + reading.at + '.' }),
        body(reading.text)
      );
      return;
    }
    if (mode === 'edit' || mode === 'conflict') {
      page.append(h('span', { class: 'wk-title', text: 'Edit ' + TITLE }));
      if (mode === 'conflict') {
        const theirs = h('pre', { class: 'wk-text recess', text: cur.text });
        theirs.hidden = !theirsOpen;
        // The key opens their text in place, so the focus stays on it.
        const see = key(theirsOpen ? 'Hide their version' : 'See their version', { kind: 'quiet', size: 's', onClick: () => {
          theirsOpen = !theirsOpen;
          theirs.hidden = !theirsOpen;
          see.textContent = theirsOpen ? 'Hide their version' : 'See their version';
          see.setAttribute('aria-expanded', String(theirsOpen));
        } });
        see.setAttribute('aria-expanded', String(theirsOpen));
        page.append(
          h('div', { class: 'wk-conflict' },
            h('span', { class: 'wk-conflict-head' }, lineLed('amber'), h('span', { text: cur.by + ' saved this page while you edited it.' })),
            h('p', { text: 'Your text is still here.' }),
            see,
            theirs
          )
        );
      }
      page.append(...editor());
      return;
    }
    page.append(
      h('span', { class: 'wk-title', text: TITLE }),
      h('p', { class: 'wk-parts' },
        h('span', { text: 'Version ' + numberOf(cur) }),
        h('span', { class: 'wk-by', text: cur.by }),
        h('span', { text: cur.at }),
        cur.summary ? h('span', { text: cur.summary }) : null
      ),
      body(cur.text)
    );
  }

  function paint() {
    paintPage();
    paintHistory();
    const words = { read: ['grey', 'saved'], edit: ['grey', 'editing'], conflict: ['amber', 'needs you'], old: ['grey', 'an old version'], removed: ['grey', 'removed'] };
    const [tone, word] = words[mode];
    d.setStatus(tone, word);
  }

  async function step(fn) {
    if (busy) return;
    busy = true;
    d.setKeys([]);
    await fn();
    busy = false;
  }

  // ---------- the steps ----------

  const edit = () => step(async () => {
    const cur = current();
    log.append('GET ' + ROUTE, '200, ETag ' + tag(cur.text));
    base = cur.text;
    draft = MINE;
    mode = 'edit';
    paint();
    d.say('The editor read the page and keeps its hash. A save sends that hash in If-Match, so it lands only on the text that you read.');
    d.setKeys([key('An agent writes first', { onClick: agentWrites }), key('Save', { kind: 'primary', onClick: save })]);
  });

  const agentWrites = () => step(async () => {
    log.append('pages_write', 'reviewer, ifHash ' + tag(base));
    await wait(300);
    add('reviewer', 'Add the release notes', THEIRS);
    paint();
    d.say('reviewer read the same version and wrote first. Its hash matched, so its text is now version 3. Your editor still holds the hash of version 2.');
    d.setKeys([key('Save', { kind: 'primary', onClick: save })]);
  });

  const save = () => step(async () => {
    const cur = current();
    if (cur.text !== base) {
      log.append('PUT ' + ROUTE, 'If-Match ' + tag(base) + ', 412', { tone: 'amber' });
      await wait(450);
      log.append('GET ' + ROUTE, '200, ETag ' + tag(cur.text));
      theirsOpen = false;
      mode = 'conflict';
      paint();
      d.say('The hash no longer matched, so the workbench wrote nothing and answered 412. The page read the newer version and asks you which text stays.');
      d.setKeys([key('Take theirs', { onClick: takeTheirs }), key('Keep mine', { kind: 'primary', onClick: keepMine })]);
      return;
    }
    if (draft === cur.text) {
      log.append('PUT ' + ROUTE, 'If-Match ' + tag(base) + ', 200, no new version');
      mode = 'read';
      paint();
      d.say('The page holds this text already, so the write changed nothing and made no version.');
    } else {
      log.append('PUT ' + ROUTE, 'If-Match ' + tag(base) + ', 200');
      const v = add(READER, MINE_SUMMARY, draft);
      mode = 'read';
      paint();
      d.say('The hash matched, so your text is version ' + numberOf(v) + '. Every earlier version stays in the history.');
    }
    d.setKeys(savedKeys());
  });

  const keepMine = () => step(async () => {
    const cur = current();
    log.append('PUT ' + ROUTE, 'If-Match ' + tag(cur.text) + ', 200');
    base = cur.text;
    const v = add(READER, MINE_SUMMARY, draft);
    mode = 'read';
    paint();
    d.say('Keep mine saved your text with the hash of their version, so it is version ' + numberOf(v) + '. Their text stays in the history as version ' + (numberOf(v) - 1) + '.');
    d.setKeys(savedKeys());
  });

  const takeTheirs = () => step(async () => {
    const cur = current();
    draft = cur.text;
    base = cur.text;
    mode = 'edit';
    paint();
    d.say('The editor now holds their text and their hash. You can add your line again before you save.');
    d.setKeys([key('Save', { kind: 'primary', onClick: save })]);
  });

  const savedKeys = () => [key('Remove page', { kind: 'danger', onClick: remove }), key('Read version 1', { kind: 'primary', onClick: readOld })];

  const readOld = () => step(async () => {
    reading = kept()[0];
    log.append('GET ' + ROUTE + '?version=' + reading.rev, '200');
    mode = 'old';
    paint();
    d.say('The store numbers the versions of the whole wiki, so the request names version ' + reading.rev + '. The page counts the versions of this page from 1.');
    d.setKeys([key('Current page', { onClick: backToCurrent }), key('Restore this version', { kind: 'primary', onClick: restoreOld })]);
  });

  const backToCurrent = () => step(async () => {
    reading = null;
    mode = 'read';
    paint();
    d.say('');
    d.setKeys(savedKeys());
  });

  const restoreOld = () => step(async () => {
    const cur = current();
    const n = numberOf(reading);
    log.append('PUT ' + ROUTE, 'If-Match ' + tag(cur.text) + ', 200');
    add(READER, 'Restored version ' + n, reading.text);
    reading = null;
    mode = 'read';
    paint();
    d.say('Restored version ' + n + ' as the newest version. A restore is one more version, so the history loses nothing.');
    d.setKeys([key('Remove page', { kind: 'danger', onClick: remove })]);
  });

  const remove = () => step(async () => {
    const cur = current();
    log.append('DELETE ' + ROUTE, 'If-Match ' + tag(cur.text) + ', 204');
    versions.forEach((o) => { if (o.at === 'now') o.at = '1 min'; });
    versions.push({ deleted: true, at: 'now' });
    mode = 'removed';
    paint();
    d.say('Remove page asks first in a dialog. Then the page leaves the wiki, and its history stays. The tree lists it under Removed pages, with Restore.');
    d.setKeys([key('Restore', { kind: 'primary', onClick: putBack })]);
  });

  const putBack = () => step(async () => {
    const last = kept()[kept().length - 1];
    log.append('GET /v1/pages/removed', '200, 1 removed page');
    await wait(350);
    log.append('GET ' + ROUTE + '?version=' + last.rev, '200');
    await wait(350);
    log.append('PUT ' + ROUTE, 'If-None-Match: *, 201');
    add(READER, 'Put back after a removal', last.text);
    mode = 'read';
    paint();
    d.say('Put back ' + TITLE + '. A removed page counts as absent, so the page writes it as a new page, over the removal.');
    d.setKeys([]);
  });

  function start() {
    versions = [];
    rev = 9;
    reading = null;
    const v1 = add(READER, 'First steps', T1);
    v1.at = '1 d';
    rev = 37;
    const v2 = add('reviewer', 'Add the rollback step', T2);
    v2.at = '2 h';
    mode = 'read';
    log.clear();
    paint();
    d.say('');
    d.setKeys([key('Edit', { kind: 'primary', onClick: edit })]);
  }

  d.reset(() => {
    if (busy) return;
    start();
  });
  start();
}
