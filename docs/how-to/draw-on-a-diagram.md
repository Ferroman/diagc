# Draw on a diagram

Circle a region, sketch an arrow, scribble a remark — by hand, on top of the boxes.

1. Open a JSON-backed diagram and press **Edit**.
2. Pick **Pen** in the toolbar (or press `p`). Choose a color (∅ is the theme's ink) and a width.
3. Drag on the canvas. Scroll to pan and ctrl/pinch to zoom while the pen is active.
4. **Eraser** (`e`) removes a stroke per click. `Esc` returns to Select. Every stroke is one undo step.
5. Autosave writes `.diagrams/src/<name>.drawings.json` next to the model. Commit it with the rest.

**Hiding and showing.** The `✎` control in the corner, and the **Drawings** row in the legend (when the diagram has one), switch every stroke off and on. That is a viewer preference — the published page opens with drawings shown, and the PNG always includes them.

**What moves and what does not.** Strokes sit at absolute canvas coordinates. On a plane with automatic layout, adding a node can slide the boxes out from under your ink; freeze the plane (**Auto-layout** off) or save positions first if the drawing must line up. Drawings are shown at the top level only — enter a container and they disappear until you come back.

## See also

- [Publish and share](publish-and-share.md) — drawings ship with the page and the PNG
- [`Drawings` reference](../reference/model.md#drawings-namedrawingsjson) — every field the file may carry
- [The model](../explanation/the-model.md) — why the strokes live outside it
