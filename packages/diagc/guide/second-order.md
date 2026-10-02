# Second-order thinking

A consequence tree: a decision, what follows from it, and what follows from that, banded by how many steps each consequence sits from the decision. Reach for it to look past the first effect of a choice.

{{starter}}

## How it works

- `m.secondOrder(opts?)` declares the diagram. It throws if called twice. `opts` takes `plane` and `name` to keep it beside other views of the model.
- `so.decision(id, name?, opts?)` is the root. `opts` takes `description` and `color`. Several decisions can share one set of bands.
- `ref.then(id, name?, opts?)` adds what follows from `ref`, and the arrow to it. `opts` is `{ valence, label, description, color }`. It returns the new consequence, so calls chain.
- `valence` is `'+'` good, `'-'` bad or `'0'` neutral. It defaults to `'0'` and picks the node type. `label` labels the arrow that leads to the consequence.
- `ref.leadsTo(other, opts?)` joins two branches without a new node: `ref` also leads to a consequence declared elsewhere. `opts` takes `label`. It returns `ref`.
- The bands (first order, second order, and so on) are worked out from the arrows: a node's order is its longest path from a decision. Moving a box by hand does not change its band.

## Node types

{{node-types}}

The builder picks the consequence type from `valence`, so an author never writes these types.

## Rules

- A cycle among the consequences is an error (`so-cycle`). A loop belongs in a causal-loop diagram. The builder does not stop one: `leadsTo` can close a cycle, and compiling then fails.
- Decisions and consequences take no containment (`so-contained`). The builder never adds any; only a hand-written `node.contains(…)` call or JSON can.
- A consequence that no decision leads to fails with `so-unreachable`. A diagram with consequences and no decision fails with `so-no-decision`. The builder cannot produce either: `then` always has a source and `decision` is the way in.
