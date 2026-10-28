// The places of bossmode: a small app bar of the real places, in the order
// of src/ui/Shell.tsx of featherweight-bossmode. A pick shows what the place
// is for, what its list, main, and details panes hold (src/ui/App.tsx names
// the component of each pane), and a screenshot of the place from
// docs/assets/shots/, light or graphite after the theme of the site.
//
// Options from the element: data-places="chat,fleet" keeps only those
// places, data-place="fleet" picks the first place, and data-title names
// the card.

import { h, css, svg, demo, key, code } from './kit.js';

css('bossmode-tour', `
.bt-shell {
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr);
  border: 1px solid var(--line);
  border-radius: var(--r);
  overflow: hidden;
  background: var(--paper);
}
.bt-bar {
  display: flex;
  flex-direction: column;
  gap: var(--s-1);
  padding: var(--s-2) 6px;
  border-right: 1px solid var(--line);
  background: repeating-linear-gradient(to bottom, var(--groove-chrome) 0 1px, var(--chrome) 1px 8px);
}
.bt-place {
  appearance: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 0;
  padding: var(--s-2) 0 6px;
  border: 1px solid transparent;
  border-radius: var(--r);
  background: var(--chrome);
  color: var(--ink);
  font-family: inherit;
  font-size: var(--t-caption);
  line-height: var(--t-caption-lh);
  font-weight: 600;
  cursor: pointer;
}
.bt-place:hover {
  background: var(--raised);
}
.bt-place[aria-selected='true'] {
  background: var(--paper);
  border-color: var(--line);
  box-shadow: var(--e-selected);
  font-weight: 700;
}
.bt-place:focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: 1px;
}
.bt-place span {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bt-panel {
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
  min-width: 0;
  padding: var(--s-3) var(--s-4) var(--s-4);
}
.doc .bt-panel p {
  margin: 0;
}
.doc .bt-name {
  font-size: var(--t-heading);
  line-height: var(--t-heading-lh);
  font-weight: 800;
  font-stretch: 106%;
}
.doc .bt-panes {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 6px var(--s-3);
  margin: 0;
  font-size: var(--t-meta);
  line-height: var(--t-meta-lh);
}
.doc .bt-panes dt {
  font-weight: 700;
}
.doc .bt-panes dd {
  margin: 0;
}
.doc .bt-panes dd.bt-none {
  color: var(--muted);
}
.doc .bt-cond {
  font-size: var(--t-meta);
  line-height: var(--t-meta-lh);
  color: var(--muted);
}
.bt-shot {
  display: flex;
  flex-direction: column;
  gap: var(--s-1);
  margin: 0;
}
.bt-shot a {
  display: block;
  line-height: 0;
}
.doc .bt-shot img {
  display: block;
  width: 100%;
  height: auto;
  border: 1px solid var(--line);
  border-radius: var(--r);
}
.bt-shot figcaption {
  font-size: var(--t-meta);
  line-height: var(--t-meta-lh);
  color: var(--muted);
}
.doc .bt-noshot {
  padding: var(--s-3);
  font-size: var(--t-meta);
  line-height: var(--t-meta-lh);
  color: var(--muted);
}
@media (max-width: 640px) {
  .bt-shell {
    grid-template-columns: minmax(0, 1fr);
  }
  .bt-bar {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    border-right: 0;
    border-bottom: 1px solid var(--line);
  }
  .bt-place {
    font-stretch: 75%;
  }
}
`);

// The glyphs of the places: the 24-unit set of src/ui/icons.tsx of bossmode.
const GLYPHS = {
  activity: ['M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9', 'M10 21h4'],
  chat: ['M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 4v-4h0A1.5 1.5 0 0 1 4 14.5z'],
  bridges: ['M2 20v-1a5 5 0 0 1 5-5a5 5 0 0 1 5 5v1', 'M12 20v-1a5 5 0 0 1 5-5a5 5 0 0 1 5 5v1', { circle: [7, 6, 3] }, { circle: [17, 6, 3] }],
  fleet: [{ rect: [3, 3] }, { rect: [14, 3] }, { rect: [3, 14] }, { rect: [14, 14] }],
  duties: [{ circle: [12, 12, 8.5] }, 'M12 7.5V12l3 2'],
  skills: ['M12 3l9 5-9 5-9-5z', 'M3 12.5l9 5 9-5', 'M3 17l9 5 9-5'],
  routines: ['M17 3l3 3-3 3', 'M4 11V9a3 3 0 0 1 3-3h13', 'M7 21l-3-3 3-3', 'M20 13v2a3 3 0 0 1-3 3H4'],
  wiki: ['M4 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4z', 'M20 4h-7a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h8z'],
  manager: [{ circle: [12, 8, 4] }, 'M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1'],
};

function glyph(name) {
  const parts = (GLYPHS[name] || []).map((p) => {
    if (typeof p === 'string') return svg('path', { d: p });
    if (p.circle) return svg('circle', { cx: p.circle[0], cy: p.circle[1], r: p.circle[2] });
    return svg('rect', { x: p.rect[0], y: p.rect[1], width: 7, height: 7, rx: 1 });
  });
  return svg('svg', { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' }, parts);
}

// The places of the app bar, with the address of each (PLACES in
// src/ui/Shell.tsx) and the panes of each route (panesOf in src/ui/App.tsx).
// shot names the screenshot bm-<shot>-light.png or bm-<shot>-dark.png of
// docs/assets/shots/.
const PLACES = [
  {
    id: 'activity', label: 'Activity', href: '#activity', page: 'decisions',
    purpose: 'What needs you, across every bridge and duty: decisions, questions, failed seats, and new messages.',
    list: 'The inbox: what needs you first, the oldest wait first, then the errors and the new messages.',
    main: 'The item you pick, else the item that needs you and waits longest. A decision shows as its card.',
    details: '',
    shot: 'activity', date: '2026-10-27',
    alt: 'The Activity place: the inbox with a decision of migrator-2 picked, and its card with Deny, Always allow, and Run command in the main pane.',
  },
  {
    id: 'chat', label: 'Chat', href: '#chat', page: 'chat',
    purpose: 'A quick chat with a general assistant, beside the bridges.',
    list: 'Your chats, newest first, under a heading per day, with New and Find a chat.',
    main: 'The conversation of a chat, or a new chat with its picks of tools and skills.',
    details: 'This chat: what the chat can do, its skills, the model, and the usage.',
    shot: 'chat', date: '2026-10-27',
    alt: 'The Chat place: the history by day, a chat about the handler that reloads nginx, and This chat.',
    cond: 'Without the setting workbench.bossmode.chat.agent, the place says "No quick chat is set up."',
  },
  {
    id: 'bridges', label: 'Bridges', href: '#', page: 'bridges',
    purpose: 'Bridges: one large job with one agent on each seat, and one channel where they and you talk.',
    list: 'The bridges, open first, each with its count and its light. The readout of the workers sits at its foot.',
    main: 'The channel of a bridge, with the tabs Posts, Wiki, and Decisions.',
    details: 'The members of the bridge, with Add.',
    shot: 'bridges', date: '2026-10-27',
    alt: 'The Bridges place: the list of bridges, a channel with a decision card of migrator-2, and its members.',
  },
  {
    id: 'fleet', label: 'Fleet', href: '#fleet', page: 'chat',
    purpose: 'Every agent you can talk to: the seats of each bridge, then the agents on no bridge.',
    list: 'The people, grouped by bridge, then Not on a bridge, with Find a member, Board, and New agent.',
    main: 'A direct conversation with an agent. A seat has the tabs Chat, Run, and Files. Board shows the statuses of each group.',
    details: 'The profile of the agent.',
    shot: 'fleet', date: '2026-10-27',
    alt: 'The Fleet place: the people list grouped by bridge, a conversation with migrator-1, and the profile of its agent.',
  },
  {
    id: 'duties', label: 'Duties', href: '#duties', page: 'duties',
    purpose: 'Work that an agent starts on its own: on a schedule, on an event, or after a check.',
    list: 'The duties, what needs you first, with New duty, and the tabs Duties and Playbooks. An admin also sees Pause all duties.',
    main: 'A duty with its history, or the editor of New duty and Edit.',
    details: '',
    shot: 'duties', date: '2026-10-27',
    alt: 'The Duties place: the list of duties, and the duty daily-release-notes with its schedule, its limits, and its history.',
  },
  {
    id: 'skills', label: 'Skills', href: '#skills', page: 'skills',
    purpose: 'The skills that agents can load, and the tools that they can call.',
    list: 'The skills by origin: Imported, Local, and one group per server. Then the tools.',
    main: 'The text of a skill or the description of a tool, and the agents that can use it.',
    details: 'Add skill, and the keys of the item that you picked.',
    shot: 'skills', date: '2026-10-27',
    alt: 'The Skills place: the skills by origin, and the text of the skill ansible-style with the agents that can load it.',
  },
  {
    id: 'routines', label: 'Routines', href: '#routines', page: 'routines',
    purpose: 'Work that came round often enough to run from a recipe. A routine waits for your sign-off before it goes live.',
    list: 'The routines in the order of attention: Needs you, Live, Rehearsing, Proposed, and Paused. Retired sits behind a toggle.',
    main: 'A routine with the tabs Steps, Evidence, and Runbook.',
    details: 'The agent of the routine and its week.',
    shot: 'routines', date: '2026-10-27',
    alt: 'The Routines place: a routine that needs your sign-off, the list, and the week of its agent.',
    cond: 'The place shows only when the server keeps routines.',
  },
  {
    id: 'wiki', label: 'Wiki', href: '#pages', page: 'wiki',
    purpose: 'The pages that agents and people write. The wiki keeps every older version.',
    list: 'The tree of pages and the search.',
    main: 'A page, its history, or the editor.',
    details: '',
    shot: 'wiki', date: '2026-10-27',
    alt: 'The Wiki place: the page The wiki of the fleet with its meta, and the tree.',
  },
  {
    id: 'manager', label: 'Manager', href: '#manager', page: 'manager',
    purpose: 'Your conversations with the manager, an agent that helps you run the fleet.',
    list: 'Your conversations with the manager, newest first, with New and Find a conversation.',
    main: 'The conversation.',
    details: '',
    shot: 'manager', date: '2026-10-27',
    alt: 'The Manager place: the list of your conversations with the manager, and one conversation.',
    cond: 'Without the setting workbench.bossmode.manager, the place says "No manager is set up."',
  },
];

/** dark reports the theme that the site shows: the pick of the reader, else the scheme of the system. */
function dark() {
  const t = document.documentElement.getAttribute('data-theme');
  if (t === 'dark') return true;
  if (t === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

const shotFile = (p) => 'bm-' + p.shot + '-' + (dark() ? 'dark' : 'light') + '.png';
const shotUrl = (p) => new URL('../shots/' + shotFile(p), import.meta.url).href;

export default function mount(root, opts = {}) {
  const only = (opts.places || '').split(',').map((s) => s.trim()).filter(Boolean);
  const places = only.length ? PLACES.filter((p) => only.includes(p.id)) : PLACES;
  let at = Math.max(0, places.findIndex((p) => p.id === opts.place));

  const d = demo(root, {
    title: opts.title || (only.length ? places.map((p) => p.label).join(' and ') : 'The places of bossmode'),
    wide: true,
    caption: 'A model of the app bar of bossmode. The places, their panes, and their addresses come from src/ui/Shell.tsx and src/ui/App.tsx. The pictures show bossmode against its fake server on 2026-10-27.',
  });

  const uid = 'bt-' + Math.random().toString(36).slice(2, 8);
  const tabs = places.map((p, i) =>
    h('button', {
      type: 'button',
      class: 'bt-place',
      role: 'tab',
      id: uid + '-' + p.id,
      'aria-controls': uid + '-panel',
      on: { click: () => show(i, true) },
    }, glyph(p.id), h('span', { text: p.label }))
  );
  const bar = h('div', { class: 'bt-bar', role: 'tablist', 'aria-label': 'Places', 'aria-orientation': 'vertical' }, tabs);
  bar.addEventListener('keydown', (e) => {
    const next = { ArrowDown: at + 1, ArrowRight: at + 1, ArrowUp: at - 1, ArrowLeft: at - 1, Home: 0, End: places.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    show((next + places.length) % places.length, true);
  });
  const panel = h('div', { class: 'bt-panel', role: 'tabpanel', id: uid + '-panel', tabindex: '0' });
  d.stage.append(h('div', { class: 'bt-shell' }, bar, panel));

  function figure(p) {
    if (!p.shot) {
      return h('p', { class: 'bt-noshot recess', text: 'No picture of the ' + p.label + ' place exists yet.' });
    }
    const img = h('img', { src: shotUrl(p), alt: p.alt, width: 1440, height: 900, loading: 'lazy', decoding: 'async' });
    const link = h('a', { href: shotUrl(p), target: '_blank', rel: 'noopener', title: 'Open the picture at full size' }, img);
    const words = [shotFile(p) + ', ' + p.date + '.'];
    if (p.note) words.push(p.note);
    return h('figure', { class: 'bt-shot', 'data-shot': p.shot }, link, h('figcaption', { text: words.join(' ') }));
  }

  function show(i, focus) {
    at = i;
    const p = places[i];
    tabs.forEach((t, j) => {
      t.setAttribute('aria-selected', String(j === i));
      t.tabIndex = j === i ? 0 : -1;
    });
    if (focus) tabs[i].focus();
    panel.setAttribute('aria-labelledby', tabs[i].id);
    panel.textContent = '';
    const pane = (name, text) => [h('dt', { text: name }), h('dd', { class: text ? '' : 'bt-none', text: text || 'None' })];
    const parts = [
      h('p', { class: 'bt-name', text: p.label }),
      h('p', { text: p.purpose }),
      h('dl', { class: 'bt-panes' }, pane('List pane', p.list), pane('Main pane', p.main), pane('Details pane', p.details)),
      p.cond ? h('p', { class: 'bt-cond', text: p.cond }) : null,
      figure(p),
    ];
    panel.append(...parts.filter(Boolean));
    d.say(h('span', null, (places.length > 1 ? 'Place ' + (i + 1) + ' of ' + places.length + '. ' : '') + 'Its address in bossmode is ', code('/bossmode/' + (p.href === '#' ? '' : p.href)), '.'));
  }

  // The keys are drawn once, so a key keeps the focus while the reader
  // presses it again and again.
  function paintKeys() {
    if (places.length < 2) {
      d.setKeys([]);
      return;
    }
    const n = places.length;
    d.setKeys([
      key('Previous place', { onClick: () => show((at - 1 + n) % n, false) }),
      key('Next place', { kind: 'primary', onClick: () => show((at + 1) % n, false) }),
    ]);
  }

  // A change of the theme picks the other picture.
  const repaint = () => {
    const fig = panel.querySelector('.bt-shot');
    if (!fig) return;
    const p = places[at];
    fig.replaceWith(figure(p));
  };
  document.addEventListener('fw-theme', repaint);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', repaint);

  show(at, false);
  paintKeys();
}
