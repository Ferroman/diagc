# Draw a C4 diagram

Draw a [C4 model](https://c4model.com) — context, container, component or deployment — with the notation's authentic look: solid person/system/container/component fills and a `[Type: technology]` subtitle under each box. Deployment-level stencils (`c4-deployment-node`, `c4-infrastructure-node`, `c4-container-instance`) deliberately keep the outline look — no fill override, by design.

![Internet banking system: a Personal Banking Customer and an E-mail System at context level, with the Internet Banking System drilled into its Web Application, API Application and Database containers](../../.diagrams/static/docs/c4.png)

C4 elements are ordinary nodes with `type: 'c4-*'` — stencils from the **Library** panel's C4 categories, or free-form in the DSL. What makes the picture read as C4 is the **notation** (turns the fills on) and **technology** (the per-node subtitle); neither exists only for C4, but both were built for it.

## In TypeScript

1. Pin the notation on the model, then declare the context-level nodes:

   ```ts
   import { model } from '@diagc/core';

   const m = model('docs-c4', { name: 'Internet banking system' });
   m.notation('c4');

   const customer = m.node('customer', { type: 'c4-person', name: 'Personal Banking Customer' });
   const banking = m.node('banking', { type: 'c4-system', name: 'Internet Banking System' });
   const mail = m.node('mail', { type: 'c4-system-external', name: 'E-mail System' });
   ```

2. Drill in: containers are ordinary children, and `technology` composes into the type subtitle (`[Container: Java, Spring Boot]`):

   ```ts
   const web = m.node('web', { type: 'c4-container-web', name: 'Web Application', technology: 'Java, Spring MVC' });
   const api = m.node('api', { type: 'c4-container-api', name: 'API Application', technology: 'Java, Spring Boot' });
   const db = m.node('db', { type: 'c4-container-db', name: 'Database', technology: 'PostgreSQL' });

   banking.contains(web, api, db);
   ```

3. Relate them — a relation `label` is where the protocol goes, C4-dynamic-diagram style:

   ```ts
   m.relate(customer, web, { kind: 'sync', label: 'Uses [HTTPS]' });
   m.relate(web, api, { kind: 'sync', label: 'Calls [JSON/HTTPS]' });
   m.relate(api, db, { kind: 'reads', label: 'Reads and writes [SQL]' });
   m.relate(api, mail, { kind: 'async', label: 'Sends e-mail using [SMTP]' });

   export default m;
   ```

4. `pnpm compile`, open it in the studio or publish it. Double-click **Internet Banking System** to drill into its containers.

The whole picture above is `.diagrams/src/docs/c4.diagram.ts` in this repo.

## In the studio

1. **Layers & planes**, in edit mode: set **Notation** to `C4` — at the top for a single-plane diagram, or on a plane's own row if the diagram declares several (a plane's `notation` wins over the model's where both are set).
2. Drag stencils off the **C4 · Context**, **C4 · Container**, **C4 · Component**, **C4 · Deployment** and **C4 · Code** categories in the **Library** panel — see [Use the icon library](use-the-icon-library.md#build-a-c4-diagram) for which section matches which diagram level. Drag one onto another to nest a container inside a system, a component inside a container.
3. Select a node — the Properties panel's **Technology** field sets the per-node subtitle.
4. Clear a node's **Colour** swatch to let the C4 notation's fill show through (see precedence, below).

## What to know

- **An explicit node colour always beats the notation's fill.** That's the standing rule for every notation, not a C4 special case — `node.color`, and failing that a model `typeColors` entry, wins over whatever the active notation would paint. The **Library**'s C4 cards set an explicit `color` on every stencil, so a dropped Person or Software System already reads about right without turning the notation on at all — but that same colour then shadows the authentic multi-shade palette once you do. The External twins carry a grey close to the notation's own, so they look right regardless; the others need their Colour swatch cleared (or `m.node(...)` called without `color`, as in the DSL example above) to show it. This diagram's nodes never set `color`, so the fill is the notation speaking.
- **Sketch/hand-drawn presets keep the outline look.** Rough rendering (`sketch`, `hand-drawn`, `pencil`, `blueprint`, `marker`) never fills a C4 box solid — the wobbly stroke stays an outline over the plain canvas whatever the notation says, so switching presets mutes the palette back down.
- **Component text goes dark, everyone else's goes white.** The pale component blue (`#85bbf0`) fails contrast against white, so `c4-component*` types render dark text on it; person/system/container/external all render white on their darker fills.
- **`technology` is not C4-only.** It is a plain field on `DiagramNode`, composed into the `[Type]` subtitle in any notation — C4 is simply where it matters most.

## Examples

**Starter** — one person, one system, two containers, with the notation pinned and every relation labelled. Copy it into `.diagrams/src/` and change the names.

```ts
import { model } from '@diagc/core';

// A C4 starter: one person, one system, two containers. The notation is what
// paints the solid fills and the [Type: technology] subtitles.
const m = model('expense-claims', { name: 'Expense claims' });
m.notation('c4');

const employee = m.node('employee', { type: 'c4-person', name: 'Employee' });
const claims = m.node('claims', { type: 'c4-system', name: 'Expense Claims' });

const web = m.node('web', { type: 'c4-container-web', name: 'Web Application', technology: 'TypeScript, Next.js' });
const db = m.node('db', { type: 'c4-container-db', name: 'Claims Database', technology: 'PostgreSQL 16' });

claims.contains(web, db);

m.relate(employee, web, { kind: 'sync', label: 'Submits claims [HTTPS]' });
m.relate(web, db, { kind: 'reads', label: 'Stores claims [SQL/TCP]' });

export default m;
```

[![Expense claims](../../.diagrams/static/examples/c4/starter.png)](https://ferroman.github.io/diagc/html/examples/c4/starter.html)

**Online bookstore** — one shop at all three C4 levels: a customer and two external systems at context level, seven containers inside the bookstore, and the Checkout API's own components one drill further down. It uses `technology` on every container and component, the database and queue container types, and relations drawn to the component that answers rather than to the box around it — folded, they aggregate onto the container, so the context view still reads. [Source](../../.diagrams/src/examples/c4/online-bookstore.diagram.ts)

[![Online bookstore](../../.diagrams/static/examples/c4/online-bookstore.png)](https://ferroman.github.io/diagc/html/examples/c4/online-bookstore.html)

## See also

- [Builder API](../reference/builder-api.md#mnotationid--m) — `m.notation`, and `technology` in `m.node`'s options
- [Model reference](../reference/model.md#diagrammodel) — `notation` on the model and per plane; `technology` on a node
- [Use the icon library](use-the-icon-library.md#build-a-c4-diagram) — placing C4 stencils from the palette
- [Publish and share](publish-and-share.md) — the page and the PNG work as for any diagram
