# Tutorial 1 — Your first diagram

**Goal:** starting from an empty repo, write a diagram in TypeScript, see it in the browser, and export a PNG you can commit.

You will type every command. Nothing here explains *why* the pieces work the way they do — for that, read [How a diagram becomes a picture](../explanation/architecture.md) afterwards.

**Time:** about ten minutes.

---

## Before you start

You need three things. If you already have them, skip ahead.

- **Node.js 22 or newer.** Check with `node --version`. The repo pins Node 24 in `mise.toml`; if you use [mise](https://mise.jdx.dev), `mise install` picks the right version whenever you `cd` in.
- **pnpm 10.** Run `corepack enable` once — Corepack ships with Node, and the version pinned in `package.json` is then used automatically.
- **A clone of this monorepo**, with dependencies installed:

  ```bash
  git clone <this repo> diagramming
  cd diagramming
  pnpm install
  ```

Everything below runs from that clone. To use `diagc` from a *different* repo instead, finish this tutorial first, then follow [Set up diagc in another repo](../how-to/set-up-in-another-repo.md).

---

## Step 1 — Write the source

Diagrams live in `.diagrams/src/`. Create `.diagrams/src/shop.diagram.ts`:

```ts
import { model } from '@diagramming/core';

const m = model('shop', { name: 'Shop' });

const web = m.node('web', { type: 'system', name: 'Storefront' });
const api = m.node('api', { type: 'service', name: 'Orders API' });
const db = m.node('orders-db', { type: 'database', name: 'Orders DB' });

web.contains(api);
api.contains(db);

m.relate(api, db, { kind: 'writes' });

export default m;
```

Three things are happening: `m.node` declares an entity, `.contains` nests one inside another, and `m.relate` draws an arrow. The `export default` at the end is what the compiler looks for.

## Step 2 — Compile it

```bash
pnpm compile
```

```
✓ .diagrams/src/shop.diagram.ts -> .diagrams/.artifacts/shop.diagram.json
```

That JSON file is the **artifact** — your model, validated. Open it if you like; it is plain, readable JSON. You never edit it by hand, and it is gitignored.

If you made a mistake — a relation pointing at a node that does not exist, say — the compile fails here with a message naming the problem, and no artifact is written. That is the point: a diagram that cannot be drawn correctly never reaches the browser.

## Step 3 — Look at it

```bash
pnpm studio
```

Open <http://localhost:5173> and pick **shop** from the dropdown in the top bar.

You will see one box, `Storefront`, with a dashed border. That is a *folded group*: the API and the database are inside it, but the diagram rests folded so you see structure before detail.

**Double-click the Storefront box.** It unfolds and the view glides into it, revealing `Orders API`. Double-click `Orders API` and you reach `Orders DB`. Double-click empty canvas to fit the whole diagram again.

This is **semantic zoom**, and it is the reason a large diagram stays readable. You will meet it properly in [What you see is not what is stored](../explanation/views.md).

Leave the studio running.

## Step 4 — Change it and watch it update

Open a second terminal in the same directory:

```bash
pnpm compile:watch
```

Now add a second service to `shop.diagram.ts`:

```ts
const worker = m.node('worker', { type: 'service', name: 'Fulfilment' });
web.contains(worker);
m.relate(worker, db, { kind: 'reads' });
```

Save the file. The watcher recompiles, and the studio picks up the new artifact within a second — no reload, no re-running `pnpm compile`.

> `pnpm dev` runs the watcher and the studio together in one terminal. Use it from now on.

## Step 5 — Export a picture

Stop the studio (`Ctrl+C`) and run:

```bash
pnpm build:cli        # once — builds the shell the exporter stamps your model into
pnpm publish-diagrams
```

This writes two kinds of output:

- `.diagrams/html/shop.html` — a self-contained interactive page. Open it in a browser: it has the same fold/unfold behaviour and needs no server.
- `.diagrams/static/shop.png` — a flat image, sized to your diagram, with every group unfolded.

Embed the PNG in any markdown file:

```markdown
![Shop](.diagrams/static/shop.png)
```

> **If you see `No Chrome found`:** the PNG step drives a real browser. Install Chrome or Chromium, or point `CHROME_PATH` at an existing binary. `pnpm publish-diagrams --no-images` skips PNGs and still writes the HTML.

## What you have now

```
.diagrams/
  src/shop.diagram.ts          you wrote this — commit it
  .artifacts/shop.diagram.json generated, gitignored
  html/shop.html               generated, gitignored
  static/shop.png              generated — commit this one
```

## Next

- [Tutorial 2 — Draw one in the browser](02-draw-in-the-studio.md), which produces the same kind of model without writing TypeScript.
- [Author diagrams in TypeScript](../how-to/author-in-typescript.md) for the rest of the DSL: descriptions, metadata, colours, styles.
- [Builder API reference](../reference/builder-api.md) for every method and option.
