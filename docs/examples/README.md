# Examples

Every diagram here is built by `diagc` from a source in this repository. Click an image to open the live page: it folds, drills and switches planes the way the PNG cannot. **Source** is the file to copy from; **Guide** is the page that explains it.

To open them in the studio instead, run `pnpm dev` in a clone and pick one from the diagram picker — they are grouped by the same folders.

- [Diagram types](#diagram-types)
- [Architecture](#architecture)
- [Features](#features)
- [The docs' own figures](#the-docs-own-figures)

## Diagram types

### C4

[![Internet banking system](../../.diagrams/static/docs/c4.png)](https://ferroman.github.io/diagc/html/docs/c4.html)

The canonical C4 picture, kept small: a person and two systems at context level, with the primary system's containers one drill below — solid fills per element kind and a technology subtitle, from `m.notation('c4')`.
[Live](https://ferroman.github.io/diagc/html/docs/c4.html) · [Source](../../.diagrams/src/docs/c4.diagram.ts) · [Guide](../how-to/draw-a-c4-diagram.md)

### Activity

[![Order processing](../../.diagrams/static/docs/activity.png)](https://ferroman.github.io/diagc/html/docs/activity.html)

Order processing across three swimlanes: a decision, a fork and join, an object flow, and an interruptible region that a received signal cuts short — `m.activity()` with `lane`, `region`, `flow`, `objectFlow` and `interrupt`.
[Live](https://ferroman.github.io/diagc/html/docs/activity.html) · [Source](../../.diagrams/src/docs/activity.diagram.ts) · [Guide](../how-to/draw-an-activity-diagram.md)

### Git graph

[![Branching strategy](../../.diagrams/static/docs/git-graph.png)](https://ferroman.github.io/diagc/html/docs/git-graph.html)

A branching strategy as lanes of commits: a release line, a hotfix, release candidates, a nightly integration lane and two feature teams, with tags, branch-offs and merges — `m.gitGraph()`.
[Live](https://ferroman.github.io/diagc/html/docs/git-graph.html) · [Source](../../.diagrams/src/docs/git-graph.diagram.ts) · [Guide](../how-to/draw-a-git-branching-diagram.md)

### Fishbone

[![Fishbone: checkout outage on release day](../../.diagrams/static/docs/fishbone.png)](https://ferroman.github.io/diagc/html/docs/fishbone.html)

A postmortem's cause-and-effect fish: the six `Software` preset bones, with causes and sub-causes hung on them — `m.fishbone()` and `categories('Software')`.
[Live](https://ferroman.github.io/diagc/html/docs/fishbone.html) · [Source](../../.diagrams/src/docs/fishbone.diagram.ts) · [Guide](../how-to/draw-a-fishbone-diagram.md)

### Second-order thinking

[![Second-order thinking: splitting the monolith](../../.diagrams/static/docs/second-order.png)](https://ferroman.github.io/diagc/html/docs/second-order.html)

One decision and what follows from it, banded by order: good, bad and neutral consequences, and two branches that join — `m.secondOrder()` with `then` and `leadsTo`.
[Live](https://ferroman.github.io/diagc/html/docs/second-order.html) · [Source](../../.diagrams/src/docs/second-order.diagram.ts) · [Guide](../how-to/draw-a-second-order-thinking-diagram.md)

### Threat model

[![Threat model: online shop checkout](../../.diagrams/static/docs/threat-model.png)](https://ferroman.github.io/diagc/html/docs/threat-model.html)

A STRIDE data-flow diagram of a checkout: entities, processes and a store inside two trust boundaries, with seven threats recorded on the elements and flows they belong to. The live page lists them in a register under the canvas — `m.threatModel()`.
[Live](https://ferroman.github.io/diagc/html/docs/threat-model.html) · [Source](../../.diagrams/src/docs/threat-model.diagram.ts) · [Guide](../how-to/draw-a-threat-model.md)

## Architecture

### Acme SaaS

[![Acme SaaS](../../.diagrams/static/examples/acme.png)](https://ferroman.github.io/diagc/html/examples/acme.html)

A small platform seen three ways over the same services: an architecture plane of who owns what, an infra plane of where it runs, and a flow plane that shows only the data-flow layer — plus icons and node metadata. The image shows the first plane; the live page switches between them.
[Live](https://ferroman.github.io/diagc/html/examples/acme.html) · [Source](../../.diagrams/src/examples/acme.diagram.ts) · [Guide](../how-to/author-in-typescript.md)

### Multi-AZ EKS on AWS

[![Multi-AZ EKS on AWS](../../.diagrams/static/examples/aws-multi-az.png)](https://ferroman.github.io/diagc/html/examples/aws-multi-az.html)

A classic AWS reference architecture drawn with the bundled library: `aws-*` boundary containers with corner badges, official service icons, Kubernetes pod icons and tech-pack logos, all as `image` asset refs.
[Live](https://ferroman.github.io/diagc/html/examples/aws-multi-az.html) · [Source](../../.diagrams/src/examples/aws-multi-az.diagram.ts) · [Guide](../how-to/use-the-icon-library.md)

## Features

### Semantic zoom

[![Semantic zoom: two folded groups](../../.diagrams/static/examples/nested-zoom-demo.png)](https://ferroman.github.io/diagc/html/examples/nested-zoom-demo.html)

Everything rests folded: two groups, each showing how many children it holds, and the three relations between their contents drawn as one aggregated arrow. Open the live page and double-click a group to unfold it.
[Live](https://ferroman.github.io/diagc/html/examples/nested-zoom-demo.html) · [Source](../../.diagrams/src/examples/nested-zoom-demo.diagram.json) · [Guide](../how-to/organise-large-diagrams.md)

### Planes

[![Architecture plane](../../.diagrams/static/docs/plane-architecture.png)](https://ferroman.github.io/diagc/html/docs/plane-architecture.html)
[![Infra plane](../../.diagrams/static/docs/plane-infra.png)](https://ferroman.github.io/diagc/html/docs/plane-infra.html)
[![Flow plane](../../.diagrams/static/docs/plane-flow.png)](https://ferroman.github.io/diagc/html/docs/plane-flow.html)

One model, three hierarchies over the same nodes: who owns what, where it runs, and a flow view that borrows the first plane's structure, presets a layer and drops the ordinary arrows. Three thin files share one module and differ only in which plane comes first.
[Live](https://ferroman.github.io/diagc/html/docs/plane-architecture.html) · [Source](../../.diagrams/src/docs/planes.shared.ts) · [Guide](../how-to/use-planes-and-layers.md)

### Legend

[![Legend example](../../.diagrams/static/docs/legend.png)](https://ferroman.github.io/diagc/html/docs/legend.html)

An on-canvas key: rows derived from the layers and relation kinds in use, plus two hand-written ones — a caption for a kind, and a colour only the author can explain.
[Live](https://ferroman.github.io/diagc/html/docs/legend.html) · [Source](../../.diagrams/src/docs/legend.diagram.ts) · [Guide](../how-to/add-a-legend.md)

## The docs' own figures

The explanation pages are illustrated with the tool too:
[anatomy of a model](https://ferroman.github.io/diagc/html/docs/model.html) ([source](../../.diagrams/src/docs/model.diagram.ts), in [What is in a model](../explanation/the-model.md)) ·
[the pipeline](https://ferroman.github.io/diagc/html/docs/pipeline.html) ([source](../../.diagrams/src/docs/pipeline.diagram.ts), in [How a diagram becomes a picture](../explanation/architecture.md)) ·
[compiling a view](https://ferroman.github.io/diagc/html/docs/view-compile.html) ([source](../../.diagrams/src/docs/view-compile.diagram.ts), in [What you see is not what is stored](../explanation/views.md)) ·
[the workspace](https://ferroman.github.io/diagc/html/docs/workspace.html) ([source](../../.diagrams/src/docs/workspace.diagram.ts), in the same page).
