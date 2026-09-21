# Author diagrams in TypeScript

Recipes for writing a `.diagram.ts` source. Assumes you have compiled one before — if not, do [Tutorial 1](../tutorials/01-your-first-diagram.md) first.

Every method is listed in the [Builder API reference](../reference/builder-api.md).

## Start a diagram

Any file matching `.diagrams/src/**/*.diagram.ts` is picked up. The filename minus `.diagram.ts` names both the artifact and the entry in the studio's picker.

```ts
import { model } from '@diagc/core';

const m = model('shop', { name: 'Shop' });
// ...
export default m;
```

Compile one file instead of all of them:

```bash
pnpm compile .diagrams/src/shop.diagram.ts
```

## Give a node a look

`type` and `icon` are free-form strings resolved by the renderer's registries. Unknown values draw as a plain box, silently.

```ts
const db = m.node('orders-db', {
  type: 'database',        // cylinder
  icon: 'postgres',
  name: 'Orders DB',
  color: '#0891b2',        // overrides the type's default look
  description: 'Shared by the API and the worker.',
});
```

`description` appears in the studio's detail panel, **never on the canvas**. If a reader must see it, it belongs in `name`.

See [registry defaults](../reference/model.md#registry-defaults) for the types and icons that already exist.

## Nest nodes

```ts
platform.contains(comms, identity, billing);
comms.contains(mail, push);
```

A node can have several parents — that is the point of containment being a DAG:

```ts
identity.contains(sharedDb);
billing.contains(sharedDb);   // one database, two owners
```

When both owners are folded, the shared node is promoted to where both can see it and marked `⚭`. You do not have to do anything for that to happen.

## Connect nodes

```ts
m.relate(api, db, { kind: 'writes' });
m.relate(api, worker, { kind: 'async', label: 'order placed' });
```

`kind` is free-form. Built-in kinds: `sync`, `async` (dashed), `reads`, `writes` (thick), `hosted-on` (dashed), `flow` (animated), `fk` (a bar at the referenced end).

Several relations between the same pair are fine — ids are generated as `from->to#0`, `#1`, and so on.

### Style one connection

```ts
m.relate(api, worker, {
  kind: 'async',
  label: 'order placed',
  style: { shape: 'step', line: 'dashed', color: '#c2410c', end: 'diamond' },
});
```

Anything left unset falls back to the kind's registry style and the layer tint. Full option list in [Model reference](../reference/model.md#relationstyle).

## Attach data

`metadata` is free-form and untouched by validation. The studio can surface chosen keys as badges.

```ts
const svc = m.node('mail-svc', {
  type: 'service',
  metadata: { language: 'typescript', repo: 'https://github.com/acme/mail-svc' },
});
```

## Draw an ER diagram

```ts
const users = m.table('users', {
  columns: [
    { name: 'id', type: 'uuid', pk: true },
    { name: 'email', type: 'text' },
  ],
});

const orders = m.table('orders', {
  columns: [
    { name: 'id', type: 'uuid', pk: true },
    { name: 'user_id', type: 'uuid', fk: true },
  ],
});

m.fk(orders, 'user_id', users);   // toColumn defaults to the target's PK
```

`m.fk` **throws** if the target has zero or several primary-key columns and you did not pass `toColumn`. Declare the target table, with its PK, before calling.

## Rich labels

```ts
m.node('warn', {
  name: 'Legacy path',
  rich: [{ text: 'Legacy', bold: true }, { text: ' path' }],
  textAlign: 'center',
  fontScale: 'lg',
});
```

`name` must equal the concatenated run text, or validation fails with `invalid-rich`.

## Pin a visual style

Presets are `clean`, `sketch`, `hand-drawn`, `pencil`, `blueprint`, `marker`. Picking one in the studio header is a viewer preference and is not saved to the diagram.

To make a diagram *always* render hand-drawn, pin `style` on the model:

```ts
m.style('hand-drawn');
```

An unknown preset id is legal — the renderer falls back to the app-level preference.

## Organise the file

Nothing enforces an order, but this reads well and matches the shipped `acme` example:

1. `model(...)`
2. `m.layer(...)` declarations
3. `m.plane(...)` declarations
4. nodes, grouped by area
5. containment, grouped by plane
6. relations, base ones first then layered ones
7. `export default m`

Subfolders under `.diagrams/src/` are mirrored into the artifact directory, so `src/team-a/app.diagram.ts` never clobbers `src/team-b/app.diagram.ts`.

## When compile fails

The message names the file and the issue, and no artifact is written. Every code is listed in [Model reference](../reference/model.md#validation-codes). The four you will actually hit:

| Code | Usually means |
| --- | --- |
| `duplicate-node` | You called `m.node` twice with the same id. |
| `dangling-endpoint` | A relation names a node you renamed or removed. |
| `unknown-layer` | You used a `layer` on a relation without `m.layer(...)`. |
| `containment-cycle` | A node ended up inside itself, transitively. |

## See also

- [Builder API reference](../reference/builder-api.md)
- [Use planes and layers](use-planes-and-layers.md) — one model, several views
- [Compose diagrams](compose-diagrams.md) — `include` and `key`
- [Eject a diagram to TypeScript](eject-to-typescript.md) — started in the studio? promote it to this format.
