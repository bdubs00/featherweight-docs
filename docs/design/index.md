# About these documents

The pages under `design/` are copies of the design documents of the product repositories. The script `sync.sh` of the docs repository copies them before each build: `make build` and `make serve` run `sync` first. The repositories are the source of truth. To change a document, change it in its repository, and the next build picks it up.

The script changes two things in each copy. A relative link to a source file becomes a link to that file on GitHub. A link between the documents follows the new name of its target. The diagrams of the kernel, as SVG and Mermaid files, go to `design/diagrams/`.

| Page | Source | What it is for |
|---|---|---|
| [Kernel architecture](kernel-architecture.md) | `featherweight-kernel/docs/ARCHITECTURE.md` | The design of `fw`: the ledger, the kernel, the models, the tools, the surfaces, the bus, ax, and security. |
| [Kernel map](kernel-map.md) | `featherweight-kernel/docs/KERNEL_MAP.md` | A survey of the implementation with three diagrams, from the components to the boot inside ax, with links to the source. |
| [Kernel roadmap](kernel-roadmap.md) | `featherweight-kernel/docs/ROADMAP.md` | The order of the work for the kernel and the workbench, with the stages that are done and the stages that remain. |
| [Workbench architecture](workbench-architecture.md) | `featherweight-workbench/docs/ARCHITECTURE.md` | The design of `fw-workbench`: the routes for people, the MCP server, the fleet, the sign-in, the connections, the sources, and the pools. |
| [Product direction](product-direction.md) | `featherweight-workbench/docs/PRODUCT_DIRECTION.md` | The thesis of the product: durable actors on AX and Substrate that cost nothing while they wait. |

The other pages of this site link to sections of these documents instead of copying them. A section anchor is the heading in lower case with dashes for spaces and without the dot, for example `kernel-architecture.md#47-branches` for "4.7 Branches".

To refresh the copies by hand, run the script from the root of the docs repository:

```sh
./sync.sh
```

The variables `KERNEL_DIR` and `WORKBENCH_DIR` point the script at checkouts in other places. By default it reads the two repositories next to this one.
