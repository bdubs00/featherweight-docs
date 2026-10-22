# Writing rules for this site

Every page follows these rules. A subagent that writes a page reads this file first.

## Truth

1. Every fact comes from the source code or the documents of the two repositories next to this one: `../featherweight-kernel` and `../featherweight-workbench`. Do not invent a flag, a key, a route, a tool, a default, or a step.
2. Before you name a command, a flag, a configuration key, an environment variable, a route, or an MCP tool, find it in the code. For the kernel verbs, read `cli/*.go` and `cmd/fw/*.go`. For the configuration keys, read `examples/fw.yaml` and `config/`. For the workbench, read `cmd/fw-workbench/*.go`, the packages, and `examples/`.
3. If a document and the code disagree, the code wins. Say so in one sentence.
4. If you cannot verify a claim, leave it out, or mark it `(unverified)` in the text.
5. End every page with a `## Sources` section: a list of the files you read, as paths relative to the repository root, for example `featherweight-kernel/cli/serve.go`.

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
4. The site is MkDocs with the Material theme. Admonitions work: `!!! note`, `!!! warning`, with the body indented four spaces. Mermaid diagrams work in a fenced block with the language `mermaid`.
5. A page is between 60 and 400 lines. If a topic needs more, it needs two pages: say so in your report instead of writing a longer page.
