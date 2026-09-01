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
| `color`, `textColor` | `string?` | `color` also wins over a notation's fill (e.g. C4's solid palette). |
| `technology` | `string?` | Composed into the type subtitle: `[Container: Java, Spring Boot]`. See [Draw a C4 diagram](../how-to/draw-a-c4-diagram.md). |
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
| `layers` | `string[]?` | Layers on by default in this plane. A default, not a floor: hosts with a layer switch start from this (`presetLayers`) and can turn them off — an export, which has no switch, always draws them. |
| `baseRelations` | `boolean?` | `false` hides untagged relations. |
| `notation` | `NotationId?` (`'causal-loop' \| 'git-graph' \| 'c4'`) | Prefer `m.gitGraph()` for `git-graph`. Overrides `m.notation()` for this plane. |
| `hides` | `string[]?` | Shared node ids to hide here, promoting their contents into their place. |
| `hidesTree` | `string[]?` | Shared node ids to hide here together with their contents, however deep. A child another visible box also contains stays. |

## `m.gitGraph(opts?) → GitGraphBuilder`

Declares the model a git branching diagram: a plane with the `git-graph` notation that must be the first plane declared (it owns the lanes' containment). Throws if a plane already exists or if called twice.

| Option | Type | Notes |
| --- | --- | --- |
| `plane` | `string?` | Plane id. Default `git-graph`. |
| `name` | `string?` | Plane name. Default `Git graph`. |

### `g.branch(id, opts?) → BranchRef`

A lane. Lanes are drawn top to bottom in declaration order. `BranchRef` is a `NodeRef` (type `branch`).

| Option | Type | Notes |
| --- | --- | --- |
| `name` | `string?` | Defaults to `id`. |
| `color` | `string?` | The lane's colour; its commits and links inherit it. Default: a built-in palette by lane index. |

### `branch.commit(tag?)` / `branch.commit(opts) → CommitRef`

A commit on the lane, linked from the lane's previous commit — or, with `from`, the first commit of a new run branched off a commit on another lane. `CommitRef` is a `NodeRef` (type `commit`) with a `branch` field.

| Option | Type | Notes |
| --- | --- | --- |
| `id` | `string?` | Default `<branch>-<n>`. |
| `tag` | `string?` | The label above the circle (the node's `name`). Default none. |
| `from` | `CommitRef?` | Start a new run from this commit (must be on another lane). |
| `gap` | `number?` | Empty columns before this commit (`metadata.gap`). |
| `color` | `string?` | Overrides the lane colour for this commit. |

### `branch.merge(src, opts?) → CommitRef`

A commit on the lane that absorbs `src` (a commit on another lane): a `merge` link from `src`, plus the usual link from the lane's previous commit. Same options as `commit` minus `from`.

## `m.activity(id, opts?) → ActivityBuilder`

Declares an activity frame: a UML swimlane flow. Repeatable — each call is one frame, and frames are ordinary containers on whatever plane the model uses (no notation, no plane creation), so several can share a canvas. `ActivityBuilder` **is** the frame's `NodeRef` (type `activity-frame`).

| Option | Type | Notes |
| --- | --- | --- |
| `name` | `string?` | Defaults to `id`. |

### `act.lane(id, opts?) → LaneRef`

A lane. Lanes are drawn top to bottom in declaration order. `LaneRef` is a `NodeRef` (type `activity-lane`).

| Option | Type | Notes |
| --- | --- | --- |
| `name` | `string?` | Defaults to `id`. |
| `color` | `string?` | The lane's colour. |

### `lane.region(id?, name?) → RegionRef`

An interruptible region: a dashed sub-area nested in the lane, hosting the same element helpers below. `RegionRef` is a `NodeRef` (type `activity-region`). `id` defaults to `${lane}-region`, `${lane}-region-2`, ….

### Element helpers (`LaneRef` and `RegionRef`)

Both extend `ActivityScope`, so a lane and a region expose the same leaf-creating methods; every helper contains the new node in the scope it's called on and returns a plain `NodeRef`.

| Method | Type created | Notes |
| --- | --- | --- |
| `.action(id, name, opts?)` | `activity-action` | |
| `.object(id, name, opts?)` | `activity-object` | |
| `.send(id, name, opts?)` | `activity-send` | |
| `.receive(id, name, opts?)` | `activity-receive` | |
| `.note(id, text)` | `activity-note` | `text` becomes the node's `name`. |
| `.decision(id?, name?)` | `activity-decision` | Auto-id `<scope>-decision`, `-2`, …; name defaults to `''`. |
| `.bar(id?)` | `activity-bar` | Fork/join. Auto-id `<scope>-bar`, `-2`, …; unnamed. |
| `.start(id?)` | `activity-start` | Auto-id `<scope>-start`, `-2`, …; unnamed. |
| `.end(id?)` | `activity-end` | Auto-id `<scope>-end`, `-2`, …; unnamed. |

`action`, `object`, `send` and `receive` take `opts: { color?: string }`.

### `act.flow(from, to, label?) → act`

A `kind: 'control'` relation — the ordinary solid arrow between two elements. `label` is a plain relation label; a guard is just a label like `[order accepted]`.

### `act.objectFlow(from, to, label?) → act`

A `kind: 'object-flow'` relation — dashed, for data (an object) passing between actions.

### `act.interrupt(from, to, label?) → act`

A `kind: 'interrupt'` relation — a zigzag jog at the midpoint, for a signal that interrupts a region.

### `act.noteLink(note, target) → act`

A `kind: 'note-link'` relation from a note to what it annotates — dashed, no arrowhead.

```ts
const m = model('flow');
const act = m.activity('actors', { name: 'Actors' });
const orders = act.lane('orders', { name: 'Orders' });
const start = orders.start();
const submit = orders.action('submit', 'Submit order');
const note = orders.note('n1', 'Validated client-side first');
act.flow(start, submit).noteLink(note, submit);
```

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

## `m.typeColors(map) → m`

A colour convention for the whole diagram: a default accent colour per node type, with `*` as the fallback for every type without an entry.

```ts
m.typeColors({ 'c4-person': '#c62828', 'c4-container-spa': '#f9a825', '*': '#1565c0' });
```

This is the only way to colour nodes the diagram did not author — an umbrella that composes a dozen `include`s cannot reach into the grafted nodes, but it can say what a `c4-container` looks like here. Precedence, highest first: the node's own `color`, the entry for its type, `*`. An untyped node with no `*` entry keeps the registry look.

Successive calls merge (last wins per key). `typeColors` is presentation, so it does NOT travel through `include`: the host's convention is kept and every child's is dropped — the diagram you are looking at owns the look.

## `m.layerRules(rules) → m`

Put relations that carry no `layer` of their own onto layers by class. Each rule names a `kind` and/or a `color` (matched against `style.color`) and the `layer` to assign; every field a rule names must match; first match wins.

```ts
m.layer('http', { name: 'HTTP', tint: '#ef6c00' });
m.layer('sql', { name: 'SQL', tint: '#2e7d32' });
m.layerRules([
  { color: '#ef6c00', layer: 'http' },
  { kind: 'sql', layer: 'sql' },
  { kind: 'fk', layer: 'sql' },
]);
```

This is the one way a composed diagram can layer relations an `include` brought in: the umbrella cannot edit grafted relations, but it can say "everything orange is HTTP here". A relation's own `layer` always beats the rules; a relation no rule matches stays on the base sheet. Combine with a plane's `layers` presets and `baseRelations: false` to draw exactly one class.

Successive calls append. Like `typeColors`, rules are presentation and do NOT travel through `include`: the host's are kept, every child's dropped. A rule naming an undeclared layer fails validation (`unknown-layer`).

## `m.notation(id) → m`

Pin the whole diagram's visual language — the model-level fallback a plane's own `notation` overrides (see [`m.plane`](#mplaneid-opts--m)). The one way to opt a planeless diagram into a built-in look without declaring a plane purely to carry it.

```ts
m.notation('c4');
```

`id` must be one of `BUILTIN_NOTATIONS`; an unknown id fails validation with `unknown-notation`, same as an unknown `plane.notation`. Calling it twice replaces the value.

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
