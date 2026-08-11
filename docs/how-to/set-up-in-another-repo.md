# Set up `diagc` in another repo

Draw and compile diagrams inside any project on your machine, while the tool itself stays in this monorepo.

## Link the CLI once

From this monorepo:

```bash
pnpm install
pnpm build:cli        # builds the viewer shell that `publish` stamps models into
pnpm link --global    # puts `diagc` on your PATH
```

Check it:

```bash
diagc compile         # in a directory with no diagrams: succeeds, does nothing
```

## Use it anywhere

```bash
cd ~/work/some-project

diagc studio          # draw and edit in .diagrams/src (opens a browser)
diagc compile         # .diagrams/src/*.diagram.{ts,json} -> .diagrams/.artifacts
diagc publish         # -> .diagrams/html and .diagrams/static/*.png
```

`.diagram.ts` sources compile in any repo without installing anything there — the CLI aliases `@diagramming/core` back to this monorepo.

## Add to the target repo's `.gitignore`

```gitignore
.diagrams/.artifacts/
.diagrams/html/
```

Commit `.diagrams/src/` and `.diagrams/static/*.png`.

## What must stay installed

`diagc studio` runs **this monorepo's** studio pointed at your current directory. That means:

- the monorepo must stay where it is — the CLI resolves its home by walking up from the linked binary's real path to the directory containing `pnpm-workspace.yaml`;
- its `node_modules` must remain installed;
- `pnpm build:cli` must have been run at least once, or `publish` will refuse.

Deleting or moving the monorepo breaks `diagc` everywhere.

## Gotchas

- **`diagc studio` needs the monorepo's dependencies, not yours.** Do not add `@diagramming/*` to the target repo's `package.json`.
- **The bundled icon library lives in the monorepo too.** Published pages inline the icons they use, so a published page keeps working — but a target repo cannot serve `/library/...` on its own.
- **Re-run `pnpm build:cli` after pulling monorepo changes**, or published pages keep using the old viewer shell.
- **There is no version pinning.** Every repo on your machine uses whatever the monorepo is at right now.

## See also

- [`diagc` reference](../reference/cli.md) — every command, flag and environment variable
- [Publish and share](publish-and-share.md)
