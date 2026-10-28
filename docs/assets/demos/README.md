# Writing a demo

A demo is a small working model of one mechanism, drawn in the design
language of bossmode. Read `DESIGN.md` at the root of this repository first,
sections 4 and 5. MkDocs does not publish this file: `exclude_docs` in
`mkdocs.yml` names it.

## The parts

| File | What |
|---|---|
| `kit.js` | The primitives and the mount. Every demo imports from it. |
| `kit.css` | The frame of a demo, the ledger, the rows of workers, the step bar. |
| `<name>.js` | One demo. Its default export mounts it. |
| `run-lifecycle.js` | The reference demo. Copy its shape. |

The primitives of bossmode that the shell also uses (the light, the keys,
the chips, the marks, the recess) are in `theme/assets/css/site.css`.

## Put a demo on a page

```html
<div class="demo" data-demo="run-lifecycle" markdown>

A plain fallback in Markdown: what the demo shows, in two or three
sentences. It shows without JavaScript, and the search reads it.

</div>
```

Leave a blank line after the opening tag and before the closing tag. The kit
finds the element, imports `run-lifecycle.js`, and calls its default export
with the element. The demo replaces the fallback.

## The kit

```js
import { h, css, demo, key, led, lineLed, chip, code, mark, avatar, ledger, workers, wait, settle, reduced } from './kit.js';
```

| Function | What it draws |
|---|---|
| `h(tag, props, ...children)` | An element. props: `class`, `text`, `html`, `on: {click}`, `style: {}`, and attributes. |
| `css(id, text)` | The styles of one demo, added once. Use the tokens only. |
| `demo(root, {title, tone, word, caption, wide})` | The card: groove band, title, status light, stage, the line that explains, the keys. Returns `{stage, keys, title, card, say(text), setKeys([...]), reset(fn), setStatus(tone, word)}`. |
| `key(label, {kind, size, onClick, disabled})` | A key. kind: `primary` (one per demo, the next natural step), `secondary`, `quiet`, `danger`. |
| `led(tone, word, {still})` | A light and its word. tone: `green`, `amber`, `red`, `grey`, `off`. The returned element has `set(tone, word)`. |
| `lineLed(tone)` | A bare light for a line whose text is its word. |
| `chip(text, kind)` | A count: `plain`, `ink`, `amber`. |
| `code(text)` | Inline monospace: an event, a key, a route, a command. |
| `mark(name, size)` | The face of an agent, the same as in bossmode. |
| `avatar(initials, size)` | A person. |
| `ledger({title, file, empty, onPick})` | A recess of numbered event lines. `append(type, detail, {tone})`, `pick(i)`, `clear()`. |
| `workers([{name, state, word}])` | Rows of workers with lamps. state: `working`, `awake`, `starting`, `asleep`, `failed`, `needs`. `set(name, state, word)`. |
| `wait(ms)` | A pause between steps. Zero under reduced motion. |
| `settle(el)` | The settle motion on a new element. |

The object that `demo()` returns also has `focusKeys()`, which puts the
focus on the primary key. `setKeys()` already keeps the focus: after a press,
the new primary key takes it, and after Reset it stays on Reset.

Layout helpers in `kit.css`:

| Class | What |
|---|---|
| `.demo-split` | Two columns that stack when the card is narrow. It follows the width of the card, not of the window. |
| `.demo-col` | A column of a split: a label and its content, stacked with a gap. |
| `.demo-label` | A small muted label. |
| `.demo-note` | A muted line of meta text under a part of the stage. |
| `.demo-rows` | Rows with a raised current row: add `on` to an `li`. |
| `.demo-command` with `.recess` | A command block. |
| `.demo-steps` | A bar of steps: `li.done`. |
| `.demo-card.decided` | A card that waits for nothing any more: a line edge, no drop, as a decided card of bossmode. |

Ledger lines wrap their detail instead of cutting it, so a long event stays
readable at 390 pixels.

## The rules

1. One mechanism. The title names it in plain words, such as "A run, read
   from its ledger". The caption says that it is a model and where its names
   come from.
2. Real names. Every event type, state, route, tool, and configuration key
   in a demo comes from the code. Find it before you use it.
3. One orange key. The primary key does the next natural step. Other keys
   are secondary. Reset is quiet and sits at the start of the row.
4. Words with lights. A light never stands alone.
5. Motion answers a key. Nothing moves on load. A sequence of steps uses
   `wait()`, so reduced motion shows the steps at once.
6. Keyboard. Every action is a button. The line under the stage
   (`say()`) is a polite live region, so a screen reader hears each step.
7. No new colors, radii, shadows, or type sizes. Use the tokens and the
   classes above. A demo that needs a new primitive asks for it in the kit.
8. Both themes and three widths. Check light, graphite, 1440, 1000, and 390
   pixels.

## Check a demo

Build the site into a directory of your own, serve it, and shoot it:

```sh
uvx --with-requirements requirements.txt mkdocs build -d /tmp/site-mine
python3 -m http.server 8801 --bind 127.0.0.1 -d /tmp/site-mine &
node tools/shoot.mjs http://127.0.0.1:8801/concepts/run-lifecycle/ /tmp/rl.png \
  --scroll '.demo' --key 'Start a run' --key 'Give it a slot'
node tools/shoot.mjs http://127.0.0.1:8801/concepts/run-lifecycle/ /tmp/rl-dark.png --dark --width 390 --scroll '.demo'
```

`shoot.mjs` prints the console errors of the page. If the page logged an
error, it exits with 1. `--key` clicks the button with that text, `--eval` runs JavaScript
and prints its value. Run `node tools/shoot.mjs` alone for every option.
Check the syntax of a demo with `cp x.js /tmp/x.mjs && node --check /tmp/x.mjs`.
