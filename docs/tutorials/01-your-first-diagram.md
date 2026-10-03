# Tutorial 1 — Your first diagram

**Goal:** starting from an empty repository, get a diagram you can read in the browser, change it in TypeScript and see the change, and export a PNG you can commit.

You will type every command. Nothing here explains *why* the pieces work the way they do — for that, read [How a diagram becomes a picture](../explanation/architecture.md) afterwards.

**Time:** about ten minutes.

---

## Before you start

Install the CLI. One line, no Node required (macOS and Linux):

```bash
curl -fsSL https://raw.githubusercontent.com/Ferroman/diagc/main/install.sh | sh
```

With Node 22 or newer already set up, npm works too:

```bash
npm i -g @diagc/cli
```

Check it with `diagc --help`. Nothing in this tutorial needs a checkout of diagc, or a package manager in your project.

Then make an empty repository to work in:

```bash
mkdir shop-diagrams && cd shop-diagrams
git init
```

---

## Step 1 — Create a diagram

```bash
diagc init shop
```

```
✓ .diagrams/src/shop.diagram.ts         (basic starter)
✓ .gitignore                            (+ .diagrams/.artifacts/, .diagrams/html/, .diagrams/diff/)
✓ compiled                              -> .diagrams/.artifacts/shop.diagram.json

Next:
  diagc studio                          look at it
  diagc guide                           how to write diagrams (for you or your agent)
  diagc init --agents                   point coding agents at the guide (AGENTS.md, Claude Code skill)
```

Three files, one of them yours. Open `.diagrams/src/shop.diagram.ts`:

```ts
import { model } from '@diagc/core';

// A starter: a customer and one system holding two services and a database.
// `contains` nests, `relate` draws an arrow. The system rests folded, with the
// arrows into it bundled, until you double-click it.
const m = model('shop', { name: 'Shop' });

const customer = m.node('customer', { type: 'person', name: 'Customer' });
const shop = m.node('shop', { type: 'system', name: 'Shop' });

const web = m.node('web', { type: 'service', name: 'Storefront' });
const api = m.node('api', { type: 'service', name: 'Orders API' });
const db = m.node('orders-db', { type: 'database', name: 'Orders DB' });

shop.contains(web, api, db);

m.relate(customer, web, { kind: 'sync', label: 'Browses' });
m.relate(web, api, { kind: 'sync', label: 'Places orders' });
m.relate(api, db, { kind: 'writes', label: 'Order rows' });

export default m;
```

`m.node` declares a box, `.contains` nests boxes inside another, and `m.relate` draws an arrow. The `export default` at the end is what the compiler looks for.

The compiled file, `.diagrams/.artifacts/shop.diagram.json`, is the **artifact** — your model, validated. Open it if you like; it is plain, readable JSON. You never edit it by hand, and `init` has already gitignored it.

If you break the source — a relation pointing at a node that does not exist, say — the compile fails with a message naming the problem, and no artifact is written. That is the point: a diagram that cannot be drawn correctly never reaches the browser.

## Step 2 — Look at it

```bash
diagc studio
```

Your browser opens on the studio (if it does not, open the address the terminal prints — normally <http://127.0.0.1:5173>). If **shop** is not already showing, pick it from the diagram picker in the top bar.

You will see `Customer`, and a `Shop` box with a dashed border and a badge counting what is inside. That is a *folded group*: the storefront, the API and the database are in there, but the diagram rests folded so you see structure before detail. The arrow from `Customer` lands on the group.

**Double-click the Shop box.** It unfolds and the view glides into it, revealing `Storefront`, `Orders API` and `Orders DB` with the arrows between them. Double-click empty canvas to fit the whole diagram again.

This is **semantic zoom**, and it is the reason a large diagram stays readable. You will meet it properly in [What you see is not what is stored](../explanation/views.md).

The diagram carries a `read-only` chip: it is TypeScript, so the file is where you change it. Leave the studio running — it is also recompiling your sources whenever they change.

## Step 3 — Change it

Add a second service to `shop.diagram.ts`, above the `export default` line:

```ts
const worker = m.node('worker', { type: 'service', name: 'Fulfilment' });
shop.contains(worker);
m.relate(worker, db, { kind: 'reads', label: 'Open orders' });
```

Save the file. The terminal running the studio prints a `✓` line as it recompiles. Reload the browser tab — the studio reopens `shop` — and double-click `Shop` again: `Fulfilment` is there with its arrow to the database.

## Step 4 — Export a picture

Stop the studio (`Ctrl+C`) and run:

```bash
diagc publish
```

This writes two kinds of output:

- `.diagrams/html/shop.html` — a self-contained interactive page. Open it in a browser: it has the same fold/unfold behaviour and needs no server. An `index.html` beside it lists every diagram.
- `.diagrams/static/shop.png` — a flat image, sized to your diagram, with every group unfolded.

Embed the PNG in any markdown file:

```markdown
![Shop](.diagrams/static/shop.png)
```

> **If you see `No Chrome found`:** the PNG step drives a real browser. Install Chrome or Chromium, or point `CHROME_PATH` at an existing binary. `diagc publish --no-images` skips PNGs and still writes the HTML.

## What you have now

```
.gitignore                     written by init — commit it
.diagrams/
  src/shop.diagram.ts          you changed this — commit it
  .artifacts/shop.diagram.json generated, gitignored
  html/shop.html               generated, gitignored
  html/index.html              generated, gitignored
  static/shop.png              generated — commit this one
```

## Next

- [Tutorial 2 — Draw one in the browser](02-draw-in-the-studio.md), which produces the same kind of model without writing TypeScript.
- `diagc guide` — how to write diagrams, printed by the CLI you just installed: the DSL, the vocabularies, and one topic per diagram type. `diagc init shop --type c4` would have started you from a C4 diagram instead.
- [Write diagrams with a coding agent](../how-to/write-diagrams-with-a-coding-agent.md) — what the `diagc init --agents` line is for.
- [Add diagc to an existing repository](../how-to/set-up-in-another-repo.md) — what to commit, editor types, `diagc lint` in CI.
- [Author diagrams in TypeScript](../how-to/author-in-typescript.md) for the rest of the DSL: descriptions, metadata, colours, styles.
- [Builder API reference](../reference/builder-api.md) for every method and option.
