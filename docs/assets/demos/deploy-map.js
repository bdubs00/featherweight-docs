// The parts of a fleet deployment as a map. The reader picks a part to read
// what it is, its main configuration keys, and what it talks to, or presses
// a key that traces one path through the parts, one step at a time.
//
// The names come from the code of the workbench and the kernel: the keys of
// workbench.fleet in fleet/config.go and section 4.6 of the workbench
// architecture, the RPCs ListTasks, SuspendTask, and ResumeTask that
// fleet/suspend.go calls, the routes of bossmode in bossmode/routes.go, the
// token broker POST /v1/tokens in connections/broker.go, the grant store
// keys in connections/config.go, the fleet series in fleet/metrics.go, and
// the egress of a Task (spec.egress.hosts) in ax/manifest.go of the kernel.

import { h, css, demo, key, chip, code, ledger, workers, wait } from './kit.js';

css('deploy-map', `
.dm-map { display: flex; flex-direction: column; gap: var(--s-3); }
.dm-zones { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: var(--s-3); align-items: start; }
@container (max-width: 520px) { .dm-zones { grid-template-columns: minmax(0, 1fr); } }
.dm-zone { display: flex; flex-direction: column; gap: 6px; padding: 8px; border-radius: var(--r); background: var(--recess); box-shadow: var(--e-recess); min-width: 0; }
.dm-zone > .demo-label { margin: 0 2px 2px; }
.dm-node { min-width: 0; border: 1px solid var(--line); border-radius: var(--r); background: var(--paper); }
.dm-node.on { background: var(--raised); border-color: var(--ink); box-shadow: var(--e-row); }
.dm-node.dim { background: none; }
.dm-node.dim .dm-name { color: var(--muted); }
.dm-pick { appearance: none; display: flex; align-items: center; gap: var(--s-2); width: 100%; min-height: 48px; padding: 6px 10px; border: 0; border-radius: var(--r); background: none; color: var(--ink); font: inherit; text-align: left; cursor: pointer; }
.dm-pick:focus-visible { outline: 2px solid var(--ink); outline-offset: -2px; }
.dm-label { display: flex; flex-direction: column; min-width: 0; }
.dm-name { font-size: var(--t-control); line-height: var(--t-control-lh); font-weight: 700; }
.dm-sub { font-size: var(--t-meta); line-height: var(--t-meta-lh); color: var(--muted); }
.dm-steps { display: flex; flex: none; gap: 4px; margin-left: auto; }
.dm-node .workers { margin: 0 8px 8px; }
.dm-node .worker { min-height: 26px; font-size: var(--t-meta); }
.dm-below { margin-top: var(--s-4); }
.dm-detail { display: flex; flex-direction: column; gap: var(--s-2); min-width: 0; }
.doc .dm-dname { margin: 0; font-size: var(--t-control); line-height: var(--t-control-lh); font-weight: 800; }
.doc .dm-what { margin: 0; font-size: var(--t-control); line-height: var(--t-control-lh); }
.doc .dm-keys { display: flex; flex-direction: column; gap: 4px; margin: 0; padding: 0; list-style: none; }
.doc .dm-keys > li { display: flex; flex-direction: column; margin: 0; padding: 4px 8px; border-left: 2px solid var(--line); }
.dm-keys code { align-self: flex-start; font-size: var(--t-caption); overflow-wrap: anywhere; }
.dm-keys span { font-size: var(--t-meta); line-height: var(--t-meta-lh); color: var(--muted); }
.dm-talks { display: flex; flex-wrap: wrap; gap: 6px; }
`);

// rich turns a sentence with `code` spans into nodes.
function rich(text) {
  return text.split('`').map((part, i) => (i % 2 ? code(part) : part));
}

// The parts. zone: people, cluster, or ax. keys: [the key, what it does].
const PARTS = {
  you: {
    zone: 'people',
    name: 'You',
    sub: 'bossmode in a browser, Claude Code over MCP',
    what: 'People reach the whole fleet at one address. A browser opens bossmode, and an MCP client such as Claude Code calls the tools of the front.',
    keys: [
      ['/bossmode/', 'the page, with workbench.bossmode.enabled'],
      ['/mcp', 'the MCP server over Streamable HTTP'],
      ['/ui/signin', 'the browser sign-in, with auth.oidc.clientId'],
    ],
    talks: ['front'],
  },
  front: {
    zone: 'cluster',
    name: 'The front',
    sub: 'fw-workbench, a Deployment',
    what: 'One or more replicas of fw-workbench outside the sandboxes. It runs no agent of its own. It signs people in, keeps their grants, queues jobs, keeps the pools, and puts idle Tasks to sleep.',
    keys: [
      ['workbench.fleet.atespaces', 'the atespaces whose Tasks are members'],
      ['workbench.fleet.egress', 'the stream of events it reads, such as fw.events'],
      ['workbench.fleet.intake', 'the prefix of the job queues, such as fw.jobs'],
      ['workbench.fleet.suspendAfter', 'the idle time before a suspend, 10m by default'],
      ['FW_API_TOKEN', 'the static token that every process of the fleet shares'],
    ],
    talks: ['you', 'nats', 'axapi', 'router', 'grants', 'prom'],
  },
  nats: {
    zone: 'cluster',
    name: 'NATS JetStream',
    sub: 'the bus: queues, events, shared state',
    what: 'It carries the jobs to the workers and their events back to the front. Its key-value buckets hold what every replica of the front shares: pools, bridges, the wiki, and duties.',
    keys: [
      ['bus.url', 'nats://...:4222 for the front, ws://...:8080 for a worker'],
      ['bus.options.stream', 'the JetStream stream, FW by default'],
      ['fw.jobs.<agent>', 'the queue of the pool that runs an agent'],
      ['fw.events', 'the egress stream of every worker'],
    ],
    talks: ['front', 'workers'],
  },
  grants: {
    zone: 'cluster',
    name: 'The grant store',
    sub: 'a volume of the front',
    what: 'The refresh tokens that people give the workbench when they connect a service, encrypted. Only the front reads it, so no refresh token enters a sandbox.',
    keys: [
      ['FW_WORKBENCH_GRANTS_DIR', 'the directory, <home>/grants by default'],
      ['FW_GRANT_KEY', 'the key that encrypts the store, the same on every replica'],
      ['workbench.grants.store', 'file, the default, or memory'],
    ],
    talks: ['front'],
  },
  model: {
    zone: 'cluster',
    name: 'The model proxy',
    sub: 'a Service with a name in the cluster',
    what: 'It forwards model calls to the model server and adds the key, so no sandbox holds the key. An egress host is a DNS name, so the proxy gives the model a name inside the cluster.',
    keys: [
      ['providers.openai.baseUrl', 'the address of the proxy, in the configuration of the workers'],
      ['apiKeyEnv', 'the variable of the key, which holds a placeholder'],
      ['model', 'the provider/model selector, with no default'],
    ],
    talks: ['workers'],
  },
  prom: {
    zone: 'cluster',
    name: 'Prometheus',
    sub: 'with an OpenTelemetry collector',
    what: 'Prometheus scrapes the front, which counts the queues, the dead letters, and the ends of runs without a request to a Task. Workers push their own metrics to a collector, because a scrape wakes a sleeping Task.',
    keys: [
      ['/metrics', 'no authentication, so keep it inside the cluster'],
      ['fw.dev/scrape: "true"', 'the pod label for the front, never for a Task'],
      ['OTEL_EXPORTER_OTLP_ENDPOINT', 'the collector that a worker pushes to'],
    ],
    talks: ['front', 'workers'],
  },
  axapi: {
    zone: 'ax',
    name: 'The AX API',
    sub: 'ax-server: the Task list',
    what: 'It lists, creates, suspends, resumes, and deletes Tasks. The front reads the Task list at every interval and keeps the pools through it. It has no authentication, so only the front and a Task that starts child Tasks reach it.',
    keys: [
      ['ax.server', 'ax-server.ax-system.svc.cluster.local:8080'],
      ['workbench.fleet.interval', 'the time between two reads, 30s by default'],
    ],
    talks: ['front', 'workers'],
  },
  router: {
    zone: 'ax',
    name: 'The atenet router',
    sub: 'the one door into a Task',
    what: 'Every request to a Task goes through it with a header that names the Task. A request to a sleeping Task wakes the Task first.',
    keys: [
      ['ax.router', 'atenet-router.ate-system.svc.cluster.local'],
      ['ate-target-actor', 'the header: <atespace>/<task>'],
    ],
    talks: ['front', 'workers'],
  },
  workers: {
    zone: 'ax',
    name: 'Worker Tasks',
    sub: 'one fw each, in a gVisor sandbox',
    what: 'Each Task runs one fw as PID 1, with its ledger on /workspace, which survives a suspend. A pool keeps a number of them. The egress policy of each Task lists the only hosts that it can reach.',
    keys: [
      ['spec.egress.hosts', 'the hosts that the Task can reach, and no other'],
      ['bus.intake', 'the queue it takes jobs from'],
      ['bus.egress', 'the subject it publishes its events on'],
      ['tokens.url', 'the token broker of the front'],
    ],
    talks: ['nats', 'model', 'router', 'front', 'prom', 'axapi'],
  },
};

const ZONES = [
  ['people', 'People'],
  ['cluster', 'The cluster'],
  ['ax', 'AX and Agent Substrate'],
];

const RACK = ['triage-0', 'triage-1', 'manager-0'];

// The paths. Each step: the part, the real name, the sentence, and an
// optional change of the rack of workers.
const PATHS = [
  {
    label: 'A job from Claude Code',
    kind: 'primary',
    steps: [
      ['you', 'enqueue', 'Claude Code calls the tool `enqueue` on `/mcp` with a profile, `triage`, and one item per run.'],
      ['nats', 'fw.jobs.triage', 'The front puts one run request per item on the queue of the pool that runs the profile.'],
      ['router', 'GET /v1/status', 'A sleeping Task reads no queue. The front reads the status of each sleeping Task of the pool through the router, and the router wakes it.', { 'triage-0': ['starting', 'waking'], 'triage-1': ['starting', 'waking'] }],
      ['workers', 'bus.intake', 'Each worker takes a job when it has a free run slot. It acknowledges the job once the run is in its ledger.', { 'triage-0': ['working', 'working'], 'triage-1': ['working', 'working'] }],
      ['model', 'baseUrl', 'Each run calls the model through the proxy, which adds the key. The sandbox never holds it.'],
      ['nats', 'fw.events', 'The worker publishes the events of the run on the egress stream.'],
      ['front', 'batch', 'The front builds its view from the stream. The tool `batch` tells Claude Code how the job goes.', { 'triage-0': ['awake', 'idle'], 'triage-1': ['awake', 'idle'] }],
      ['axapi', 'SuspendTask', 'A Task that stays idle for `workbench.fleet.suspendAfter` goes to sleep through the AX API. It costs nothing until the next job.', { 'triage-0': ['asleep', 'asleep'], 'triage-1': ['asleep', 'asleep'] }],
    ],
  },
  {
    label: 'A person opens bossmode',
    steps: [
      ['you', 'GET /bossmode/', 'The browser loads the page from the front. The files hold no data.'],
      ['front', '/v1/bossmode/stream', 'The person signs in. The page reads its settings at `GET /v1/bossmode` and opens one stream of live events.'],
      ['axapi', 'ListTasks', 'The stream carries the members and their Tasks, which the front reads from the AX API at every interval.'],
      ['nats', 'fw.events', 'The stream also carries the runs of every worker, which the front reads from the egress stream. The page never asks a Task, so it wakes nobody.'],
      ['router', 'POST /v1/runs', 'The person writes to the manager. The front decides for the person and forwards the run to `?member=default/manager-0` through the router, with the static token and the header `Fw-On-Behalf-Of`.', { 'manager-0': ['starting', 'waking'] }],
      ['workers', 'manager-0', 'The router wakes the Task of the manager in about five seconds, and the run starts as the person.', { 'manager-0': ['working', 'working'] }],
      ['axapi', 'ResumeTask', 'A wake through the router does not change the phase on the AX API, so the front calls `ResumeTask` after the Task answers.'],
    ],
  },
  {
    label: 'An agent acts as you',
    steps: [
      ['workers', 'grant: user', 'A run calls an MCP server whose entry has `auth.oauth.grant: user`, so the call acts for the person who started the run.', { 'triage-0': ['working', 'working'] }],
      ['front', 'POST /v1/tokens', 'The worker asks the token broker of the front, at `tokens.url`, and presents the static token.'],
      ['grants', 'FW_GRANT_KEY', 'The front reads the grant of the person from its store and refreshes it. It stores a new refresh token before it uses the new access token.'],
      ['workers', 'access token', 'The worker gets a short-lived access token for this run and calls the service. If the person never connected the service, the run waits for them instead.'],
    ],
  },
  {
    label: 'Metrics, no wake',
    steps: [
      ['workers', 'OTEL_EXPORTER_OTLP_ENDPOINT', 'A worker pushes its metrics, its ledger as logs, and its traces while it runs. Asleep, it pushes nothing.', { 'triage-0': ['working', 'working'] }],
      ['prom', ':4318', 'The collector takes OTLP over HTTP and serves the metrics of every pusher to Prometheus.', { 'triage-0': ['asleep', 'asleep'] }],
      ['front', '/metrics', 'Prometheus scrapes the front for `fw_fleet_queue_pending`, `fw_fleet_dead_letters_total`, and `fw_fleet_runs_finished_total`. The front reads only what it holds, so the scrape wakes no Task.'],
      ['prom', 'fw.dev/scrape', 'The label goes on the pods of the front, never on a Task. A scrape every 30 seconds keeps a Task awake.'],
    ],
  },
];

export default function mount(root) {
  const d = demo(root, {
    title: 'The parts of a fleet, and the paths through them',
    tone: 'grey',
    word: 'at rest',
    wide: true,
    caption: 'A model of a fleet deployment. The keys, routes, subjects, and RPCs are the ones in the code of the workbench and the kernel.',
  });

  const nodes = {};
  let rack = null;

  function node(id) {
    const p = PARTS[id];
    const steps = h('span', { class: 'dm-steps' });
    // No lamp: the raised edge marks the part in view, and the chips number
    // the steps of a path that passed through it.
    const pick = h('button', { type: 'button', class: 'dm-pick', 'aria-pressed': 'false', on: { click: () => show(id) } },
      h('span', { class: 'dm-label' }, h('span', { class: 'dm-name', text: p.name }), h('span', { class: 'dm-sub', text: p.sub })),
      steps);
    const el = h('div', { class: 'dm-node', 'data-part': id }, pick);
    if (id === 'workers') {
      rack = workers(RACK.map((name) => ({ name, state: 'asleep', word: 'asleep' })));
      el.append(rack.el);
    }
    nodes[id] = { el, pick, steps, marks: [] };
    return el;
  }

  const zone = (z, label) => h('div', { class: 'dm-zone' }, h('span', { class: 'demo-label', text: label }),
    Object.keys(PARTS).filter((id) => PARTS[id].zone === z).map(node));

  const map = h('div', { class: 'dm-map' },
    zone(...ZONES[0]),
    h('div', { class: 'dm-zones' }, zone(...ZONES[1]), zone(...ZONES[2])));

  const detail = h('div', { class: 'dm-detail', 'aria-live': 'polite' });
  const path = ledger({ title: 'The path', empty: 'Press a key below to trace one path through the parts.', onPick: (i) => replay(i) });
  d.stage.append(map, h('div', { class: 'demo-split dm-below' }, detail, path.el));

  let picked = 'front';
  let trace = [];
  let busy = false;
  // mode is explore, where a picked part lights what it talks to, or trace,
  // where the parts of the path stay lit.
  let mode = 'explore';

  function paintNodes() {
    const linked = mode === 'explore' ? PARTS[picked].talks : [];
    for (const [id, n] of Object.entries(nodes)) {
      const on = id === picked;
      n.el.classList.toggle('on', on);
      n.el.classList.toggle('linked', !on && linked.includes(id));
      n.el.classList.toggle('dim', mode === 'trace' ? !on && !n.marks.length : !on && !linked.includes(id));
      n.pick.setAttribute('aria-pressed', on ? 'true' : 'false');
      n.steps.textContent = '';
      for (const m of n.marks) n.steps.append(chip(String(m), m === trace.length && busy ? 'ink' : 'plain'));
    }
  }

  function paintDetail() {
    const p = PARTS[picked];
    detail.textContent = '';
    detail.append(
      h('span', { class: 'demo-label', text: 'The part' }),
      h('p', { class: 'dm-dname', text: p.name }),
      h('p', { class: 'dm-what' }, rich(p.what)),
      h('span', { class: 'demo-label', text: 'Main keys' }),
      h('ul', { class: 'dm-keys' }, p.keys.map(([k, v]) => h('li', null, code(k), h('span', { text: v })))),
      h('span', { class: 'demo-label', text: 'Talks to' }),
      h('div', { class: 'dm-talks' }, p.talks.map((t) => key(PARTS[t].name, { kind: 'quiet', size: 's', onClick: () => pickFromDetail(t) }))));
  }

  function show(id) {
    if (busy) return;
    mode = 'explore';
    picked = id;
    path.pick(-1);
    paintNodes();
    paintDetail();
  }

  // A key under Talks to is redrawn with the detail, so the focus moves to
  // the part on the map that it picked.
  function pickFromDetail(id) {
    if (busy) return;
    show(id);
    nodes[id].pick.focus({ preventScroll: true });
  }

  function replay(i) {
    if (busy) return;
    const s = trace[i];
    if (!s) return;
    path.pick(i);
    mode = 'trace';
    picked = s.part;
    paintNodes();
    paintDetail();
    d.say(h('span', null, String(i + 1) + '. ', rich(s.text)));
  }

  function clearTrace() {
    trace = [];
    path.clear();
    for (const n of Object.values(nodes)) n.marks = [];
    for (const w of RACK) rack.set(w, 'asleep', 'asleep');
  }

  async function run(p) {
    if (busy) return;
    clearTrace();
    busy = true;
    mode = 'trace';
    d.setKeys([]);
    d.setStatus('green', 'tracing');
    d.say('');
    for (const [part, name, text, workersChange] of p.steps) {
      trace.push({ part, text });
      nodes[part].marks.push(trace.length);
      if (workersChange) for (const [w, [state, word]] of Object.entries(workersChange)) rack.set(w, state, word);
      picked = part;
      paintNodes();
      paintDetail();
      path.append(name, PARTS[part].name);
      d.say(h('span', null, String(trace.length) + '. ', rich(text)));
      await wait(1100);
    }
    busy = false;
    d.setStatus('grey', 'traced');
    paintNodes();
    render();
  }

  function render() {
    d.setKeys(PATHS.map((p) => key(p.label, { kind: p.kind || 'secondary', onClick: () => run(p) })));
  }

  d.reset(() => {
    if (busy) return;
    clearTrace();
    mode = 'explore';
    picked = 'front';
    d.setStatus('grey', 'at rest');
    d.say('');
    paintNodes();
    paintDetail();
  });

  paintNodes();
  paintDetail();
  render();
}
