// The policy: the reader types a bash command, and the demo decides it as
// the kernel decides a tool call. The matching is a port of the rules in
// fw/policy.go (NewRulesPolicy, callMatcher.matches, valueMatches,
// wildcardMatch, globMatch) and of the split of a shell command in
// fw/command.go (commandForms). Deny wins over ask, ask wins over allow, and
// the default applies when no rule matches. A deny or an ask rule reads each
// part of a compound command; an allow rule reads the whole command only.
// The reasons and the error text are the strings of the kernel: "rule: deny
// bash: git push*", "default", and "denied by policy: <reason>"
// (stepTools in fw/turn.go). The demo decides one set of rules for the tool
// bash, whose spec sets only the flag destructive (tools/builtin/bash.go).

import { h, css, demo, key, led, code } from './kit.js';

css('policy', `
/* .doc beats the code block of the theme, so the lines sit 6px in, as the
   lines of a ledger do. The one column is as wide as the box or as the
   longest line, so a lit line keeps its ground when the box scrolls. */
.doc .pl-yaml { display: grid; grid-template-columns: minmax(100%, max-content); margin: 0; padding: 6px; font-family: var(--mono); font-size: var(--t-pre); line-height: var(--t-pre-lh); overflow-x: auto; }
.pl-line { display: block; padding: 0 6px; border-radius: var(--r); white-space: pre; }
.pl-line.on { background: var(--raised); box-shadow: inset 0 0 0 1px var(--raised-line); font-weight: 700; }
.doc .pl-order { margin-top: var(--s-2); }
.pl-ask { display: flex; gap: var(--s-2); }
.pl-ask input { flex: 1 1 auto; min-width: 0; font-family: var(--mono); font-size: var(--t-code); }
.pl-examples { display: flex; flex-wrap: wrap; gap: 6px; }
.pl-examples .key { font-family: var(--mono); font-weight: 600; font-size: var(--t-caption); }
.pl-verdict { display: flex; flex-direction: column; gap: 6px; min-height: 60px; padding: 8px 10px; border: 1px solid var(--line); border-radius: var(--r); }
.pl-verdict-head { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s-2) var(--s-3); }
.pl-verdict-head .status { font-size: var(--t-control); }
.doc .pl-verdict code { font-size: var(--t-caption); overflow-wrap: anywhere; }
.pl-why { font-size: var(--t-meta); line-height: var(--t-meta-lh); color: var(--muted); }
.pl-parts { display: flex; flex-wrap: wrap; gap: 4px 6px; align-items: center; font-size: var(--t-meta); line-height: var(--t-meta-lh); color: var(--muted); }
`);

// The rules of the demo, as fw.yaml holds them under policy:.
const RULES = {
  default: 'ask',
  allow: ['bash: git status', 'bash: git diff*', 'bash: go test ./...'],
  ask: ['bash: git commit*'],
  deny: ['bash: git push*', 'bash: rm -rf*'],
};
// The spec of the tool bash: only destructive is set.
const BASH = { name: 'bash', readOnly: false, idempotent: false, destructive: true, parallelSafe: false };

const EXAMPLES = ['git status', 'git commit -am "fix"', 'git diff && git push', 'sudo rm -rf build', 'git status && make'];

// ---------- the split of a shell command, after fw/command.go ----------

const MAX_DEPTH = 8;
const MAX_BYTES = 16 << 20;
const RUNNERS = new Set(['sudo', 'doas', 'su', 'runuser', 'env', 'time', 'nohup', 'xargs', 'nice', 'ionice', 'timeout', 'stdbuf', 'setsid', 'chroot', 'flock', 'watch', 'command', 'builtin', 'exec', 'eval', 'find', 'ssh', 'sh', 'bash', 'zsh', 'dash', 'ksh', 'fish']);
const SPECIAL = ' \t\r\n;&|()<>`$\'"\\';
const LEADERS = new Set(['!', '{', 'if', 'then', 'elif', 'else', 'do', 'while', 'until', 'coproc']);

function commandForms(cmd) {
  const sp = { forms: [], bytes: 0, over: false };
  splitList(sp, cmd, 0, '', 0);
  return { forms: sp.forms, complete: !sp.over };
}

function addForm(sp, s) {
  s = s.trim();
  if (s === '' || sp.over) return;
  sp.bytes += s.length;
  if (sp.bytes > MAX_BYTES) {
    sp.over = true;
    return;
  }
  sp.forms.push(s);
}

function splitList(sp, s, i, end, depth) {
  if (depth > MAX_DEPTH) {
    sp.over = true;
    return s.length;
  }
  let words = [];
  let buf = '';
  let inWord = false;
  let wordStart = 0;
  let docs = [];
  const startWord = (at) => {
    if (!inWord) {
      inWord = true;
      wordStart = at;
    }
  };
  const endWord = () => {
    if (inWord) {
      words.push({ start: wordStart, text: buf });
      buf = '';
      inWord = false;
    }
  };
  const endCommand = (at) => {
    endWord();
    simple(sp, s, words, at, depth);
    words = [];
  };
  const nested = (open, close) => {
    const k = splitList(sp, s, open + 1, close, depth + 1);
    const stop = Math.min(k + 1, s.length);
    buf += s.slice(open, stop);
    return stop;
  };
  while (i < s.length) {
    const c = s[i];
    if (end !== '' && c === end) {
      endCommand(i);
      return i;
    } else if (c === ' ' || c === '\t' || c === '\r') {
      endWord();
      i++;
    } else if (c === '\\') {
      if (i + 1 < s.length && s[i + 1] === '\n') {
        i += 2;
        continue;
      }
      startWord(i);
      if (i + 1 < s.length) {
        buf += s[i + 1];
        i += 2;
        continue;
      }
      buf += c;
      i++;
    } else if (c === "'") {
      startWord(i);
      const ansi = buf.length > 0 && buf[buf.length - 1] === '$' && i > 0 && s[i - 1] === '$';
      const q = singleQuoted(s, i + 1, ansi);
      if (!q.ok) {
        buf += c;
        i++;
        continue;
      }
      if (ansi) buf = buf.slice(0, -1);
      buf += q.text;
      i = q.next;
    } else if (c === '"') {
      startWord(i);
      const q = doubleQuoted(sp, s, i + 1, depth);
      if (!q.ok) {
        buf += c;
        i++;
        continue;
      }
      buf += q.text;
      i = q.next;
    } else if (c === '(') {
      startWord(i);
      i = nested(i, ')');
    } else if (c === '`') {
      startWord(i);
      i = nested(i, '`');
    } else if (c === ')' || c === ';') {
      endCommand(i);
      i++;
    } else if (c === '\n') {
      endCommand(i);
      i++;
      if (docs.length) {
        i = hereDocs(sp, s, i, docs, depth);
        docs = [];
      }
    } else if (c === '|') {
      if (inWord && i > 0 && s[i - 1] === '>') {
        buf += c;
        i++;
        continue;
      }
      endCommand(i);
      i++;
    } else if (c === '&') {
      if ((inWord && i > 0 && (s[i - 1] === '>' || s[i - 1] === '<')) || (i + 1 < s.length && s[i + 1] === '>')) {
        startWord(i);
        buf += c;
        i++;
        continue;
      }
      endCommand(i);
      i++;
    } else if (s.startsWith('<<<', i)) {
      startWord(i);
      buf += '<<<';
      i += 3;
    } else if (s.startsWith('<<', i)) {
      startWord(i);
      const r = hereDocStart(s, i + 2);
      if (r.doc.delim !== '') docs.push(r.doc);
      buf += s.slice(i, r.next);
      i = r.next;
    } else {
      startWord(i);
      buf += c;
      i++;
    }
  }
  endCommand(s.length);
  return s.length;
}

function baseName(w) {
  let p = w.replace(/\/+$/, '');
  if (p === '') return w === '' ? '.' : '/';
  return p.slice(p.lastIndexOf('/') + 1);
}

function simple(sp, s, words, end, depth) {
  if (!words.length) return;
  const offsets = [];
  let joined = '';
  words.forEach((w, k) => {
    if (k > 0) joined += ' ';
    offsets.push(joined.length);
    joined += w.text;
  });
  const from = (k) => {
    const raw = s.slice(words[k].start, end).trim();
    addForm(sp, raw);
    const norm = joined.slice(offsets[k]);
    if (norm !== raw) addForm(sp, norm);
  };
  for (let k = 0; k < words.length; ) {
    from(k);
    const w = words[k].text;
    if (isAssignment(w) || LEADERS.has(w) || w.endsWith('()')) {
      k++;
      continue;
    }
    if (w === 'function') {
      k += 2;
      continue;
    }
    if (RUNNERS.has(baseName(w))) {
      for (let j = k + 1; j < words.length; j++) {
        from(j);
        if ([...SPECIAL].some((ch) => words[j].text.includes(ch))) splitList(sp, words[j].text, 0, '', depth + 1);
      }
    }
    break;
  }
}

function isFieldName(s) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(s);
}

function isAssignment(w) {
  const at = w.indexOf('=');
  if (at < 0) return false;
  const name = w.slice(0, at);
  return isFieldName(name.endsWith('+') ? name.slice(0, -1) : name);
}

function singleQuoted(s, i, ansi) {
  let text = '';
  for (let k = i; k < s.length; k++) {
    if (s[k] === "'") return { text, next: k + 1, ok: true };
    if (ansi && s[k] === '\\' && k + 1 < s.length) {
      k++;
      text += s[k];
    } else text += s[k];
  }
  return { ok: false };
}

function doubleQuoted(sp, s, i, depth) {
  let text = '';
  while (i < s.length) {
    const c = s[i];
    if (c === '"') return { text, next: i + 1, ok: true };
    if (c === '\\' && i + 1 < s.length) {
      const n = s[i + 1];
      if (n === '\n') {
        // a continued line
      } else if (n === '"' || n === '\\' || n === '$' || n === '`') text += n;
      else text += c + n;
      i += 2;
    } else if (c === '`') {
      const k = splitList(sp, s, i + 1, '`', depth + 1);
      const stop = Math.min(k + 1, s.length);
      text += s.slice(i, stop);
      i = stop;
    } else if (c === '$' && i + 1 < s.length && s[i + 1] === '(') {
      const k = splitList(sp, s, i + 2, ')', depth + 1);
      const stop = Math.min(k + 1, s.length);
      text += s.slice(i, stop);
      i = stop;
    } else {
      text += c;
      i++;
    }
  }
  return { ok: false };
}

function hereDocStart(s, i) {
  const doc = { delim: '', tabs: false };
  if (i < s.length && s[i] === '-') {
    doc.tabs = true;
    i++;
  }
  while (i < s.length && (s[i] === ' ' || s[i] === '\t')) i++;
  let delim = '';
  while (i < s.length && !' \t\r\n;&|<>()`'.includes(s[i])) {
    const ch = s[i];
    if (ch === "'" || ch === '"') {
      const k = s.indexOf(ch, i + 1);
      if (k < 0) {
        delim += s.slice(i + 1);
        return { doc: { delim, tabs: doc.tabs }, next: s.length };
      }
      delim += s.slice(i + 1, k);
      i = k + 1;
    } else if (ch === '\\') {
      if (i + 1 < s.length) delim += s[i + 1];
      i += 2;
    } else {
      delim += ch;
      i++;
    }
  }
  doc.delim = delim;
  return { doc, next: Math.min(i, s.length) };
}

function hereDocs(sp, s, i, docs, depth) {
  for (const d of docs) {
    while (i < s.length) {
      let line = s.slice(i);
      let next = s.length;
      const nl = line.indexOf('\n');
      if (nl >= 0) {
        line = line.slice(0, nl);
        next = i + nl + 1;
      }
      i = next;
      const k = d.tabs ? line.replace(/^\t+/, '') : line;
      if (k === d.delim) break;
      splitList(sp, line, 0, '', depth + 1);
    }
  }
  return i;
}

// ---------- the matching of a rule, after fw/policy.go ----------

function matchChars(pattern, s) {
  if (pattern.length !== s.length) return false;
  for (let i = 0; i < pattern.length; i++) if (pattern[i] !== '?' && pattern[i] !== s[i]) return false;
  return true;
}

function wildcardMatch(pattern, s) {
  if (pattern === '*') return true;
  const parts = pattern.split('*');
  if (parts.length === 1) return matchChars(pattern, s);
  const first = parts[0];
  const last = parts[parts.length - 1];
  if (s.length < first.length + last.length || !matchChars(first, s.slice(0, first.length)) || !matchChars(last, s.slice(s.length - last.length))) return false;
  let rest = s.slice(first.length, s.length - last.length);
  for (const part of parts.slice(1, -1)) {
    if (!part) continue;
    let found = -1;
    for (let i = 0; i + part.length <= rest.length; i++) {
      if (matchChars(part, rest.slice(i, i + part.length))) {
        found = i;
        break;
      }
    }
    if (found < 0) return false;
    rest = rest.slice(found + part.length);
  }
  return true;
}

// globMatch matches a tool name as path.Match does for the patterns that a
// tool name takes: "*" and "?" stop at a slash. A trailing "*" also
// matches the bare prefix, as in the kernel.
function globMatch(pattern, s) {
  if (pattern === '*') return true;
  if (/[[\\]/.test(pattern)) return pattern === s;
  const re = new RegExp('^' + pattern.replace(/[.+^${}()|]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]') + '$');
  if (re.test(s)) return true;
  return pattern.endsWith('*') && s.startsWith(pattern.slice(0, -1));
}

// matcher matches the rules against one call of bash with the input
// {"command": cmd}. A match returns what it matched: the whole command, a
// part of it, or every part of a command past a bound of the split.
function matcher(cmd) {
  const input = { command: cmd };
  let split = null;
  function valueMatches(field, pattern, value, allow) {
    if (wildcardMatch(pattern, value)) return { whole: true };
    if (allow || field !== 'command' || value === '') return null;
    if (!split) split = commandForms(value);
    if (!split.complete) return { bound: true };
    for (const f of split.forms) if (wildcardMatch(pattern, f)) return { part: f };
    return null;
  }
  function matches(rule, allow) {
    rule = rule.trim();
    const colon = rule.indexOf(':');
    if (colon >= 0) {
      if (!globMatch(rule.slice(0, colon).trim(), BASH.name)) return null;
      const rest = rule.slice(colon + 1).trim();
      const eq = rest.indexOf('=');
      if (eq >= 0) {
        const field = rest.slice(0, eq);
        if (isFieldName(field) && Object.prototype.hasOwnProperty.call(input, field)) {
          return valueMatches(field, rest.slice(eq + 1).trim(), String(input[field]), allow);
        }
      }
      return valueMatches('command', rest, input.command, allow);
    }
    let on = false;
    switch (rule.toLowerCase()) {
      case 'readonly':
      case 'read-only':
        on = BASH.readOnly;
        break;
      case 'idempotent':
        on = BASH.idempotent;
        break;
      case 'destructive':
        on = BASH.destructive;
        break;
      case 'parallel':
      case 'parallelsafe':
        on = BASH.parallelSafe;
        break;
      default:
        on = globMatch(rule, BASH.name);
    }
    return on ? { whole: true } : null;
  }
  return { matches, forms: () => split || (split = commandForms(cmd)) };
}

// decide is NewRulesPolicy for rules without clauses: deny, then ask, then
// allow, then the default.
function decide(cmd) {
  const m = matcher(cmd);
  for (const [list, verdict] of [['deny', 'deny'], ['ask', 'ask'], ['allow', 'allow']]) {
    for (const rule of RULES[list]) {
      const hit = m.matches(rule, list === 'allow');
      if (hit) return { verdict, reason: 'rule: ' + verdict + ' ' + rule, list, rule, hit, forms: m.forms() };
    }
  }
  const d = String(RULES.default).toLowerCase();
  return { verdict: d === 'deny' || d === 'ask' ? d : 'allow', reason: 'default', list: 'default', rule: null, hit: null, forms: m.forms() };
}

// ---------- the demo ----------

export default function mount(root) {
  const d = demo(root, {
    title: 'The policy decides a tool call',
    tone: 'grey',
    word: 'no call yet',
    wide: true,
    caption: 'A model of the policy of the kernel, for the tool bash. The matching is a port of fw/policy.go and fw/command.go. This policy is an example, not the default.',
  });

  // The rules as YAML, one line each, so the line that decided can light.
  const lines = [];
  const line = (text, list, rule) => {
    const el = h('span', { class: 'pl-line', text });
    lines.push({ el, list, rule });
    return el;
  };
  const yaml = h('pre', { class: 'pl-yaml recess', 'aria-label': 'The policy' },
    line('policy:'),
    line('  default: ' + RULES.default, 'default', null),
    ['allow', 'ask', 'deny'].map((list) => [
      line('  ' + list + ':'),
      RULES[list].map((r) => line('    - "' + r + '"', list, r)),
    ]));
  const left = h('div', null, h('span', { class: 'demo-label', text: 'The policy in fw.yaml' }), yaml,
    h('p', { class: 'demo-note pl-order', text: 'The kernel reads deny first, then ask, then allow. If no rule matches, the default applies.' }));

  const input = h('input', { class: 'recess input', type: 'text', value: EXAMPLES[2], spellcheck: 'false', autocomplete: 'off', 'aria-label': 'A bash command' });
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      run();
    }
  });
  const examples = h('div', { class: 'pl-examples' }, EXAMPLES.map((ex) => key(ex, { size: 's', onClick: () => { input.value = ex; run(); } })));
  const verdict = h('div', { class: 'pl-verdict', 'aria-live': 'polite' }, h('span', { class: 'pl-why', text: 'Type a command, or pick one, and press Decide.' }));
  const right = h('div', { class: 'demo-col' },
    h('div', null, h('span', { class: 'demo-label', text: 'The model asks bash to run' }), h('div', { class: 'pl-ask' }, input)),
    examples,
    verdict);
  d.stage.append(h('div', { class: 'demo-split' }, left, right));

  const TONE = { allow: 'green', ask: 'amber', deny: 'red' };

  function run() {
    const cmd = input.value;
    const r = decide(cmd);
    for (const l of lines) l.el.classList.toggle('on', l.list === r.list && l.rule === r.rule && (l.list !== 'default' || r.list === 'default'));
    verdict.textContent = '';
    const head = h('div', { class: 'pl-verdict-head' }, led(TONE[r.verdict], r.verdict, { still: true }), code(r.reason));
    let why;
    if (!r.rule) why = 'No rule matched, so the default decided.';
    else if (r.hit.bound) why = 'The command passes a bound of the split, so it matches every deny and ask rule.';
    else if (r.hit.part) why = h('span', null, 'The rule matched one part of the command: ', code(r.hit.part), '.');
    else why = 'The rule matched the whole command.';
    const parts = [...new Set(r.forms.forms)].filter((f) => f !== cmd.trim());
    verdict.append(head, h('span', { class: 'pl-why' }, why));
    if (parts.length) verdict.append(h('div', { class: 'pl-parts' }, 'Deny and ask rules also read:', parts.slice(0, 8).map((p) => code(p)), parts.length > 8 ? '…' : null));
    d.setStatus(TONE[r.verdict], r.verdict, { still: true });
    if (r.verdict === 'allow') d.say(h('span', null, 'The kernel appends ', code('fw.tool.requested'), ', and the command runs.'));
    else if (r.verdict === 'ask') d.say(h('span', null, 'The kernel appends ', code('fw.approval.requested'), ' with this reason. The run waits for a person, who sees the key Run command.'));
    else d.say(h('span', null, 'The command never runs. The model reads the error ', code('denied by policy: ' + r.reason), ' as the result of its call.'));
  }

  d.setKeys([key('Decide', { kind: 'primary', onClick: run })]);
  d.reset(() => {
    input.value = EXAMPLES[2];
    for (const l of lines) l.el.classList.remove('on');
    verdict.textContent = '';
    verdict.append(h('span', { class: 'pl-why', text: 'Type a command, or pick one, and press Decide.' }));
    d.setStatus('grey', 'no call yet');
    d.say('');
  });
}
