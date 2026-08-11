# Builder API reference

The TypeScript DSL exported by `@diagramming/core`. Every method returns something chainable, and `toJSON()` validates.

Source of truth: `packages/core/src/builder.ts`.

```ts
import { model } from '@diagramming/core';
```

## `model(id, opts?) → ModelBuilder`

| Param | Type | Notes |
| --- | --- | --- |
| `id` | `string` | The model id. |
| `opts.name` | `string?` | Display name. Defaults to `id`. |

## `m.node(id, opts?) → NodeRef`

Declares an entity and returns a handle for containment and relations.

| Option | Type | Notes |
| --- | --- | --- |
| `name` | `string?` | Defaults to `id`. |
| `type` | `string?` | Free-form; see [registry defaults](model.md#registry-defaults). |
| `icon` | `string?` | Free-form. |
| `image`, `shape` | `string?` | Asset refs; see [Model reference](model.md#asset-refs-image-shape). |
| `color`, `textColor` | `string?` | |
| `description` | `string?` | Detail panel only — never drawn on the canvas. |
| `metadata` | `Record<string, unknown>?` | |
| `key` | `string?` | Cross-diagram identity. |
| `include` | `string?` | Compose another diagram under this node. |
| `plane`, `layer` | `string?` | Scope the node. |
| `columns` | `Column[]?` | ER-table rows. |

Undefined options are pruned, so the emitted JSON has no `key: undefined` noise.

## `m.table(id, opts) → NodeRef`

Shorthand for `m.node(id, { type: 'db-table', ...opts })`. `columns` is required.

```ts
const users = m.table('users', {
  columns: [
    { name: 'id', type: 'uuid', pk: true },
    { name: 'email', type: 'text' },
  ],
});
```

## `ref.contains(...children, opts?) → ref`

Nests nodes. Accepts any number of `NodeRef`s, optionally followed by an options object.

| Option | Type | Notes |
| --- | --- | --- |
| `plane` | `string?` | Assign these edges to a plane. Omit for the default plane. |

```ts
platform.contains(comms, identity, billing);
k8s.contains(mail, push, { plane: 'infra' });
```

Duplicate parent/child/plane triples are ignored, so calling it twice is safe. A node may be contained by several parents — containment is a DAG.

> **Omitting `plane` does not mean "every plane".** An untagged edge belongs to the model's default plane — whichever you declared **first**. In a diagram with several planes, tag containment explicitly, or reordering your `m.plane(...)` calls changes what the diagram means. See [Use planes and layers](../how-to/use-planes-and-layers.md#gotchas).

## `m.relate(from, to, opts) → m`

| Option | Type | Notes |
| --- | --- | --- |
| `kind` | `string` | **Required.** Free-form. |
| `label` | `string?` | |
| `description` | `string?` | |
| `layer` | `string?` | Must match a declared layer. |
| `style` | `RelationStyle?` | See [Model reference](model.md#relationstyle). |
| `polarity`, `delay` | | Causal-loop diagrams. |
| `fromColumn`, `toColumn` | `string?` | ER foreign keys. |

Relation ids are generated as `from->to#n`, with `n` counting per ordered pair — so two relations between the same nodes never collide.

## `m.fk(from, fromColumn, to, toColumn?, opts?) → m`

A `kind: 'fk'` relation between two tables. `toColumn` defaults to the target's single primary-key column.

```ts
m.fk(orders, 'user_id', users);
```

**Throws** if `toColumn` is omitted and the target has zero or several primary-key columns. Declare the target table, with its PK, before calling.

## `m.layer(id, opts?) → m`

| Option | Type | Notes |
| --- | --- | --- |
| `name` | `string?` | Defaults to `id`. |
| `tint` | `string?` | Colour for this layer's relations. |

## `m.plane(id, opts?) → m`

The first plane declared is the default and owns untagged containment.

| Option | Type | Notes |
| --- | --- | --- |
| `name` | `string?` | Defaults to `id`. |
| `containmentOf` | `string?` | Borrow another plane's structure. |
| `layers` | `string[]?` | Layers on by default in this plane. |
| `baseRelations` | `boolean?` | `false` hides untagged relations. |
| `notation` | `'causal-loop'?` | |
| `hides` | `string[]?` | Shared node ids to hide here. |

## `m.legend(opts?) → m`

Opt this diagram into an on-canvas key. Calling it at all is the switch — a diagram that never does has no legend. A bare `m.legend()` derives every row.

| Option | Type | Notes |
| --- | --- | --- |
| `title` | `string?` | Default `Legend`. |
| `position` | `string?` | `top-left`, `top-right`, `bottom-left`, `bottom-right`. Default `bottom-right`. |
| `show` | `string[]?` | Derived sections: `layers`, `kinds`, `types`. Default `['layers', 'kinds']`. |
| `items` | `LegendItem[]?` | Hand-written rows. One naming a derived `kind`/`type` recaptions that row in place. |

```ts
m.legend({ items: [{ label: 'Fire-and-forget', kind: 'flow' }] });
```

Calling it twice replaces the config. See [Add a legend](../how-to/add-a-legend.md) and [`DiagramLegend`](model.md#diagramlegend).

## `m.toJSON() → DiagramModel`

Validates and returns the model. **Throws `DiagramValidationError`** carrying the full issue list if anything is wrong.

You rarely call this — `export default m` and the compiler calls it for you.

## Gotchas

- **`m.relate` takes `NodeRef`s, not ids.** Keep the handles that `m.node` returns.
- **`m.node` is not idempotent.** Calling it twice with the same id creates two nodes and fails validation with `duplicate-node`.
- **A trailing plain object in `contains` is always read as options**, never as a child. That is only ambiguous if you try to pass something that is not a `NodeRef`.
- **`description` does not render on the canvas.** Put anything the reader must see in `name`.

## See also

- [Author diagrams in TypeScript](../how-to/author-in-typescript.md) — worked examples.
- [Model reference](model.md) — the JSON this produces.
