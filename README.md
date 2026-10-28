# featherweight-docs

The documentation site of Featherweight: the kernel and the workbench. The site is built with [MkDocs](https://www.mkdocs.org/) from the Markdown files under `docs/`, with a theme of its own in `theme/` that follows the look of bossmode.

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
| `DESIGN.md` | The plan of the look. The site wears the design language of bossmode. |
| `STYLE.md` | The writing rules of every page. |
| `theme/` | The theme of the site: the templates, the styles, the script of the shell, and the Archivo font files. |
| `hooks/site.py` | A build hook. It records the commits that the pages were written from, and moves the title and the Sources of a page into the panes. |
| `tools/shoot.mjs` | Takes a screenshot of a built page in headless Chrome, after clicks and key presses, and prints the console errors. |
| `docs/index.md` | The home page, with the opening scene. |
| `docs/getting-started/` | Walk-throughs for one machine and for Claude Code. |
| `docs/guide/` | Bossmode for operators: the places, decisions, bridges, duties, skills, the wiki, routines. |
| `docs/concepts/` | How the system works: the layers, the run lifecycle, the ledger, the safeguards, identity, the fleet. |
| `docs/deployment/` | Images, one Task on AX, a fleet, pools, bossmode, observability. |
| `docs/operations/` | Debugging a Task, platform gaps and patches. |
| `docs/reference/` | Every verb, flag, configuration key, route, and MCP tool. |
| `docs/assets/demos/` | The interactive demos and their kit. `README.md` there is the guide for the authors of demos. |
| `docs/assets/shots/` | Screenshots of bossmode, copied from the bossmode repository. |
| `docs/design/` | Copies of the design documents, made by `sync.sh`. Do not edit them here. |
| `docs/glossary.md` | The terms of the project. |

## Writing a page

Read `STYLE.md` first. Every fact comes from the code or the documents of the repositories, and every page ends with a `## Sources` list of the files it was written from. The design documents under `docs/design/` are copies: change them in their repository, then run `make sync`.
