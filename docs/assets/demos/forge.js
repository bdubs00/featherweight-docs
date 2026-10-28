// The forge: the opening movie of the home page. One person strikes once,
// and the strike becomes an agent that repeats every weekday, branches into
// child runs, keeps working through the night, sends its news to email,
// Slack, Teams, and a phone, and comes back to the person for one decision.
//
// The movie is a pure function of its clock: render(t) draws the frame at t
// seconds, so Pause, the chapter bar, and reduced motion all work by moving
// t. The canvas draws the screen; the subtitle under it and a live region
// carry the words for every reader.
//
// The facts it shows come from the code. The manager shows the readback of
// a duty (duty_preview) and saves it after the person agrees (duty_put). A
// readback reads "Every weekday at 9:00 AM, New York time." (the tests of
// duties/schedule). A run starts child runs with spawn_task, by default 16
// children per run and 32 runs per tree (spawn.maxChildren,
// spawn.maxDescendants in fw/config.go). While the owner of a duty is away,
// the manager decides its approvals, but never a question, a connect, or a
// destructive tool (workbench section 23.4). The channels of a person are
// ntfy, Slack, Discord, Teams, a webhook, and email, with a daily digest
// (the notify package).

import { h, css, key, reduced, markCells } from './kit.js';

css('forge', `
.doc > .demo.movie { max-width: 1120px; margin-top: var(--s-5); }
.mv-card { container-type: inline-size; }
.mv-screen { position: relative; aspect-ratio: 16 / 9; background: #1b1b19; border-bottom: 1px solid var(--edge); outline: none; }
.mv-screen:focus-visible { outline: 2px solid var(--ink); outline-offset: -4px; }
.mv-screen canvas { position: absolute; inset: 0; display: block; width: 100%; height: 100%; }
.doc .mv-sub { min-height: 60px; margin: 0; padding: var(--s-3) var(--s-5) 0; font-size: 17px; line-height: 26px; }
.mv-controls { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s-2) var(--s-3); padding: var(--s-2) var(--s-5) var(--s-4); }
.doc .mv-chapters { display: flex; flex: 1 1 360px; gap: 4px; min-width: 0; margin: 0; padding: 0; list-style: none; }
.doc .mv-chapters li { flex: 1 1 0; min-width: 0; margin: 0; }
.mv-chap { display: flex; flex-direction: column; gap: 6px; width: 100%; padding: 6px 0; border: 0; background: none; color: var(--muted); font-size: var(--t-caption); line-height: var(--t-caption-lh); font-weight: 600; text-align: left; cursor: pointer; }
.mv-chap:hover, .mv-chap.now { color: var(--ink); }
.mv-chap span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mv-bar { position: relative; height: 4px; border-radius: 2px; background: var(--line); overflow: hidden; }
.mv-bar i { position: absolute; top: 0; bottom: 0; left: 0; width: 0; background: var(--ink); }
.mv-time { flex: none; font-size: var(--t-meta); line-height: var(--t-meta-lh); color: var(--muted); font-variant-numeric: tabular-nums; }
.mv-keys { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s-2); }
@container (max-width: 600px) {
  .mv-chap > span:last-child { display: none; }
  .doc .mv-sub { min-height: 72px; padding: var(--s-2) var(--s-4) 0; font-size: 15px; line-height: 22px; }
  .mv-controls { padding: var(--s-2) var(--s-4) var(--s-3); }
}
`);

// ---------- the clock of the movie ----------

const W = 1600;
const H = 900;
const T2 = 7.5;
const T3 = 15.5;
const T4 = 25.5;
const T5 = 34;
const T6 = 42;
const TEND = T6 + 5.6;
const TOTAL = 50;

const CHAPTERS = [
  { t: 0, end: T2, at: 4.6, name: 'Strike once', title: 'Strike once.', sub: 'Tell the manager what you want, in plain words. It shows you the duty it will make, and one key saves it.' },
  { t: T2, end: T3, name: 'It repeats', title: 'It repeats.', sub: 'Every weekday at 9, the duty wakes the agent. It does the work, sends you the summary, and goes back to sleep.' },
  { t: T3, end: T4, name: 'It branches', title: 'It branches.', sub: 'A run can hand parts of its work to child runs, each in a sandbox of its own. Limits bound every tree: by default 16 children per run and 32 runs per tree.' },
  { t: T4, end: T5, name: 'While you are away', title: 'It works while you are away.', sub: 'A sleeping sandbox costs nothing. For a duty, the manager can decide routine approvals while you are away. Questions and destructive tools wait for you.' },
  { t: T5, end: T6, name: 'The news finds you', title: 'The news finds you.', sub: 'Reports, failures, and questions reach you where you are: email, Slack, Microsoft Teams, Discord, or your phone. A daily digest sums up the day.' },
  { t: T6, end: TOTAL, name: 'One click to decide', title: 'One click to decide.', sub: 'When something needs you, you decide in one click, from anywhere. The work goes on from the step where it stopped.' },
];
const POSTER = 6.6;

// The screen is a display window set into the faceplate, so it keeps the
// graphite values of bossmode in both themes. The orange of the sparks is
// the signal orange of the primary key: the strike is the press of that key.
const P = {
  bg: '#1b1b19', vig: '#2a2a27', grid: '#2f2f2c', line: '#3d3d39', line2: '#55554f', ink: '#f3f3ef', muted: '#b8b8b0', dim: '#8a8a82',
  sleep: '#6c6c65', green: '#1e9e45', greenHi: '#4ccb70', amber: '#f0a400', accent: '#ff4d00', hot: '#fff3e0', card: '#33332f', edge: '#0b0b0a', recess: '#262623', key: '#44443f',
};
const HUES = ['#7fa1e8', '#e8905a', '#7cc47a', '#b89ae0', '#d9b45a', '#6cc4cc', '#e88aa8', '#a9b6c6'];
const SANS = '"Archivo Variable", Archivo, system-ui, sans-serif';
const MONO = 'ui-monospace, Menlo, Consolas, "Liberation Mono", monospace';

const REQUEST = 'Every weekday at 9, triage the new incidents and send me a summary.';
const REPLY = 'I can make that a duty. It wakes triage, which reads the new incidents and sends you a summary.';
const READBACK = 'Every weekday at 9:00 AM, New York time.';
const COMMAND = 'git push origin fix/alert-rules';

// ---------- small math ----------

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const seg = (t, a, b) => clamp((t - a) / (b - a));
const lerp = (a, b, x) => a + (b - a) * x;
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const easeOut = (x) => 1 - Math.pow(1 - x, 3);
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a, b, x) {
  const p = rgb(a);
  const q = rgb(b);
  return `rgb(${Math.round(lerp(p[0], q[0], x))},${Math.round(lerp(p[1], q[1], x))},${Math.round(lerp(p[2], q[2], x))})`;
}
function upper(sorted, t) {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (sorted[m] <= t) lo = m + 1;
    else hi = m;
  }
  return lo;
}
const fmt = (n) => n.toLocaleString('en-US');

// ---------- the data of the movie, made once from a fixed seed ----------

const R = rng(20261027);
const GLYPH = markCells('triage');
const MANAGER = markCells('manager');
const FORGE_ORDER = GLYPH.cells.map((on, i) => (on ? i : -1)).filter((i) => i >= 0).sort(() => R() - 0.5);

// Chapter 2: one run on each weekday of a year that starts on a Monday.
const RUN_DAYS = [];
for (let d = 0; d < 365; d++) if (d % 7 < 5) RUN_DAYS.push(d);
const TX0 = 320;
function dayAt(u) {
  if (u < 1) return -1;
  if (u < 3.6) return ((u - 1) / 2.6) * 13.5;
  const x = seg(u, 3.6, 7.0);
  return 13.5 + 351 * x * x;
}
function pxPerDay(u) {
  return Math.exp(lerp(Math.log(1180 / 14), Math.log(1180 / 365), ease(seg(u, 3.4, 6.6))));
}
const dayX = (d, u) => TX0 + 14 + (d + 0.5) * pxPerDay(u);
const RUN_T = RUN_DAYS.map((d) => {
  let lo = 1;
  let hi = 7.2;
  for (let k = 0; k < 30; k++) {
    const m = (lo + hi) / 2;
    if (dayAt(m) < d) lo = m;
    else hi = m;
  }
  return T2 + hi;
});

// Chapter 3: the 261 runs wrap into a circle, and each run grows a tree of
// child runs, at most 32 runs under its root.
const NODES = [{ x: 0, y: 0, p: -1, b: 0, depth: 0, ang: 0, r: 0 }];
const pick = (list) => list[Math.floor(R() * list.length)];
function child(pi, depth, spread, dr, b) {
  const p = NODES[pi];
  const ang = p.ang + (R() - 0.5) * spread;
  const r = p.r + dr;
  NODES.push({ x: Math.cos(ang) * r, y: Math.sin(ang) * r, p: pi, b, depth, ang, r, work: 0.6 + R() * 1.8 });
  return NODES.length - 1;
}
RUN_DAYS.forEach((d, i) => {
  const ang = -Math.PI / 2 + (Math.PI * 2 * i) / RUN_DAYS.length;
  const r = 150 + R() * 24;
  const fly = T3 + 0.2 + (0.6 * i) / RUN_DAYS.length;
  NODES.push({ x: Math.cos(ang) * r, y: Math.sin(ang) * r, p: 0, b: fly + 0.9, fly, depth: 1, ang, r, run: i, day: d, work: 0 });
  const l1 = NODES.length - 1;
  let left = 32;
  const kids = pick([0, 1, 2, 3, 3, 4, 4, 5, 6]);
  for (let k = 0; k < kids && left > 0; k++, left--) {
    const l2 = child(l1, 2, 0.05, 85 + R() * 45, T3 + 1.5 + (2.6 * i) / RUN_DAYS.length + R() * 0.7);
    if (R() < 0.7) {
      const n3 = pick([1, 2, 2, 3]);
      for (let j = 0; j < n3 && left > 0; j++, left--) {
        const l3 = child(l2, 3, 0.035, 75 + R() * 40, NODES[l2].b + 0.45 + R() * 0.8);
        if (R() < 0.4) {
          const n4 = pick([1, 1, 2]);
          for (let q = 0; q < n4 && left > 0; q++, left--) child(l3, 4, 0.025, 65 + R() * 35, NODES[l3].b + 0.4 + R() * 0.7);
        }
      }
    }
  }
});
const RMAX = NODES.reduce((m, n) => Math.max(m, n.r), 1);
const KID_BIRTHS = NODES.filter((n) => n.depth >= 2).map((n) => n.b).sort((a, b) => a - b);
for (const n of NODES) {
  const turn = ((n.ang + Math.PI / 2 + Math.PI * 4) % (Math.PI * 2)) / (Math.PI * 2);
  n.w1 = R() < 0.32 ? T4 + 2.0 + turn * 1.1 : 0;
  n.w2 = R() < 0.32 ? T4 + 5.0 + turn * 1.1 : 0;
  n.wl = 0.8 + R() * 0.8;
  n.rip = T6 + 3.0 + (n.r / RMAX) * 1.5;
}
function nearest(angle, depth) {
  let best = 1;
  let gap = 9;
  NODES.forEach((n, i) => {
    if (n.depth !== depth) return;
    const g = Math.abs(Math.atan2(Math.sin(n.ang - angle), Math.cos(n.ang - angle)));
    if (g < gap) {
      gap = g;
      best = i;
    }
  });
  return best;
}
const NODE_A = nearest(-0.9, 3);
const NODE_B = nearest(2.5, 3);
const A_ON = T4 + 2.8;
const A_OK = T4 + 4.6;
const B_ON = T4 + 5.4;
const B_OK = T6 + 2.6;

// Chapter 5: the news flies to four channels of the person.
const TILES = ['Email', 'Slack', 'Microsoft Teams', 'Phone, through ntfy'];
const NEWS = [
  [1.2, 'Daily digest: 261 runs, 0 failed', 0],
  [1.55, 'triage: 3 new incidents, 2 closed', 1],
  [1.9, 'Summary posted to the Ops room', 2],
  [2.3, 'triage: the queue is empty', 1],
  [2.6, 'Failed: nightly backup, retried', 0],
  [3.0, 'Summary of the week is ready', 2],
  [3.35, 'triage: 1 incident of priority 1', 3],
  [3.8, 'triage: 5 new incidents, 5 closed', 1],
  [4.2, 'Daily digest of the team', 0],
  [4.6, 'Summary posted to the Ops room', 2],
  [5.4, 'Needs you: git push', 3],
].map(([at, text, tile]) => ({ at: T5 + at, arrive: T5 + at + 0.9, text, tile, from: text.startsWith('Needs you') ? NODE_B : 1 + Math.floor(R() * (NODES.length - 1)) }));

// The sparks of the two strikes.
function sparks(seed, n, x, y, t0, power) {
  const r = rng(seed);
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (r() - 0.5) * Math.PI * 1.8;
    const sp = power * (0.3 + r() * 0.95);
    out.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t0: t0 + r() * 0.07, life: 0.7 + r() * 1.4, size: 1.6 + r() * 2.8 });
  }
  return out;
}
const PRESS1 = 3.95;
const STRIKE1 = 4.05;
const KEY1 = { x: 1004, y: 598, w: 140, h: 46 };
const SPARKS1 = sparks(11, 280, KEY1.x + KEY1.w / 2, KEY1.y + KEY1.h / 2, STRIKE1, 1300);
// Embers drift up from the forge while the agent cools.
const EMBERS = (() => {
  const r = rng(31);
  return Array.from({ length: 46 }, () => ({ x: 800 + (r() - 0.5) * 260, y: 470 + r() * 60, t0: STRIKE1 + 0.2 + r() * 2.6, life: 1.4 + r() * 1.6, rise: 50 + r() * 70, sway: 8 + r() * 18, ph: r() * 6.28, size: 1.6 + r() * 2.2 }));
})();
const CARD = { x: 520, y: 300, w: 560, h: 252 };
const ALLOW = { x: CARD.x + CARD.w - 22 - 116, y: CARD.y + CARD.h - 22 - 44, w: 116, h: 44 };
const SPARKS2 = sparks(23, 110, ALLOW.x + ALLOW.w / 2, ALLOW.y + ALLOW.h / 2, B_OK, 760);

// ---------- drawing helpers ----------

function font(ctx, weight, size, stretch, family = SANS) {
  ctx.font = `${weight} ${size}px ${family}`;
  if ('fontStretch' in ctx) ctx.fontStretch = stretch || 'normal';
}
function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}
function wrap(ctx, text, max) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const next = line ? line + ' ' + w : w;
    if (ctx.measureText(next).width > max && line) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}
function lines(ctx, text, x, y, max, lh) {
  wrap(ctx, text, max).forEach((l, i) => ctx.fillText(l, x, y + i * lh));
}
function led(ctx, x, y, color, glow, size = 10) {
  ctx.save();
  if (glow) {
    ctx.shadowColor = color;
    ctx.shadowBlur = glow;
  }
  ctx.fillStyle = color;
  rrect(ctx, x, y, size, size, 2);
  ctx.fill();
  ctx.restore();
}
function keyCap(ctx, b, label, primary, pressed, alpha = 1) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  const dy = pressed ? 2 : 0;
  if (!pressed) {
    ctx.fillStyle = '#000';
    rrect(ctx, b.x, b.y + 2, b.w, b.h, 4);
    ctx.fill();
  }
  ctx.fillStyle = primary ? P.accent : P.key;
  rrect(ctx, b.x, b.y + dy, b.w, b.h, 4);
  ctx.fill();
  ctx.strokeStyle = primary ? '#000' : P.edge;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  font(ctx, primary ? 800 : 700, 17);
  ctx.fillStyle = primary ? '#000' : P.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, b.x + b.w / 2, b.y + b.h / 2 + dy + 1);
  ctx.restore();
}
function groove(ctx, x, y, w) {
  ctx.fillStyle = P.line;
  for (let k = 0; k < 3; k++) ctx.fillRect(x, y + k * 4, w, 1);
}
function drawMark(ctx, glyph, cx, cy, cs, colorOf, well = 1) {
  const size = cs * 5;
  const pad = cs * 0.9;
  if (well > 0) {
    ctx.save();
    ctx.globalAlpha *= well;
    ctx.fillStyle = P.card;
    rrect(ctx, cx - size / 2 - pad, cy - size / 2 - pad, size + pad * 2, size + pad * 2, Math.max(3, cs * 0.5));
    ctx.fill();
    ctx.strokeStyle = P.line2;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }
  glyph.cells.forEach((on, i) => {
    if (!on) return;
    const c = colorOf(i);
    if (!c) return;
    ctx.save();
    if (c.glow) {
      ctx.shadowColor = P.accent;
      ctx.shadowBlur = c.glow;
    }
    ctx.fillStyle = c.color;
    ctx.fillRect(cx - size / 2 + (i % 5) * cs, cy - size / 2 + Math.floor(i / 5) * cs, cs + 0.5, cs + 0.5);
    ctx.restore();
  });
}
function cursor(ctx, x, y, down) {
  ctx.save();
  ctx.translate(x, y);
  if (down) ctx.scale(0.9, 0.9);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 26);
  ctx.lineTo(7, 20);
  ctx.lineTo(12, 31);
  ctx.lineTo(17, 29);
  ctx.lineTo(12, 18);
  ctx.lineTo(21, 18);
  ctx.closePath();
  ctx.fillStyle = P.ink;
  ctx.fill();
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}
function drawSparks(ctx, list, t, dx = 0, dy = 0) {
  ctx.save();
  ctx.translate(dx, dy);
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  const k = 2.4;
  const g = 1100;
  for (const s of list) {
    const dt = t - s.t0;
    if (dt < 0 || dt > s.life) continue;
    const pos = (tt) => {
      const e = (1 - Math.exp(-k * tt)) / k;
      return [s.x + s.vx * e, s.y + (g / k) * tt + (s.vy - g / k) * e];
    };
    const [x, y] = pos(dt);
    const [px, py] = pos(Math.max(0, dt - 0.035));
    const a = dt / s.life;
    ctx.strokeStyle = a < 0.12 ? P.hot : a < 0.5 ? mix(P.hot, P.accent, (a - 0.12) / 0.38) : mix(P.accent, P.amber, (a - 0.5) / 0.5);
    ctx.globalAlpha = 1 - a * a;
    ctx.lineWidth = s.size * (1 - a * 0.5);
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(x, y);
    ctx.stroke();
  }
  ctx.restore();
}
function drawEmbers(ctx, t) {
  if (t < STRIKE1 || t > T2 + 1) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const e of EMBERS) {
    const dt = t - e.t0;
    if (dt < 0 || dt > e.life) continue;
    const a = dt / e.life;
    ctx.globalAlpha = Math.sin(a * Math.PI) * (0.6 + 0.4 * Math.sin(t * 13 + e.ph));
    ctx.fillStyle = a < 0.4 ? P.amber : P.accent;
    ctx.fillRect(e.x + Math.sin(dt * 2 + e.ph) * e.sway, e.y - e.rise * dt, e.size, e.size);
  }
  ctx.restore();
}

function flash(ctx, t, t0, x, y, strength) {
  const dt = t - t0;
  if (dt < 0 || dt > 0.9) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const a = Math.max(0, 1 - dt / 0.35) * strength;
  if (a > 0) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, 700);
    g.addColorStop(0, `rgba(255,243,224,${a})`);
    g.addColorStop(0.25, `rgba(255,77,0,${a * 0.45})`);
    g.addColorStop(1, 'rgba(255,77,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  const ring = easeOut(seg(dt, 0, 0.8));
  ctx.strokeStyle = `rgba(255,77,0,${(1 - ring) * 0.8})`;
  ctx.lineWidth = 3 * (1 - ring) + 0.5;
  ctx.beginPath();
  ctx.arc(x, y, 20 + ring * 520, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
function pill(ctx, x, y, text, color, alpha = 1, size = 14) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  font(ctx, 700, size);
  const w = ctx.measureText(text).width + 18;
  ctx.fillStyle = P.card;
  rrect(ctx, x - w / 2, y - 13, w, 26, 4);
  ctx.fill();
  ctx.strokeStyle = P.line2;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 1);
  ctx.restore();
}
function clock(hours) {
  const hh = Math.floor(hours) % 24;
  const mm = Math.floor((hours % 1) * 4) * 15;
  const ap = hh >= 12 ? 'PM' : 'AM';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${String(mm).padStart(2, '0')} ${ap}`;
}

// ---------- the scenes ----------

function cam(t) {
  if (t < T3) return { x: 800, y: 450, s: 1 };
  if (t < T4) return { x: 800, y: 450, s: lerp(1.28, 0.74, ease(seg(t - T3, 0.6, 8.6))) };
  if (t < T5) {
    const w = t - T4;
    return { x: 800, y: lerp(450, 470, ease(seg(w, 0, 1.5))), s: lerp(0.74, 0.62, ease(seg(w, 0, 2))) };
  }
  if (t < T6) {
    const k = ease(seg(t - T5, 0, 1.2));
    return { x: lerp(800, 560, k), y: 470, s: lerp(0.62, 0.58, k) };
  }
  const k = ease(seg(t - T6, 2.8, 4.4));
  return { x: lerp(560, 800, k), y: lerp(470, 450, k), s: lerp(0.58, 0.66, k) };
}

// The place and the cell size of the mark of the forged agent.
function markAt(t) {
  if (t < T2) return { x: 800, y: 400, cs: 22 };
  if (t < T3) {
    const k = ease(seg(t - T2, 0, 0.9));
    return { x: lerp(800, 210, k), y: lerp(400, 450, k), cs: lerp(22, 11, k) };
  }
  const c = cam(t);
  const k = ease(seg(t - T3, 0, 0.8));
  return { x: lerp(210, c.x, k), y: lerp(450, c.y, k), cs: lerp(11, 6, k) };
}

function forgedColor(t) {
  return (i) => {
    const order = FORGE_ORDER.indexOf(i);
    const t0 = STRIKE1 + 0.25 + order * 0.055;
    const dt = t - t0;
    if (dt < 0) return null;
    const hue = HUES[GLYPH.hue];
    if (dt < 0.15) return { color: P.hot, glow: 24 };
    if (dt < 0.5) return { color: mix(P.hot, P.accent, (dt - 0.15) / 0.35), glow: 18 };
    if (dt < 1.1) return { color: mix(P.accent, hue, (dt - 0.5) / 0.6), glow: 10 * (1 - (dt - 0.5) / 0.6) };
    return { color: hue };
  };
}

function sceneManagerChat(ctx, t) {
  if (t > STRIKE1 + 0.7) return;
  const fade = 1 - seg(t, STRIKE1, STRIKE1 + 0.55);
  const x = 440;
  const y = 196;
  const w = 720;
  const hgt = 470;
  ctx.save();
  ctx.globalAlpha = fade * seg(t, 0, 0.3);
  ctx.translate(800, 430);
  const sc = (1 - 0.03 * seg(t, STRIKE1, STRIKE1 + 0.55)) * zoom();
  ctx.scale(sc, sc);
  ctx.translate(-800, -430);
  ctx.fillStyle = P.card;
  rrect(ctx, x, y, w, hgt, 4);
  ctx.fill();
  ctx.strokeStyle = P.line2;
  ctx.lineWidth = 1;
  ctx.stroke();
  drawMark(ctx, MANAGER, x + 36, y + 30, 4, () => ({ color: P.ink }), 1);
  font(ctx, 800, 20, 'semi-expanded');
  ctx.fillStyle = P.ink;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillText('manager', x + 66, y + 37);
  font(ctx, 600, 15);
  ctx.fillStyle = P.muted;
  ctx.textAlign = 'right';
  ctx.fillText('Manager', x + w - 20, y + 37);
  groove(ctx, x, y + 58, w);

  // Your message, typed.
  ctx.textAlign = 'left';
  ctx.fillStyle = P.ink;
  rrect(ctx, x + 24, y + 86, 32, 32, 4);
  ctx.fill();
  font(ctx, 800, 13);
  ctx.fillStyle = '#000';
  ctx.textAlign = 'center';
  ctx.fillText('AL', x + 40, y + 107);
  ctx.textAlign = 'left';
  font(ctx, 700, 17);
  ctx.fillStyle = P.ink;
  ctx.fillText('You', x + 70, y + 100);
  const typed = REQUEST.slice(0, Math.floor(REQUEST.length * seg(t, 0.35, 2.35)));
  font(ctx, 400, 19);
  lines(ctx, typed, x + 70, y + 128, w - 100, 28);

  // The reply of the manager, with the readback and the key.
  const r = seg(t, 2.7, 3.0);
  if (r > 0) {
    ctx.save();
    ctx.globalAlpha *= r;
    drawMark(ctx, MANAGER, x + 40, y + 212, 4, () => ({ color: P.ink }), 1);
    font(ctx, 700, 17);
    ctx.fillStyle = P.ink;
    ctx.fillText('manager', x + 70, y + 206);
    font(ctx, 400, 19);
    lines(ctx, REPLY, x + 70, y + 234, w - 100, 28);
    ctx.fillStyle = P.recess;
    rrect(ctx, x + 70, y + 296, w - 100, 64, 4);
    ctx.fill();
    ctx.strokeStyle = P.line;
    ctx.stroke();
    font(ctx, 600, 13);
    ctx.fillStyle = P.muted;
    ctx.fillText('When', x + 86, y + 320);
    font(ctx, 600, 18);
    ctx.fillStyle = P.ink;
    ctx.fillText(READBACK, x + 86, y + 346);
    keyCap(ctx, KEY1, 'Save duty', true, t >= PRESS1 && t < PRESS1 + 0.18);
    ctx.restore();
  }
  // The pointer moves to the key and presses it.
  const m = ease(seg(t, 3.1, 3.85));
  if (t > 3.0 && t < STRIKE1 + 0.35) {
    ctx.save();
    ctx.globalAlpha = 1 - seg(t, STRIKE1 + 0.1, STRIKE1 + 0.35);
    cursor(ctx, lerp(1220, KEY1.x + 88, m), lerp(720, KEY1.y + 22, m), t >= PRESS1 && t < PRESS1 + 0.18);
    ctx.restore();
  }
  ctx.restore();
}

function sceneForge(ctx, t) {
  if (t < STRIKE1) return;
  const mk = markAt(t);
  // The glow of the anvil under the new agent.
  const glow = (1 - seg(t, STRIKE1 + 0.4, STRIKE1 + 2.4)) * seg(t, STRIKE1, STRIKE1 + 0.3);
  if (glow > 0 && t < T2 + 1) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(mk.x, mk.y, 0, mk.x, mk.y, 260);
    g.addColorStop(0, `rgba(255,77,0,${0.35 * glow})`);
    g.addColorStop(1, 'rgba(255,77,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(mk.x - 260, mk.y - 260, 520, 520);
    ctx.restore();
  }
  const well = t < T2 ? seg(t, STRIKE1 + 1.2, STRIKE1 + 1.8) : 1;
  drawMark(ctx, GLYPH, mk.x, mk.y, mk.cs, forgedColor(t), well);
  // The name and the readback under it, in chapters 1 and 2.
  const label = seg(t, STRIKE1 + 1.6, STRIKE1 + 2.0) * (1 - seg(t, T3 - 0.4, T3));
  if (label > 0) {
    ctx.save();
    ctx.globalAlpha = label;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const big = t < T2;
    font(ctx, 800, big ? 24 : 18, 'semi-expanded');
    ctx.fillStyle = P.ink;
    ctx.fillText('triage', mk.x, mk.y + mk.cs * 3.6 + (big ? 30 : 22));
    if (big) {
      font(ctx, 400, 17);
      ctx.fillStyle = P.muted;
      ctx.fillText('A new duty: ' + READBACK, mk.x, mk.y + mk.cs * 3.6 + 58);
    }
    ctx.restore();
  }
}

function sceneTimeline(ctx, t) {
  if (t < T2 || t > T3 + 1.2) return;
  const u = Math.min(t - T2, 7.6);
  const show = seg(t - T2, 0.5, 1.1) * (1 - seg(t, T3 - 0.1, T3 + 0.6));
  if (show <= 0) return;
  const pxd = pxPerDay(u);
  ctx.save();
  ctx.globalAlpha = show;
  // The track.
  ctx.strokeStyle = P.line2;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(TX0, 450);
  ctx.lineTo(lerp(TX0, 1520, seg(t - T2, 0.5, 1.1)), 450);
  ctx.stroke();
  // Day or week ticks.
  font(ctx, 600, 14);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  if (pxd > 30) {
    const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    for (let d = 0; d < 21; d++) {
      const x = dayX(d, u);
      if (x > 1510) break;
      const weekend = d % 7 >= 5;
      ctx.fillStyle = weekend ? P.sleep : P.dim;
      ctx.fillRect(x - 0.5, 462, 1, 8);
      ctx.fillText(names[d % 7], x, 492);
    }
  } else {
    for (let wk = 0; wk <= 52; wk++) {
      const x = dayX(wk * 7, u);
      if (x > 1515) break;
      ctx.fillStyle = P.sleep;
      ctx.fillRect(x - 0.5, 462, 1, wk % 13 === 0 ? 12 : 5);
      if (wk % 13 === 0 && wk > 0 && pxd < 12) {
        ctx.fillStyle = P.dim;
        ctx.fillText('Week ' + wk, x, 496);
      }
    }
  }
  // The runs: a lamp on each weekday that the clock has passed.
  const size = clamp(pxd * 0.55, 2.4, 12);
  const tall = 14;
  for (let i = 0; i < RUN_DAYS.length; i++) {
    const tr = RUN_T[i];
    if (t < tr) break;
    if (t > T3 + 0.2 + (0.6 * i) / RUN_DAYS.length) continue;
    const x = dayX(RUN_DAYS[i], u);
    if (x > 1515) continue;
    const age = t - tr;
    const color = age < 0.12 ? P.hot : age < 0.7 ? mix(P.greenHi, P.green, age / 0.7) : P.sleep;
    if (size >= 12) led(ctx, x - size / 2, 450 - size / 2, color, age < 0.7 ? 10 * (1 - age / 0.7) : 0, size);
    else {
      ctx.fillStyle = color;
      if (age < 0.7) {
        ctx.globalAlpha = 0.25 * show;
        ctx.fillRect(x - size * 1.5, 450 - tall, size * 3, tall * 2);
        ctx.globalAlpha = show;
      }
      ctx.fillRect(x - size / 2, 450 - tall / 2, size, tall);
    }
    // A pulse runs from the agent to each of the first runs.
    if (i < 10 && age < 0.25) {
      const mk = markAt(t);
      const px = lerp(mk.x + mk.cs * 4, x, age / 0.25);
      led(ctx, px - 3, 447, P.hot, 12, 6);
    }
    // The first summaries rise toward the person.
    if (i < 6 && age > 0.2 && age < 1.4) {
      const k = easeOut(seg(age, 0.2, 1.4));
      pill(ctx, lerp(x, 1360, k), lerp(430, 210, k), 'summary', P.ink, 1 - seg(age, 1.0, 1.4), 13);
    }
  }
  ctx.restore();
  // The counter and the calendar.
  const n = upper(RUN_T, t);
  const day = Math.max(0, Math.floor(dayAt(u)));
  counter(ctx, t, 'Runs this year', fmt(n), day <= 13 ? `Week ${Math.floor(day / 7) + 1}, ${['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][day % 7]}` : `Week ${Math.min(52, Math.floor(day / 7) + 1)}`, show);
}

let textScale = 1;
// On a narrow screen, the chat of chapter 1 and the card of chapter 6 grow,
// so their words stay readable. zoomAt moves a point of the world with them.
const zoom = () => Math.min(textScale, 1.7);
const zoomAt = (x, y, cx, cy) => [cx + (x - cx) * zoom(), cy + (y - cy) * zoom()];
function counter(ctx, t, label, value, note, alpha) {
  if (alpha <= 0) return;
  const tf = textScale;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  font(ctx, 600, 16 * tf);
  ctx.fillStyle = P.muted;
  ctx.fillText(label, 1536, 92);
  font(ctx, 800, 54 * tf, 'expanded');
  ctx.fillStyle = P.ink;
  ctx.fillText(value, 1536, 92 + 58 * tf);
  if (note) {
    font(ctx, 400, 16 * tf);
    ctx.fillStyle = P.muted;
    ctx.fillText(note, 1536, 92 + 58 * tf + 28 * tf);
  }
  ctx.restore();
}

function nodeState(n, i, t) {
  // Returns the color, the glow, and the alpha of one run of the tree.
  if (i === NODE_A && t >= A_ON && t < A_OK) return [P.amber, 10 + 6 * Math.sin((t - A_ON) * 2.6), 1];
  if (i === NODE_B && t >= B_ON && t < B_OK) return [P.amber, 10 + 6 * Math.sin((t - B_ON) * 2.6), 1];
  if (t >= n.rip) return [P.green, 5, 1];
  if ((i === NODE_A && t >= A_OK && t < A_OK + 1.6) || (i === NODE_B && t >= B_OK)) return [P.greenHi, 8, 1];
  if (n.depth === 1) {
    const dt = t - n.b;
    if (dt < 0.5) return [mix(P.greenHi, P.sleep, dt / 0.5), 0, 1];
  } else {
    const dt = t - n.b;
    if (dt < 0.3) return [mix(P.hot, P.accent, dt / 0.3), 10, 1];
    if (dt < 0.3 + n.work) return [P.green, 5, 1];
  }
  if ((n.w1 && t >= n.w1 && t < n.w1 + n.wl) || (n.w2 && t >= n.w2 && t < n.w2 + n.wl)) return [P.green, 5, 1];
  return [P.sleep, 0, 0.9];
}

function sceneTree(ctx, t) {
  if (t < T3) return;
  const c = cam(t);
  const pos = (n) => [c.x + n.x * c.s, c.y + n.y * c.s];
  // Where a run of chapter 2 flies from the track to its place on the circle.
  const at = (n) => {
    if (n.depth !== 1 || t >= n.fly + 0.9) return pos(n);
    const k = ease(seg(t, n.fly, n.fly + 0.9));
    const [ex, ey] = pos(n);
    return [lerp(dayX(n.day, 7.6), ex, k), lerp(450, ey, k), k];
  };
  const size = Math.max(2.2, 4 * c.s);
  // The edges, in one path, then the edges that still grow, hot.
  ctx.save();
  ctx.lineWidth = Math.max(0.6, 1.1 * c.s);
  ctx.strokeStyle = 'rgba(85,85,79,0.3)';
  ctx.beginPath();
  const growing = [];
  for (let i = 1; i < NODES.length; i++) {
    const n = NODES[i];
    const dt = t - n.b;
    if (dt < -0.3) continue;
    const [px, py] = n.depth === 1 ? [c.x, c.y] : pos(NODES[n.p]);
    const [x, y] = at(n);
    if (n.depth === 1 && t < n.fly + 0.9) continue;
    if (dt < 0) {
      growing.push([px, py, lerp(px, x, 1 + dt / 0.3), lerp(py, y, 1 + dt / 0.3)]);
      continue;
    }
    ctx.moveTo(px, py);
    ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = P.accent;
  ctx.beginPath();
  for (const [a, b, x, y] of growing) {
    ctx.moveTo(a, b);
    ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();
  // The runs, as lamps.
  for (let i = 1; i < NODES.length; i++) {
    const n = NODES[i];
    if (n.depth >= 2 && t < n.b) continue;
    if (n.depth === 1 && t < n.fly) continue;
    const [x, y] = at(n);
    const [color, glow, alpha] = nodeState(n, i, t);
    // A lit lamp gets a halo: a larger square at low alpha, cheaper than a
    // shadow blur on thousands of lamps.
    ctx.fillStyle = color;
    if (glow) {
      const hs = size * (glow > 8 ? 4 : 2.8);
      ctx.globalAlpha = 0.2 * alpha;
      ctx.fillRect(x - hs / 2, y - hs / 2, hs, hs);
    }
    ctx.globalAlpha = alpha;
    ctx.fillRect(x - size / 2, y - size / 2, size, size);
  }
  ctx.globalAlpha = 1;
  // The counter of chapter 3: the runs and their children.
  const count = RUN_DAYS.length + upper(KID_BIRTHS, t);
  counter(ctx, t, 'Runs this year, with their children', fmt(count), 'Each tree stays within its limits', seg(t, T3 + 0.4, T3 + 1.0) * (1 - seg(t, T4 - 0.4, T4)));
}

function badgeYou(ctx, t) {
  const a = seg(t, T4 + 0.3, T4 + 0.8) * (1 - seg(t, TEND, TEND + 0.4));
  if (a <= 0) return;
  const back = t >= T6 + 0.3;
  const tf = Math.min(textScale, 1.5);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(64, 60);
  ctx.scale(tf, tf);
  ctx.fillStyle = P.ink;
  rrect(ctx, 0, 0, 38, 38, 4);
  ctx.fill();
  font(ctx, 800, 14);
  ctx.fillStyle = '#000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('AL', 19, 20);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  font(ctx, 800, 19);
  ctx.fillStyle = P.ink;
  ctx.fillText('You', 52, 16);
  led(ctx, 52, 25, back ? P.green : '#6e6e68', back ? 6 : 0, 10);
  font(ctx, 600, 15);
  ctx.fillStyle = back ? P.greenHi : P.muted;
  ctx.fillText(back ? 'back' : 'away', 68, 35);
  ctx.restore();
}

function sceneAway(ctx, t) {
  if (t < T4 || t > T5 + 1) return;
  const w = t - T4;
  const c = cam(t);
  const pos = (i) => [c.x + NODES[i].x * c.s, c.y + NODES[i].y * c.s];
  // The clock of the night.
  const a = seg(w, 0.4, 1.0) * (1 - seg(t, T5 - 0.3, T5));
  counter(ctx, t, 'While you are away', clock(18 + 13 * seg(w, 0.5, 7.8)), 'Asleep, a sandbox costs nothing', a);
  // The manager, above the fleet.
  const ma = seg(w, 0.6, 1.2) * (1 - seg(t, T5 + 0.2, T5 + 0.8));
  if (ma <= 0) return;
  const mx = 800;
  const my = 66;
  ctx.save();
  ctx.globalAlpha = ma;
  drawMark(ctx, MANAGER, mx, my, 5, () => ({ color: P.ink }), 1);
  font(ctx, 700, 17);
  ctx.fillStyle = P.muted;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('manager', mx + 30, my + 1);
  ctx.restore();
  // A routine approval goes up to the manager and comes back allowed.
  const link = (i, t0, t1, back, label, color) => {
    const [x, y] = pos(i);
    const up = seg(t, t0, t0 + 0.5);
    if (up <= 0) return;
    const fade = 1 - seg(t, t1 + 1.6, t1 + 2.2);
    ctx.save();
    ctx.globalAlpha = ma * fade;
    ctx.strokeStyle = 'rgba(240,164,0,0.6)';
    ctx.setLineDash([4, 5]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(lerp(x, mx, up), lerp(y, my + 26, up));
    ctx.stroke();
    ctx.setLineDash([]);
    if (up < 1) led(ctx, lerp(x, mx, up) - 4, lerp(y, my + 26, up) - 4, P.amber, 12, 8);
    const down = seg(t, t1, t1 + 0.6);
    if (down > 0 && down < 1) pill(ctx, lerp(mx, x, ease(down)), lerp(my + 40, y, ease(down)), back, color, 1, 14);
    if (t >= t1 + 0.6) pill(ctx, x, y - 26, label, color, seg(t, t1 + 0.6, t1 + 0.9), 14);
    ctx.restore();
  };
  link(NODE_A, A_ON + 0.2, A_OK - 0.6, 'allow', 'Decided by the manager', P.greenHi);
  link(NODE_B, B_ON + 0.2, B_ON + 1.0, 'for you', 'A destructive tool waits for you', P.amber);
}

function tileRect(i, t) {
  const slide = ease(seg(t, T5 + 0.2, T5 + 1.0)) * (1 - ease(seg(t, T6 + 2.8, T6 + 3.6)));
  return { x: lerp(1640, 1186, slide), y: 136 + i * 176, w: 360, h: 152, a: slide };
}
function sceneNews(ctx, t) {
  if (t < T5 || t > T6 + 3.8) return;
  const c = cam(t);
  // The tiles of the channels.
  TILES.forEach((name, i) => {
    const r = tileRect(i, t);
    const got = NEWS.filter((n) => n.tile === i && n.arrive <= t);
    const last = got[got.length - 1];
    const hit = last ? 1 - seg(t, last.arrive, last.arrive + 0.6) : 0;
    const needs = last && last.text.startsWith('Needs you');
    ctx.save();
    ctx.globalAlpha = r.a;
    ctx.fillStyle = P.card;
    rrect(ctx, r.x, r.y, r.w, r.h, 4);
    ctx.fill();
    ctx.strokeStyle = needs ? P.amber : mix(P.line2, P.ink, hit);
    ctx.lineWidth = needs || hit > 0 ? 2 : 1;
    ctx.stroke();
    groove(ctx, r.x, r.y + 1, r.w);
    font(ctx, 800, 19, 'semi-expanded');
    ctx.fillStyle = P.ink;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(name, r.x + 18, r.y + 44);
    if (got.length) {
      font(ctx, 700, 13);
      const label = String(got.length);
      const cw = Math.max(22, ctx.measureText(label).width + 14);
      ctx.fillStyle = P.ink;
      rrect(ctx, r.x + r.w - 18 - cw, r.y + 27, cw, 22, 4);
      ctx.fill();
      ctx.fillStyle = '#000';
      ctx.textAlign = 'center';
      ctx.fillText(label, r.x + r.w - 18 - cw / 2, r.y + 43);
      ctx.textAlign = 'left';
    }
    font(ctx, 400, 16);
    ctx.fillStyle = needs ? P.amber : P.muted;
    lines(ctx, last ? last.text : 'Waiting for news', r.x + 18, r.y + 82, r.w - 36, 22);
    if (needs) led(ctx, r.x + r.w - 30, r.y + r.h - 30, P.amber, 10 + 5 * Math.sin(t * 2.6), 10);
    ctx.restore();
  });
  // The news in flight, from a run of the fleet to a channel.
  for (const n of NEWS) {
    const k = seg(t, n.at, n.arrive);
    if (k <= 0 || k >= 1) continue;
    const src = NODES[n.from];
    const sx = c.x + src.x * c.s;
    const sy = c.y + src.y * c.s;
    const r = tileRect(n.tile, t);
    const tx = r.x - 6;
    const ty = r.y + r.h / 2;
    const e = ease(k);
    const mx = lerp(sx, tx, 0.5);
    const my = Math.min(sy, ty) - 120;
    const x = (1 - e) * (1 - e) * sx + 2 * (1 - e) * e * mx + e * e * tx;
    const y = (1 - e) * (1 - e) * sy + 2 * (1 - e) * e * my + e * e * ty;
    pill(ctx, x, y, n.text, n.text.startsWith('Needs you') ? P.amber : P.ink, Math.min(1, k * 5), 13);
  }
}

function sceneDecide(ctx, t) {
  if (t < T6) return;
  const y = t - T6;
  if (y > 4.0) return;
  // The card flies from the phone to the middle of the screen.
  const fly = ease(seg(y, 0.4, 1.2));
  if (fly <= 0) return;
  const phone = tileRect(3, T6);
  const sc = lerp(0.32, 1, fly) * lerp(1, zoom(), fly);
  const cx = lerp(phone.x + phone.w / 2, CARD.x + CARD.w / 2, fly);
  const cy = lerp(phone.y + phone.h / 2, CARD.y + CARD.h / 2, fly);
  const gone = seg(y, 3.2, 3.8);
  const decided = t >= B_OK;
  ctx.save();
  // The fleet dims behind the card.
  ctx.fillStyle = `rgba(14,14,13,${0.5 * fly * (1 - gone)})`;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1 - gone;
  ctx.translate(cx, cy);
  ctx.scale(sc, sc);
  ctx.translate(-(CARD.x + CARD.w / 2), -(CARD.y + CARD.h / 2));
  const { x, y: top, w, h: hgt } = CARD;
  if (!decided) {
    ctx.fillStyle = '#000';
    rrect(ctx, x, top + 3, w, hgt, 4);
    ctx.fill();
  }
  ctx.fillStyle = P.card;
  rrect(ctx, x, top, w, hgt, 4);
  ctx.fill();
  ctx.strokeStyle = decided ? P.line2 : P.edge;
  ctx.lineWidth = decided ? 1 : 2;
  ctx.stroke();
  groove(ctx, x, top + 2, w);
  led(ctx, x + 24, top + 32, decided ? '#6e6e68' : P.amber, decided ? 0 : 10 + 6 * Math.sin(t * 2.6), 12);
  font(ctx, 800, 22, 'semi-expanded');
  ctx.fillStyle = P.ink;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(decided ? 'Allowed by you' : 'Needs your decision', x + 46, top + 44);
  drawMark(ctx, GLYPH, x + 38, top + 84, 3.4, () => ({ color: HUES[GLYPH.hue] }), 1);
  font(ctx, 700, 18);
  ctx.fillText('triage', x + 64, top + 90);
  const tw = ctx.measureText('triage ').width;
  font(ctx, 400, 18);
  ctx.fillText('wants to run a command.', x + 64 + tw, top + 90);
  ctx.fillStyle = P.recess;
  rrect(ctx, x + 24, top + 110, w - 48, 46, 4);
  ctx.fill();
  ctx.strokeStyle = P.line;
  ctx.lineWidth = 1;
  ctx.stroke();
  font(ctx, 400, 17, 'normal', MONO);
  ctx.fillStyle = P.ink;
  ctx.fillText(COMMAND, x + 40, top + 139);
  font(ctx, 400, 14);
  ctx.fillStyle = P.muted;
  ctx.fillText('Rule: ask before git push', x + 24, top + 184);
  if (!decided) {
    keyCap(ctx, { x: ALLOW.x - 100, y: ALLOW.y, w: 88, h: 44 }, 'Deny', false, false);
    keyCap(ctx, ALLOW, 'Allow', true, y >= 2.5 && y < 2.68);
  }
  // The pointer.
  if (y > 1.4 && y < 3.0) {
    const m = ease(seg(y, 1.5, 2.4));
    ctx.save();
    ctx.globalAlpha = 1 - seg(y, 2.7, 3.0);
    cursor(ctx, lerp(1120, ALLOW.x + 70, m), lerp(680, ALLOW.y + 24, m), y >= 2.5 && y < 2.68);
    ctx.restore();
  }
  ctx.restore();
}

function sceneTitle(ctx, t) {
  const i = chapterAt(t);
  const ch = CHAPTERS[i];
  const start = ch.at !== undefined ? ch.at : ch.t + 0.6;
  const end = i === CHAPTERS.length - 1 ? TEND : ch.end;
  const inA = seg(t, start, start + 0.32);
  const a = inA * (1 - seg(t, end - 0.4, end - 0.05));
  if (a <= 0) return;
  const tf = textScale;
  ctx.save();
  ctx.globalAlpha = a;
  let size = 66 * tf;
  font(ctx, 800, size, 'expanded');
  const max = 1040;
  const wd = ctx.measureText(ch.title).width;
  if (wd > max) {
    size *= max / wd;
    font(ctx, 800, size, 'expanded');
  }
  const sc = 1 + 0.08 * (1 - easeOut(inA));
  ctx.translate(70, 828);
  ctx.scale(sc, sc);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = P.ink;
  ctx.fillText(ch.title, 0, 0);
  font(ctx, 600, 16 * tf);
  ctx.fillStyle = P.muted;
  ctx.fillText(`${i + 1} of ${CHAPTERS.length}`, 2, -size - 10 * tf);
  ctx.restore();
}

function sceneEnd(ctx, t) {
  const a = seg(t, TEND, TEND + 0.6);
  if (a <= 0) return;
  ctx.save();
  ctx.fillStyle = `rgba(27,27,25,${0.84 * a})`;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = a;
  drawMark(ctx, GLYPH, 800, 300, 9, () => ({ color: HUES[GLYPH.hue] }), 1);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  font(ctx, 800, 116, 'expanded');
  ctx.fillStyle = P.ink;
  ctx.fillText('Featherweight', 800, 486);
  ctx.globalAlpha = seg(t, TEND + 0.4, TEND + 1.2);
  font(ctx, 400, 30 * Math.min(textScale, 1.4));
  ctx.fillStyle = P.muted;
  ctx.fillText('Strike once. Your agents do the rest.', 800, 548);
  ctx.restore();
}

function background(ctx, t) {
  ctx.fillStyle = P.bg;
  ctx.fillRect(0, 0, W, H);
  const night = t < T4 ? 0 : t < T5 ? seg(t, T4, T4 + 1.5) : t < T6 ? 1 - seg(t, T5 + 5, T6) : 0;
  const g = ctx.createRadialGradient(800, 450, 0, 800, 450, 900);
  g.addColorStop(0, mix(P.vig, P.bg, night * 0.8));
  g.addColorStop(1, P.bg);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // The glow of the forge at the foot of the screen, from the first frame:
  // it flares at the strike and dies down once the agent is made.
  const fire = t < T2 + 1 ? 0.13 + 0.03 * Math.sin(t * 6.3) + 0.35 * Math.max(0, 1 - Math.abs(t - STRIKE1 - 0.2) / 1.4) : 0;
  if (fire > 0) {
    const f = ctx.createRadialGradient(800, 1010, 0, 800, 1010, 760);
    f.addColorStop(0, `rgba(255,77,0,${fire * (1 - seg(t, T2 - 0.5, T2 + 1))})`);
    f.addColorStop(1, 'rgba(255,77,0,0)');
    ctx.fillStyle = f;
    ctx.fillRect(0, 0, W, H);
  }
  // The graticule of the display.
  ctx.fillStyle = P.grid;
  for (let x = 50; x < W; x += 50) for (let y = 50; y < H; y += 50) ctx.fillRect(x - 1, y - 1, 2, 2);
}

function chapterAt(t) {
  let i = 0;
  for (let k = 0; k < CHAPTERS.length; k++) if (t >= CHAPTERS[k].t) i = k;
  return i;
}

function render(ctx, t) {
  background(ctx, t);
  sceneTimeline(ctx, t);
  sceneTree(ctx, t);
  sceneForge(ctx, t);
  sceneAway(ctx, t);
  sceneNews(ctx, t);
  badgeYou(ctx, t);
  sceneManagerChat(ctx, t);
  sceneDecide(ctx, t);
  const k1 = [KEY1.x + KEY1.w / 2, KEY1.y + KEY1.h / 2];
  const z1 = zoomAt(k1[0], k1[1], 800, 430);
  flash(ctx, t, STRIKE1, z1[0], z1[1], 0.8);
  drawEmbers(ctx, t);
  drawSparks(ctx, SPARKS1, t, z1[0] - k1[0], z1[1] - k1[1]);
  const k2 = [ALLOW.x + ALLOW.w / 2, ALLOW.y + ALLOW.h / 2];
  const z2 = zoomAt(k2[0], k2[1], CARD.x + CARD.w / 2, CARD.y + CARD.h / 2);
  flash(ctx, t, B_OK, z2[0], z2[1], 0.35);
  drawSparks(ctx, SPARKS2, t, z2[0] - k2[0], z2[1] - k2[1]);
  sceneTitle(ctx, t);
  sceneEnd(ctx, t);
}

// ---------- the player ----------

export default function mount(root) {
  root.textContent = '';
  root.classList.add('demo', 'is-live', 'movie');

  const canvas = h('canvas', { 'aria-hidden': 'true' });
  const screen = h('div', { class: 'mv-screen', tabindex: '0', role: 'img', 'aria-label': 'A movie of 50 seconds: one strike becomes an agent that repeats, branches, works while you are away, and reports to you. Space pauses it.' }, canvas);
  const sub = h('p', { class: 'mv-sub', 'aria-live': 'polite' });
  const playKey = key('Pause', { onClick: () => toggle() });
  const replay = key('Watch again', { kind: 'quiet', onClick: () => seek(0, true) });
  const next = h('a', { class: 'key key-m key-primary', href: '#one-job-up-close', hidden: true, text: 'See one job up close' });
  const chapterEls = CHAPTERS.map((ch, i) => {
    const bar = h('i');
    const b = h('button', { type: 'button', class: 'mv-chap', title: ch.title, 'aria-label': `Chapter ${i + 1}: ${ch.title}`, on: { click: () => seek(ch.t + (i === 0 ? 0 : 0.01), true) } }, h('span', { class: 'mv-bar' }, bar), h('span', { text: ch.name }));
    return { b, bar };
  });
  const time = h('span', { class: 'mv-time' });
  const controls = h('div', { class: 'mv-controls' }, h('div', { class: 'mv-keys' }, replay, playKey, next), h('ol', { class: 'mv-chapters', 'aria-label': 'Chapters' }, chapterEls.map((c) => h('li', null, c.b))), time);
  const card = h('section', { class: 'demo-card mv-card', 'aria-label': 'Strike once: the movie of Featherweight' }, h('div', { class: 'groove groove-card', 'aria-hidden': 'true' }), screen, sub, controls);
  root.append(card, h('p', { class: 'demo-caption', text: 'A model of a year of one duty, sped up. The manager, the duty and its readback, the child runs and their limits, the decisions while away, and the channels are real parts of Featherweight; the numbers are an example.' }));

  const ctx = canvas.getContext('2d');
  let t = 0;
  let playing = false;
  let wanted = !reduced();
  let visible = false;
  let last = 0;
  let raf = 0;
  let chapter = -1;
  let k = 1;

  function size() {
    const r = screen.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    k = canvas.width / W;
    textScale = clamp(820 / Math.max(1, r.width), 1, 2.1);
    draw();
  }

  function draw() {
    ctx.setTransform(k, 0, 0, k, 0, 0);
    render(ctx, t);
    const i = chapterAt(t);
    if (i !== chapter) {
      chapter = i;
      sub.textContent = CHAPTERS[i].sub;
    }
    chapterEls.forEach((c, j) => {
      const ch = CHAPTERS[j];
      c.bar.style.width = (seg(t, ch.t, ch.end) * 100).toFixed(1) + '%';
      c.b.classList.toggle('now', j === i);
      if (j === i) c.b.setAttribute('aria-current', 'step');
      else c.b.removeAttribute('aria-current');
    });
    const s = Math.floor(t);
    time.textContent = `0:${String(s).padStart(2, '0')} / 0:${TOTAL}`;
    const ended = t >= TOTAL;
    next.hidden = !ended;
    playKey.hidden = ended;
  }

  function frame(now) {
    raf = 0;
    if (!playing) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t = Math.min(TOTAL, t + dt);
    draw();
    if (t >= TOTAL) {
      playing = false;
      wanted = false;
      setKey();
      return;
    }
    raf = requestAnimationFrame(frame);
  }

  function run() {
    const go = wanted && visible && !document.hidden && t < TOTAL;
    if (go && !playing) {
      playing = true;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    } else if (!go && playing) {
      playing = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }
    setKey();
  }

  function setKey() {
    playKey.textContent = wanted && t < TOTAL ? 'Pause' : t > 0 && t < TOTAL && !(reduced() && t === POSTER) ? 'Play' : 'Play the movie';
  }

  function toggle() {
    if (t >= TOTAL) t = 0;
    wanted = !wanted;
    run();
    draw();
  }

  // seek moves the clock. Under reduced motion, a chapter shows its frame
  // and waits; the reader can still press Play.
  function seek(to, byReader) {
    t = clamp(to, 0, TOTAL);
    if (byReader && reduced()) {
      const i = chapterAt(t + 0.02);
      const ch = CHAPTERS[i];
      t = to === 0 ? POSTER : Math.min(ch.end - 0.5, ch.t + (ch.end - ch.t) * 0.7);
      wanted = false;
    } else if (byReader) {
      wanted = true;
    }
    run();
    draw();
  }

  screen.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'k') {
      e.preventDefault();
      toggle();
    } else if (e.key === 'ArrowRight') {
      seek(t + 5);
    } else if (e.key === 'ArrowLeft') {
      seek(t - 5);
    }
  });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
      run();
    }, { threshold: 0.35 }).observe(screen);
  } else visible = true;
  document.addEventListener('visibilitychange', run);
  if ('ResizeObserver' in window) new ResizeObserver(size).observe(screen);
  window.addEventListener('resize', size);

  // A test or a script can show one frame: root.forgeSeek(seconds).
  root.forgeSeek = (s) => {
    wanted = false;
    run();
    t = clamp(s, 0, TOTAL);
    draw();
  };

  if (reduced()) t = POSTER;
  const ready = document.fonts && document.fonts.load ? Promise.all([document.fonts.load(`800 66px ${SANS}`), document.fonts.load(`400 19px ${SANS}`)]).catch(() => {}) : Promise.resolve();
  ready.then(() => {
    size();
    run();
  });
  size();
  setKey();
}
