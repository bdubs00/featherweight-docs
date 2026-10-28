# Writing rules for this site

Every page follows these rules. A subagent that writes a page reads this file first.

## Truth

1. Every fact comes from the source code or the documents of the three repositories next to this one: `../featherweight-kernel`, `../featherweight-workbench`, and `../featherweight-bossmode` (the web page). Do not invent a flag, a key, a route, a tool, a default, or a step.
2. Before you name a command, a flag, a configuration key, an environment variable, a route, or an MCP tool, find it in the code. For the kernel verbs, read `cli/*.go` and `cmd/fw/*.go`. For the configuration keys, read `examples/fw.yaml` and `config/`. For the workbench, read `cmd/fw-workbench/*.go`, the packages, and `examples/`.
3. If a document and the code disagree, the code wins. Say so in one sentence.
4. If you cannot verify a claim, leave it out, or mark it `(unverified)` in the text.
5. End every page with a `## Sources` section: a list of the files you read, one path per item in backticks, relative to the folder of the repositories, for example `featherweight-kernel/cli/serve.go`.

## Approachability

The first version of this site was accurate but hard to read. These rules come first when they conflict with habit.

1. Every page opens with a lede: one to three sentences in plain words that say what the thing is and why the reader cares. The lede holds no code names. The theme sets the first paragraph larger.
2. Show, then tell. After the lede comes a demo, if a mechanism is worth seeing. Then comes the explanation, then how to use it, then the details.
3. The running text of a guide page or a concept page names only what the reader types or sees: commands, flags, configuration keys, routes, MCP tools, event types, states, and the words of the bossmode page. Go functions, Go types, and internal file names go in a disclosure at the end of the section, `??? note "Under the hood"`, or only in the Sources list.
4. One idea per section. A page has three to seven `##` sections, plus a last section, Where to go next. A section that needs more than five paragraphs is two sections.
5. No Mermaid. A mechanism worth a diagram gets a demo (see `docs/assets/demos/README.md`). A static structure gets a table or a short list.
6. A table is for reference data with parallel fields. A concept is prose.
7. Define a term the first time a page uses it, in under ten words, and use the term of the [glossary](docs/glossary.md).
8. End each page with where to go next: one or two links in the last section, or a `<div class="paths" markdown>` list of links. A link in that list is `[Title <span>one line</span>](page.md)`.
9. A guide page speaks to the operator in the words of bossmode: places, bridges, seats, duties, decisions. It explains what each key does and what happens after it.
10. Write a word of the screen as the screen writes it, with its capitals, without quotes and without code: press Run command, open the Duties place, pick Where to reach me. Use code only for what a person types.
11. A screenshot of bossmode comes in two images, light and graphite, side by side: `![The Fleet place](../assets/shots/x-light.png){ .only-light }` and the same with `{ .only-dark }`. The theme shows the one that matches.

## Scope

1. A page explains one topic to a reader who knows software but not this project. It answers "what is it, how does it work, how do I use it".
2. Do not copy long passages from `docs/ARCHITECTURE.md` of the kernel or the workbench. The site pulls those documents in under `design/`. Link to the section instead: `../design/kernel-architecture.md#4-the-ledger`, `../design/workbench-architecture.md#11-connections`. Section anchors are the heading in lower case with spaces as dashes and the dot removed: `## 7.11 Acting for a person` is `#711-acting-for-a-person`.
3. Link to the other pages of the site with relative links, for example `../concepts/run-lifecycle.md`. The page list is in `mkdocs.yml`.
4. Link to source files on GitHub when the reader must open them: `https://github.com/bdubs00/featherweight-kernel/blob/main/fw/kernel.go`.

## Language

Plain English, in the spirit of ASD-STE100 Simplified Technical English.

1. Procedural text tells the reader what to do: imperative mood, one instruction per sentence, at most 20 words per sentence.
2. Descriptive text explains: simple tenses, active voice, at most 25 words per sentence, one topic per paragraph, at most six sentences per paragraph.
3. Condition before command, with a comma: "If the build fails, read the log."
4. Name the actor: "The front suspends the Task."
5. Modal verbs: can, will, must. Never should, would, may, might, could.
6. No contractions. Keep the articles. No semicolons. No em-dashes.
7. One word, one meaning. Use `make sure that` for check, verify, confirm. Use `configuration`, never `config`, in prose.
8. Define a concept term at its first use on the page, in under ten words: "the ledger, an append-only log of the run". Do not define product names such as Kubernetes, NATS, Prometheus, or the tool the page is about.
9. Name the host, the flag, or the prior step that a command depends on, instead of assuming that the reader has it.
10. State the fact, not its importance. Delete simply, seamlessly, robust, powerful, comprehensive, leverage, crucial, "in order to", "it is worth noting".
11. No bold as emphasis. No emoji. A heading has at most two sentences under it before the first paragraph.
12. A vertical list is for three or more parallel items or steps. A table is for parallel items with the same fields, for example flags and their meaning.
13. Warnings: the command or the condition first, then the risk.
14. American spelling.

## Markdown

1. One `#` title at the top. Sections with `##`, subsections with `###`. No deeper.
2. Commands and code in fenced blocks with a language: `sh`, `yaml`, `json`, `go`.
3. Inline code for a file path, a key, a flag, a route, a tool name, or a value.
4. The site is MkDocs with its own theme in `theme/`, after the look of bossmode (`DESIGN.md`). Admonitions work: `!!! note`, `!!! warning`, `!!! tip`, `!!! danger`, with the body indented four spaces. A disclosure is `??? note "Under the hood"` with the body indented four spaces. Tabs work with `=== "Tab name"`. Mermaid does not work, by choice.
5. A demo goes on a page as `<div class="demo" data-demo="name" markdown>`, a blank line, a plain fallback paragraph, a blank line, and `</div>`.
6. A reference page with wide tables can set `wide: true` in front matter (a `---` block at the top of the file). The column then grows to 760 pixels.
7. The theme moves the `#` title into the pane header and the `## Sources` section into the details pane. Keep both in the Markdown.
8. A guide page or a concept page is between 60 and 250 lines. A reference page can reach 450 lines. If a topic needs more, it needs two pages: say so in your report instead of writing a longer page.
