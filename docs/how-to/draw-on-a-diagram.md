# Draw on a diagram

Circle a region, sketch an arrow, scribble a remark — by hand, on top of the boxes.

1. Open a JSON-backed diagram and press **Edit**.
2. Pick **Pen** in the toolbar (or press `p`). Choose a color (∅ is the theme's ink) and a width.
3. Drag on the canvas. Scrolling still pans and `Ctrl` + wheel still zooms while the pen is active — with a mouse or trackpad. On a touch screen a second finger is ignored while you are drawing, so a resting palm cannot hijack the stroke; switch back to **Select** to pan and zoom by touch.
4. **Eraser** (`e`) removes a stroke per click. `Esc` returns to Select. Every stroke is one undo step.
5. Autosave writes `.diagrams/src/<name>.drawings.json` next to the model. Commit it with the rest.

**Hiding and showing.** The `✎` control in the corner, and the **Drawings** row in the legend (when the diagram has one), switch every stroke off and on. That is a viewer preference — the published page opens with drawings shown, and the PNG always includes them.

**Pointing, not drawing.** To point at something during a screenshare, use the laser pointer instead: `L` (or `◉` in the corner controls) in either mode, drag to draw a red trail that fades out after a second. It is never saved, it works inside containers too, and `Esc` switches it off.

**What moves and what does not.** Strokes sit at absolute canvas coordinates. On a plane with automatic layout, adding a node can slide the boxes out from under your ink; freeze the plane (**Auto-layout** off) or save positions first if the drawing must line up. Drawings are shown at the top level only — enter a container and they disappear until you come back.

## See also

- [Publish and share](publish-and-share.md) — drawings ship with the page and the PNG
- [`Drawings` reference](../reference/model.md#drawings-namedrawingsjson) — every field the file may carry
- [The model](../explanation/the-model.md) — why the strokes live outside it
