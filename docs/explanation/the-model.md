# What is in a model

The five decisions frozen into the data structure, and why each one is the way it is. For the field-by-field listing, see [Model reference](../reference/model.md).

![Anatomy of a diagram model](../../.diagrams/static/docs-model.png)

A model is five flat arrays that reference each other by id, plus a separate layout file. There is no nesting in the stored form — the tree you see on screen is derived.

---

## 1. Containment is a DAG, not a tree

`containment` is a list of `{ parent, child }` pairs, and nothing stops a node from having two parents. A shared database contained by both `identity` and `billing` is a normal, expected model.

This is the single decision that shapes the most behaviour. A tree would have been simpler, but it would force you to lie: pick one owner for the shared thing and draw a long arrow from the other, or duplicate the box and pretend they are two databases.

The cost lands in the view compiler. When both owners are folded, a node inside both cannot be drawn inside either — so it is **promoted** to the nearest level where both owners can see it, and marked shared. You get one database, visible, beside the two systems that use it.

The only structural rule is **no cycles within one plane**. Cycles across planes are fine, because planes are independent hierarchies.

## 2. `type` and `kind` are free-form strings

A node's `type` and a relation's `kind` are not enums. The model does not know what `service` means; the renderer's registry maps the string to a shape and an icon, and an unrecognised string falls back to a plain box or a plain line.

This keeps the vocabulary yours. A diagram using `type: 'squid'` is valid — it just draws as a box until you register `squid`. The alternative, a closed enum in the core model, would mean every new visual concept requires a change to the schema that every diagram file is validated against.

The trade is that typos are silent. `tpye: 'service'` and `type: 'servcie'` both compile, and both draw as a plain box.

## 3. Layout is not in the model

Positions live in `<name>.layout.json`: plane → node id → `{x, y}`, plus a `sizes` map and a `manual` set of planes where automatic layout is switched off.

Two reasons. The obvious one is diff hygiene — dragging boxes should not touch the file that says what the system *is*. The subtler one is that **position is per-plane but size is not**: the same node sits in different places in the `architecture` and `infra` views, but it is the same size in both. Those two facts have different shapes, and neither belongs on the node.

Any node with no recorded position is laid out automatically. The overlay is a set of overrides, not a complete description.

Freehand drawings are the second thing kept out of the model, in `<name>.drawings.json`. They are coordinates too, but they get their own file rather than a key in the layout one: a box nudge and a scribble should not share a diff hunk, a repo can ignore its drawings without losing its positions, and the drawings format can grow on its own version. A drawing is an overlay on the canvas — absolute coordinates, not anchored to a node — so automatic layout can move boxes out from under it; that is the deliberate trade for "draw anywhere".

## 4. Cross-diagram identity is opt-in, via `key`

Two diagrams that both mention the same database are, by default, two unrelated nodes. Give both the same `key` and, when the diagrams are composed under an umbrella via `include`, they merge into one entity with both declaring contexts as parents.

The alternative — matching on id or name — would make composition surprising: two services that happened to both call something `db` would silently fuse. Requiring an explicit `key` means merging is a decision you wrote down.

Keys are inert in a diagram that is never composed. They cost nothing to add early.

## 5. The library bakes, it does not reference

Placing an icon from the studio's library copies its `type`, `color`, `image` and `shape` onto an ordinary node. The model holds no pointer back to the library entry.

So a diagram renders correctly with no library present, and deleting a library entry never breaks a diagram that used it. The price is that editing a library entry does not retro-update nodes already placed — which is the right trade for a file that outlives the tool that drew it.

---

## Note

- **`description` never renders on the canvas.** It shows in the studio's detail panel when you select a node. Anything the reader must see belongs in `name`.
- **`metadata` is `Record<string, unknown>` and is not validated.** It travels with the node and can surface as badges; the model does not care what is in it.
- **Relation ids are generated as `from->to#n`.** The `#n` counter is what lets two relations connect the same pair. Hand-written JSON must keep them unique.
- **An empty `planes` array means one implicit plane.** You do not declare planes to have a working diagram; you declare them when you want a second hierarchy.

## Read next

- [Model reference](../reference/model.md) — every field, every validation code.
- [What you see is not what is stored](views.md) — how these arrays become a picture.
