# Place boxes by hand on a generated diagram

A `.diagram.ts` diagram is **read-only** in the studio: its model is compiled from the
TypeScript, so the studio will not let you rename a node or draw a relation. Positions are
different. They were never part of the model, so you can place the boxes wherever you like
and keep them.

## Why re-compiling does not undo it

Meaning and coordinates live in two files:

| File | Written by | Rewritten on `pnpm compile`? |
| --- | --- | --- |
| `.diagrams/src/shop.diagram.ts` | you | — it is the source |
| `.diagrams/.artifacts/shop.diagram.json` | the compiler | **yes**, wholesale |
| `.diagrams/src/shop.layout.json` | the studio | **no** — never touched |

`diagc compile` writes exactly one file per diagram: the artifact. It never reads or writes
a `.layout.json`. That is the point of the split — a change to the source rewrites what the
diagram *means* and leaves where you put things alone.

## Move and save

1. `pnpm dev`, then open the diagram. It shows a `read-only` chip; that is expected.
2. Hold **Alt** and drag a box. Alt is what unlocks dragging in view mode.
3. A **Save positions** chip appears in the top bar. Click it.

That writes `.diagrams/src/<name>.layout.json`:

```json
{
  "version": 1,
  "planes": {
    "architecture": {
      "platform": { "x": 71.87, "y": 171.92 }
    }
  }
}
```

Positions are keyed by **plane** — `architecture` above, because that diagram declares
planes and this is the first one. A diagram with no planes keys under `default`. Each plane
is positioned independently, so the same node can sit in different places in different views.

Nothing is written until you click. Dragging alone is throwaway state, and switching plane
or diagram discards it — the same class of state as pins and focus.

## Hand a plane back to the algorithm

A saved position beats every layout algorithm, so once a node is placed the algorithm
picker stops moving it. To let the algorithms have it back, press **Auto-arrange**. It
appears next to the picker whenever the active plane has saved positions.

While it is on, the saved coordinates are ignored and the chosen algorithm arranges every
node, so you can try Force or Tree against the whole diagram. Press it again to get your
arrangement back. Nothing is written either way — the sidecar is untouched, and the toggle
resets when you open another diagram.

To drop the saved positions *permanently*, delete that plane's entry from
`<name>.layout.json` (or the whole file to start over).

One wrinkle: a box you have dragged in this session still sits where you dropped it, even
with Auto-arrange on — an explicit drag outranks an automatic arrangement. Reload to clear
those.

## Fine-tune the placement

Four aids, none of which need edit mode (in view mode a box moves with Alt+drag):

- **Guides.** Drag a box near a sibling's edge or centre and it snaps into line; a dashed guide shows what it matched.
- **Arrow keys.** Select a box and nudge it 5px at a time (`Shift` for 20px). No Alt needed.
- **Snap.** The `⋮⋮ Snap` chip in the header snaps drags and nudges to a 10px grid.
- **Line several up.** `Shift`+click (or `Shift`+drag a marquee around) two or more boxes and use the toolbar that appears above them: align, or distribute three or more evenly.

All four feed the same **Save positions** chip.

## Freeze the whole plane

Saving positions does **not** switch automatic layout off. Elk keeps arranging every node
you have not placed, and your saved coordinates win for the ones you have. If elk keeps
shoving your arrangement around, press **Freeze layout** in the top bar. It pins every box
where it is right now (unsaved drags included) and marks the plane manual:

```json
{ "version": 1, "planes": { "architecture": { "…": {} } }, "manual": { "architecture": true } }
```

Press it again to hand the plane back to the algorithm; the pinned positions stay.

Be clear about what the flag does. The renderer still runs the algorithm — pinned boxes
simply win over its output. What changes is that the studio stops offering to re-arrange
the plane and pins nodes you create in it. A node added to the *source* later still gets an
automatic position until you move it, so check the diagram after a source change.

## Keep node ids stable

Positions key on node id, so the id in the source is the anchor:

```ts
const platform = m.node('platform', { type: 'system' }); // 'platform' is the key
```

Rename that id and the saved position is orphaned — it is ignored, not an error, and the
node falls back to automatic placement. Add a node and it is placed automatically until you
move it. Remove one and its stale entry is harmless.

## Do not keep a `.diagram.json` of the same name

`shop.diagram.ts` and `shop.diagram.json` both compile to the same artifact path, so one
silently overwrites the other. If you want a hand-edited model, pick one authoring route
for that name — this page is the way to keep the TypeScript *and* control the layout.

## See also

- [Author diagrams in TypeScript](author-in-typescript.md)
- [`LayoutOverlay` reference](../reference/model.md#layoutoverlay-namelayoutjson) — every field the file may carry
- [The model](../explanation/the-model.md) — why positions live outside it
