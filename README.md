# featherweight-docs

The documentation site of Featherweight: the kernel and the workbench. The site is built with [MkDocs](https://www.mkdocs.org/) and the [Material](https://squidfunk.github.io/mkdocs-material/) theme from the Markdown files under `docs/`.

## Build and serve

Install [uv](https://docs.astral.sh/uv/getting-started/installation/) once. The Makefile runs MkDocs through `uvx`, so no other install is needed.

```sh
make serve    # http://127.0.0.1:8000, rebuilds on change
make build    # writes the site into site/
```

Both targets run `./sync.sh` first. The script copies the design documents of the two repositories into `docs/design/` and rewrites their relative links. The repositories must sit next to this one: `../featherweight-kernel` and `../featherweight-workbench`. The variables `KERNEL_DIR` and `WORKBENCH_DIR` point the script elsewhere.

## Layout

| Path | What |
|---|---|
| `mkdocs.yml` | The site configuration and the navigation. Add a new page here. |
| `docs/index.md` | The home page. |
| `docs/concepts/` | How the system works: the layers, the run lifecycle, the ledger, the safeguards, identity, the fleet. |
| `docs/getting-started/` | Walk-throughs for one machine and for Claude Code. |
| `docs/reference/` | Every verb, flag, configuration key, route, and MCP tool. |
| `docs/deployment/` | Images, one Task on AX, a fleet, observability. |
| `docs/operations/` | Debugging a Task, platform gaps and patches. |
| `docs/design/` | Copies of the design documents, made by `sync.sh`. Do not edit them here. |
| `docs/glossary.md` | The terms of the project. |
| `STYLE.md` | The writing rules of every page. |

## Writing a page

Read `STYLE.md` first. Every fact comes from the code or the documents of the repositories, and every page ends with a `## Sources` list of the files it was written from. The design documents under `docs/design/` are copies: change them in their repository, then run `make sync`.
