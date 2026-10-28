// shoot.mjs takes a screenshot of a page of the built site in headless
// Chrome, after optional steps that click and type, and prints the console
// errors of the page. It needs Node 22 or newer (for the global WebSocket)
// and Chrome. It talks to Chrome over the DevTools protocol, so it needs no
// package.
//
//   node tools/shoot.mjs <url> <out.png> [options]
//
//   --width N        the width of the window (default 1440)
//   --height N       the height of the window (default 1000)
//   --dark           prefers-color-scheme: dark
//   --reduced        prefers-reduced-motion: reduce
//   --full           the whole page, not only the window
//   --wait MS        wait after the load and after each step (default 600)
//   --click SEL      click the first element that matches a CSS selector
//   --key TEXT       click the first button whose text is TEXT
//   --eval JS        run JavaScript in the page; its value is printed
//   --scroll SEL     scroll an element into view
//
// The steps run in the order given. The command exits with 1 if the page
// logged an error or threw.

import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('usage: node tools/shoot.mjs <url> <out.png> [--width N] [--height N] [--dark] [--reduced] [--full] [--wait MS] [--click SEL] [--key TEXT] [--eval JS] [--scroll SEL]');
  process.exit(2);
}
const [url, out] = args;
const opt = { width: 1440, height: 1000, dark: false, reduced: false, full: false, wait: 600 };
const steps = [];
for (let i = 2; i < args.length; i++) {
  const a = args[i];
  if (a === '--width') opt.width = Number(args[++i]);
  else if (a === '--height') opt.height = Number(args[++i]);
  else if (a === '--dark') opt.dark = true;
  else if (a === '--reduced') opt.reduced = true;
  else if (a === '--full') opt.full = true;
  else if (a === '--wait') opt.wait = Number(args[++i]);
  else if (a === '--click' || a === '--key' || a === '--eval' || a === '--scroll') steps.push([a.slice(2), args[++i]]);
  else {
    console.error('unknown option ' + a);
    process.exit(2);
  }
}

const chromeBin = ['/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync);
if (!chromeBin) {
  console.error('no Chrome found');
  process.exit(2);
}
const profile = mkdtempSync(join(tmpdir(), 'shoot-'));
const chrome = spawn(chromeBin, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let port = null;
for (let i = 0; i < 100 && !port; i++) {
  await sleep(100);
  try {
    port = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0];
  } catch {}
}
if (!port) {
  console.error('Chrome did not start');
  chrome.kill();
  process.exit(2);
}
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));

let id = 0;
const pending = new Map();
const problems = [];
const loaded = [];
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  } else if (m.method === 'Runtime.exceptionThrown') {
    problems.push('exception: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  } else if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) {
    problems.push(m.params.type + ': ' + m.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
  } else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
    problems.push('log: ' + m.params.entry.text + (m.params.entry.url ? ' ' + m.params.entry.url : ''));
  } else if (m.method === 'Page.loadEventFired') {
    loaded.push(1);
  }
});
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const n = ++id;
    pending.set(n, resolve);
    ws.send(JSON.stringify({ id: n, method, params }));
  });
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) problems.push('step failed: ' + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text));
  return r.result?.result?.value;
};

await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: opt.width, height: opt.height, deviceScaleFactor: 1, mobile: opt.width < 600 });
await send('Emulation.setEmulatedMedia', {
  features: [
    { name: 'prefers-color-scheme', value: opt.dark ? 'dark' : 'light' },
    { name: 'prefers-reduced-motion', value: opt.reduced ? 'reduce' : 'no-preference' },
  ],
});
await send('Page.navigate', { url });
for (let i = 0; i < 100 && !loaded.length; i++) await sleep(100);
await sleep(opt.wait);

for (const [kind, value] of steps) {
  const v = JSON.stringify(value);
  if (kind === 'click') await evaluate(`(() => { const el = document.querySelector(${v}); if (!el) throw new Error('no element ' + ${v}); el.scrollIntoView({block: 'center'}); el.click(); })()`);
  else if (kind === 'key') await evaluate(`(() => { const el = [...document.querySelectorAll('button, a')].find((b) => b.textContent.trim() === ${v}); if (!el) throw new Error('no key ' + ${v}); el.scrollIntoView({block: 'center'}); el.click(); })()`);
  else if (kind === 'scroll') await evaluate(`(() => { const el = document.querySelector(${v}); if (!el) throw new Error('no element ' + ${v}); el.scrollIntoView({block: 'start'}); })()`);
  else if (kind === 'eval') console.log(JSON.stringify(await evaluate(value)));
  await sleep(opt.wait);
}

const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: opt.full });
writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
console.log('wrote ' + out);
for (const p of problems) console.log(p);
ws.close();
chrome.kill();
await sleep(200);
try {
  rmSync(profile, { recursive: true, force: true });
} catch {}
process.exit(problems.some((p) => !p.startsWith('warning')) ? 1 : 0);
