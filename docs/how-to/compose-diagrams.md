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
| Containment | **only one plane's edges** — the default, or whichever `includePlane` names — imported untagged |
| Included roots | children of the include node |

Include targets must be `*.diagram.json` — a compiled artifact or a studio-authored source, not a `.diagram.ts`. See [Snapshots](#snapshots) below for how a remote (`https://…`) one is pinned.

Nesting is allowed up to **10 levels**; deeper fails with an `IncludeError` naming the chain.

## Snapshots

A **remote** `include` (an `https://…` URL) is never fetched live by an ordinary compile. Every command that resolves includes — `compile`, `watch`, `publish`, `studio`, `eject` — runs in **locked mode** by default: it reads remote includes from a vendored copy under `.diagrams/includes/`, hash-verified against `.diagrams/includes.lock.json`. Local file includes (`./…`, `../…`) are unaffected — they stay **live**, resolved straight off disk on every compile, because they're already in the repo and reviewable in whatever diff changed them.

Fetch and pin (or refresh) every remote include with:

```bash
diagc compile --update-includes
```

This writes the fetched model into `.diagrams/includes/`, records its URL, vendor path and content hash in `.diagrams/includes.lock.json`, and — on a full-tree run (no file arguments) — prunes entries no longer referenced. Commit both `.diagrams/includes/` and `.diagrams/includes.lock.json`; they are ordinary tracked files, not build output.

A locked compile that meets a remote include missing from the lock, whose vendored file is gone, or whose vendored file no longer hashes to what the lock recorded, refuses instead of silently re-fetching — with the remedy in the message:

```
Include 'https://example.com/svc.diagram.json' is not snapshotted — run 'diagc compile --update-includes' and commit .diagrams/includes/ + .diagrams/includes.lock.json
```

`diagc publish --update-includes` does the same thing during a publish (publish always compiles the whole source tree first, so its prune is unconditional).

## Choosing the grafted plane

By default, `include` grafts the child diagram's **default plane** — its first-declared plane, or its only (implicit) one if it has no planes at all. Name a different plane with `includePlane`:

```ts
m.node('repo', {
  name: 'Payments repo',
  include: './payments.diagram.json',
  includePlane: 'deployment',
});
```

`includePlane` only picks which plane's containment becomes the include node's own structure — the untagged rows the host sees. It says nothing about which plane the *host* is currently showing; it is purely "which cut of the child do I graft." Naming a plane the child doesn't declare fails composition (`plane 'deployment' not found in the included diagram`); naming the plane that already resolves as the default reproduces the behavior of omitting it.

## Keeping the include's own views

`includePlane` picks **one** plane to graft as structure. `includePlanes: true` is additive and different: it carries **every** plane the child declares over into the host, namespaced (`repo/deployment`, name `Payments repo/Deployment`) with each plane's `notation` untouched:

```ts
m.node('repo', {
  name: 'Payments repo',
  include: './payments.diagram.json',
  includePlanes: true,
});
```

Switch the plane switcher to a carried plane and the include's content renders standalone, in its own visual language — a git-graph child shows as a real git graph, lanes and commits intact, not folded into the host's own look. The host's own structure (the default plane, or whichever `includePlane` names) is unaffected and still lands exactly as it does without `includePlanes`.

A child with no planes of its own but a model-level `notation` still contributes one carried plane, synthesized as `main`. And if the *host itself* declares no planes, `includePlanes` synthesizes a base plane for it too, so the diagram's default view keeps showing the host's own untagged content — the carried planes arrive as alternatives, never as a silent replacement for `planes[0]`.

**One view still renders one notation.** A carried plane is a whole separate view, not a window mixing notations inside the host's own plane — there is no way to show, say, one subtree of a C4 host in git-graph notation on the *same* canvas as the rest. That would need a per-subtree notation profile, which the renderer doesn't have.

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

- **Only one plane's structure grafts as the include node's own containment.** The default, or whichever `includePlane` names — everything else the child declares is dropped unless you also set `includePlanes: true` (see [Keeping the include's own views](#keeping-the-includes-own-views)).
- **The studio opens a JSON umbrella composed, not raw.** A designer-owned diagram with `include` nodes is expanded for view the same way a compiled artifact is, and any compose warnings (e.g. a `key` type mismatch) show up in the issues panel. Entering edit or Duplicate always fetches the raw, uncomposed source first, though — a save or a copy never bakes grafted content into the model on disk; both keep the `include`.
- **Prefixing changes ids.** Anything that referenced `db` in the child now needs `perm/db` at the umbrella level.

## See also

- [Builder API reference](../reference/builder-api.md)
- [What is in a model](../explanation/the-model.md#4-cross-diagram-identity-is-opt-in-via-key) — why identity is opt-in
