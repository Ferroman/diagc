# `diagc` reference

The command-line interface. Invoked as `diagc <command>` from an install, from a global link, or through the repo's pnpm scripts.

## Installing

```bash
npm i -g @diagc/cli            # global
npx @diagc/cli studio          # without installing
npm i -D @diagc/core     # optional: types for .diagram.ts authoring
```

Node ≥ 22. Everything the CLI needs is in the package — the prebuilt studio, the viewer shell `publish` stamps models into, and the icon library — so it runs against any directory with no checkout and no pnpm.

From a checkout, `pnpm link --global` inside the repo gives you a `diagc` that runs the working tree instead. Both layouts are detected automatically; the differences are called out below where they matter.

```
diagc <compile|lint|watch|publish|studio|eject|diff> [files...] [--out dir] [--no-images] [--link url]
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

A remote (`https://…`) `include` resolves from a vendored snapshot, not a live fetch — **locked mode**, the default `compile` (and `watch`/`publish`/`studio`/`eject`) runs in. It reads `.diagrams/includes/<file>` and checks its hash against `.diagrams/includes.lock.json`; an include missing from the lock, or whose vendored file is gone or no longer matches its recorded hash, fails the compile naming the remedy:

```
Include 'https://example.com/svc.diagram.json' is not snapshotted — run 'diagc compile --update-includes' and commit .diagrams/includes/ + .diagrams/includes.lock.json
```

```bash
diagc compile --update-includes   # fetch every remote include, vendor it, rewrite the lock
```

Pruning entries the run no longer touched only happens on a full-tree run — pass no `files...` alongside `--update-includes`, or nothing is pruned. Local file includes are never vendored; they resolve straight off disk on every compile. See [Compose diagrams § Snapshots](../how-to/compose-diagrams.md#snapshots).

### `lint`

Reports what compiles but is probably a mistake — the slips a generated diagram makes and nothing else catches, because each one still draws.

```bash
diagc lint
diagc lint .diagrams/src/acme.diagram.ts --json
```

- **Input:** as `compile`. Nothing is written.
- **Output:** one line per finding, `<file>: <severity> <code>: <message>`, or with `--json` one array of `{ file, severity, code, message, ref? }`. A source that does not compile reports its validation errors (severity `error`); one that does reports its warnings (severity `warning`): the [lint codes](model.md#lint-codes) plus the notation warnings `compile` prints.
- **Exit code:** `0` when there are no findings, `1` otherwise — so a script or an agent can loop until it is clean.

### `diff`

Compares the diagrams at two git refs, or at one ref and the working tree, and draws what changed. How to use it: [Show what changed between two versions](../how-to/show-what-changed.md).

```bash
diagc diff v1.0..v2.0              # two refs
diagc diff main                    # a ref against the working tree
diagc diff v1.0..v2.0 checkout     # only these diagrams, by name
```

- **Input:** the `.diagrams/` tree at each ref, read with `git archive` (nothing is checked out), and every `*.diagram.{ts,json}` in it compiled in memory. Diagrams pair up by name.
- **Output:** the change list on stdout (`+` added, `-` removed, `~` changed), or with `--json` one object `{ from, to, diagrams: [{ name, status, diff?, error? }] }`. When anything changed, it also writes to `.diagrams/diff/<from>..<to>/` (or `--out`): a page and a PNG per side of each changed diagram with the changes outlined, `index.html` with the two sides next to each other, and `summary.md` for an ADR. `--no-images` skips the PNGs; they also need Chrome, as `publish` does.
- **For a comment elsewhere:** `--labels main,#12` names the two sides in place of the refs, and `--image-url 'https://host/pr-12/{path}'` makes `summary.md` link its images there (`{path}` is each PNG's path under the output directory). The [pull-request action](../how-to/show-what-changed.md#show-it-on-every-pull-request) uses both.
- **What counts:** nodes by id (any field, plus a move to another container), relations by id or else by endpoints and kind, layers and planes by id. Layout positions are not compared.
- **Exit code:** `0` whether or not anything changed; `1` for a ref that does not exist or a failure.

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
diagc publish --link https://github.com/you/repo
```

- `.diagrams/html/<name>.html` — self-contained interactive pages, every asset inlined as a data URI.
- `.diagrams/html/index.html` — a gallery linking them, grouped by source folder; a card shows the model's name and the diagram's path.
- `.diagrams/static/<name>.png` — flat images, unless `--no-images`.

`files...` here filters by diagram **name**, not path.

**`--link <url>` puts one link in the index header**, shown as the address it goes to — the project's repository, say. It must be an `http(s)` URL; anything else exits `1` before anything is compiled. Diagram pages never carry it: a published page belongs to its diagram and has no chrome of its publisher's.

**Requires the viewer shell.** An installed `diagc` ships it. From a checkout you must build it once (`pnpm build:cli`); until then publish exits `1` with `viewer shell not built`.

**PNG export needs a browser.** If none is found, publish prints `No Chrome found — writing HTML only` and continues without images. See `CHROME_PATH` below.

**Remote includes resolve locked**, same as `compile`; `diagc publish --update-includes` refreshes and re-pins them first. Publish always compiles the whole source tree regardless of `files...` (that only filters which pages are rendered below it), so an `--update-includes` run here always prunes unreferenced entries — there is no scoped/unpruned form the way a filtered `compile` run has.

### `studio`

Runs the browser studio against the current directory.

```bash
diagc studio
```

Starts the compile watcher and an editor server (default <http://127.0.0.1:5173>, stepping to the next free port if that one is taken), pointed at `./.diagrams/src` and `./.diagrams/.artifacts`, and opens a browser. `Ctrl+C` stops both.

The server is local and its `/api/*` routes carry no authentication, so it answers only its own page: a request whose `Origin` is another site, or whose `Host` is a name other than `localhost` (a raw IP address is fine), gets `403`, and the JSON routes take `application/json` only. Scripts that call the API without an `Origin` header are unaffected. See [SECURITY.md](../../SECURITY.md).

Which server depends on how `diagc` was installed, and nothing else does:

- **Installed from npm** — the prebuilt studio bundle is served straight from the package over plain http. No Vite, no workspace, nothing installed into your project.
- **From a checkout** (`pnpm link --global`, or `pnpm dev`) — the studio's own Vite dev server runs instead, so edits to the studio hot-reload. Its `node_modules` must be installed in the monorepo.

Both serve the same API from the same route table (`packages/diagc/src/api`), so saving, renaming, assets, and the shape library behave identically.

Remote includes resolve locked here too, same as `compile` — there is no `--update-includes` flag on `studio` itself; run `diagc compile --update-includes` first if a lock entry is missing.

### `eject`

Promotes a JSON diagram to a generated `.diagram.ts` — but only after executing the generated
source and proving it rebuilds the identical model.

```bash
diagc eject shop
```

- **Input:** one diagram name, or a path under `.diagrams/src` — either way only the name is
  kept (the `.diagrams/src/` prefix and `.diagram.{ts,json}` suffix are both stripped).
- **Output:** `.diagrams/src/<name>.diagram.ts`; `<name>.diagram.json` is deleted. Sidecars
  (`.layout.json`, `.drawings.json`, …) are untouched.
- **Exit code:** `0` and `✓ <tsPath>` on success; `1` and the reason on stderr otherwise.

Every refusal leaves `.diagrams/src` exactly as it was — nothing is written, nothing is deleted:

| Case | What happens |
| --- | --- |
| No `<name>.diagram.json` | Refuses: no such diagram. |
| `<name>.diagram.ts` already exists | Refuses: already TypeScript-owned. |
| The JSON does not parse, fails validation, or holds a value the generated code cannot express | Refuses, naming the parse error, listing the validation issues, or naming the diagram and the underlying error. |
| The generated source fails to execute | Refuses, surfacing the underlying execution error. |
| The generated source executes but rebuilds a model that differs from the JSON | Refuses, naming the paths where the two models first differ. |

See [Eject a diagram to TypeScript](../how-to/eject-to-typescript.md) for the studio side and
the crash-recovery note (a crash between writing the TS and deleting the JSON leaves both —
recovery is deleting one).

Like `studio`, `eject`'s post-swap recompile resolves remote includes locked, with no
`--update-includes` flag of its own.

## Flags

| Flag | Applies to | Default | Meaning |
| --- | --- | --- | --- |
| `--out <dir>` | `compile`, `watch`, `eject`, `diff` | `.diagrams/.artifacts` (`diff`: `.diagrams/diff/<from>..<to>`) | Where artifacts are written — for `eject`, the dir its post-swap recompile writes into; for `diff`, its pages and images. |
| `--no-images` | `publish`, `diff` | off | Skip PNG export; write HTML only. |
| `--link <url>` | `publish` | none | Link the index header to this `http(s)` address. |
| `--labels <a,b>` | `diff` | the refs | Names for the before and after sides. |
| `--image-url <template>` | `diff` | relative | `summary.md`'s image links; `{path}` stands for each PNG's path. |
| `--json` | `lint`, `diff` | off | Print the findings (lint) or the changes (diff) as JSON. |
| `--update-includes` | `compile`, `publish` | off | Refetch every remote `include`, vendor it under `.diagrams/includes/`, and rewrite `.diagrams/includes.lock.json`. On `compile`, pruning entries the run didn't touch only happens with no `files...` given (a full-tree run); `publish` always compiles the whole tree, so its prune is unconditional. |

Anything not recognised as a flag is collected as `files...`.

## Environment variables

| Variable | Read by | Meaning |
| --- | --- | --- |
| `CHROME_PATH` | `publish` | Path to a Chrome/Chromium binary for PNG export. Checked before the default locations. |
| `DIAGC_AUTH_TOKENS` | `--update-includes` | Credentials for private include hosts: `;`-separated `token@host` (bearer) or `user:pass@host` (basic). Sent over https only, to the named host only. See [Compose diagrams](../how-to/compose-diagrams.md#private-hosts). |
| `DIAGRAMS_DIR` | studio server | Source directory. Set by `diagc studio`. |
| `ARTIFACTS_DIR` | studio server | Artifact directory. Set by `diagc studio`. |
| `DIAGRAMS_CWD` | studio dev server | Extra path added to Vite's filesystem allow-list (checkout layout only). |
| `DIAGRAMS_OPEN` | studio server | `1` opens a browser on start. |

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
| `pnpm build:studio` | builds the static studio bundle the installed CLI serves |
| `pnpm build:dist` | everything a release needs: both packages compiled, both bundles built and staged |
| `pnpm publish-site` | `gh-pages -d .diagrams/html` |
| `pnpm test` / `pnpm typecheck` | vitest / tsc across every package |

## Files and directories

| Path | Owner | Commit it? |
| --- | --- | --- |
| `.diagrams/src/*.diagram.ts` | you | yes |
| `.diagrams/src/*.diagram.json` | you, via the studio | yes |
| `.diagrams/src/*.layout.json` | the studio | yes |
| `.diagrams/src/*.drawings.json` | the studio (freehand drawings) | yes |
| `.diagrams/src/assets/` | the studio (imported images) | yes |
| `.diagrams/src/library.json` | the studio (your library entries) | yes |
| `.diagrams/.artifacts/` | `compile` | no |
| `.diagrams/html/` | `publish` | no |
| `.diagrams/diff/` | `diff` | usually not — copy the PNGs you keep next to the ADR |
| `.diagrams/static/*.png` | `publish` | yes — these are your doc images |
| `.diagrams/includes/` | `compile --update-includes` | yes — vendored snapshots of remote includes |
| `.diagrams/includes.lock.json` | `compile --update-includes` | yes — the hashes pinning them |

## See also

- [Set up diagc in another repo](../how-to/set-up-in-another-repo.md)
- [Publish and share](../how-to/publish-and-share.md)
- [Eject a diagram to TypeScript](../how-to/eject-to-typescript.md)
- [Compose diagrams](../how-to/compose-diagrams.md) — includes, `key`, and snapshotting remote includes
