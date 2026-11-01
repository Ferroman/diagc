# Compose diagrams

An umbrella diagram pulls other diagrams in whole, each as a group of its own, and draws arrows between what is inside them. The parts stay in their own files; recompiling the umbrella picks up their changes. This is `include`, a node option: there is no method for it.

## The parts

A part is any diagram compiled to JSON: a diagram drawn in the studio, or a `.diagram.ts` once `diagc compile` has written `.diagrams/.artifacts/<name>.diagram.json`. Never include a `.diagram.ts` itself. These two parts are what the umbrella below pulls in; both draw the same users database and say so with `key`.

```json billing.diagram.json
{
  "version": 1, "id": "billing", "name": "Billing",
  "nodes": [
    { "id": "invoices", "name": "Invoice service", "type": "service" },
    { "id": "notifier", "name": "Notifier", "type": "service" },
    { "id": "ledger", "name": "Ledger DB", "type": "database" },
    { "id": "users", "name": "Users DB", "type": "database", "key": "users-db" }
  ],
  "containment": [],
  "relations": [
    { "id": "b1", "from": "invoices", "to": "ledger", "kind": "writes", "label": "Invoices" },
    { "id": "b2", "from": "invoices", "to": "users", "kind": "reads" },
    { "id": "b3", "from": "invoices", "to": "notifier", "kind": "async", "label": "Invoice events" }
  ],
  "layers": [], "planes": []
}
```

```json notify.diagram.json
{
  "version": 1, "id": "notify", "name": "Notify",
  "nodes": [
    { "id": "router", "name": "Message router", "type": "service" },
    { "id": "emailgw", "name": "Email gateway", "type": "service" },
    { "id": "sms", "name": "SMS gateway", "type": "service" },
    { "id": "users", "name": "User store", "type": "database", "key": "users-db" }
  ],
  "containment": [],
  "relations": [
    { "id": "n1", "from": "router", "to": "emailgw", "kind": "async" },
    { "id": "n2", "from": "router", "to": "sms", "kind": "async" },
    { "id": "n3", "from": "router", "to": "users", "kind": "reads" }
  ],
  "layers": [], "planes": []
}
```

## The umbrella

```ts
import { model } from '@diagc/core';

// One picture of two diagrams that live in their own files. Recompile this one
// and it follows them.
const m = model('platform', { name: 'Platform' });

// An include node is a group holding everything the named diagram declares. The
// path is relative to this file; an https:// address works too (see the rules).
const bill = m.node('bill', { type: 'system', name: 'Billing', include: './billing.diagram.json' });
const note = m.node('note', { type: 'system', name: 'Notifications', include: './notify.diagram.json' });

// An arrow between two nodes that live inside the parts: reach each through its
// include node's handle, by the id it has in its own diagram.
m.relate(bill.included('notifier'), note.included('emailgw'), { kind: 'async', label: 'Invoice ready' });

export default m;
```

## How it works

- Composition happens when the umbrella compiles. The artifact holds everything; the source stays this short. The studio shows the composed picture too.
- Every id a part declares is prefixed with its include node's id: `invoices` in `billing.diagram.json` is `bill/invoices` here, and so are its relation ids. A part's layer keeps its id when the umbrella declares a layer with the same id (they merge), and is prefixed otherwise.
- `bill.included('notifier')` is the handle for `bill/notifier`. Nothing is declared by it; the arrow is checked once the part is composed, and a node the part does not have fails the compile with `dangling-endpoint` naming `bill/notifier`.
- Two parts that draw the same thing merge it with `key`: nodes sharing a `key` become one node whose id is the key (`users-db` above), inside both groups, and every arrow from either part lands on it. Declare `key: 'users-db'` on a node in the umbrella too to choose its name and type. A key is inert until the diagram is composed, so adding one costs nothing.
- One plane's grouping comes along: the part's first-declared plane, or the one `includePlane` names (`includePlane: 'deployment'`). Add `includePlanes` (`includePlanes: true`) to also carry every plane of the part over, as `bill/<plane id>` with its own notation, so a git graph inside a C4 umbrella still reads as a git graph on its own plane.
- Parts nest: a part may include parts of its own, up to 10 deep.
- A part at an `https://` address is never fetched by a plain compile. Run `diagc compile --update-includes` once to fetch it into `.diagrams/includes/` and pin its hash in `.diagrams/includes.lock.json`, and commit both. Every later compile reads the pinned copy.

## Rules

- `include` points at a `.diagram.json`. A `.diagram.ts` must be compiled first, and the include then names its artifact.
- Do not rebuild a part by hand — not by copying its nodes, and not by importing its JSON and looping over it. That compiles and lints clean, but nothing is prefixed, no `key` merges and nothing is checked; the picture is a copy, not a composition.
- The umbrella's own ids must not collide with a prefixed one: declaring a node `bill/invoices` beside the include fails validation.
- The umbrella owns the look. A part's `typeColors`, `layerRules` and `legend` are dropped; declare them on the umbrella.
- Keys match `^[a-z0-9][a-z0-9-]*$`, and two nodes in one diagram never share one.
