# diagramming

Author software-architecture diagrams as TypeScript, compile them to a validated JSON model, and explore them in a browser studio with **semantic zoom** — the diagram rests as folded group boxes whose relations aggregate; double-click a group to zoom into it and unfold its parts, double-click again to fold it back.

Diagrams are code, so they diff, review, and refactor like the rest of your repo.

![How a diagram becomes a picture](.diagrams/static/docs-pipeline.png)

You author diagrams two ways that meet at the same validated model: write a `.diagram.ts` file, or draw one in the browser and the studio writes a `.diagram.json` for you. Either way `diagc` compiles and validates it into one artifact per diagram, which the studio renders and `diagc publish` turns into shareable pages and images.

## Quickstart

Needs **Node ≥ 22** (the repo pins Node 24 in `mise.toml`) and **pnpm 10** (`corepack enable` once).

```bash
pnpm install
pnpm dev          # compile watcher + studio at http://localhost:5173
```

The repo ships an example, `.diagrams/src/acme.diagram.ts`, so a fresh clone renders something immediately.

New here? Start with **[Tutorial 1 — Your first diagram](docs/tutorials/01-your-first-diagram.md)**.

## Documentation

Organised along [Diátaxis](https://diataxis.fr/) lines — learning, tasks, lookup, understanding.

### Tutorials — learn by doing

| | |
| --- | --- |
| [Your first diagram](docs/tutorials/01-your-first-diagram.md) | Zero to a compiled, rendered, exported diagram in TypeScript. |
| [Draw one in the browser](docs/tutorials/02-draw-in-the-studio.md) | The same result by dragging AWS icons onto a canvas. |

### How-to guides — get something done

| | |
| --- | --- |
| [Author diagrams in TypeScript](docs/how-to/author-in-typescript.md) | Nodes, relations, styles, ER tables, metadata. |
| [Use planes and layers](docs/how-to/use-planes-and-layers.md) | One model, several views: a second hierarchy, or an overlay. |
| [Add a legend](docs/how-to/add-a-legend.md) | An on-canvas key: derived rows, plus what only you can say. |
| [Organise a large diagram](docs/how-to/organise-large-diagrams.md) | Semantic zoom, pins, drilling — and when to split instead. |
| [Use the icon library](docs/how-to/use-the-icon-library.md) | C4 stencils, 763 AWS icons, importing your own. |
| [Compose diagrams](docs/how-to/compose-diagrams.md) | `include` and `key`: umbrella views over several diagrams. |
| [Publish and share](docs/how-to/publish-and-share.md) | PNGs for a README, interactive pages, GitHub Pages. |
| [Set up `diagc` in another repo](docs/how-to/set-up-in-another-repo.md) | Use the CLI anywhere on your machine. |

### Reference — look it up

| | |
| --- | --- |
| [`diagc` CLI](docs/reference/cli.md) | Commands, flags, environment variables, which files to commit. |
| [Model](docs/reference/model.md) | Every field of a diagram, every validation code, registry defaults. |
| [Builder API](docs/reference/builder-api.md) | The TypeScript DSL, method by method. |
| [Studio](docs/reference/studio.md) | Panels, gestures, shortcuts. |
| [Library](docs/reference/library.md) | The bundled C4, Tech and AWS packs. |

### Explanation — understand it

| | |
| --- | --- |
| [How a diagram becomes a picture](docs/explanation/architecture.md) | The pipeline, the packages, and why they are split that way. |
| [What is in a model](docs/explanation/the-model.md) | The five decisions frozen into the data structure. |
| [What you see is not what is stored](docs/explanation/views.md) | Semantic zoom, planes and layers — and how they interact. |

## Extending the renderer

The renderer is driven by three registries and a theme, all overridable. The studio uses the built-in defaults; these hooks apply when you render `DiagramView` yourself.

```tsx
import { createIconRegistry } from '@diagramming/icons';
import { createTypeRegistry, createKindRegistry, DiagramView } from '@diagramming/renderer';

const typeRegistry = createTypeRegistry({ lambda: { shape: 'hexagon', icon: 'lambda', dashed: true } });
const kindRegistry = createKindRegistry({ grpc: { animated: true, width: 2 } });
const icons = createIconRegistry({ lambda: MyLambdaIcon });

<DiagramView model={model} typeRegistry={typeRegistry} kindRegistry={kindRegistry} icons={icons} />;
```

Overrides merge over the defaults, so you declare only what is new; unknown types fall back to a plain box and unknown kinds to a plain line. `registry.register(id, style)` adds entries imperatively.

Colours are a flat [`ThemeTokens`](./packages/renderer/src/theme.ts) object exposed to CSS as `--dg-*` custom properties. Start from `lightTheme` / `darkTheme` and apply a tweaked copy with `applyTheme(el, theme)`.

## Development

```bash
pnpm dev         # compile:watch + studio together
pnpm test        # vitest
pnpm typecheck   # tsc --noEmit across every package
```

![Which package owns what](.diagrams/static/docs-workspace.png)

| Path | Package | Role |
| --- | --- | --- |
| `packages/core` | `@diagramming/core` | Builder DSL, the JSON model + validation, the view compiler. |
| `packages/renderer` | `@diagramming/renderer` | React `DiagramView` (React Flow + elk) and the type/kind/theme registries. |
| `packages/icons` | `@diagramming/icons` | Icon id → lucide component. |
| `packages/diagc` | `@diagramming/diagc` | The `diagc` CLI: compile, watch, publish, studio. |
| `apps/studio` | `@diagramming/studio` | The browser app and its dev-server API. |
| `apps/viewer` | `@diagramming/viewer` | The single-file shell `publish` stamps a model into. |

The diagrams in these docs are built with this tool — sources in `.diagrams/src/docs-*.diagram.ts`, regenerated with `pnpm publish-diagrams`.
