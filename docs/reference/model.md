# Model reference

Every field of a compiled diagram, and every way the compiler can reject one. Source of truth: `packages/core/src/types.ts` and `packages/core/src/validate.ts`.

For *why* the model is shaped like this, see [What is in a model](../explanation/the-model.md).

![Anatomy of a diagram model](../../.diagrams/static/docs-model.png)

## `DiagramModel`

| Field | Type | Notes |
| --- | --- | --- |
| `version` | `1` | Required. Only value accepted. |
| `id` | `string` | Diagram identity. |
| `name` | `string` | Display name. |
| `style` | `string?` | Renderer style preset pinned by this file. Unknown ids fall back to the app preference. |
| `legend` | `DiagramLegend?` | Opt-in key for the diagram's visual vocabulary. Absent means no legend anywhere. |
| `typeColors` | `Record<string, string>?` | Default accent colour per node type; `*` is the fallback. A node's own `color` wins. Dropped from included models on graft — the host owns the look. |
| `layerRules` | `LayerRule[]?` | Class → layer for relations without a `layer`: `{ kind?, color?, layer }`, every named field must match, first match wins, explicit `layer` beats the rules. Dropped from included models on graft. |
| `nodes` | `DiagramNode[]` | |
| `containment` | `ContainmentEdge[]` | |
| `relations` | `DiagramRelation[]` | |
| `layers` | `DiagramLayer[]` | |
| `planes` | `DiagramPlane[]` | Empty means one implicit plane and no switcher. |

Style preset ids: `clean` (default), `sketch`, `hand-drawn`, `pencil`, `blueprint`, `marker`.

## `DiagramNode`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `string` | Unique within the model. |
| `name` | `string` | The label drawn on the canvas. |
| `type` | `string?` | Free-form; resolved by the renderer's type registry. Omit for a bare label. |
| `icon` | `string?` | Free-form; resolved by the icon registry. |
| `image` | `string?` | Asset ref — the node renders as the picture itself. |
| `shape` | `string?` | SVG silhouette ref, drawn as a tintable mask filled with `color`. Takes precedence over `image`. |
| `color` | `string?` | Accent colour; overrides the type registry's look. |
| `textColor` | `string?` | Label colour, independent of `color`. |
| `description` | `string?` | Shown in the detail panel — **never on the canvas**. |
| `rich` | `TextRun[]?` | Bold/italic label runs. When present, `name` must equal the concatenated text. |
| `textAlign` | `'left' \| 'center' \| 'right'?` | Default `left`. |
| `fontScale` | `'sm' \| 'md' \| 'lg'?` | Default `md`. |
| `metadata` | `Record<string, unknown>?` | Free-form; not validated. |
| `key` | `string?` | Cross-diagram identity. Pattern `^[a-z0-9][a-z0-9-]*$`. |
| `include` | `string?` | URL or path to another `*.diagram.json` composed under this node at compile time. |
| `plane` | `string?` | Restrict the node to one plane. Omit to share it across all. |
| `layer` | `string?` | The node shows only while this layer is active. |
| `columns` | `Column[]?` | ER-table rows; rendered when `type` is `db-table`. |

### Asset refs (`image`, `shape`)

Two forms are accepted, and nothing else:

- `^[a-z0-9]+\.(png|jpe?g|svg|webp|gif)$` — a content-hashed file in `.diagrams/src/assets/`.
- `^/library/[a-z0-9-]+/[a-z0-9-]+\.(png|jpe?g|svg|webp|gif)$` — a bundled library asset. **Exactly one directory level**, lowercase kebab-case only.

### `Column`

| Field | Type | Notes |
| --- | --- | --- |
| `name` | `string` | Unique within the table. |
| `type` | `string?` | Shown right-aligned, e.g. `uuid`, `text`. |
| `pk` | `boolean?` | Primary-key member. |
| `fk` | `boolean?` | Drives the FK marker and the row-port edge origin. |

## `ContainmentEdge`

| Field | Type | Notes |
| --- | --- | --- |
| `parent` | `string` | Node id. |
| `child` | `string` | Node id. |
| `plane` | `string?` | Absent means the model's default (first-declared) plane — **not** "all planes". |

A node may appear as `child` in several edges — containment is a DAG. Cycles are rejected per plane.

Because an absent `plane` resolves to whichever plane was declared first, plane declaration order is semantically significant in a multi-plane model. A plane using `containmentOf` borrows only the edges tagged for the plane it names.

## `DiagramRelation`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `string` | Unique. The builder generates `from->to#n`. |
| `from`, `to` | `string` | Node ids. |
| `kind` | `string` | Free-form; resolved by the kind registry. |
| `label` | `string?` | Legacy single label. |
| `labels` | `EdgeLabel[]?` | Positioned labels; supersedes `label` when present. |
| `style` | `RelationStyle?` | Per-relation visual overrides. |
| `description` | `string?` | |
| `layer` | `string?` | Must match a declared layer id. |
| `polarity` | `'+' \| '-'?` | Causal-loop diagrams only. Colours the link green (`+`) or red (`-`) unless `style.color` or a layer tint says otherwise. |
| `delay` | `boolean?` | Causal-loop diagrams only. |
| `fromColumn` | `string?` | FK column on `from`; anchors the edge to that row. |
| `toColumn` | `string?` | Referenced column on `to`; defaults to the target's primary key. |

### `RelationStyle`

| Field | Values | Default |
| --- | --- | --- |
| `shape` | `curved` \| `straight` \| `step` | `curved` |
| `color` | any CSS colour | the layer tint, then the causal-loop polarity colour |
| `width` | number (px) | the kind's width |
| `line` | `solid` \| `dashed` \| `dotted` | the kind's line |
| `end` | `arrow` \| `dot` \| `square` \| `diamond` \| `none` | `arrow` |
| `fromSide`, `toSide` | `top` \| `right` \| `bottom` \| `left` | unset — floats to the facing side |
| `animated` | boolean | the kind's setting |
| `curvature` | number | `0.25` |
| `bow` | `left` \| `right` | `left` |

### `EdgeLabel`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `string` | |
| `text` | `string` | |
| `t` | `number?` | Position along the edge, 0–1. Default `0.5`. |
| `side` | `'top' \| 'bottom' \| 'center'?` | Default `center`. |

## `DiagramLayer`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `string` | |
| `name` | `string` | |
| `tint` | `string?` | Colour for this layer's relations. |

## `DiagramPlane`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `string` | |
| `name` | `string` | |
| `containmentOf` | `string?` | Borrow another plane's containment instead of declaring your own. |
| `layers` | `string[]?` | Layers switched on when this plane is selected. |
| `baseRelations` | `boolean?` | `false` hides untagged relations, leaving only layer arrows. |
| `notation` | `string?` | Visual language. Only `causal-loop` is built in. |
| `hides` | `string[]?` | Shared node ids this plane hides; their children are promoted into their place. |
| `hidesTree` | `string[]?` | Shared node ids this plane hides along with everything inside them (a child with another visible parent stays). |

## `DiagramLegend`

Present only if the diagram declares one. See [Add a legend](../how-to/add-a-legend.md).

| Field | Type | Notes |
| --- | --- | --- |
| `title` | `string?` | Panel heading. Default `Legend`. |
| `position` | `string?` | `top-left`, `top-right`, `bottom-left`, `bottom-right`. Default `bottom-right`. |
| `show` | `string[]?` | Derived sections to include: `layers`, `kinds`, `types`. Default `['layers', 'kinds']` — replaced, not extended. |
| `items` | `LegendItem[]?` | Hand-written rows, appended after the derived ones. |

Derived rows come from two different places, and the difference is visible:

- **`kinds` and `types` come from the compiled view** — the arrows and boxes actually drawn. They follow the active plane, the active layers and what is currently unfolded; a kind whose only arrows are behind a switched-off layer has no row. Order within the section is the built-in registry's, then alphabetical for ids it does not know.
- **`layers` comes from the model, per plane** — every declared layer that something the active plane could draw carries, whether it is switched on or off, in **declaration order**. Folding changes nothing here: a layer row is the switch that reveals its overlay, so it has to stay put while the overlay is hidden. When the plane borrows another's containment (`containmentOf`), relevance is resolved against the donor plane, the same way the view is; when you have drilled into a node, it is resolved against that node's interior.

Inactive layer rows are listed **greyed** wherever the host can toggle them (the studio). Where nothing can — a published page, an exported PNG — they are **omitted** instead of shown as a row no click can change.

A `kinds` swatch is the kind's registry style, tinted when every drawn arrow of that kind shares one layer tint. A per-relation `style.color` describes one arrow rather than the kind, so it is never lifted into a row.

### `LegendItem`

| Field | Type | Notes |
| --- | --- | --- |
| `label` | `string` | Required, non-empty. |
| `type` | `string?` | Swatch drawn as this node type's shape. |
| `kind` | `string?` | Swatch drawn as this relation kind's line. |
| `color` | `string?` | Tints whichever swatch is drawn; on its own, a plain chip. |
| `icon` | `string?` | Icon for a `type` swatch, overriding the registry's. |

An item naming a `kind` or `type` that already has a derived row **recaptions that row in place**, keeping its position and swatch, instead of appending a new one.

## `LayoutOverlay` (`<name>.layout.json`)

| Field | Type | Notes |
| --- | --- | --- |
| `version` | `1` | |
| `planes` | `Record<plane, Record<nodeId, {x, y}>>` | Positions, per plane. |
| `sizes` | `Record<nodeId, {w, h}>?` | Plane-independent — a node is the same size everywhere. |
| `manual` | `Record<plane, true>?` | Planes with automatic layout switched off. |
| `settings` | `Record<plane, LayoutSettings>?` | Per-plane automatic-layout settings. Absent means the tuned defaults. |
| `export` | `{ collapsed?: string[] }?` | How the PNG export differs from the interactive page. |

Both are keyed by the **resolved containment plane** (`layoutPlaneKey`), the same
as `planes` and `manual` — so a plane that borrows containment with
`containmentOf` shares the donor's entry rather than having its own.

### `LayoutSettings`

| Field | Type | Notes |
| --- | --- | --- |
| `algorithm` | `string?` | elk.algorithm: `layered` (default), `force`, `stress`, `mrtree`, `radial`, `rectpacking`. |
| `direction` | `string?` | elk.direction for `layered`: `RIGHT` (default), `DOWN`, `LEFT`, `UP`. |
| `spacing` | `number?` | Base node-to-node spacing in px; between-layer spacing is derived from it. |
| `edgeRouting` | `'curved' \| 'orthogonal'?` | Floating beziers (default) or orthogonal along elk waypoints. |

`export.collapsed` lists node ids to keep FOLDED in the PNG only; the interactive
page ignores it and always rests fully folded so the reader unfolds what they
want. The exporter otherwise unfolds every container, which turns a view with
hundreds of leaves into an unreadable thumbnail. Folding rather than the plane's
`hides` is the right tool when the edges matter: a folded box still ANCHORS its
hidden children's edges, where a hidden node drops them. Ids that are not
containers have no effect.

## Validation codes

`validate()` returns issues; the compiler refuses to write an artifact if there are any.

| Code | Means |
| --- | --- |
| `duplicate-node` | Two nodes share an id. |
| `duplicate-layer` | Two layers share an id. |
| `duplicate-plane` | Two planes share an id. |
| `duplicate-relation` | Two relations share an id. |
| `duplicate-key` | Two nodes declare the same `key`. |
| `duplicate-column` | Two columns in one table share a name. |
| `containment-cycle` | A node contains itself, transitively, within a plane. |
| `dangling-endpoint` | A relation names a node that does not exist. |
| `unknown-layer` | A `layer` does not match any declared layer. |
| `unknown-plane` | A `plane` does not match any declared plane. |
| `unknown-column` | `fromColumn`/`toColumn` names no column on that table. |
| `unknown-hidden-node` | `hides`/`hidesTree` names a node that does not exist. |
| `redundant-hide` | `hides`/`hidesTree` names a node already scoped to one plane. |
| `invalid-plane` | Malformed plane declaration. |
| `invalid-style` | `style` is not a non-empty string. |
| `invalid-legend` | Malformed `legend`: bad title, unknown position or section, or a bad `items` entry. |
| `invalid-image` | `image` matches neither asset-ref form. |
| `invalid-shape` | `shape` matches neither asset-ref form. |
| `invalid-key` | `key` breaks `^[a-z0-9][a-z0-9-]*$`. |
| `invalid-include` | Malformed `include`. |
| `unknown-notation` | `notation` is not a built-in id. |
| `invalid-polarity` | `polarity` is not `+` or `-`. |
| `invalid-delay` | `delay` is not a boolean. |
| `invalid-rich` | `rich` runs do not reconstruct `name`. |
| `invalid-align` | `textAlign` outside the allowed set. |
| `invalid-font-scale` | `fontScale` outside the allowed set. |
| `invalid-edge-label` | Malformed `labels` entry. |

## Registry defaults

Strings the renderer already knows. Anything else falls back to a plain box or a plain line.

**Node types** — `system`, `platform` (dashed boxes); `service` (box + icon); `database`, `aws-rds`, `table` (cylinders); `db-table` (ER table); `queue` (pill); `infra` (hexagon); `person` (pill); and the 33 `c4-*` types listed in [Library reference](library.md).

**Relation kinds** — `sync`, `async` (dashed), `reads`, `writes` (thick), `hosted-on` (dashed), `flow` (animated), `mixed` (thick, used for aggregates), `fk` (crow's-foot).

An **aggregate** edge (one arrow standing for several relations, after a fold) labels itself from its constituents: their distinct labels joined with ` / ` while that stays within 32 characters, or a single distinct label whatever its length, and otherwise `N relations`. Single-relation edges always carry their own label. Long labels are ellipsised at ~24 characters when drawn; the arrow's hover title carries the full text. See [Views](../explanation/views.md#semantic-zoom).

**Shapes** — `box`, `cylinder`, `pill`, `hexagon`, `table`.

**Icons** — `database`, `postgres`, `table`, `user`, `cloud`, `mail`, `service`, `system`, `queue`, `server`, `kubernetes`, `infra`, `browser`, `spa`, `mobile`, `desktop`, `api`, `function`, `cli`, `blob`, `search`, `component`, `interface`, `class`, `node`, `instance`.

## See also

- [Builder API](builder-api.md) — the TypeScript way to produce this.
- [What is in a model](../explanation/the-model.md) — the reasoning.
