# Tutorial 2 — Draw one in the browser

**Goal:** build a small AWS diagram by dragging icons onto a canvas, and end up with a source file that compiles exactly like a hand-written one.

You do not need [Tutorial 1](01-your-first-diagram.md) first, but it helps — this one assumes you can already start the studio.

**Time:** about ten minutes.

---

## Before you start

- A clone of this monorepo with `pnpm install` run once (see [Tutorial 1 → Before you start](01-your-first-diagram.md#before-you-start)).
- The studio running: `pnpm dev` — this starts the compiler watcher *and* the studio, which is what you want while drawing.

Open <http://localhost:5173>.

---

## Step 1 — Create a diagram you own

Click **New diagram** in the top bar, name it `payments`, and press Enter.

The studio creates `.diagrams/src/payments.diagram.json` and opens it in edit mode. A toolbar appears: Add node, Layers & planes, Undo, Redo, Save, Done.

> **Why a new one?** Only `.diagram.json` files are editable in the browser. Diagrams compiled from `.diagram.ts` open with a **read-only** chip — the studio will not fight your TypeScript. The shipped `acme` example is TypeScript, so it is read-only.

## Step 2 — Place an icon

Open the **Library** tab in the right-hand inspector.

Type `lambda` into the search box. Under *AWS · Compute* you will find **AWS Lambda**. Click the card.

A node appears on the canvas with the Lambda icon and its name selected for editing. Type `Charge card` and press Enter.

Now search `sqs` and click **Amazon Simple Queue Service**. Name it `Payment events`.

> Searching works on names, categories *and* keywords — which is why `sqs` finds a service whose official name is "Amazon Simple Queue Service". The same trick works for `s3`, `eks`, `iam`.

## Step 3 — Connect them

Hover over the `Payment events` node. Small dots appear on each of its four sides — those are connect points.

Drag from a dot on `Payment events` to any dot on `Charge card`. An arrow appears; the node you dragged *from* is the source.

Double-click the arrow and type `payment requested`, then press Enter to commit the label.

## Step 4 — Group them

Click **Add node** in the toolbar. Name it `Payments service`.

Now drag `Charge card` and drop it *onto* `Payments service`. It nests inside. Do the same with `Payment events`.

`Payments service` is now a group. Double-click it to fold and unfold it — the same semantic zoom you get from a TypeScript-authored diagram, because it is the same model underneath.

## Step 5 — Save

Press `Ctrl/Cmd + S`, or click **Save**.

Two files are written next to your other sources:

- `.diagrams/src/payments.diagram.json` — the model: nodes, containment, relations.
- `.diagrams/src/payments.layout.json` — where you dragged things.

They are separate on purpose, so that moving a box around never muddies the diff of what the diagram *means*.
It is also what lets you position a diagram compiled from TypeScript, whose model you cannot edit — see
[Place boxes on a generated diagram](../how-to/position-a-generated-diagram.md).

Because `pnpm dev` is running the watcher, the artifact is recompiled the moment you save.

> **Save validates first.** If the model is somehow invalid, Save refuses and shows you the same issues the compiler would. Nothing half-written reaches disk.

## Step 6 — Read it back

Open `.diagrams/src/payments.diagram.json`. It is plain, pretty-printed JSON:

```json
{
  "version": 1,
  "id": "payments",
  "name": "payments",
  "nodes": [
    { "id": "icon-1", "name": "Charge card", "type": "image", "image": "/library/aws/aws-lambda.svg" }
  ],
  "containment": [{ "parent": "node-1", "child": "icon-1" }],
  "relations": [{ "id": "icon-2->icon-1#0", "from": "icon-2", "to": "icon-1", "kind": "sync" }],
  "layers": [],
  "planes": []
}
```

This is the same shape `m.toJSON()` produces from the TypeScript DSL. A browser-drawn diagram and a hand-written one are indistinguishable downstream — both compile, both publish, both review as text in a pull request.

## What you learned

- The studio writes **sources**, not exports. They are yours to commit.
- Placing a library card **bakes** its look onto an ordinary node. The model keeps no link back to the library, so deleting a library entry never breaks a diagram that used it.
- Model and layout are two files, deliberately.

## Next

- [Use the icon library](../how-to/use-the-icon-library.md) — C4 stencils, 763 AWS icons, importing your own.
- [Use planes and layers](../how-to/use-planes-and-layers.md) — one model, several views.
- [Organise a large diagram](../how-to/organise-large-diagrams.md) — semantic zoom and pins.
- [Studio reference](../reference/studio.md) — every panel, gesture and shortcut.
