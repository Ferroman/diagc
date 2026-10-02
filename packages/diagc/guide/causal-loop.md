# Causal loop

Variables that push each other around in circles. Every link is signed, and every closed ring of links is a feedback loop. Reach for it when the point is that effects come back round.

{{starter}}

## How it works

- `m.notation('causal-loop')` declares the diagram. The notation has no builder of its own; the ordinary `m.node` and `m.relate` calls do the work.
- A variable is `m.node(id, { name })` with no `type`. The notation draws a typeless node as bare text.
- A link is `m.relate(a, b, { kind: 'influence', polarity })`. `polarity` is `'+'` when the two move the same way and `'-'` when they move opposite ways. `kind` is free-form and the loop arithmetic never reads it.
- `delay: true` on a link marks an effect that arrives late. It is drawn as two hash marks and changes nothing about how a loop is classified.
- Loops are found automatically from the arrows drawn. Each is badged R (reinforcing: an even number of `-` links, none included) or B (balancing: an odd number). Do not add loop labels yourself.
- A loop with any unsigned link is badged `?`: unknown, not neutral.
- Links running the same way between two variables count as one, and as unsigned if their polarities disagree. Two opposite links between the same pair stay two, which is what makes a two-variable loop.

## Rules

- Sign every link. One unsigned link leaves its whole loop unclassified (`?`).
- `polarity` other than `'+'` or `'-'` fails with `invalid-polarity`. A `delay` that is not a boolean fails with `invalid-delay`. Both are checked on every relation, whatever the notation.
- Loops are badged shortest first, up to 50, each at most 20 variables long.
- A typed node keeps its ordinary stencil, so leave variables typeless.
