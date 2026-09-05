# Use the Obsidian plugin

Host the full diagram studio inside an Obsidian vault, embed interactive diagrams in notes, and link diagram nodes to notes.

## Build and install

From this monorepo:

```bash
pnpm install
pnpm build:obsidian
```

This bundles `apps/obsidian/dist/`: `main.js`, `manifest.json`, `styles.css`, and a copy of the icon library (`library/`).

```bash
OBSIDIAN_VAULT=/path/to/vault node scripts/install-obsidian.mjs
```

Copies `dist/` into `<vault>/.obsidian/plugins/diagramming-studio/`. The script refuses to run without `OBSIDIAN_VAULT` set, and refuses if `dist/` doesn't exist yet — build first.

Then, in Obsidian: **Settings → Community plugins**, make sure community plugins are enabled, find **Diagramming Studio** in the installed list, and toggle it on.

Re-run both commands after pulling changes to this repo — installing does not build for you, and Obsidian does not pick up a newer `dist/` on its own.

## Open the studio

The ribbon's network icon, or the command palette's **Open diagram studio**, opens a pane hosting the same studio as the browser app — palette, library packs, planes/layers UI included. It's a singleton view: opening it again just focuses the existing pane.

## The diagrams folder

Plugin setting **Diagrams folder** (`diagramsFolder`, default `diagrams`), vault-relative — set it under **Settings → Diagramming Studio**.

That folder is laid out exactly like a `diagc` project directory: `src/*.diagram.json` with their `.layout.json` sidecars, `src/assets/` for uploaded images, and `.artifacts/` (populated only when the CLI compiles a `.diagram.ts` source — the plugin itself never compiles TypeScript). The plugin creates `src/` and `.artifacts/` under the configured folder the first time you open the studio, if they don't already exist.

Because it's an ordinary diagc home, the CLI works against it unchanged from a terminal — useful for `.diagram.ts` authoring or `publish`ing outside the vault:

```bash
cd /path/to/vault/diagrams
diagc compile
diagc publish
```

(See [Set up diagc in another repo](set-up-in-another-repo.md) if `diagc` isn't linked on your machine yet.)

## Embed a diagram in a note

Use a `diagram` code fence, one `key: value` per line:

````markdown
```diagram
name: aws-multi-az
plane: deployment
layers: security, ops
root: vpc
height: 480
```
````

| Key | Required | Meaning |
| --- | --- | --- |
| `name` | yes | Diagram name in the vault's diagrams folder |
| `plane` | no | Which plane to open on; default: the model's first plane |
| `layers` | no | Comma-separated layer ids to enable |
| `root` | no | Drill into this node instead of the bird's-eye view |
| `height` | no | Embed height in px; default `480` |

Blank lines and lines starting with `#` are skipped as comments — put a comment on its own line, not trailing a value, since the parser only strips a line that starts with `#`. An unrecognised key, a missing `name`, or a non-numeric `height` renders an error card in place of the embed rather than breaking the note.

The embed is the interactive `DiagramView`, read-only: semantic zoom (double-click to unfold), the layer toggles, and node links all work, seeded from the fence's `plane`/`layers`/`root` but then owned by the reader for as long as the note is open — reopening the note resets them. A corner **Open in studio** button jumps to the same diagram in the studio pane for editing.

## Link nodes to notes

The node panel's **Link** field takes either form:

- `[[Note name]]` or `[[Note name|alias]]` — a wikilink. A small badge appears on the node (in both the studio and embeds); clicking the badge opens the note in Obsidian. A plain click on the node still selects it, so the link never gets in the way of editing.
- `https://…` (or `http://…`) — opens externally in your browser.

Obsidian does not index the diagram's JSON, so a node link never shows up in that note's backlinks or in graph view — see the limitation below.

## Limitations (v1)

- **Desktop only.** The manifest sets `isDesktopOnly: true` because the API layer reads and writes the vault with `node:fs`, which isn't available on Obsidian mobile.
- **No backlinks or graph-view integration.** Obsidian only indexes markdown notes, not diagram JSON, so node → note links are click-to-open only.
- **No in-vault `.diagram.ts` compilation.** The plugin never runs the TypeScript compiler; only the `diagc` CLI does. A diagram authored as `.diagram.ts` opens read-only in the studio pane once its artifacts exist — the same rule as the browser studio.
- **No community-plugin-store release.** Install manually as above (or via BRAT); this isn't published to Obsidian's plugin directory.
- **No auto-reload on external edits.** If a diagram file changes outside the studio pane (another editor, `diagc compile`, `git pull`), reopen the diagram (or the note) to see the change.
- **No `obsidian://` deep links** into the studio pane on a specific diagram.

## See also

- [`diagc` reference](../reference/cli.md)
- [Set up diagc in another repo](set-up-in-another-repo.md)
