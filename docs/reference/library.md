# Library reference

The palette of ready-made nodes in the studio's **Library** tab. Eleven read-only packs ship bundled; your own entries merge over them.

For how to use it, see [Use the icon library](../how-to/use-the-icon-library.md).

## Bundled packs

854 entries in 40 categories, rendered in this order:

| Pack | Entries | Categories | Assets |
| --- | --- | --- | --- |
| **C4** | 31 | 5 | `/library/shapes/person.svg` (the rest are coloured boxes) |
| **Activity** | 10 | 1 | none — renderer-drawn glyphs, not images |
| **Second-order thinking** | 4 | 1 | none — renderer-drawn glyphs, not images |
| **Fishbone** | 3 | 1 | none — renderer-drawn looks, not images |
| **Threat model** | 4 | 1 | none — renderer-drawn shapes, not images |
| **Plan** | 4 | 1 | none — renderer-drawn shapes, not images |
| **Data** | 1 | 1 | none — it seeds columns, not an image |
| **Shapes** | 3 | 1 | `/library/shapes/` — tintable silhouette masks |
| **Tech** | 16 | 1 | `/library/tech/` |
| **Kubernetes** | 6 | 1 | `/library/k8s/` |
| **AWS** | 772 | 26 | `/library/aws/`, `/library/aws-resources/`, `/library/aws-groups/`, `/library/aws-categories/` |

### C4

One category per C4 diagram level. Every entry carries a `c4-*` node type that the renderer styles.

| Category | Entries |
| --- | --- |
| **C4 · Context** | Person, External Person, Software System, External Software System, Enterprise Boundary, System Boundary, Group |
| **C4 · Container** | Container, External Container, Web Application, Single-Page Application, Mobile App, Desktop App, API Application, Serverless Function, Console / CLI, Database, Blob Store, Search Index, Message Bus, Container Boundary |
| **C4 · Component** | Component, External Component, Component Database, Component Queue |
| **C4 · Deployment** | Deployment Node, Infrastructure Node, Container Instance |
| **C4 · Code** | Class, Interface, Enumeration |

Reference palette: person `#08427b`, external person `#686868`, system `#1168bd`, external system `#999999`, container `#438dd5`, external container `#b3b3b3`, component `#85bbf0`, external component `#cccccc`, boundaries `#444444`, group `#888888`, deployment node `#666666`.

Dynamic diagrams reuse whichever level's elements they describe — what makes them dynamic is numbered relation labels, authored on the connector, not a separate stencil.

### Activity

One category, **UML · Activity** — the flow elements of the [activity diagram](../how-to/draw-an-activity-diagram.md) stencil: Activity frame, Action, Decision, Fork/join bar, Start, End, Send signal, Receive signal, Object, Note. Every entry carries an `activity-*` node type that the renderer draws as a glyph (diamond, bar, dot, …), not an image.

Lanes and regions are not here — they are structural (a lane must live inside a frame, a region inside a lane) and are created from the frame's own panel, which parents them correctly in one batch, rather than dropped loose from the palette.

### Second-order thinking

One category, **Second-order thinking** — the four stencils behind an [and-then-what tree](../how-to/draw-a-second-order-thinking-diagram.md): Decision, Good consequence, Bad consequence, Neutral consequence. Valence is the node's `type` (`so-decision`, `so-consequence-positive`, `so-consequence-negative`, `so-consequence-neutral`), not a separate field, so turning a consequence from good to bad is a type change in the node panel. Every entry carries an `so-*` node type that the renderer draws as a glyph, not an image.

### Fishbone

One category, **Fishbone** — the three stencils behind a [fishbone diagram](../how-to/draw-a-fishbone-diagram.md): Effect, Category, Cause. Every entry carries an `fb-*` node type (`fb-effect`, `fb-category`, `fb-cause`) that the renderer draws as part of the fish, not an image. A dropped Cause waits in the stray row under the fish until it is connected to a bone.

### Threat model

One category, **Threat model** — the four STRIDE data-flow stencils behind a [threat model](../how-to/draw-a-threat-model.md): External entity, Process, Data store, Trust boundary. Every entry carries a `tm-*` node type (`tm-entity`, `tm-process`, `tm-store`, `tm-boundary`) the renderer draws itself — a box, an ellipse, the open-ended store glyph, a red dashed outline — not an image. `dfd`, `stride` and `threat` are keywords on all four, so any of them finds the set.

A dropped Trust boundary is an empty box: it holds elements through ordinary containment, added with the node panel's Memberships picker.

### Plan

One category, **Plan** — the four stencils behind a [plan](../how-to/draw-a-plan.md): Zone, Event, Person, Team. Zone and Event carry `plan-zone`/`plan-event` node types the renderer draws as a date bar and a diamond, not images; a zone carries no size of its own — the plan layout sizes it from its dates, and a dropped one seeds two weeks wide at the date under the pointer (a zone dropped inside another starts where its parent does). Person and Team carry the ordinary `person`/`team` types, the same pills used elsewhere — a team is an actor exactly like a person, for a role that belongs to a group. `plan` is a keyword on all four, so it finds the set.

### Data

One entry, **Table** — a `db-table` node seeded with a single `id int PK` column, ready to edit in place. The only bundled entry whose template carries `columns` rather than an image. See [Draw an ER diagram](../how-to/draw-an-er-diagram.md).

### Shapes

Person, Users, Internet — hand-drawn silhouette SVGs rendered as tintable masks (`template.shape`, not `template.image`), for the generic marks cloud diagrams hang off the edge of the frame. The person silhouette is the same one the C4 person entries use.

### Tech

Temporal, NATS, StarRocks, Cloudflare, GitHub, GitHub Actions, Auth0, SendGrid, New Relic, ClickHouse, Redis, RabbitMQ, PostgreSQL, Helm, Jupyter, Kubernetes — vendor logos no cloud icon set covers, normalised onto a common tile.

### Kubernetes

Pod, Service, Deployment, Ingress, Secret, Node — the [Kubernetes community icons](https://github.com/kubernetes/community/tree/master/icons), the labeled blue heptagons k8s diagrams are drawn with. Unlike the Tech logos they ship bare (no white tile), since they carry their own chrome.

### AWS

The complete official AWS Architecture Icons release (2026-07-31):

| Family | Count | Directory | Placed size |
| --- | --- | --- | --- |
| Architecture service icons | 303 | `/library/aws/` | 64×64 |
| Resource icons | 419 | `/library/aws-resources/` | 48×48 |
| Group / boundary icons | 15 | `/library/aws-groups/` | 64×64 |
| Category tiles | 26 | `/library/aws-categories/` | 64×64 |

Categories mirror AWS's own taxonomy — *AWS · Compute*, *AWS · Storage*, *AWS · Databases*, and so on — plus *AWS · Groups* and *AWS · Category icons*.

*AWS · Groups* opens with nine hand-curated **boundary containers** (AWS Cloud, AWS Account, Region, Availability Zone, VPC, Public/Private Subnet, Auto Scaling Group, Generic Group). Each places a node with an `aws-*` group type the renderer styles as the official stencil draws it — corner badge, dashed or solid outline, tint-filled subnets — with the authentic accent color baked in. Add children (the node panel's containment control) and it becomes the styled boundary box; the raw badge icons follow in the same category for when you want just the glyph.

Six legacy file names (`lambda.svg`, `s3.svg`, `sns.svg`, `dynamodb.svg`, `api-gateway.svg`, `cloudwatch.svg`) are kept as copies of the real icons so diagrams authored against the old placeholder pack keep resolving. They are not library entries.

## Entry shape

```ts
interface LibraryEntry {
  id: string;
  category: string;      // must match a declared category id
  name: string;          // display, and the primary search term
  keywords?: string[];   // extra search terms
  template: {            // the fields stamped onto a placed node
    type?: string;
    color?: string;
    image?: string;
    shape?: string;
    width?: number;
    height?: number;
    columns?: Column[];  // db-table seeds only
  };
}

interface LibraryCategory {
  id: string;
  name: string;
  builtin?: boolean;     // bundled packs — not user-deletable
}
```

Placing an entry **bakes** `type`, `color`, `image` and `shape` onto a new node, then applies `width`/`height` to the layout overlay. The model keeps no reference back to the entry.

*Apply to …* replaces all four presentation fields on the selected node — fields the card omits are cleared, so no stale look survives.

## Search

Case-insensitive substring over the entry's `name`, its `keywords`, and its category's display name. No fuzzy matching, no ranking; results come back in manifest order.

Keywords carry the abbreviations official names omit, so `s3`, `sqs`, `eks`, `iam`, `msk`, `vpc` and `kms` all find the right icon.

## Panel behaviour

- Categories are collapsible. A section with **more than 16 entries starts collapsed**; smaller ones start open.
- Searching expands every section that matched, unless you collapsed it yourself.
- The count beside a category name is how many entries currently match.
- While searching, empty builtin sections are hidden; empty user categories stay visible so you can still import into them.

## Your own entries

Stored in `.diagrams/src/library.json`, merged over the bundled packs on load. Bundled entries win on an id collision, and user entries whose category does not resolve are dropped.

Imported image bytes are content-hashed into `.diagrams/src/assets/` (max 5 MB; `png`, `jpeg`, `svg`, `webp`, `gif`). The entry stores only the file name.

## Asset ref rules

A `template.image` or `template.shape` must match one of:

- `^[a-z0-9]+\.(png|jpe?g|svg|webp|gif)$` — an imported, content-hashed asset
- `^/library/[a-z0-9-]+/[a-z0-9-]+\.(png|jpe?g|svg|webp|gif)$` — a bundled asset

**Exactly one directory level**, lowercase kebab-case. A nested path such as `/library/aws/compute/ec2.svg` fails validation.

## Regenerating the bundled packs

Assets and manifests are committed; nothing fetches at build time.

```bash
node scripts/build-aws-pack.mjs     # downloads the pinned AWS release
node scripts/build-aws-pack.mjs --src <dir>   # or build from an extracted package
node scripts/build-tech-pack.mjs    # refetches the vendor logos and Kubernetes icons
```

Bump `RELEASE` and `RELEASE_URL` in `scripts/build-aws-pack.mjs` for a newer AWS quarterly release. Extra search aliases live in `scripts/aws-aliases.mjs`.

## See also

- [Use the icon library](../how-to/use-the-icon-library.md)
