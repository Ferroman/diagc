# Draw a second-order thinking diagram

Show what follows from a decision, and what follows from *that*: a consequence tree, banded by how many steps from the decision each consequence sits — 1st order, 2nd order, 3rd order, each tinted good, bad or neutral.

![Second-order thinking example](../../.diagrams/static/docs-second-order.png)

## In TypeScript

1. Declare the model a second-order diagram, then chain "and then what?" from the decision:

   ```ts
   import { model } from '@diagramming/core';

   const m = model('docs-second-order', { name: 'Second-order thinking: splitting the monolith' });
   const so = m.secondOrder();

   const split = so.decision('split', 'Split the monolith into services');

   const deploys = split.then('deploys', 'Teams deploy independently', { valence: '+' });
   const infra = split.then('infra', 'More infrastructure to run', { valence: '-' });
   const contracts = split.then('contracts', 'APIs become contracts', { valence: '0' });

   const faster = deploys.then('faster', 'Faster releases', { valence: '+' });
   const oncall = infra.then('oncall', 'More on-call load', { valence: '-' });
   infra.then('cost', 'Cloud bill goes up', { valence: '-' });
   contracts.then('versioning', 'Versioning discipline needed', { valence: '0' });
   deploys.leadsTo(oncall);

   faster.then('experiments', 'More product experiments', { valence: '+' });
   oncall.then('burnout', 'Burnout and attrition', { valence: '-' });
   oncall.then('platform', 'A platform team is formed', { valence: '0' });

   export default m;
   ```

2. The four calls:

   | Call | Returns | Notes |
   | --- | --- | --- |
   | `m.secondOrder(opts?)` | `SecondOrderBuilder` | Declares the model's notation. `opts.plane`/`opts.name` keep it beside other views of the same model; with no `plane` the notation is model-wide. Once per model. |
   | `so.decision(id, name?, opts?)` | `ConsequenceRef` | The root of a tree. Several decisions can share one set of bands. |
   | `ref.then(id, name?, { valence?, label?, description?, color? })` | `ConsequenceRef` | What follows from `ref`: creates the consequence and the arrow that leads to it, and hands back a ref you can keep chaining from. |
   | `ref.leadsTo(other, { label? })` | `ref` | Joins two branches: `ref` also leads to a consequence declared elsewhere, without creating a new node. |

   `valence` is `'+' | '-' | '0'` (good / bad / neutral) and defaults to neutral. `leadsTo` is how two branches arrive at the same consequence — above, `deploys` and `infra` both lead into `oncall`.

3. `pnpm compile`, open it in the studio or publish it.

The whole picture above is `.diagrams/src/docs-second-order.diagram.ts` in this repo.

## In the studio

1. Create a new JSON diagram and, in **Layers & planes**, set its **Notation** to *Second-order thinking*.
2. Press **Edit**. The **And then what?** panel appears on the right.
3. **Add a decision**, name it.
4. Select it and pick **Good consequence**, **Bad consequence** or **Neutral consequence** — or press `Tab`, or click the `+` on the selected box, for a neutral one. Type the name and press `Tab` again to chain (it commits the name and opens the next consequence); `Ctrl`/`Cmd`+`Enter` or a click elsewhere commits without adding — plain `Enter` starts a new line instead.
5. Select the new consequence and repeat — `Tab` or its `+` again — to go one order deeper.
6. Changing a consequence from good to bad (or to neutral) is its **type** in the node panel, not a separate field.

The palette's *Second-order thinking* section holds the same four stencils (decision, good/bad/neutral consequence) for drag-and-drop.

## How the bands are decided

A band is never authored — it is derived from the graph: the longest path from any decision. A consequence reached both directly from a decision and through another consequence lands in the later band, so every cause sits above its effect. Several decisions in one diagram share the same set of bands.

Moving a box by hand does not change its band. The order comes from the graph, not the position, so dragging a consequence out of place just stretches its stripe to keep containing it.

## What it will not do

- **A loop is an error here.** Consequences form a cycle → `so-cycle`. A feedback loop is a causal-loop diagram — use that notation for it.
- **Decisions and consequences cannot be grouped.** Nesting one in a container fails validation with `so-contained` — a band and a group want the same rectangle.
- **The layout algorithm is fixed to layered.** The bands ride elk's own layer partitions, so the algorithm picker is withheld. Direction, spacing and edge routing stay adjustable — switch to a left-to-right flow and the bands turn into columns, headers on top.
- **A consequence nothing leads to yet is an error too** (`so-unreachable`) — a stencil dropped from the palette before it is connected, say. The studio will not save until an arrow leads to it, so draw the arrow, or use "And then what?" / `Tab` / the node's `+`, which create the box and its arrow together.

## See also

- [Builder API](../reference/builder-api.md#msecondorderopts--secondorderbuilder) — `secondOrder`, `decision`, `then`, `leadsTo`
- [Model reference](../reference/model.md#second-order-thinking-conventions) — what the nodes and relations mean on a `second-order` plane
- [Publish and share](publish-and-share.md) — the page and the PNG work as for any diagram
