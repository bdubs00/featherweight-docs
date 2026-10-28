# The design of the site

This file is the plan of the look of the documentation site. It borrows the
design language of bossmode, the page that operators use every day. The
source of that language is `docs/DESIGN.md` in the repository
featherweight-bossmode. Read its sections 2 to 7 before you change the theme
or write a demo. This file names only what the site adds or changes.

## 1. The subject, the reader, and the job

The subject is Featherweight: agents that run in sandboxes, write every step
to a ledger, sleep while they wait for a person, and wake where they stopped.

The reader is an engineer who knows software but not this project. A second
reader is an operator who uses bossmode and wants to know what a place does.

The job of the site is to make the system clear in one sitting, and then to
let the reader find one fact fast. Every choice below serves that job.

## 2. The idea

The manual is built from the instrument. The site wears the chassis of
bossmode. It has a platinum app bar of places and snow panes. A band of fine
grooves sits under each pane header. Square status lights sit beside printed
words, and keys have a hard edge.

The boldness sits in one place: the demo. A demo is a small working model of
one mechanism. It is the only thing on a page with a hard black edge. Only
a demo has a light that breathes, and only a demo has an orange key.
Everything around it is quiet text on snow, at a reading measure.

## 3. Review against the generic defaults

| The default | This site | Why |
|---|---|---|
| The stock look of the generator: a colored header bar, tabs, a left tree, a right table of contents | The shell of bossmode: an app bar of places, a list pane, the page, and a details pane, each with a 56-pixel header and a groove band | The reader of the docs is also the operator of bossmode. One look teaches both. |
| A flowchart for every mechanism | A demo that the reader drives with keys. Each step names the real event, route, or key. | A reader who presses Allow and sees the sleeping Task wake learns the mechanism. A box with arrows shows only that the parts exist. |
| A hero with a big headline, a gradient, and a call to action | The home page opens on the decision card of bossmode: a sleeping agent waits for you, and the orange key wakes it | The decision is the most characteristic moment of the product. |
| Implementation names in the running text (`stepTools`, `launchLocked`) | Plain words in the text. Function names and file paths go in an Under the hood disclosure and in the Sources list of the details pane. | A first reader needs the idea. A second reader opens the disclosure. |
| Sources at the foot of every page | Sources in the details pane, below On this page, with a count chip | They stay in reach and out of the way, like This bridge in bossmode. |
| Uppercase section labels, middle-dot meta strings, arrows after link text | Sentence case, a gap between parts, and plain link text | The same rules as bossmode, section 3 of its design. |
| Numbered markers as decoration | Numbers only for a real sequence: steps of a procedure, the steps of a demo | Structure is information. |

## 4. Tokens

The tokens are the tokens of bossmode, unchanged: `theme/assets/css/tokens.css`
is a copy of `src/styles/tokens.css` of featherweight-bossmode, plus the
values of section 4.2 below. Both themes exist: snow and graphite. The theme
menu at the foot of the app bar offers Match the system, Light, and Graphite,
as the account menu of bossmode does.

### 4.1 Color

| Name | Light | Graphite | Use |
|---|---|---|---|
| Snow `--paper` | `#F3F3EF` | `#353532` | The panes |
| Platinum `--chrome` | `#DCDCD6` | `#2A2A28` | The app bar and the frame |
| Fog `--line` | `#C4C4BC` | `#4A4A46` | Pane edges, groove lines |
| `--recess` | `#ECECE7` | `#2E2E2B` | Code blocks, the find field, the ledger of a demo |
| Ink `--ink` | `#000000` | `#F3F3EF` | Text, links, the hard edge of a key |
| `--muted` | `#55554F` | `#B8B8B0` | Secondary text |
| Signal orange `--accent` | `#FF4D00` | `#FF4D00` | The primary key of a demo, and the bar under an active tab. Nowhere else. |

The status lights keep their meaning from bossmode: green works, amber needs
you (and only amber breathes), red failed, grey is idle, asleep, or done.
A light never stands alone: a word stands beside it.

### 4.2 Type

One family, Archivo, with its width axis. The files are in
`theme/assets/fonts/`, so the site loads nothing from another origin.

| Role | Size / line | Weight | Width | Use |
|---|---|---|---|---|
| Title | 22 / 28 | 800 | 110% | The page title, in the pane header |
| Heading | 19 / 26 | 800 | 108% | `##` sections |
| Sub | 16 / 24 | 700 | 100% | `###` sections, a name in a row |
| Body | 16 / 26 | 400 | 100% | Running text |
| Meta | 13 / 18 | 400 to 600 | 100% | Captions, status words, the list pane foot |
| Control | 14 / 20 | 600 to 800 | 100% | Keys, tabs, the page list |
| Code | 13.5 / 20 | 400 | | Commands, keys, paths, event names |

The body is 16 pixels, one step above the 15 of bossmode. A page of the
docs is read for minutes, not glanced at for seconds. The measure is
`--measure-doc`, 36rem (576 pixels): about 72 characters of the body.

### 4.3 Layout

```
+------+-----------------+------------------------------------------+---------------+
|[ F  ]| Concepts [8]    | The run lifecycle                        | On this page  |
|------|/////////////////|//////////////////////////////////////////|///////////////|
| Start|[Find in docs   ]|      lede, in plain words                | The states    |
|[Conc]|[> The layers   ]|                                          | How a run     |
| Guide|  Run lifecycle  |      +================================+  | Waiting       |
| Depl.|  The ledger     |      |////////////////////////////////|  |               |
| Oper.|  Safeguards     |      | ■ running  A run, by its events|  | Sources [6]   |
| Ref. |                 |      | ...the stage...                |  | fw/run.go     |
| Desn.|                 |      |    [Fail] [Cancel] [Allow call]|  | fw/turn.go    |
|      |                 |      +================================+  |               |
| (◐)  | Built from      |      Previous            Next            |               |
+------+-----------------+------------------------------------------+---------------+
  76px      272px          the rest; text at 36em, in the middle       272px
```

Wide, 1240 pixels and more: all four columns. The home page has no details
pane, so its opening scene can grow to 960 pixels. Medium, 820 to 1239 pixels: the
app bar, the list pane, and the page. On this page and Sources move into the
page. Narrow, under 820 pixels: the page alone. The places sit in a bar at
the bottom edge, and a back key in the pane header opens the list of the
place.

The window scrolls the page. The app bar, the list pane, and the details
pane stick to the top of the window and scroll on their own.

Text is left aligned. A demo can be wider than the measure, up to 760
pixels, and stays in the middle of the pane.

### 4.4 Motion

The four motions of bossmode, and nothing else: the amber light breathes,
an arriving card settles, a chip slides in, and the typing dots rise. In a
demo, a key can start a short sequence of steps. Each step is a new ledger
line that settles, or a light that changes.

Nothing moves on load, with one exception. The breath of an amber light is
not a motion on load: it is the state of something that waits for you, as in
bossmode, so a demo that opens on a waiting card shows it breathing. The opening scene of the home
page, `stack-hero`, plays on its own, because the owner asked for an
animated opening on 2026-10-27. The packets that fly between its columns
are the one motion beyond the four of bossmode. It shows one job through
the stack and the three values of the product: easy to drive, sealed in a
sandbox, and more done per person. It has a Pause key and a bar of steps that
jump to any step. It stops while it is out of sight or the tab is hidden.
Under reduced motion it does not play: the reader steps through it with
Next step. Reduced motion shows every step of every demo at once.

## 5. The demos

A demo lives in `docs/assets/demos/<name>.js` and mounts into a page through
an element with `data-demo="<name>"`. The kit, `docs/assets/demos/kit.js`,
draws the primitives of bossmode. These are the card with its groove band,
the light and its word, the keys, the chips, and the marks of agents. The
kit also draws the recess, the ledger, and the rack of lamps. A demo builds from the kit and adds no color,
radius, shadow, or type size of its own. `README.md` in that directory is
the guide for the authors of demos.

The rules of a demo:

1. It models one mechanism, and says so in its caption.
2. Every step names the real thing: the event type, the route, the tool, or
   the configuration key. The names come from the code.
3. Its primary key does the next natural step. Its other keys are
   secondary. Reset is a quiet key.
4. It works from the keyboard, it gives every light a word, and it shows
   every step at once under reduced motion.
5. The element that holds it contains a plain fallback in Markdown, which
   shows without JavaScript and feeds the search.

## 6. Principles

1. Show, then tell. A concept page opens with a lede in plain words. If a
   mechanism is worth seeing, a demo follows. Then come the explanation and
   the details behind a disclosure.
2. A status is a word. The light repeats it.
3. The accent has two uses: the primary key of a demo and the bar under an
   active tab.
4. Hard edges act, lines separate, recesses hold what you type or copy.
5. Monospace only for text that a person can type: commands, keys, paths,
   event names.
6. The chrome never explains. A label names a thing.
7. Nothing moves unless the reader pressed something.
