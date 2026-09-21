# Use the icon library

The **Library** tab in the studio's right-hand inspector. Full contents in [Library reference](../reference/library.md).

## Find an icon

Type in the search box. It matches an entry's **name, its category, and its keywords** — the keywords carry abbreviations the official names omit:

| Type this | Finds |
| --- | --- |
| `s3` | Amazon Simple Storage Service, and every S3 resource icon |
| `sqs` | Amazon Simple Queue Service |
| `eks` | Amazon Elastic Kubernetes Service |
| `iam` | AWS Identity and Access Management |
| `kafka` | Amazon Managed Streaming for Apache Kafka |
| `person` | the C4 Person stencil |
| `erd` | the Data pack's Table |

Sections with more than 16 entries start collapsed — the AWS pack is 763 icons, so the panel opens as a tidy list of headers. Searching expands whatever matched. The number beside a category name is how many entries currently match.

## Place one

- **Click** a card to drop a node at an auto-placed spot, with its name selected so you can type immediately.
- **Drag** a card onto the canvas to place it exactly there.
- **Drag it onto an existing node** to nest it inside.

If a container is selected when you click, the new node lands inside it.

## Restyle an existing node

Select a node, then use the **Apply to …** toggle at the top of the panel and click a card. That replaces the node's look instead of placing a new one.

Apply is a **total** replace of the four presentation fields — `type`, `color`, `image`, `shape`. Fields the card does not carry are cleared, so an image card wipes a leftover silhouette and a plain colour card wipes both.

## Build a C4 diagram

Each C4 category matches one C4 diagram level, so pick the section that matches what you are drawing:

| Drawing | Section |
| --- | --- |
| System context, system landscape | **C4 · Context** |
| Container diagram | **C4 · Container** |
| Component diagram | **C4 · Component** |
| Deployment diagram | **C4 · Deployment** |
| Code diagram | **C4 · Code** |

Boundaries (*Enterprise Boundary*, *System Boundary*, *Container Boundary*, *Group*) are ordinary nodes with a dashed style — place one, then drag other nodes onto it to nest them inside.

**External** twins are the same stencil in grey. Use them for anything outside your scope of control.

**Dynamic diagrams** have no separate stencil: reuse the elements of whichever level you are describing, and number the interactions by double-clicking each connector and typing `1. …`, `2. …`.

## Draw an ER diagram

The **Data** category holds one entry, **Table**. Placing it drops a `db-table` node seeded with a single `id int PK` column; edit the rows in place on the node.

Drag from a column row's connect point to another table to create a foreign key — it draws anchored to that row, with a bar at the referenced end. [Draw an ER diagram](draw-an-er-diagram.md) has the whole walkthrough, in the studio and in TypeScript.

## Add your own icons

1. Type a name into **New category…** at the bottom of the panel and press `+`.
2. Use the **Icon** button on your new category to import an image, or **Shape** to import an SVG silhouette.

The difference matters:

- An **icon** renders as the picture itself, unchanged.
- A **shape** renders as a tintable mask filled with the node's colour — good for silhouettes you want to recolour per node.

Bytes are stored content-hashed in `.diagrams/src/assets/` (max 5 MB; `png`, `jpeg`, `svg`, `webp`, `gif`), and your entries in `.diagrams/src/library.json`. Both are yours to commit.

Only your own categories get import and delete controls. Bundled packs are read-only.

## Gotchas

- **Placing bakes.** The node copies the card's look; the model keeps no link back. Deleting a library entry never breaks a placed node — and editing an entry never updates one.
- **Library writes are best-effort.** A failed save to `library.json` is currently swallowed silently.
- **Bundled entries win on id collision.** A user entry reusing a bundled id is dropped at merge time.
- **Asset refs allow exactly one directory level.** `/library/aws/ec2.svg` is valid; `/library/aws/compute/ec2.svg` fails validation.

## See also

- [Library reference](../reference/library.md) — packs, entry shape, regeneration
- [Tutorial 2 — Draw one in the browser](../tutorials/02-draw-in-the-studio.md)
