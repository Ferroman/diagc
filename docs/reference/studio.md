# Studio reference

Every panel, gesture and shortcut in the browser app. Start it with `pnpm dev` (in this repo) or `diagc studio` (anywhere else).

## Modes

| Mode | How you get there | What it allows |
| --- | --- | --- |
| **View** | default | Navigate, fold/unfold, toggle layers and planes, inspect. |
| **Edit** | **Edit** in the top bar, on a JSON-backed diagram | Everything in view, plus mutation and Save. |

A diagram compiled from `.diagram.ts` shows a **read-only** chip and cannot enter edit mode. Only `.diagram.json` sources are browser-editable.

**New diagram** is always available while the dev server runs — it creates an empty `.diagram.json` and opens it for editing.

## Navigation

| Gesture | Effect |
| --- | --- |
| Double-click a group | Unfold it and glide into it |
| Double-click it again | Fold it back |
| Double-click a leaf | Zoom to it |
| Double-click empty canvas (view mode) | Fit the whole diagram |
| Scroll | Pan |
| Pinch, or the corner controls | Zoom |
| Pin chip on a group header | Force expanded/collapsed, overriding the automatic choice |
| `⤢` chip on a group header | Enter it as its own diagram |
| `◎` in the corner controls | Dim everything unconnected to the selection |
| `▤` in the corner controls | Show/hide the legend. Only present when the diagram declares one and it has rows. A viewer preference, never saved. |
| `◉` in the corner controls, or `L` | Laser pointer for screenshares: drag to draw a red trail that fades out after a second. Works in both modes and inside a drilled-in group; never saved. `Esc` switches it off. |
| Click a layer row in the legend | Toggle that overlay, like the layer chips |

## Editing

| Gesture | Effect |
| --- | --- |
| Double-click empty canvas | Drop a node there and name it |
| Drag a node onto another | Nest it inside |
| Drag a node near a sibling's edge or centre | It snaps into line and a dashed guide shows the match. Also with Alt+drag in view mode. |
| Drag from a connect dot to another node | Create a `sync` relation, pinned to both dots |
| Double-click a node | Rename in place (Enter commits, Escape cancels) |
| Double-click an edge | Edit its label in place |
| Drag an edge endpoint onto another node | Reconnect that end |
| Drag an image file onto the canvas, or paste one | Create an image node |
| Drag an image node's corner handles | Resize (aspect locked) |
| Click a `db-table` node's rows | Add, edit, remove or reorder columns in place |
| Drag from a column row's connect point to another table | Create a foreign key, drawn crow's-foot and anchored to that row |
| **Pen** in the toolbar (`p`), then drag on the canvas | Draw a freehand stroke in the chosen color and width |
| **Eraser** in the toolbar (`e`), then click a stroke | Erase it (one stroke per click; undo brings it back) |
| `✎` in the corner controls, or the **Drawings** row in the legend | Show/hide all drawings — tracing paper, never saved |

New nodes are **typeless** — just a label — so quick sketches stay clean. Give a node a `type` in its panel to get the registry's shape and icon.

## Keyboard

| Action | Shortcut |
| --- | --- |
| Add node | `N` |
| Nudge the selected node(s) | Arrow keys (5px; `Shift` = 20px; the grid step when Snap is on). Works in view mode too — no Alt needed. |
| Undo | `Ctrl/Cmd + Z` |
| Redo | `Ctrl/Cmd + Shift + Z` or `Ctrl + Y` |
| Save | `Ctrl/Cmd + S` |
| Pen | `P` |
| Eraser | `E` |
| Laser pointer on/off (both modes) | `L` |
| Back to Select, laser off | `Esc` |

Shortcuts are ignored while you are typing in a form field. History is capped at 100 steps.

## Panels

**Properties** (node selected) — name, `type`, `icon`, colour swatches, **Technology**, description, free-form metadata rows, memberships (which parents contain it, per plane), delete.

**Properties** (relation selected) — `kind`, label, `layer`, delete, plus a *Style* section: line shape (curved / straight / step), colour, thickness, line (solid / dashed / dotted), arrow end (arrow / dot / square / diamond / none), from/to side, animated. Anything left at *default* falls back to the kind's registry style and the layer tint.

**Library** — the palette. See [Library reference](library.md) and [Use the icon library](../how-to/use-the-icon-library.md).

**Layers & planes** — add, edit and remove layers (id, name, tint) and planes (id, name, containment borrowing, preset layers, its own **Notation**). In edit mode it also carries a model-level **Notation** selector (`default look`, `causal-loop`, `git-graph`, `c4` — a plane's own notation wins where set) and a **Legend** checkbox, which adds or removes the diagram's `legend` declaration; its title, position, sections and items are authored in the file. See [Draw a C4 diagram](../how-to/draw-a-c4-diagram.md) and [Add a legend](../how-to/add-a-legend.md).

**Git** — on a plane with the `git-graph` notation, in edit mode: add lanes and commits, branch the selected commit into another lane, merge it into one, set its gap. Each action is one undo step. See [Draw a git branching diagram](../how-to/draw-a-git-branching-diagram.md).

**Activity** — when an `activity-frame`, `activity-lane` or `activity-region` is selected, in edit mode. On a frame: name a lane, pick a colour, **Add lane** (lanes stack in the order you add them). On a lane or region: an optional name field plus one quick-add button per leaf type (action, decision, fork/join bar, start, end, send signal, receive signal, object, note), and, on a lane only, **Add region**. Every add parents the new node in the selected scope and places it at a deterministic spot, sidestepping drag-and-drop entirely — the model never passes through a state validation would refuse. See [Draw an activity diagram](../how-to/draw-an-activity-diagram.md).

## Header controls

| Control | Effect |
| --- | --- |
| Diagram picker | Switch diagrams |
| Light / dark | Theme. A viewer preference, never saved to the model. |
| `✏ sketch` / style preset | `clean`, `sketch`, `hand-drawn`, `pencil`, `blueprint`, `marker`. Remembered across reloads, independent of light/dark. |
| `⋮⋮ Snap` | Snap dragged boxes (and arrow-key nudges) to a 10px grid; the background dots become the grid. A viewer preference, remembered across reloads, never saved to the diagram. |
| Plane switcher | Present when the diagram declares planes |
| Layout pickers | Algorithm, direction, spacing, edge routing and **Wrap** (off / square / screen / wide — folds a long layered chain onto several rows). View mode previews; edit mode saves them to the layout file. |
| **Save positions** / **Freeze layout** (view mode) | Write Alt-dragged boxes to `<name>.layout.json`; pin every box and mark the plane manual (click again to hand it back). See [Place boxes on a generated diagram](../how-to/position-a-generated-diagram.md). |

Switching planes keeps your place — the groups containing what you were looking at open automatically in the new plane.

## Saving

Save **validates first** and refuses to write an invalid model, surfacing the same issues the compiler would. On success it writes these files next to your other sources:

- `.diagrams/src/<name>.diagram.json` — the model
- `.diagrams/src/<name>.layout.json` — positions, sizes, and which planes have automatic layout switched off
- `.diagrams/src/<name>.drawings.json` — freehand strokes, only when there are any

The layout file is paired by name alone, so a diagram compiled from TypeScript can have one too — see
[Place boxes on a generated diagram](../how-to/position-a-generated-diagram.md).

Subfolders are preserved. All are pretty-printed JSON that reviews like any other source.

An unsaved dot sits next to Save while the session is dirty; edits autosave a moment after you stop and **Done** flushes a final save, so nothing is discarded on the way out — undo is how you take a change back.

## Gotchas

- **The studio reads artifacts, not sources.** Compile at least once, or you get a "No artifacts found" banner. `pnpm dev` handles this by running the watcher.
- **Pins, theme and style preset are viewer state.** They are not written to the diagram file — except the style preset, which a diagram *may* pin via its `style` field.
- **JSON diagrams that declare `include` show their raw source.** Composed content is only visible for compiled, read-only diagrams.
- **Library saves are best-effort.** A failed write to `library.json` is currently swallowed silently.
- On a `git-graph` plane the layout pickers (algorithm, direction, spacing, routing) are hidden: the notation owns the arrangement. Auto-layout on/off and Re-layout still work.

## See also

- [Tutorial 2 — Draw one in the browser](../tutorials/02-draw-in-the-studio.md)
- [Use planes and layers](../how-to/use-planes-and-layers.md)
- [Organise a large diagram](../how-to/organise-large-diagrams.md)
