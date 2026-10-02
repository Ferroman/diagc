# Show what changed between two versions

Diagrams live in git, so the repository's history is the architecture's history. `diagc diff` compares the diagrams at two refs and draws the difference: what was added, what went and what changed. Use it for the before/after pictures in an ADR, or to review a pull request that touches a diagram.

## Compare two tags

```bash
diagc diff adr-12-before..adr-12-after
```

It prints the changes per diagram:

```
diagc diff adr-12-before -> adr-12-after
checkout:
  + Payments service [service]
  + Payment events [queue]
  - Payments monolith [service]
  ~ Orders API -> Checkout API (renamed)
  + Checkout API -> Payment events (async: charge requested)
  - Orders API -> Payments monolith (sync: charge)
  ~ Web app -> Checkout API (sync: GraphQL): label
1 diagram(s) changed, 14 unchanged
```

and writes, under `.diagrams/diff/adr-12-before..adr-12-after/`:

- `<name>.before.png` and `<name>.after.png`: each version with the changes outlined.
- `<name>.before.html` and `<name>.after.html`: the same pictures as interactive pages.
- `index.html`: every changed diagram, both versions side by side, with the change list.
- `summary.md`: the pictures in a before/after table and the change list, ready to paste into an ADR.

Any two refs work: tags, branches, commits, `HEAD~3`. Give a single ref to compare it with the working tree, including uncommitted edits:

```bash
diagc diff main                    # what this branch changed
diagc diff v1.0..v2.0 checkout     # only the checkout diagram
```

## Reading the pictures

| Mark | Before picture | After picture |
| --- | --- | --- |
| green outline | — | added |
| red dashed outline, faded | removed | — |
| amber outline | changed (renamed, retyped, restyled, moved to another box) | changed |
| amber dashed outline | a folded box with a change inside | a folded box with a change inside |

Relations are coloured the same way. A relation whose endpoints or kind changed counts as one removed and one added. Positions are not compared: a box moved on the canvas is not an architecture change.

## Put it in an ADR

1. Tag the commit before the change and the one after it, or note the commits.
2. Run `diagc diff <before>..<after> <diagram>`.
3. Copy the two PNGs next to the ADR and paste the table from `summary.md`.

PNGs need Chrome, as for `publish`; without it, or with `--no-images`, you get the HTML pages and a summary that links to them.

## Gotchas

- **Each version is compiled as it was.** A diagram that did not compile at one of the refs is reported (`!`) and not compared.
- **Only `.diagrams/` is read at each ref.** A local `include` that points outside `.diagrams/` cannot be resolved at an old ref.
- **Nodes match by id.** Renaming a node's *name* is a change; changing its *id* reads as one node removed and another added.
- **Add `.diagrams/diff/` to `.gitignore`** unless you mean to commit the output.

See the [`diff` reference](../reference/cli.md#diff) for every option.
