# @diagc/core

The diagram model behind [`diagc`](https://www.npmjs.com/package/@diagc/cli): the `DiagramModel` types, `validate()`, the builder DSL, and the view compiler. No React, no filesystem — it does not know it is going to be drawn.

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

## License

[AGPL-3.0-only](https://github.com/Ferroman/diagc/blob/main/LICENSE), with additional permissions under section 7: diagrams you author, and the pages and images built from them, are yours to license however you like. A commercial license is available. See the [project README](https://github.com/Ferroman/diagc#license).
