# Organise a large diagram

Four mechanisms keep a big diagram readable. Pick by what you actually want:

| Want | Use |
| --- | --- |
| Hide detail until asked for | nothing — **semantic zoom** is on by default |
| One box always open, or always shut | **pins** (viewer state) |
| The same entities under a *different hierarchy* | **planes** → [Use planes and layers](use-planes-and-layers.md) |
| The same structure with *extra arrows* | **layers** → [Use planes and layers](use-planes-and-layers.md) |

This guide covers the first two. Planes and layers have [their own guide](use-planes-and-layers.md).

---

## Let semantic zoom do the work

Every group starts folded. You get this for free — just nest things:

```ts
platform.contains(comms, identity, billing);
comms.contains(mail, push);
```

The diagram opens as one box. Double-click to descend. Siblings stay folded, so you always read one path of detail against an overview.

**Do not fight it.** If a diagram is unreadable fully expanded, that is fine — it is not meant to be seen fully expanded. The exception is the PNG export, which *does* unfold everything; see [Publish and share](publish-and-share.md).

### Shape the tree, not the picture

Since folding follows containment, containment is your only real lever on how much shows at once. Two habits help:

- **Group by the thing a reader asks about**, not by what is convenient to type. A group is a question ("what is in Billing?"), and unfolding it is the answer.
- **Keep sibling counts small.** Eight children under one parent all unfold at once. Two groups of four unfold one at a time.

## Force a box open or shut

Click the pin chip on a group's header. A pin overrides the automatic fold decision for that container until you clear it.

Pins are **viewer state** — not written to the diagram file, and not honoured by the PNG export, which expands everything regardless.

## Enter a node as its own diagram

The `⤢` chip on a group header drills into that node: it becomes the whole canvas, and anything outside it is reduced to stubs on the edge so arrows still land somewhere. Use it when one subsystem deserves the full screen.

The breadcrumb trail at the top takes you back out.

## When a diagram is still too big

If the diagram is a long chain that runs off the screen sideways, try the **Wrap** picker in the header first (`screen` aims at a 16:10 shape). It folds the chain onto several rows without touching what is nested where, and is saved with the other layout settings.

Splitting is usually better than more nesting. Give each subsystem its own diagram, then build an umbrella that pulls them together — see [Compose diagrams](compose-diagrams.md). `key` makes the shared database in two child diagrams resolve to one node in the umbrella.

## See also

- [Use planes and layers](use-planes-and-layers.md)
- [What you see is not what is stored](../explanation/views.md)
