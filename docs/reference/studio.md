# Studio reference

Every panel, gesture and shortcut in the browser app. Start it with `pnpm dev` (in this repo) or `diagc studio` (anywhere else).

## Modes

| Mode | How you get there | What it allows |
| --- | --- | --- |
| **View** | default | Navigate, fold/unfold, toggle layers and planes, inspect. |
| **Edit** | **Edit** in the top bar, on a JSON-backed diagram | Everything in view, plus mutation and Save. |

A diagram compiled from `.diagram.ts` shows a **read-only** chip and cannot enter edit mode. Only `.diagram.json` sources are browser-editable.

**New diagram** (`＋`, beside the diagram picker) is always available while the dev server runs — it creates an empty `.diagram.json` and opens it for editing.

## Navigation

| Gesture | Effect |
| --- | --- |
| Double-click a group | Unfold it and glide into it |
| Double-click it again | Fold it back |
| Double-click a leaf | Zoom to it |
| Double-click empty canvas (view mode) | Fit the whole diagram |
| `Shift` + click a node, or `Shift` + drag on empty canvas | Add to the selection / draw a marquee. Dragging any selected node drags them all. |
| Scroll | Pan |
| Pinch, or the corner controls | Zoom |
| `▸` / `▾` chip on a group header | Unfold the group in place / fold it back, without gliding into it |
| `⤢` chip on a group header | Enter it as its own diagram |
| `Alt` + drag a node | Move it (view mode). A node dragged past its group's wall grows the group. **Save positions** writes the move. |
| `Alt` + drag an edge label | Slide it along its edge, or across to the other side of the line (view mode). Saved by the same chip. |
| `◎` in the corner controls | Dim everything unconnected to the selection |
| `▤` in the corner controls | Show/hide the legend. Only present when the diagram declares one and it has rows. A viewer preference, never saved. |
| `◉` in the corner controls, or `L` | Laser pointer for screenshares: drag to draw a red trail that fades out after a second. Works in both modes and inside a drilled-in group; never saved. `Esc` switches it off. |
| Click a layer row in the legend | Toggle that overlay, like the layer chips |

## Editing

| Gesture | Effect |
| --- | --- |
| Double-click empty canvas | Drop a node there and name it |
| `+` on the selected node | Add the node the notation expects on it — a category on the effect or a cause on a bone (fishbone; a sub-cause offers nothing), a consequence (second-order), a flow to a new process or a process inside a boundary (threat model), a commit at the lane's tip on a lane or its last commit (git graph; a mid-lane commit offers nothing — branching and merging need a target lane, so they stay in the Git panel), a connected node of the same type on any other diagram that offers one — and start naming it. `Tab` does the same. |
| Threat badge (the count on an element or a flow) | Click to open the element's threat bubble; click again to close it. Saved with the layout, so the published page and the PNG show the bubbles you left open. In view mode (and in the published page) the badge still toggles, for the session only — entering edit mode shows the saved state. |
| Threat bubble | Double-click a title to retitle it in place; click the status word to advance it (open → mitigated → accepted → n/a); `▸` opens the description and mitigation, written in place and committed when you leave the field (`Escape` restores). `+` adds a threat and opens its title. A bubble opens on the nearest spot next to its badge that covers nothing (its tail points at the badge); drag it where it reads best — the offset from the badge is saved and it reopens there. Click its body to select the element (Properties → Threats holds category and severity). |
| Empty threat badge (`+` at a threat-model element's corner, or on a flow) | Adds the element's first threat, opens its bubble and its title field. |
| `Notes` chip | Opens every threat bubble in the diagram, or — once they are all open — closes them all (edit mode; one undo step). Model-wide: an element the active plane does not draw still gets its flag, ready for the view that does. |
| Drag a library stencil onto a node | The new node nests inside it |
| Drag a node near a sibling's edge or centre | It snaps into line and a dashed guide shows the match. Also with Alt+drag in view mode. |
| Drag a node past the wall of its group | The group grows around it, in any direction — a drag never takes a node out of its group. Also with Alt+drag in view mode. |
| Align / distribute toolbar | Appears at the top of the canvas when two or more nodes are selected: align left/centre/right/top/middle/bottom, distribute (3+). In view mode it appears when positions can be saved. |
| Drag from a connect dot to another node | Create a `sync` relation, pinned to both dots — a `data-flow` on a `threat-model` diagram, the one notation the kind means something to |
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

Every action below can be given a different key, a second key, or none: open **Keyboard shortcuts** with the `⚙` in the top bar or `?` — see [Change keyboard shortcuts](../how-to/change-keyboard-shortcuts.md). These are the defaults; `Ctrl` is `Cmd` on a Mac. Button tooltips always show the key an action has *now*.

| Action | Default | Where |
| --- | --- | --- |
| Open the diagram picker | `Ctrl + K` | both modes |
| Edit / Done | `Ctrl + Enter` | both modes |
| Rename diagram | `F2` | view mode |
| Add node | `N` | edit mode |
| Add the node the notation expects on the selection and start naming it (same as the node's `+`); inside a name being typed, `Tab` commits it and adds the next | `Tab` | edit mode |
| Undo | `Ctrl + Z` | edit mode |
| Redo | `Ctrl + Shift + Z` or `Ctrl + Y` | edit mode |
| Save | `Ctrl + S` | edit mode |
| Group the selection | `Ctrl + G` | edit mode |
| Select · Pen · Eraser | `V` · `P` · `E` | edit mode |
| Fit view · zoom in · zoom out | `F` · `=` or `+` · `-` | both modes |
| Laser pointer on/off | `L` | both modes |
| Show/hide legend | `Shift + L` | both modes |
| Show/hide left · right panel | `[` · `]` | both modes |
| Light / dark | `Shift + T` | both modes |
| Snap to grid | `Shift + S` | both modes |
| Keyboard shortcuts | `?` | both modes |

**Bindable, no default:** New / Duplicate / Eject diagram, Re-layout, Auto-layout, open/close all threat notes, pen width (thin / medium / thick), dim unconnected, show/hide drawings, show/hide loop badges, Freeze layout, Save positions, Auto-arrange, align left / centre / right / top / middle / bottom, distribute horizontally / vertically, inspector tab (Properties / Library).

**Fixed** — gestures and cancels, not rebindable:

| Key | Does |
| --- | --- |
| `Esc` | Back to Select, laser off, cancel what is being typed |
| `Delete` / `Backspace` | Delete the selection (edit mode) |
| Arrow keys | Nudge the selected node(s): 5px; `Shift` = 20px; the grid step when Snap is on. Works in view mode too — no Alt needed. |
| `Shift` + click / drag | Add to the selection, marquee-select |
| `Alt` + drag | Move a box or an edge label in view mode |

A shortcut acts only while its button would: Pen does nothing while you are drilled into a group, Save positions nothing when nothing moved. Shortcuts are ignored while you are typing in a field and, in the Obsidian pane, while focus is anywhere outside the studio. A held key repeats only for Undo, Redo and zoom. Letters and digits work under a non-Latin keyboard layout (the physical key is read); a symbol follows the character your layout types. History is capped at 100 steps.

## Panels

**Properties** (node selected) — name, `type`, `icon`, colour swatches, **Technology**, description, free-form metadata rows, **Threats** (below), memberships (which parents contain it, per plane), **Position** (X/Y in parent-relative px — pinned values editable, unpinned nodes show where they sit; Clear hands the node back to the algorithm), delete.

**Properties** (relation selected) — `kind`, label, **Threats** (below), `layer`, delete, plus a *Style* section: line shape (curved / straight / step), colour, thickness, line (solid / dashed / dotted), arrow end (arrow / dot / square / diamond / none), from/to side, animated. Anything left at *default* falls back to the kind's registry style and the layer tint.

**Threats** — a section of both Properties panels, shown on a `threat-model` diagram, and on any element that already carries threats whatever the notation (so turning the notation off never strands them). The header counts *open / total*; on a relation, a **Crosses: *from* → *to*** line names the two trust boundaries its ends sit in (`outside` where there is none), derived from containment. The add row is a STRIDE category select — the categories that apply to this element's type first, then the rest behind a separator — a threat title, and **Add** (disabled while the title is blank; `Enter` adds). Each existing threat is a row: category, title (commits on blur or `Enter`), severity (`—`, low, medium, high, critical), status (open, mitigated, accepted, not-applicable), a **▸ details** disclosure holding description and mitigation, and **Remove**. Every commit is one undo step, and a commit that changes nothing lands none. See [Draw a threat model](../how-to/draw-a-threat-model.md).

**Library** — the palette. See [Library reference](library.md) and [Use the icon library](../how-to/use-the-icon-library.md).

The left dock keeps the tab you chose: selecting on the canvas never switches it. **Add node** in the Library opens Properties for the name; a placed stencil names in place on the canvas.

The right dock stacks its panels — the notation's own panel (Git, Activity, And then what?, Fishbone or Threat model), then **Layout & style**, then **Layers & planes** — in one scrolling column. Click a panel's heading to fold it down to that heading; the others stay open. Which panels are folded is a viewer preference, remembered across reloads and never saved to the diagram. The dock's own chevron still hides the whole column.

**Layout & style** — how the active plane is arranged and drawn, in both modes. One row per setting: **Algorithm**, **Direction**, **Wrap** (off / square / screen / wide — folds a long layered chain onto several rows), **Spacing**, **Edges** (rounded / square corners) and **Style** (`clean`, `sketch`, `hand-drawn`, `pencil`, `blueprint`, `marker`). View mode previews the layout settings (**Reset layout** drops the preview); edit mode saves them to the layout file. Style is a viewer preference in view mode, remembered across reloads and independent of light/dark; in edit mode the same row pins a style into the diagram. The hatched presets (`hand-drawn`, `pencil`, `marker`) hatch boxes only: an open group takes a plain wash, since its area is where its children and their edges are drawn, and an outline boundary (C4 boundary, AWS region) stays a line in every preset. Under the rows sit the mode's layout commands: **Auto-arrange** and **Freeze layout** in view mode (see [Place boxes on a generated diagram](../how-to/position-a-generated-diagram.md)), **Re-layout** and **Auto-layout** in edit mode. Their shortcuts work whether or not the section is folded.

**Layers & planes** — add, edit and remove layers (id, name, tint) and planes (id, name, containment borrowing, preset layers, its own **Notation**). In edit mode it also carries a model-level **Notation** selector (`default look`, `causal-loop`, `git-graph`, `c4`, `second-order` (shown as *Second-order thinking*), `fishbone` (shown as *Fishbone (cause and effect)*), `threat-model` (shown as *Threat model (STRIDE)*) — a plane's own notation wins where set) and a **Legend** checkbox, which adds or removes the diagram's `legend` declaration; its title, position, sections and items are authored in the file. See [Draw a C4 diagram](../how-to/draw-a-c4-diagram.md) and [Add a legend](../how-to/add-a-legend.md).

**Git** — on a plane with the `git-graph` notation, in edit mode: add lanes and commits, branch the selected commit into another lane, merge it into one, set its gap. Each action is one undo step. **Add commit** is the same action as the `+` on a selected lane or tip commit. See [Draw a git branching diagram](../how-to/draw-a-git-branching-diagram.md).

**Activity** — when an `activity-frame`, `activity-lane` or `activity-region` is selected, in edit mode. On a frame: name a lane, pick a colour, **Add lane** (lanes stack in the order you add them). On a lane or region: an optional name field plus one quick-add button per leaf type (action, decision, fork/join bar, start, end, send signal, receive signal, object, note), and, on a lane only, **Add region**. Every add parents the new node in the selected scope and places it at a deterministic spot, sidestepping drag-and-drop entirely — the model never passes through a state validation would refuse. See [Draw an activity diagram](../how-to/draw-an-activity-diagram.md).

**Second-order thinking** — on a diagram with the `second-order` notation, in edit mode: "And then what?" with **Good consequence** / **Bad consequence** / **Neutral consequence**, enabled once a decision or consequence is selected, plus **Add a decision**, always offered. Each add is one undo step for the box and its arrow together; it also opens the new node's name for typing, which is a separate, later undo step once committed. Lists the notation's validation issues (an unreachable consequence, a cycle), each clickable to select the offending node. See [Draw a second-order thinking diagram](../how-to/draw-a-second-order-thinking-diagram.md).

**Fishbone** — on a diagram with the `fishbone` notation, in edit mode: **Add an effect** until there is one; then **Software** / **6M** / **4S** while the effect has no bones; then **Add a category** (nothing or the effect selected) or **Add a cause** (a bone or a cause selected — disabled on a sub-cause, which takes nothing). Each add is one undo step for the node and its arrow together; it also opens the new node's name for typing, which is a separate, later undo step once committed. Lists the notation's validation issues, node ones clickable to select. The arrangement is the notation's own, so the layout controls are absent and a node on the fish cannot be dragged, nudged or aligned. See [Draw a fishbone diagram](../how-to/draw-a-fishbone-diagram.md).

**Threat model** — on a diagram with the `threat-model` notation, in **both** modes: this panel only reads, so a read-only `.diagram.ts` threat model gets its register too. **Crossings to review** lists every flow whose two ends sit in different trust boundaries and that carries no threat yet — the flow's two elements on one line, the two boundaries (`outside` where there is none) underneath — each clickable to select it. **Register** lists every threat in the diagram grouped by the element that carries it, in model order (elements first, then relations), each element's row clickable to select it and showing its own *open / total*. Threat and threat-model validation issues follow under **Issues**, clickable where they name an element. Every element with threats wears a badge that opens its bubble on the canvas — see the Editing table. Title, status, description and mitigation can be written there; category and severity live in the Threats section of the Properties panel. See [Draw a threat model](../how-to/draw-a-threat-model.md).

## Top bar

One row, in both modes. Layout and style are not here: they are the right dock's **Layout & style** section (above).

| Control | Effect |
| --- | --- |
| Diagram picker (`Ctrl/Cmd + K` by default) | Switch diagrams. Type to search — every word must appear somewhere in the name, folder included. Diagrams are grouped by the folder part of their name (`docs/fishbone` is under **docs**); diagrams with no folder come first. Click a folder heading to collapse it; collapsed folders are remembered across reloads, and a search looks inside them anyway. `↑` / `↓` move, `Enter` opens, `Esc` closes. To move a diagram into a folder, **Rename** it to `folder/name`. **New diagram** starts from the open diagram's folder. |
| `＋` | New diagram. |
| `⋯` (view mode) | **Rename**, **Duplicate** and **Eject** — only the ones that apply: a diagram compiled from TypeScript offers Duplicate alone. `↑` / `↓` move, `Enter` runs, `Esc` closes. |
| **Edit** / `read-only` | Enter edit mode, or the mark of a diagram compiled from `.diagram.ts`. |
| **Save positions** (view mode) | Appears once you have moved something: writes Alt-dragged boxes and edge labels, and which groups are open, to `<name>.layout.json`. See [Place boxes on a generated diagram](../how-to/position-a-generated-diagram.md). |
| **Notes** (edit mode, threat models) | Open or close every threat bubble at once. |
| `⋮⋮` | Snap dragged boxes (and arrow-key nudges) to a 10px grid; the background dots become the grid. A viewer preference, remembered across reloads, never saved to the diagram. |
| `☀` / `☾` | Light / dark theme. A viewer preference, never saved to the model. |
| `⚙` | Keyboard shortcuts. |

In a narrow pane the app name gives way first, then the diagram's folder and name shorten; the buttons never wrap or leave the window.

In edit mode a tool row sits under the top bar: **Done**, **Select** / **Pen** / **Eraser** (with the pen's colour and width while it is active), **Undo** / **Redo** / **Save**, and the selection's colour.

The plane switcher is in **Layers & planes**, present when the diagram declares planes. Switching planes keeps your place — the groups containing what you were looking at open automatically in the new plane.

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
- **A folded group shows no notes for what it hides.** Only its own; unfold it for the notes inside.
- On a `git-graph` or `fishbone` plane the layout pickers (algorithm, direction, wrap, spacing, edges) are hidden, in both modes: the notation owns the arrangement. Style, Auto-layout on/off and Re-layout still work.
- On a `second-order` diagram only the layout **algorithm** picker is hidden — it is pinned to layered so the order bands can use elk's partitioning. Direction, spacing and edge routing stay adjustable.

## See also

- [Tutorial 2 — Draw one in the browser](../tutorials/02-draw-in-the-studio.md)
- [Use planes and layers](../how-to/use-planes-and-layers.md)
- [Organise a large diagram](../how-to/organise-large-diagrams.md)
