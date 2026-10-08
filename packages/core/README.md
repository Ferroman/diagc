# @diagc/core

The diagram model behind [`diagc`](https://www.npmjs.com/package/@diagc/cli): the `DiagramModel` types, `validate()` and the builder DSL. No React, no filesystem — it does not know it is going to be drawn.

```bash
npm i -D @diagc/core
```

Install it alongside the CLI (`@diagc/cli`) to get types and completion when authoring `.diagram.ts` files:

```ts
import { model } from '@diagc/core';

const m = model('acme', { name: 'Acme platform' });
const web = m.node('web', { name: 'Web app', type: 'service' });
m.relate(web, m.node('db', { name: 'Postgres', type: 'database' }), { kind: 'reads' });

export default m;
```

`diagc compile` executes the file and validates whatever it exports, so the CLI works with or without this package installed — it only changes what your editor knows.

Docs and the full model reference: <https://github.com/Ferroman/diagc>

## What 1.0 promises

Semver covers what you need to write or check a diagram: `model()` and the builder it returns (its classes and option types), the model types such as `DiagramModel` with the value lists they are built from, and `validate()`, `diagramWarnings()` and `DiagramValidationError`. That is everything `@diagc/core` exports.

diagc's own packages use a second entry point, `@diagc/core/internal`: commands, the view compiler, layout helpers. It changes whenever diagc needs it to, in any release, so do not import from it.

## License

[AGPL-3.0-only](https://github.com/Ferroman/diagc/blob/main/LICENSE), with additional permissions under section 7: diagrams you author, and the pages and images built from them, are yours to license however you like. A commercial license is available. See the [project README](https://github.com/Ferroman/diagc#license).
