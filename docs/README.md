# Documentation

Organised along [Diátaxis](https://diataxis.fr/) lines — learning, tasks, lookup, understanding.

**[Examples](examples/README.md)** — every diagram type and feature with its source, each one also [live and zoomable](https://ferroman.github.io/diagc/html/index.html).

## Tutorials

Learn by doing.

| | |
| --- | --- |
| [Your first diagram](tutorials/01-your-first-diagram.md) | Zero to a compiled, rendered, exported diagram in TypeScript. |
| [Draw one in the browser](tutorials/02-draw-in-the-studio.md) | The same result by dragging AWS icons onto a canvas. |

## How-to guides

Get something done.

| | |
| --- | --- |
| [Author diagrams in TypeScript](how-to/author-in-typescript.md) | Nodes, relations, styles, ER tables, metadata. |
| [Use planes and layers](how-to/use-planes-and-layers.md) | One model, several views: a second hierarchy, or an overlay. |
| [Add a legend](how-to/add-a-legend.md) | An on-canvas key: derived rows, plus what only you can say. |
| [Organise a large diagram](how-to/organise-large-diagrams.md) | Semantic zoom, pins, drilling — and when to split instead. |
| [Use the icon library](how-to/use-the-icon-library.md) | C4 stencils, the AWS, Azure and Google Cloud icon sets, importing your own. |
| [Draw on a diagram](how-to/draw-on-a-diagram.md) | Freehand pen and eraser on top of the boxes. |
| [Comment on a diagram](how-to/comment-on-a-diagram.md) | Remarks and resource links on any node or relation, read from the badge on the published page. |
| [Draw a git branching diagram](how-to/draw-a-git-branching-diagram.md) | Lanes of commits with branch-offs and merges, from the DSL or the studio. |
| [Draw an activity diagram](how-to/draw-an-activity-diagram.md) | Swimlanes, forks and joins, decisions, signals and interrupts. |
| [Draw a C4 diagram](how-to/draw-a-c4-diagram.md) | Solid person/system/container/component fills, and a technology subtitle. |
| [Draw a second-order thinking diagram](how-to/draw-a-second-order-thinking-diagram.md) | A decision, its consequences, and what follows from those — banded by order. |
| [Draw a fishbone diagram](how-to/draw-a-fishbone-diagram.md) | An effect, the categories of cause, causes and sub-causes on their bones. |
| [Draw a threat model](how-to/draw-a-threat-model.md) | A STRIDE data-flow diagram whose elements and flows carry their own threat register. |
| [Draw a deployment diagram](how-to/draw-a-deployment-diagram.md) | Environments, regions, zones, networks and subnets, and what runs inside them. |
| [Draw a plan](how-to/draw-a-plan.md) | A schedule: zones as date bars that nest, events, people as owner / executor / checker, and comments on any of them. |
| [Draw an ER diagram](how-to/draw-an-er-diagram.md) | Tables with typed columns and keys, and foreign keys pinned row to row. |
| [Draw a causal-loop diagram](how-to/draw-a-causal-loop-diagram.md) | Variables, signed links and delays — the reinforcing and balancing loops are found for you. |
| [Compose diagrams](how-to/compose-diagrams.md) | `include` and `key`: umbrella views over several diagrams. |
| [Publish and share](how-to/publish-and-share.md) | PNGs for a README, interactive pages, GitHub Pages. |
| [Show what changed](how-to/show-what-changed.md) | Before/after pictures between two git refs, for an ADR or a review. |
| [Eject a diagram to TypeScript](how-to/eject-to-typescript.md) | Promote a studio-drawn diagram to a verified, generated `.diagram.ts`. |
| [Place boxes on a generated diagram](how-to/position-a-generated-diagram.md) | Position a read-only `.diagram.ts` view without losing it on re-compile. |
| [Change keyboard shortcuts](how-to/change-keyboard-shortcuts.md) | Give any studio action its own key, a second key, or none. |
| [Add `diagc` to an existing repository](how-to/set-up-in-another-repo.md) | Install, `diagc init`, what to commit, editor types, `diagc lint` in CI. |
| [Write diagrams with a coding agent](how-to/write-diagrams-with-a-coding-agent.md) | `diagc init --agents`, `diagc guide`, the lint loop, and a picture the agent can check. |
| [Use the Obsidian plugin](how-to/obsidian-plugin.md) | Studio pane, diagram embeds and node-to-note links in a vault. |

## Reference

Look it up.

| | |
| --- | --- |
| [`diagc` CLI](reference/cli.md) | Commands, flags, environment variables, which files to commit. |
| [Model](reference/model.md) | Every field of a diagram, every validation code, registry defaults. |
| [Builder API](reference/builder-api.md) | The TypeScript DSL, method by method. |
| [Studio](reference/studio.md) | Panels, gestures, shortcuts. |
| [Library](reference/library.md) | The bundled C4, Tech, Kubernetes, AWS, Azure and Google Cloud packs. |
| [Renderer registries and theme](reference/renderer.md) | Override shapes, line styles, icons and colours when you render `DiagramView` yourself, in a checkout. |

## Explanation

Understand it.

| | |
| --- | --- |
| [How a diagram becomes a picture](explanation/architecture.md) | The pipeline, the packages, and why they are split that way. |
| [What is in a model](explanation/the-model.md) | The five decisions frozen into the data structure. |
| [What you see is not what is stored](explanation/views.md) | Semantic zoom, planes and layers — and how they interact. |
