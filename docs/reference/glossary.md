# Glossary

The words the docs, the studio and the CLI use, one or two sentences each, with the page
that explains them. Contributors: the names these take in the code are in
[CONTRIBUTING.md](../../CONTRIBUTING.md#code-vocabulary).

## Artifact

The validated JSON a diagram source compiles to, in `.diagrams/.artifacts/`. The studio
and `publish` read artifacts, never sources, so an edit shows up only after a compile.
See [Why an artifact at all](../explanation/architecture.md#why-an-artifact-at-all).

## Badge

The count at an element's bottom-right corner, or a quarter of the way along an arrow,
saying how many threats or comments it carries (`↗` when it has only links). Click it to
open the element's note. See [Comment on a diagram](../how-to/comment-on-a-diagram.md).

## Chip

A small pill-shaped control or label: the `▸`/`▾` fold chip and the `⤢` drill chip on a
group header, the layer chips, top-bar chips such as **Save positions**, a plan's role
chips, a legend's colour chip. See [Studio](studio.md#top-bar).

## Drill

Entering a node as its own diagram with the `⤢` chip: it becomes the whole canvas, and
everything outside it becomes an external stub. See
[Enter a node as its own diagram](../how-to/organise-large-diagrams.md#enter-a-node-as-its-own-diagram).

## Element

A node or a relation, as something that can carry threats, comments and links. See
[Comment on a diagram](../how-to/comment-on-a-diagram.md).

## External stub

In a drill view, the stand-in at the edge of the canvas for a node outside the drilled
subtree, so arrows that leave the subtree still land somewhere. See
[Enter a node as its own diagram](../how-to/organise-large-diagrams.md#enter-a-node-as-its-own-diagram).

## Fold

A group shown shut, as one box that hides its children. Semantic zoom decides what is
folded; a pin overrides it. See [Semantic zoom](../explanation/views.md#semantic-zoom).

## Include

A node that pulls another diagram in under itself at compile time, so one umbrella view
can show several diagrams. See [Compose diagrams](../how-to/compose-diagrams.md).

## Lane

In a git branching diagram, the row a branch's commits sit on. In an activity diagram, a
swimlane for one actor. See [Draw a git branching diagram](../how-to/draw-a-git-branching-diagram.md)
and [Draw an activity diagram](../how-to/draw-an-activity-diagram.md).

## Layer

A named, cross-cutting set of nodes and relations that a viewer switches on or off. Layers
are off by default, and toggling one never moves a box. See
[Layers](../explanation/views.md#layers).

## Layout overlay

What a diagram's layout sidecar holds: saved positions, sizes, layout settings and open
groups, per plane. It is kept out of the model so that meaning and coordinates change in
different diffs. See [`LayoutOverlay`](model.md#layoutoverlay-namelayoutjson).

## Legend

The on-canvas key: rows derived from what the diagram uses, plus the items you add. See
[Add a legend](../how-to/add-a-legend.md).

## Notation

A visual language for the whole model or one plane — `c4`, `git-graph`, `threat-model`,
`plan` and others — that changes how nodes and relations are drawn and laid out. See
[`DiagramModel`](model.md#diagrammodel).

## Note

The speech bubble that opens from a badge, listing an element's threats, comments and
links. You can drag it where it reads best, and its place is saved. See
[How threats are shown](../how-to/draw-a-threat-model.md#how-threats-are-shown).

## Pin

A viewer's override that holds a group open or shut, whatever semantic zoom would decide.
Pins are viewer state and are not saved. Elsewhere the docs also use "pin" in its everyday
sense: a pinned version, style or edge end. See
[Semantic zoom](../explanation/views.md#semantic-zoom).

## Plane

An alternative containment hierarchy over the same nodes, so one model can be read as,
say, an architecture view and an infrastructure view. See
[Planes](../explanation/views.md#planes).

## Semantic zoom

The diagram rests folded, every group one box. Double-click a group to unfold it; its
siblings stay folded, so you read one path of detail against an overview. See
[Semantic zoom](../explanation/views.md#semantic-zoom).

## Sidecar

A file kept beside a diagram's source: `<name>.layout.json` holds its layout overlay, and
`<name>.drawings.json` its freehand strokes. See
[Files and directories](cli.md#files-and-directories).

## Starter

The small example for each diagram type that `diagc init` copies into a repository and
`diagc guide` quotes. See [`init`](cli.md#init).

## Text node

A node with no type, drawn as bare text rather than a box. Causal-loop variables are text
nodes. See [Draw a causal-loop diagram](../how-to/draw-a-causal-loop-diagram.md).

## Threat register

The threats an element carries, each with a severity, a status and a mitigation. The
published page also lists every register under the canvas. See
[Draw a threat model](../how-to/draw-a-threat-model.md).

## Zone

In a plan, a date bar that can nest and carries role chips. In a deployment diagram, an
availability zone or another failure domain. See [Draw a plan](../how-to/draw-a-plan.md)
and [The vocabulary](../how-to/draw-a-deployment-diagram.md#the-vocabulary).
