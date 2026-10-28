// A slash command, kept through a compaction. The reader sends a skill to a
// chat as a slash command, or pastes the same words as a plain message, and
// then lets the context fill. The front builds the message as section 20.3
// of the workbench architecture says: the line "Skill: <name>", a blank
// line, and the body of SKILL.md with $ARGUMENTS filled. It sends it pinned
// (section 20.4). At a compaction the kernel puts the summary first and each
// pinned message after it, word for word (kernel architecture, section 5.4),
// so the skill stays. A plain message goes into the summary. The skill is an
// example, and the demo fills its one placeholder from fixed text: it is no
// port of the expansion of the front.

import { h, css, demo, key, lineLed, chip, code, wait, settle } from './kit.js';

css('skills-slash', `
.ss-col { display: flex; flex-direction: column; gap: var(--s-2); min-width: 0; }
.ss-col .demo-label { margin-bottom: 0; }
.ss-file { color: var(--muted); }
.ss-file b { color: var(--ink); font-weight: 600; }
.ss-rows > li { flex-wrap: wrap; row-gap: 2px; }
.ss-rows > li .chip { flex: none; }
.ss-rows > li.ss-gone { text-decoration: line-through; color: var(--muted); }
`);

const COMMAND = '/release-notes v2.4';
const FILE = [
  '---',
  'name: release-notes',
  'description: Drafts release notes.',
  'argument-hint: [version]',
  '---',
  'Draft the release notes for $ARGUMENTS from the changes merged since the last tag.',
];
const BODY = 'Draft the release notes for v2.4 from the changes merged since the last tag.';
const MESSAGE = 'Skill: release-notes\n\n' + BODY;

export default function mount(root) {
  const d = demo(root, {
    title: 'A skill handed to a chat',
    tone: 'grey',
    word: 'completed',
    wide: true,
    caption: 'A model of a slash command in a chat. The route, the shape of the message, and the events come from the workbench and the kernel. The skill is an example.',
  });

  // The left column: what the person types, the file of the skill, and the message that goes out.
  const file = h('pre', { class: 'demo-command recess ss-file' }, FILE.map((line, i) => [i ? '\n' : '', line.includes('$ARGUMENTS') ? [line.split('$ARGUMENTS')[0], h('b', { text: '$ARGUMENTS' }), line.split('$ARGUMENTS')[1]] : line]));
  const sentLabel = h('span', { class: 'demo-label' });
  const sent = h('pre', { class: 'demo-command recess' });
  const sentBox = h('div', { class: 'ss-col' }, sentLabel, sent);
  const left = h('div', { class: 'ss-col' },
    h('span', { class: 'demo-label', text: 'The composer' }),
    h('pre', { class: 'demo-command recess', text: COMMAND }),
    h('span', { class: 'demo-label', text: 'SKILL.md of release-notes' }),
    file,
    sentBox,
  );

  // The right column: what the model reads, one row per part of the context.
  const rows = h('ul', { class: 'demo-rows ss-rows', 'aria-label': 'What the model reads' });
  const right = h('div', { class: 'ss-col' }, h('span', { class: 'demo-label', text: 'What the model reads' }), rows);
  d.stage.append(h('div', { class: 'demo-split' }, left, right));

  let busy = false;
  let mode = '';

  function row(text, note, opts = {}) {
    const li = h('li', { class: opts.cls }, lineLed(opts.tone || 'grey'), h('span', { text }), opts.pinned ? chip('pinned') : null, note ? h('span', { class: 'demo-row-note', text: note }) : null);
    rows.append(li);
    return settle(li);
  }

  function start() {
    mode = '';
    rows.textContent = '';
    row('The system prompt', 'not in the history');
    row('Your first message', '');
    row('6 turns of work', '');
    sentBox.hidden = true;
    d.setStatus('grey', 'completed');
    d.say('The chat ended its last turn. Send the skill as a slash command, or paste the same words as a plain message.');
    d.setKeys([
      key('Paste it as text', { onClick: () => send(false) }),
      key('Send ' + COMMAND, { kind: 'primary', onClick: () => send(true) }),
    ]);
  }

  async function send(slash) {
    if (busy) return;
    busy = true;
    mode = slash ? 'slash' : 'text';
    d.setKeys([]);
    sentLabel.textContent = slash ? 'The message that the workbench sends' : 'The message that the page sends';
    sent.textContent = slash ? MESSAGE : BODY;
    sentBox.hidden = false;
    settle(sentBox);
    await wait(300);
    if (slash) row('Skill: release-notes', 'the whole skill', { tone: 'green', pinned: true });
    else row('Draft the release notes for v2.4', 'a plain follow-up', { tone: 'green' });
    d.setStatus('green', 'running');
    d.say(slash
      ? h('span', null, 'The page sent ', code('POST /v1/bossmode/runs/{id}/skill'), '. The workbench read SKILL.md, put v2.4 in place of $ARGUMENTS, and sent the message pinned. The ledger records ', code('fw.message.received'), ' with ', code('pinned'), '.')
      : h('span', null, 'The words went out as a plain follow-up, ', code('POST /v1/runs/{id}/messages'), '. Nothing pins them.'));
    busy = false;
    d.setKeys([key('Work until the context fills', { kind: 'primary', onClick: compact })]);
  }

  async function compact() {
    if (busy) return;
    busy = true;
    d.setKeys([]);
    row('14 more turns of work', '');
    d.say('The run works on. Each turn adds to the history, until the history reaches the size that starts a compaction.');
    await wait(1200);

    // The summary replaces the history. The system prompt is not part of it, and each pinned message follows the summary.
    const kids = [...rows.children];
    kids.slice(1).forEach((li) => li.classList.add('ss-gone'));
    await wait(700);
    rows.textContent = '';
    row('The system prompt', 'not in the history');
    row('A summary of the history', 'the new epoch', { tone: 'green' });
    if (mode === 'slash') row('Skill: release-notes', 'word for word', { tone: 'green', pinned: true });
    d.say(mode === 'slash'
      ? h('span', null, 'The kernel appended ', code('fw.context.compacted'), '. A summary replaced the history, and the pinned message follows it word for word. The run keeps the skill for the rest of its life.')
      : h('span', null, 'The kernel appended ', code('fw.context.compacted'), '. A summary replaced the history, and your pasted text with it. The model reads only what the summary kept of it.'));
    await wait(900);
    d.setStatus('grey', 'completed');
    busy = false;
    d.setKeys(mode === 'slash' ? [] : [key('Try the slash command', { kind: 'primary', onClick: start })]);
  }

  d.reset(() => {
    if (!busy) start();
  });
  start();
}
