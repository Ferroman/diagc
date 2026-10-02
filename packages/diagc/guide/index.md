# Writing diagc diagrams

diagc turns a TypeScript file into a diagram: boxes that nest, arrows between them, and a picture that rests folded until the reader opens a box. You write the structure; diagc validates it, lays it out and draws it. You never write positions.

This guide is for diagc {{version}}.

## The loop

1. Write or edit `.diagrams/src/<name>.diagram.ts`. A folder is allowed: `.diagrams/src/team/app.diagram.ts` is the diagram `team/app`.
2. Run `diagc lint --json`. It prints `[]` and exits 0 when everything is clean. Otherwise each finding has `file`, `severity`, `code` and `message`: fix it and run again. An `error` means the diagram does not compile. A `warning` compiles but is probably a mistake, such as a misspelled type.
3. Run `diagc publish <name>` and look at `.diagrams/static/<name>.png` to check the picture. It needs Chrome; set `CHROME_PATH` when none is found.

A person runs `diagc studio` to browse every diagram and to move boxes by hand.

Commit `.diagrams/src/` and `.diagrams/static/`. `.diagrams/.artifacts/` and `.diagrams/html/` are build output.

## A diagram

{{starter:basic}}

- `model(id, { name })` starts a diagram, and `export default m` is what the compiler reads.
- `m.node(id, { type, name })` declares a box and returns a handle. Keep the handle: `contains` and `relate` take handles, not ids.
- `parent.contains(a, b)` nests. A box with children is a group. It rests folded and shows how many children it holds, and the arrows to its children are drawn to it as one bundled arrow until it is opened.
- `m.relate(from, to, { kind, label })` draws an arrow. `kind` is required.

More node options:

| Option | Meaning |
| --- | --- |
| `technology` | Printed under the name as `[Type: technology]`. |
| `color` | Accent colour, for example `'#1565c0'`. |
| `description` | Shown in the detail panel only, never on the canvas. |
| `metadata` | Free-form key and value data. |
| `plane`, `layer` | Show the node in one plane only, or put it on a layer. |

More relation options: `layer`, `description`, `id`.

## Types and kinds

`type` and `kind` are free-form strings. A known one gets its own shape or line style. An unknown one draws as a plain box or a plain arrow, and `lint` reports it as `unknown-type` or `unknown-kind`.

Node types for any diagram: {{node-types}}

Relation kinds: {{relation-kinds}}

Each diagram type listed at the end adds node types of its own; its topic lists them.

## Planes and layers

A **plane** is another way to group the same nodes: by owner in one plane, by where they run in another. A **layer** is an overlay the reader switches on. Anything that is not on a layer always shows.

```ts
import { model } from '@diagc/core';

// One model, two groupings of the same services, and an overlay for data flow.
const m = model('shop-views', { name: 'Shop: two views' });

m.plane('architecture', { name: 'Architecture' }); // declared first = the default plane
m.plane('infra', { name: 'Infrastructure' });
m.layer('data', { name: 'Data flow', tint: '#2e7d32' });

const web = m.node('web', { type: 'service', name: 'Storefront' });
const api = m.node('api', { type: 'service', name: 'Orders API' });
const db = m.node('orders-db', { type: 'database', name: 'Orders DB' });

// A node that groups in one plane only is scoped to it, or it would sit in the
// other plane as an empty box.
const shop = m.node('shop', { type: 'system', name: 'Shop', plane: 'architecture' });
const cluster = m.node('cluster', { type: 'infra', name: 'Kubernetes', plane: 'infra' });
const managed = m.node('managed-db', { type: 'infra', name: 'Managed Postgres', plane: 'infra' });

// Tag containment with its plane: an untagged edge belongs to the first plane only.
shop.contains(web, api, db, { plane: 'architecture' });
cluster.contains(web, api, { plane: 'infra' });
managed.contains(db, { plane: 'infra' });

m.relate(web, api, { kind: 'sync', label: 'Places orders' });
// On a layer: drawn only while the reader has "Data flow" switched on.
m.relate(api, db, { kind: 'writes', label: 'Order rows', layer: 'data' });

export default m;
```

- The first plane declared is the default. Containment without `{ plane }` belongs to it, not to every plane.
- A node with no containment in a plane still appears there, as a loose box. Give a grouping node a `plane` so that it shows only where it groups.
- `m.plane(id, { containmentOf: 'other' })` reuses another plane's grouping. `layers: ['data']` switches those layers on by default in that plane.
- Layers never move boxes.

## Rules that catch people

- Calling `m.node` twice with one id is an error (`duplicate-node`). Declare a node once and keep the handle.
- `m.relate(a, 'b-id', …)` does not work. Pass the handle that `m.node` returned.
- Put what the reader must see in `name`. `description` is not drawn.
- Keep a relation `label` to a short phrase. It is cut at about 24 characters.
- Ids must be unique in the diagram. Use short lowercase words joined by hyphens.
- Do not write positions or sizes. Layout is automatic, and a person adjusts it in the studio.
- For a large system, nest deeper instead of adding boxes at the top level. The reader opens what they need.

## Diagram types

Run `diagc guide <topic>` before writing one of these. Each has its own builder or its own node types.

{{topics}}

`diagc guide all` prints this page and every topic.

## More

The full reference is at https://github.com/Ferroman/diagc/tree/v{{version}}/docs: `reference/builder-api.md` for every method and option, `reference/model.md` for every validation and lint code.
