# Renderer registries and theme

How to change what a node type, a relation kind or an icon id draws as, and the colours of the canvas. This applies when you render `DiagramView` yourself. The studio and published pages use the built-in defaults.

> **Checkout only.** `@diagc/renderer` and `@diagc/icons` are not published to npm. The imports below resolve inside a checkout of this repository, in a package of its workspace. See [CONTRIBUTING.md](../../CONTRIBUTING.md#the-packages).

## Registries

The renderer is driven by three registries and a theme, all overridable.

```tsx
import { createIconRegistry } from '@diagc/icons';
import { createTypeRegistry, createKindRegistry, DiagramView } from '@diagc/renderer';

const typeRegistry = createTypeRegistry({ lambda: { shape: 'hexagon', icon: 'lambda', dashed: true } });
const kindRegistry = createKindRegistry({ grpc: { animated: true, width: 2 } });
const icons = createIconRegistry({ lambda: MyLambdaIcon });

<DiagramView model={model} typeRegistry={typeRegistry} kindRegistry={kindRegistry} icons={icons} />;
```

Overrides merge over the defaults, so you declare only what is new. An unknown type falls back to a plain box, and an unknown kind falls back to a plain line. `registry.register(id, style)` adds entries imperatively.

## Theme

Colours are a flat [`ThemeTokens`](../../packages/renderer/src/theme.ts) object exposed to CSS as `--dg-*` custom properties. Start from `lightTheme` / `darkTheme` and apply a tweaked copy with `applyTheme(el, theme)`.

## See also

- [Model reference](model.md): the registry defaults for every built-in type and kind.
- [How a diagram becomes a picture](../explanation/architecture.md): where the renderer sits among the packages.
