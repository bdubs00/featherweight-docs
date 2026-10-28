// The token broker: how a run on a worker Task acts as the person who
// started it, while every grant of that person stays on the front. The
// steps follow the code:
//
//   - The sign-in at the front (GET /ui/signin, GET /ui/callback) leaves one
//     token in the sessionStorage of the tab, "fw.token" (surface/web of the
//     workbench).
//   - A tool of a tools.mcp entry with auth.oauth.grant: user asks the
//     fw.PersonTokens of the worker for a token. On a worker with tokens.url,
//     that is the client of the kernel package tokens, which sends
//     POST /v1/tokens to the front with the static token of the fleet.
//   - The front (connections/broker.go) refuses with a reason such as
//     not-connected, and the call asks the person to connect
//     (fw.approval.requested with connect, fw/connect.go).
//   - The connection stores the grant in the file store of the front,
//     encrypted with AES-256-GCM under the key FW_GRANT_KEY, and publishes
//     fw.connection.connected on the subject tokens.subject, fw.connections.
//   - The worker decides the connect request with the note "connected", asks
//     again, keeps the access token five minutes at most, and calls the
//     service with it in a header. No ledger event holds a token.
//   - A disconnect publishes fw.connection.disconnected, and every worker
//     drops the cached tokens of the person.

import { h, css, demo, key, ledger, led, code, wait } from './kit.js';

css('token-broker', `
.tb-body { container-type: inline-size; }
.tb-zones { display: grid; grid-template-columns: minmax(0, 0.8fr) minmax(0, 1fr) minmax(0, 1.1fr); gap: var(--s-3); align-items: start; margin-bottom: var(--s-4); }
@container (max-width: 540px) { .tb-zones { grid-template-columns: minmax(0, 1fr); } }
.tb-zone { min-width: 0; padding: var(--s-2); border: 1px solid var(--line); border-radius: var(--r); background: var(--paper); }
.tb-zone.tb-wall { border: 2px solid var(--muted); }
.tb-zone > .demo-label { margin: 0 0 var(--s-1) 4px; }
.doc .tb-items { display: flex; flex-direction: column; gap: 2px; margin: 0; padding: 0; list-style: none; }
.doc .tb-item { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 0 var(--s-2); margin: 0; padding: 6px; border: 1px solid transparent; border-radius: var(--r); }
.doc .tb-item.on { background: var(--raised); border-color: var(--raised-line); box-shadow: var(--e-row); }
.tb-name { min-width: 0; font-size: var(--t-control); line-height: var(--t-control-lh); font-weight: 700; }
.tb-where { grid-column: 1 / -1; min-width: 0; font-size: var(--t-meta); line-height: var(--t-meta-lh); color: var(--muted); overflow-wrap: anywhere; }
.tb-where code { font-size: var(--t-caption); }
.tb-item .status { font-size: var(--t-meta); }
.tb-wire { min-width: 0; margin-bottom: var(--s-3); }
.doc .tb-hops { display: flex; flex-direction: column; gap: 2px; min-height: 64px; margin: 0; padding: 6px 8px; list-style: none; }
.doc .tb-hop { display: grid; grid-template-columns: 9.5em minmax(0, 1fr); gap: 0 var(--s-2); margin: 0; font-family: var(--mono); font-size: var(--t-code); line-height: var(--t-code-lh); }
.tb-who { color: var(--muted); white-space: nowrap; }
.tb-what { min-width: 0; overflow-wrap: anywhere; }
.doc .tb-hop.tb-none { display: block; font-family: inherit; font-size: var(--t-meta); line-height: var(--t-meta-lh); color: var(--muted); }
@container (max-width: 440px) { .doc .tb-hop { grid-template-columns: minmax(0, 1fr); } .doc .tb-hop + .tb-hop { margin-top: 4px; } }
.tb-side { display: flex; flex-direction: column; gap: var(--s-2); min-width: 0; }
.tb-steps { margin-bottom: var(--s-3); }
`);

const WHO = 'kim@acme.io';
const RUN = '01K8R2';

// The things that each side holds, by zone.
const ZONES = [
  ['Your browser', false, [
    ['signin', 'Sign-in token', () => ['Under ', code('fw.token'), ' in the session storage of the tab']],
  ]],
  ['The front, outside the sandboxes', false, [
    ['grant', 'Grant for Tickets', () => ['A refresh token, encrypted with ', code('FW_GRANT_KEY'), ' in ', code('workbench.grants.dir')]],
    ['frontToken', 'Access token for Tickets', () => ['In memory, until shortly before it expires']],
  ]],
  ['The worker Task, inside the sandbox', true, [
    ['fleet', 'Fleet token', () => [code('FW_API_TOKEN'), ': the worker shows it to the front']],
    ['taskToken', 'Access token for Tickets', () => ['Cached for 5 minutes at most']],
    ['refresh', 'Refresh token', () => ['Never enters a Task']],
  ]],
];

const START = { signin: ['grey', 'none'], grant: ['grey', 'none'], frontToken: ['grey', 'none'], fleet: ['green', 'held'], taskToken: ['grey', 'none'], refresh: ['off', 'never'] };

export default function mount(root) {
  const d = demo(root, {
    title: 'A run that acts as you',
    tone: 'grey',
    word: 'signed out',
    wide: true,
    caption: 'A model of the token broker of a fleet. The routes, keys, and events are those of connections/broker.go of the workbench and tokens/tokens.go of the kernel.',
  });

  const items = {};
  const zones = ZONES.map(([title, wall, list]) =>
    h('div', { class: 'tb-zone' + (wall ? ' tb-wall' : '') },
      h('span', { class: 'demo-label', text: title }),
      h('ul', { class: 'tb-items' }, list.map(([id, name, where]) => {
        const light = led('grey', 'none', { still: true });
        const li = h('li', { class: 'tb-item' }, h('span', { class: 'tb-name', text: name }), light, h('span', { class: 'tb-where' }, where()));
        items[id] = { li, light };
        return li;
      }))
    )
  );
  const steps = h('ol', { class: 'demo-steps tb-steps', 'aria-hidden': 'true' }, [1, 2, 3, 4, 5].map(() => h('li')));
  const wire = h('ol', { class: 'tb-hops recess', 'aria-label': 'On the wire' });
  const log = ledger({ title: 'The ledger of the run', file: 'ledger.jsonl', empty: 'No run yet.' });
  const clean = led('grey', 'No line of the ledger holds a token', { still: true });
  clean.hidden = true;

  // The zones and the wire follow the width of the card, not of the window:
  // the card is narrow beside the list pane of a medium window.
  d.stage.append(h('div', { class: 'tb-body' },
    steps,
    h('div', { class: 'tb-zones' }, zones),
    h('div', { class: 'tb-wire' }, h('span', { class: 'demo-label', text: 'On the wire' }), wire),
    h('div', { class: 'tb-side' }, log.el, clean)
  ));

  let busy = false;
  let at = 0;

  function set(id, tone, word, mark) {
    items[id].light.set(tone, word, { still: true });
    if (mark) items[id].li.classList.add('on');
  }
  function unmark() {
    for (const r of Object.values(items)) r.li.classList.remove('on');
  }
  function progress(n) {
    at = n;
    [...steps.children].forEach((li, i) => li.classList.toggle('done', i < n));
  }
  // A line of the wire is "who → who" and what goes, split at three spaces.
  function wireLines(lines) {
    wire.textContent = '';
    for (const l of lines) {
      const m = l.match(/^(\S.*?)\s{3,}(.*)$/);
      if (!m) {
        wire.append(h('li', { class: 'tb-hop tb-none', text: l.trim() }));
        continue;
      }
      wire.append(h('li', { class: 'tb-hop' }, h('span', { class: 'tb-who', text: m[1] }), h('span', { class: 'tb-what', text: m[2] })));
    }
  }

  // seq plays the parts of one step: a function, then a pause. A step that
  // sends nothing across a wall leaves the wire as the last step left it.
  async function seq(parts, sentence, next) {
    if (busy) return;
    busy = true;
    d.setKeys([]);
    unmark();
    const lines = [];
    for (const p of parts) {
      p(lines);
      if (lines.length) wireLines(lines);
      await wait(520);
    }
    busy = false;
    d.say(sentence);
    next();
  }

  const signIn = () => seq([
    (w) => w.push('browser → front    GET /ui/signin'),
    (w) => w.push('browser → issuer   sign in: code flow with PKCE'),
    (w) => {
      w.push('browser → front    GET /ui/callback');
      w.push('front → issuer     exchange the code for the token');
    },
    (w) => {
      w.push('front → browser    the token, for sessionStorage["fw.token"]');
      set('signin', 'green', 'held', true);
      d.setStatus('grey', 'signed in');
      progress(1);
    },
  ], 'You signed in at the front with OpenID Connect. The page keeps the token in its tab and sends it as a bearer token to /v1. The token never leaves the front for a worker.', render);

  const startRun = () => seq([
    (w) => w.push('browser → front    POST /v1/runs, with the sign-in token'),
    (w) => {
      w.push('front → worker     through the router, with FW_API_TOKEN, in the name of ' + WHO);
      log.append('fw.run.queued', 'principal ' + WHO);
    },
    (w) => {
      log.append('fw.run.started', 'agent triage');
      d.setStatus('green', 'running');
      progress(2);
    },
  ], 'The run belongs to you: fw.run.queued names you as its principal. Your sign-in token stayed at the front. The front spoke to the worker with the fleet token and named you.', render);

  const callTool = () => seq([
    () => {
      log.append('fw.model.responded', 'stop tool_use');
      log.append('fw.tool.requested', 'tickets.create_issue');
    },
    (w) => {
      w.push('worker → front     POST /v1/tokens, with FW_API_TOKEN: {"subject": "' + WHO + '", "server": "tickets", "run": "' + RUN + '"}');
    },
    (w) => {
      w.push('front → worker     409 {"reason": "not-connected"}');
      log.append('fw.approval.requested', 'connect tickets, missing', { tone: 'amber' });
      d.setStatus('amber', 'needs you');
      progress(3);
    },
  ], 'The worker holds no grant, so it asked the front for your token. The front found the run in its fleet records and saw that you started it. You never connected Tickets, so the run waits for you.', render);

  const connect = () => seq([
    (w) => w.push('browser → front    POST /v1/connections/tickets'),
    (w) => w.push('browser → auth     sign in at Tickets: code flow, PKCE'),
    (w) => {
      w.push('browser → front    GET /ui/connect/callback');
      w.push('front → auth       exchange the code: a refresh token');
    },
    (w) => {
      w.push('front              stores the grant, encrypted');
      set('grant', 'green', 'held', true);
    },
    (w) => {
      w.push('front → bus        fw.connection.connected on fw.connections');
      log.append('fw.approval.decided', 'allow, by ' + WHO + ', connected');
      d.setStatus('green', 'running');
      progress(4);
    },
    (w) => {
      w.length = 0;
      w.push('worker → front     POST /v1/tokens, the same request');
      w.push('front → auth       refresh the grant for the resource tickets');
      set('frontToken', 'green', 'held', true);
    },
    (w) => {
      w.push('front → worker     200 {"token": "eyJhbGciOi…", "expiresAt": "…"}');
      set('taskToken', 'green', 'held', true);
    },
    (w) => {
      w.push('worker → tickets   POST /mcp, Authorization: Bearer eyJhbGciOi…');
      log.append('fw.tool.responded', 'created the ticket INC-42');
    },
    () => {
      log.append('fw.model.responded', 'stop end_turn');
      log.append('fw.run.finished', 'outcome completed', { tone: 'grey' });
      clean.hidden = false;
      d.setStatus('grey', 'completed');
      progress(5);
    },
  ], 'The front keeps the grant and told the workers on the bus. The worker asked again and got a short-lived token. The token went in a header of the call, not in its input, so no line of the ledger holds it.', render);

  const skip = () => seq([
    () => log.append('fw.approval.decided', 'deny, by ' + WHO),
    () => log.append('fw.tool.responded', 'error: the person did not connect the service'),
    () => {
      log.append('fw.model.responded', 'stop end_turn');
      log.append('fw.run.finished', 'outcome completed', { tone: 'grey' });
      d.setStatus('grey', 'completed');
      progress(5);
    },
  ], 'Skip denies the request. The call fails with a plain message to the model, and the run does not ask again for Tickets. Nothing reached the grant store.', () => d.setKeys([]));

  const disconnect = () => seq([
    (w) => {
      w.length = 0;
      w.push('browser → front    DELETE /v1/connections/tickets');
    },
    (w) => {
      w.push('front              deletes the grant, and revokes it where the server offers that');
      set('grant', 'grey', 'deleted', true);
      set('frontToken', 'grey', 'dropped', true);
    },
    (w) => {
      w.push('front → bus        fw.connection.disconnected on fw.connections');
      set('taskToken', 'grey', 'dropped', true);
      d.setStatus('grey', 'disconnected');
    },
  ], 'Every worker dropped your cached tokens at once, without waiting for them to expire. The next call that needs Tickets asks you to connect again.', () => d.setKeys([]));

  function render() {
    const k = (label, kind, fn) => key(label, { kind, onClick: fn });
    const keys = [
      [k('Sign in', 'primary', signIn)],
      [k('Start a run', 'primary', startRun)],
      [k('The model calls Tickets', 'primary', callTool)],
      [k('Skip', 'secondary', skip), k('Connect Tickets', 'primary', connect)],
      [],
      [k('Disconnect Tickets', 'primary', disconnect)],
    ];
    d.setKeys(keys[at] || []);
  }

  function init() {
    for (const [id, [tone, word]] of Object.entries(START)) set(id, tone, word);
    unmark();
    log.clear();
    clean.hidden = true;
    wireLines(['Nothing has crossed a wall yet.']);
    d.setStatus('grey', 'signed out');
    progress(0);
  }

  d.reset(() => {
    if (busy) return;
    init();
    d.say('');
    render();
  });
  init();
  render();
}
