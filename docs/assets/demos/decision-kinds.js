// The kinds of decision: the card that bossmode draws for an approval of a
// tool call, for a question with a form, and for a connect request, with
// the keys of src/ui/Decision.tsx. A key shows what the page sends
// (src/api/routes.ts) and the events that the kernel then appends to the
// ledger of the run (fw/turn.go, fw/connect.go). A connect is an approval
// with connect set, and only a finished connection allows it: the kernel
// refuses an allow from a key (Agent.Decide in fw/kernel.go).

import { h, css, demo, key, ledger, lineLed, code, wait } from './kit.js';

css('decision-kinds', `
.dk-tabs {
  display: flex;
  gap: var(--s-5);
  margin-bottom: var(--s-4);
  border-bottom: 1px solid var(--line);
  overflow-x: auto;
}
.dk-tab {
  appearance: none;
  display: inline-flex;
  align-items: center;
  min-height: 40px;
  padding: 3px 0 0;
  border: 0;
  border-bottom: 3px solid transparent;
  background: none;
  color: var(--muted);
  font-family: inherit;
  font-size: var(--t-control);
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
}
.dk-tab:hover {
  color: var(--ink);
}
.dk-tab[aria-selected='true'] {
  color: var(--ink);
  font-weight: 700;
  border-bottom-color: var(--accent);
}
.dk-tab:focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: 2px;
}
.dk-body,
.dk-side {
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
  min-width: 0;
}
.doc .dk-body p,
.doc .dk-side p {
  margin: 0;
}
.dk-rule {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-2);
  font-size: var(--t-meta);
  line-height: var(--t-meta-lh);
  color: var(--muted);
}
.dk-details {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  font-size: var(--t-meta);
  line-height: var(--t-meta-lh);
}
.dk-field {
  display: flex;
  flex-direction: column;
  gap: var(--s-1);
}
.dk-field > span {
  font-size: var(--t-meta);
  line-height: var(--t-meta-lh);
  font-weight: 600;
}
.dk-field .input {
  font-family: inherit;
}
.doc .dk-plan {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 4px var(--s-3);
  margin: 0;
  font-size: var(--t-meta);
  line-height: var(--t-meta-lh);
}
.doc .dk-plan dt {
  color: var(--muted);
}
.doc .dk-plan dd {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dk-decided {
  display: flex;
  align-items: baseline;
  gap: var(--s-2);
  white-space: pre-line;
}
.doc .dk-note {
  color: var(--muted);
}
.dk-sent .dk-empty {
  padding: 10px 12px;
  font-size: var(--t-meta);
  line-height: var(--t-meta-lh);
  color: var(--muted);
}
.demo-card.dk-quiet {
  border-color: var(--line);
  box-shadow: none;
}
`);

const RUN = '01K8Q3';

// The three kinds, each with the card that bossmode draws for it.
const KINDS = {
  approval: {
    tab: 'Approval',
    title: 'Needs your decision',
    agent: 'migrator-2',
    before: [['fw.model.responded', 'stop tool_use'], ['fw.approval.requested', 'bash: git push origin migrate/nginx', 'amber']],
  },
  question: {
    tab: 'Question',
    title: 'Needs your answer',
    agent: 'scribe',
    before: [['fw.tool.requested', 'ask_user'], ['fw.approval.requested', 'ask_user: a form of 2 fields', 'amber']],
  },
  connect: {
    tab: 'Connect',
    title: 'Needs your decision',
    agent: 'triage',
    before: [['fw.tool.requested', 'tickets.create_issue'], ['fw.approval.requested', 'connect: Tickets', 'amber']],
  },
};

const QUESTION = 'Which release do the notes cover, and for whom?';

export default function mount(root) {
  const d = demo(root, {
    title: 'Needs your decision',
    tone: 'amber',
    word: 'needs you',
    wide: true,
    caption: 'A model of the decision cards of bossmode. The words and the keys are those of src/ui/Decision.tsx. The routes are those that the page calls, and the events are those that the kernel appends.',
  });

  let kind = 'approval';
  let busy = false;
  let refused = false;

  const tabIds = Object.keys(KINDS);
  const uid = 'dk-' + Math.random().toString(36).slice(2, 8);
  const tabs = tabIds.map((k) =>
    h('button', { type: 'button', role: 'tab', class: 'dk-tab', id: uid + '-' + k, 'aria-controls': uid + '-panel', 'data-kind': k, on: { click: () => pickKind(k, true) } }, KINDS[k].tab)
  );
  const tabBar = h('div', { class: 'dk-tabs', role: 'tablist', 'aria-label': 'Kind of decision' }, tabs);
  tabBar.addEventListener('keydown', (e) => {
    const i = tabIds.indexOf(kind);
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabIds.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    pickKind(tabIds[(next + tabIds.length) % tabIds.length], true);
  });

  const body = h('div', { class: 'dk-body' });
  const sent = h('div', { class: 'dk-sent' });
  const log = ledger({ title: 'The ledger of the run', file: 'ledger.jsonl' });
  const side = h('div', { class: 'dk-side' }, h('div', null, h('span', { class: 'demo-label', text: 'What the page sends' }), sent), log.el);
  const panel = h('div', { class: 'demo-split dk-split', role: 'tabpanel', id: uid + '-panel' }, body, side);
  d.stage.append(tabBar, panel);

  // ---------- the parts of a card ----------

  function details(tool, input) {
    const box = h('div', { class: 'dk-details', id: 'dk-details-' + kind, hidden: true }, h('p', null, 'Tool: ', code(tool)), h('pre', { class: 'demo-command recess', text: JSON.stringify(input, null, 2) }));
    const k = key('Details', { kind: 'quiet', size: 's' });
    k.setAttribute('aria-expanded', 'false');
    k.setAttribute('aria-controls', box.id);
    k.addEventListener('click', () => {
      box.hidden = !box.hidden;
      k.setAttribute('aria-expanded', String(!box.hidden));
    });
    return { k, box };
  }

  function noteField() {
    const input = h('input', { class: 'recess input', type: 'text', maxlength: '1024', placeholder: 'Optional' });
    return { el: h('label', { class: 'dk-field' }, h('span', { text: 'Note' }), input), input };
  }

  function plan(fields) {
    return h('dl', { class: 'dk-plan' }, fields.map(([k, v]) => [h('dt', { text: k }), h('dd', { title: v, text: v })]));
  }

  // ---------- the request and the ledger ----------

  function showSent(lines) {
    sent.textContent = '';
    if (!lines.length) {
      sent.append(h('p', { class: 'dk-empty recess', text: 'Nothing yet. Press a key of the card.' }));
      return;
    }
    sent.append(h('pre', { class: 'demo-command recess', text: lines.join('\n') }));
  }

  const approvalRoute = 'POST /v1/runs/' + RUN + '/approvals/ap-1';
  const json = (o) => JSON.stringify(o, null, 2);

  // ---------- the cards ----------

  let note = null;

  function drawApproval() {
    const input = { command: 'git push origin migrate/nginx' };
    const det = details('bash', input);
    note = noteField();
    body.append(
      h('p', { text: 'migrator-2 wants to run a command.' }),
      h('pre', { class: 'demo-command recess', text: input.command }),
      h('div', { class: 'dk-rule' }, h('span', { text: 'Rule: ask before bash' }), det.k),
      det.box,
      note.el,
    );
    d.say('The policy of migrator asks before bash, so the run waits. The card names the action in plain words and shows the exact command.');
    d.setKeys([
      key('Deny', { onClick: () => decideApproval('deny') }),
      key('Always allow', { title: 'Allow bash for migrator-2 from now on', onClick: () => decideApproval('always') }),
      key('Run command', { kind: 'primary', onClick: () => decideApproval('allow') }),
    ]);
  }

  async function decideApproval(how) {
    if (busy) return;
    busy = true;
    const n = note.input.value.trim();
    const bodyOf = (dec) => json(n ? { decision: dec, note: n } : { decision: dec });
    d.setKeys([]);
    if (how === 'always') {
      showSent([approvalRoute + '/rule', '200 {"pool":"migrator","rule":"bash"}', '', approvalRoute, bodyOf('allow')]);
    } else {
      showSent([approvalRoute, bodyOf(how)]);
    }
    const allow = how !== 'deny';
    quiet('migrator-2 wants to run a command', allow ? 'allowed' : 'denied', allow ? 'green' : 'red', allow ? 'You allowed this' : 'You denied this', n);
    await wait(500);
    log.append('fw.approval.decided', (allow ? 'allow' : 'deny') + ', by you');
    await wait(450);
    if (allow) {
      log.append('fw.tool.requested', 'bash: git push origin migrate/nginx');
      await wait(450);
      log.append('fw.tool.responded', 'exit 0');
    } else {
      log.append('fw.tool.responded', 'error: denied by you' + (n ? ': ' + n : ''));
    }
    busy = false;
    doneKeys();
    if (how === 'always') {
      d.say('The server added the rule "allow bash" to the policy of the workers of migrator, then allowed this call. Their next bash call runs without a card. Only an owner of the agent can do this.');
    } else if (allow) {
      d.say('The kernel records your decision, runs the command, and the run goes on from the step where it stopped. The card stays in the channel, quiet, with who decided.');
    } else {
      d.say('The model reads the denial' + (n ? ', with your note,' : '') + ' as the result of its call. It goes on without the push.');
    }
  }

  function drawQuestion() {
    const release = h('select', { class: 'recess input', required: true }, h('option', { value: '2.4', text: '2.4' }), h('option', { value: '2.5', text: '2.5' }));
    const audience = h('input', { class: 'recess input', type: 'text', value: 'operators' });
    body.append(
      h('p', null, 'scribe asks: ', h('b', { text: QUESTION })),
      h('label', { class: 'dk-field' }, h('span', { text: 'Release' }), release),
      h('label', { class: 'dk-field' }, h('span', { text: 'Audience' }), audience),
    );
    d.say('The agent called ask_user with a form. The card draws the form from its schema: a list for a field with choices, a text field for the rest.');
    d.setKeys([
      key('Decline', { onClick: () => answer(null) }),
      key('Answer', { kind: 'primary', onClick: () => answer({ release: release.value, audience: audience.value.trim() }) }),
    ]);
  }

  async function answer(content) {
    if (busy) return;
    busy = true;
    d.setKeys([]);
    if (content) {
      showSent([approvalRoute, json({ decision: 'allow', content })]);
      quiet(QUESTION, 'answered', 'green', 'You answered: Release: ' + content.release + '\nAudience: ' + (content.audience || 'none'));
    } else {
      showSent([approvalRoute, json({ decision: 'deny' })]);
      quiet(QUESTION, 'declined', 'red', 'You declined the question');
    }
    await wait(500);
    log.append('fw.approval.decided', content ? 'allow, with the answer' : 'deny, by you');
    await wait(450);
    log.append('fw.tool.responded', content ? 'ask_user: ' + JSON.stringify(content) : 'error: denied by you');
    busy = false;
    doneKeys();
    d.say(content
      ? 'The answer is the result of the ask_user call. The agent reads it and goes on.'
      : 'Decline denies the question. The call of ask_user fails, and the agent goes on without an answer.');
  }

  function drawConnect() {
    const input = { project: 'OPS', title: 'Nightly restore failed' };
    const det = details('tickets.create_issue', input);
    note = noteField();
    refused = false;
    body.append(
      h('p', { text: 'triage wants to connect tickets.' }),
      plan([['project', input.project], ['title', input.title]]),
      h('div', { class: 'dk-rule' }, h('span', { text: 'Connect Tickets, so the agent can act as you there.' }), det.k),
      det.box,
      note.el,
    );
    d.say('The tool must act as you at the service Tickets, and you have not connected it. The call waits for you, as an approval does.');
    connectKeys();
  }

  function connectKeys() {
    d.setKeys([
      key('Deny', { onClick: () => skip() }),
      refused
        ? key('Open Connections', { kind: 'primary', onClick: () => connect() })
        : key('Connect Tickets', { kind: 'primary', onClick: () => tryAllow() }),
    ]);
  }

  async function tryAllow() {
    if (busy) return;
    busy = true;
    showSent([approvalRoute, json({ decision: 'allow' }), '', '400: fw: invalid request: connect Tickets to continue; a decision can only skip it']);
    refused = true;
    busy = false;
    d.say('The server refuses the key: a click is not a grant. The card still waits. Connections, in the account menu, makes the grant.');
    connectKeys();
  }

  async function connect() {
    if (busy) return;
    busy = true;
    d.setKeys([]);
    showSent(['/ui#connections', 'Connect Tickets, then sign in at Tickets', '', 'bus: fw.connection.connected', json({ subject: 'alice@example.com', servers: ['tickets'] })]);
    d.say('Connections sends you to Tickets to sign in. When you come back, the server tells every worker on the bus that you connected Tickets.');
    await wait(1200);
    quiet('triage wants to connect tickets', 'allowed', 'green', 'You allowed this', 'connected');
    log.append('fw.approval.decided', 'allow, note connected');
    await wait(450);
    log.append('fw.tool.responded', 'created OPS-142');
    busy = false;
    doneKeys();
    d.say('The kernel that holds the run allows the call by itself, with the note connected. One connection lets every call of yours that waits for Tickets go on.');
  }

  async function skip() {
    if (busy) return;
    busy = true;
    d.setKeys([]);
    const n = note.input.value.trim();
    showSent([approvalRoute, json(n ? { decision: 'deny', note: n } : { decision: 'deny' })]);
    quiet('triage wants to connect tickets', 'denied', 'red', 'You denied this', n);
    await wait(500);
    log.append('fw.approval.decided', 'deny, by you');
    await wait(450);
    log.append('fw.tool.responded', 'error: the person did not connect the service');
    busy = false;
    doneKeys();
    d.say('Deny skips the service. The call fails, and the agent reads that you chose not to connect Tickets.');
  }

  // ---------- states ----------

  /** quiet turns the card into a decided card: a line edge, no breath, no key, and who decided. */
  // A decided card of bossmode keeps the plan of the call and the rule,
  // drops the sentence (now its title), the Note field, and the keys, and
  // says who decided. A decided question keeps only who answered.
  /** doneKeys offers the next kind of decision once a decision has played out. */
  function doneKeys() {
    const next = tabIds[(tabIds.indexOf(kind) + 1) % tabIds.length];
    d.setKeys([key('Next: ' + KINDS[next].tab, { kind: 'primary', onClick: () => pickKind(next, true) })]);
  }

  function quiet(title, word, tone, said, n) {
    d.card.classList.add('dk-quiet');
    d.title.textContent = title;
    d.setStatus('grey', word, { still: true });
    if (kind === 'question') body.textContent = '';
    else {
      const first = body.firstElementChild;
      if (first && first.tagName === 'P') first.remove();
      body.querySelectorAll('.dk-field').forEach((f) => f.remove());
    }
    body.append(h('div', { class: 'dk-decided' }, lineLed(tone), h('p', { text: said })));
    if (n) body.append(h('p', { class: 'dk-note', text: n }));
  }

  function start() {
    busy = false;
    const k = KINDS[kind];
    d.card.classList.remove('dk-quiet');
    d.title.textContent = k.title;
    d.setStatus('amber', 'needs you');
    body.textContent = '';
    log.clear();
    for (const [type, detail, tone] of k.before) log.append(type, detail, tone ? { tone } : {});
    showSent([]);
    if (kind === 'approval') drawApproval();
    else if (kind === 'question') drawQuestion();
    else drawConnect();
  }

  function pickKind(k, focus) {
    if (busy) return;
    kind = k;
    tabs.forEach((t) => {
      const on = t.getAttribute('data-kind') === k;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
    });
    panel.setAttribute('aria-labelledby', uid + '-' + k);
    start();
  }

  // Start over waits for a decision that is playing out, as the tabs do,
  // so its last events do not land in the fresh ledger.
  d.reset(() => {
    if (!busy) start();
  }, 'Start over');
  pickKind('approval', false);
}
