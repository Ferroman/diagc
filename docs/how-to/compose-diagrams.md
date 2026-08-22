# Compose diagrams

Build an umbrella diagram out of several smaller ones, and make them agree about the things they share.

Two features do this: `include` pulls another diagram's content in, and `key` merges nodes that are the same entity.

## Pull one diagram into another

```ts
const perms = m.node('perm', {
  name: 'Permissions',
  include: './permission-svc.diagram.json',
});
```

At **compile time** the node becomes a container holding that diagram's content. The path is resolved relative to the declaring source; an `https://…` URL works too.

What happens to the included content:

| Thing | Becomes |
| --- | --- |
| Node ids | prefixed — `db` → `perm/db` |
| Relation ids | prefixed the same way |
| Layer ids | prefixed; the layer *name* becomes `Permissions/<name>` — **unless the umbrella declares a layer with the same id**, in which case the included layer merges into it (umbrella name and tint win) and the include's `layer` refs on nodes and relations point at the shared layer |
| Containment | **only the default plane's edges**, imported untagged |
| Included roots | children of the include node |

Include targets must be `*.diagram.json` — a compiled artifact or a studio-authored source, not a `.diagram.ts`.

Nesting is allowed up to **10 levels**; deeper fails with an `IncludeError` naming the chain.

## Make two diagrams agree on a shared entity

Two diagrams that both mention the same database are, by default, two unrelated nodes. Give both the same `key`:

```ts
// in permission-svc.diagram.ts
m.node('db', { type: 'database', name: 'App DB', key: 'appuser-db' });

// in communication-svc.diagram.ts
m.node('database', { type: 'database', name: 'User store', key: 'appuser-db' });
```

Now compose them:

```ts
const m = model('umbrella', { name: 'Platform' });
m.node('perm', { name: 'Permissions', include: './permission-svc.diagram.json' });
m.node('comms', { name: 'Communication', include: './communication-svc.diagram.json' });
export default m;
```

The two nodes merge into **one** node whose id is the key (`appuser-db`), with both including contexts as parents. Relations from either service now point at the same box — and because containment is a DAG, it is promoted to sit visibly beside both.

Rules worth knowing:

- **Keys must match `^[a-z0-9][a-z0-9-]*$`** or validation fails with `invalid-key`.
- **A key is inert in a diagram that is never composed.** Adding them early costs nothing.
- **Two nodes in the *same* diagram may not share a key** — that is `duplicate-key`.
- **An umbrella-authored keyed node wins the display attributes.** Declare `key: 'appuser-db'` on a node in the umbrella itself to control what the merged node looks like.

## Verify the composition

```bash
pnpm compile .diagrams/src/umbrella.diagram.ts
```

The artifact is the *composed* result — open it and you will see the prefixed ids and the merged node. That is also what the studio renders.

## Gotchas

- **Only the include's default plane comes along.** If the included diagram declares an `infra` plane, that structure is dropped. Planes are an umbrella-level concern.
- **The studio shows JSON umbrellas raw.** Composed content is only visible for compiled, read-only diagrams. If you author your umbrella in the studio, you will see the include node but not its contents.
- **Prefixing changes ids.** Anything that referenced `db` in the child now needs `perm/db` at the umbrella level.

## See also

- [Builder API reference](../reference/builder-api.md)
- [What is in a model](../explanation/the-model.md#4-cross-diagram-identity-is-opt-in-via-key) — why identity is opt-in
