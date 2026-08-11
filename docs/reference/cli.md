# `diagc` reference

The command-line interface. Invoked as `diagc <command>` when linked globally, or through the repo's pnpm scripts.

```
diagc <compile|watch|publish|studio> [files...] [--out dir] [--no-images]
```

An unknown command exits `1` with that usage line.

## Commands

### `compile` (default)

Compiles sources to validated artifacts. Running `diagc` with no command runs this.

```bash
diagc compile
diagc compile .diagrams/src/acme.diagram.ts
```

- **Input:** `files...` if given, otherwise everything matching `.diagrams/src/**/*.diagram.{ts,json}`.
- **Output:** one `<name>.diagram.json` per source under `--out`. Subdirectories of `.diagrams/src/` are mirrored, so `src/team-a/app.diagram.ts` becomes `.artifacts/team-a/app.diagram.json`.
- **Exit code:** `0` if every file compiled, `1` if any failed. Failures print `✗ <file>` and the error; other files still compile.

### `watch`

Recompiles on change until interrupted.

```bash
diagc watch
diagc watch .diagrams/src/team-a
```

Takes an optional directory (default `.diagrams/src`). Writes to `--out`. On a failed recompile it prints the error and **keeps the last good artifact**, so the studio never blanks out mid-edit.

### `publish`

Compiles everything, then writes shareable output.

```bash
diagc publish
diagc publish acme shop      # only these diagrams
diagc publish --no-images
```

- `.diagrams/html/<name>.html` — self-contained interactive pages, every asset inlined as a data URI.
- `.diagrams/html/index.html` — a gallery linking them.
- `.diagrams/static/<name>.png` — flat images, unless `--no-images`.

`files...` here filters by diagram **name**, not path.

**Requires the viewer shell to be built.** Without it, publish exits `1` with `viewer shell not built — run pnpm --filter @diagramming/viewer build`. Run `pnpm build:cli` once.

**PNG export needs a browser.** If none is found, publish prints `No Chrome found — writing HTML only` and continues without images. See `CHROME_PATH` below.

### `studio`

Runs the browser studio against the current directory.

```bash
diagc studio
```

Starts the compile watcher and the studio's dev server (default <http://localhost:5173>), pointed at `./.diagrams/src` and `./.diagrams/.artifacts`, and opens a browser. `Ctrl+C` stops both.

The studio's own `node_modules` must be installed in the monorepo — this command runs the monorepo's app against your directory, it does not install anything locally.

## Flags

| Flag | Applies to | Default | Meaning |
| --- | --- | --- | --- |
| `--out <dir>` | `compile`, `watch` | `.diagrams/.artifacts` | Where artifacts are written. |
| `--no-images` | `publish` | off | Skip PNG export; write HTML only. |

Anything not recognised as a flag is collected as `files...`.

## Environment variables

| Variable | Read by | Meaning |
| --- | --- | --- |
| `CHROME_PATH` | `publish` | Path to a Chrome/Chromium binary for PNG export. Checked before the default locations. |
| `DIAGRAMS_DIR` | studio dev server | Source directory. Set by `diagc studio`. |
| `ARTIFACTS_DIR` | studio dev server | Artifact directory. Set by `diagc studio`. |
| `DIAGRAMS_CWD` | studio dev server | Extra path added to Vite's filesystem allow-list. |
| `DIAGRAMS_OPEN` | studio dev server | `1` opens a browser on start. |

Chrome is otherwise looked for at `/usr/bin/google-chrome`, `/usr/bin/google-chrome-stable`, `/usr/bin/chromium`, `/usr/bin/chromium-browser`, `/snap/bin/chromium`, and `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`.

## pnpm script equivalents

Inside this monorepo:

| Script | Runs |
| --- | --- |
| `pnpm compile` | `diagc compile` |
| `pnpm compile:watch` | `diagc watch` |
| `pnpm publish-diagrams` | `diagc publish` |
| `pnpm studio` | the studio dev server directly (not via `diagc`) |
| `pnpm dev` | `compile:watch` and the studio together |
| `pnpm build:cli` | builds the viewer shell `publish` needs |
| `pnpm publish-site` | `gh-pages -d .diagrams/html` |
| `pnpm test` / `pnpm typecheck` | vitest / tsc across every package |

## Files and directories

| Path | Owner | Commit it? |
| --- | --- | --- |
| `.diagrams/src/*.diagram.ts` | you | yes |
| `.diagrams/src/*.diagram.json` | you, via the studio | yes |
| `.diagrams/src/*.layout.json` | the studio | yes |
| `.diagrams/src/assets/` | the studio (imported images) | yes |
| `.diagrams/src/library.json` | the studio (your library entries) | yes |
| `.diagrams/.artifacts/` | `compile` | no |
| `.diagrams/html/` | `publish` | no |
| `.diagrams/static/*.png` | `publish` | yes — these are your doc images |

## See also

- [Set up diagc in another repo](../how-to/set-up-in-another-repo.md)
- [Publish and share](../how-to/publish-and-share.md)
