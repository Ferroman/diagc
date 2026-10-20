# `diagc` reference

The command-line interface. Invoked as `diagc <command>` from an install, from a global link, or through the repo's pnpm scripts.

## Installing

```bash
curl -fsSL https://raw.githubusercontent.com/Ferroman/diagc/main/install.sh | sh
npm i -g @diagc/cli            # global
npx @diagc/cli studio          # without installing
npm i -D @diagc/core     # optional: types for .diagram.ts authoring
```

Node ≥ 22. The install script ([`install.sh`](../../install.sh), macOS and Linux) needs only `curl` and `tar`: it uses the Node on your `PATH` when that is new enough, and otherwise downloads the current Node 24 into its own directory, checked against nodejs.org's published checksums. Nothing needs root.

| Variable | Default | Effect |
| --- | --- | --- |
| `DIAGC_VERSION` | `latest` | the `@diagc/cli` release to install |
| `DIAGC_HOME` | `~/.local/share/diagc` | where the package (and a downloaded Node) go |
| `DIAGC_BIN_DIR` | `~/.local/bin` | where the `diagc` launcher goes |
| `DIAGC_NODE` | | `download` fetches a private Node even when the `PATH` has one |
| `DIAGC_NODE_MIRROR` | `https://nodejs.org/dist` | where Node is downloaded from |

Re-running the script updates to the latest release. To uninstall, delete `DIAGC_HOME` and the launcher.

Everything the CLI needs is in the package — the prebuilt studio, the viewer shell `publish` stamps models into, and the icon library — so it runs against any directory with no checkout and no pnpm.

From a checkout, `pnpm link --global` inside the repo gives you a `diagc` that runs the working tree instead. Both layouts are detected automatically; the differences are called out below where they matter.

```
diagc <init|compile|lint|watch|publish|show|studio|tui|eject|diff|guide> [files...] [--out dir] [--no-images] [--link url] [--style id] [--theme light|dark]
```

An unknown command exits `1` with that usage line, and so does a flag or an argument the command does not take.

## Commands

### `init`

Sets a repository up for diagc, from the installed CLI alone.

```bash
diagc init                      # .diagrams/src/example.diagram.ts from the basic starter
diagc init shop --type c4       # a C4 starter named shop
diagc init --agents             # point coding agents at the guide (AGENTS.md / CLAUDE.md, Claude Code skill)
```

- **Steps, in order:** writes `.diagrams/src/<name>.diagram.ts` from the bundled starter for `--type`; appends whichever of `.diagrams/.artifacts/`, `.diagrams/html/` and `.diagrams/diff/` are missing from `.gitignore` (creating it if needed); with `--agents`, writes a short block into `AGENTS.md` and `CLAUDE.md` — whichever exist, or a new `AGENTS.md` — between `<!-- diagc:begin -->` and `<!-- diagc:end -->`, replacing it in place on a later run, and — where the repository has a `.claude/` folder or a `CLAUDE.md` — the Claude Code skill `.claude/skills/diagc/SKILL.md`, whose text between the same markers it replaces on a later run; compiles the starter; prints what to do next.
- **Name:** `example` by default; a folder is allowed (`team/app`); lowercase letters, digits, `-` and `/`. A diagram in a folder cannot be named `rename`, `eject` or `composed`: the studio would read `team/rename` as renaming `team`. `shop.diagram.ts` and `.diagrams/src/shop` mean `shop`.
- **Type:** `basic` by default; the types are the diagram types `diagc guide` lists, plus `basic`. An unknown type lists them.
- **Already set up:** with neither a name nor `--type`, and a diagram already under `.diagrams/src`, the starter step is skipped — `diagc init --agents` can run in any repository.
- **Refuses, writing nothing:** a name whose `.diagram.ts` or `.diagram.json` exists, an unknown type, an unsafe name. Exit `1` with one line on stderr.
- **Never:** runs a package manager (it prints `npm i -D @diagc/core@<version>` when there is a `package.json`; the types are for the editor, the CLI compiles without them), or asks a question — arguments and flags only, so a script or an agent can run it.
- **Exit code:** `0` when every step it attempted succeeded.

### `compile` (default)

Compiles sources to validated artifacts. Running `diagc` with no command runs this.

```bash
diagc compile
diagc compile .diagrams/src/acme.diagram.ts
```

- **Input:** `files...` if given, otherwise everything matching `.diagrams/src/**/*.diagram.{ts,json}`, in path order (as `lint` and `publish` take them too).
- **Output:** one `<name>.diagram.json` per source under `--out`. Subdirectories of `.diagrams/src/` are mirrored, so `src/team-a/app.diagram.ts` becomes `.artifacts/team-a/app.diagram.json`.
- **Exit code:** `0` if every file compiled, `1` if any failed. Failures print `✗ <file>` and the error; other files still compile. A source that throws while it runs — a misspelled method, a builder call that refuses — is placed at `<file>:<line>:<column>`, the first stack frame inside that file.

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
- **Output:** one line per finding, `<file>: <severity> <code>: <message>`, or with `--json` one array of `{ file, severity, code, message, ref?, line?, column? }`. A source that does not compile reports its validation errors (severity `error`); one that does reports its warnings (severity `warning`): the [lint codes](model.md#lint-codes) plus the notation warnings `compile` prints. Either way, what composing its includes warns about (two includes giving one `key` different types) is a warning with code `include`. A source that throws while it runs is one `load` finding; when the stack places it, the text form reads `<file>:<line>:<column>: error load: <message>` and the JSON form carries `line` and `column`.
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
- **What it cannot compare:** a diagram that does not compile at either side is listed as not compared, with why, on stdout, in `index.html` and in `summary.md`. A layout or drawings sidecar that cannot be read leaves the diagram compared but drawn without it, and is named on stderr, in `index.html` and in `summary.md`.
- **For a comment elsewhere:** `--labels main,#12` names the two sides in place of the refs, and `--image-url 'https://host/pr-12/{path}'` makes `summary.md` link its images there (`{path}` is each PNG's path under the output directory). The [pull-request action](../how-to/show-what-changed.md#show-it-on-every-pull-request) uses both.
- **Names:** after the range, as `eject` reads them (`shop`, `shop.diagram.json` or `.diagrams/src/shop.diagram.json`); one that matches no diagram at either side exits `1`.
- **What counts:** nodes by id (any field, plus a move to another container), relations by id or else by endpoints and kind, layers and planes by id. Layout positions are not compared.
- **Exit code:** `0` whether or not anything changed; `1` outside a git repository (`not a git repository`), for a ref that does not exist, a name that matches no diagram, or a failure.

### `watch`

Recompiles on change until interrupted.

```bash
diagc watch
diagc watch .diagrams/src/team-a
```

Takes an optional directory (default `.diagrams/src`). Writes to `--out`. Remote includes resolve locked; `--update-includes` is refused. A directory with no diagrams in it, or one that does not exist, gets the `No diagrams under …` line on stderr, and watch keeps watching. On a failed recompile it prints the error and **keeps the last good artifact**, so the studio never blanks out mid-edit.

### `publish`

Compiles everything, then writes shareable output.

```bash
diagc publish
diagc publish acme shop      # only these diagrams
diagc publish --no-images
diagc publish --link https://github.com/you/repo
diagc publish --style sketch --theme dark   # the pictures in that look
```

- `.diagrams/html/<name>.html` — self-contained interactive pages, every asset inlined as a data URI.
- `.diagrams/html/index.html` — a gallery linking the pages, grouped by source folder; a card shows the model's name, the diagram's path, and the PNG rendered with its page.
- `.diagrams/static/<name>.png` — flat images, unless `--no-images`: the first plane, every group open. Each further plane gets its own, `<name>.<plane>.png`, the plane id lower-cased with each run of other characters a `-` (`Target VPC` → `<name>.target-vpc.png`). A plane whose file would be another diagram's PNG gets none, with a warning.

`files...` here selects diagrams by **name**: a path under `.diagrams/src` works too, read as `eject` reads one. A name that matches no diagram exits `1` before any page is written. The gallery keeps the other diagrams, linking the pages an earlier run wrote.

**Exit code:** `0` when every diagram is published; `1` when a source does not compile (`✗ <file>` and the error, as `compile` prints them) or a diagram is skipped (`publish: skipping diagram …`), after everything else is written.

**`--link <url>` puts one link in the index header**, shown as the address it goes to — the project's repository, say. It must be an `http(s)` URL; anything else exits `1` before anything is compiled. Diagram pages never carry it: a published page belongs to its diagram and has no chrome of its publisher's.

**`--style <id>` and `--theme light|dark` choose the look of the pictures.** Without them a PNG is drawn in its diagram's own [style preset](model.md#style-presets) (`clean` where it names none) and in the light theme. `--style` takes a preset id and refuses any other, naming the ids, before anything is compiled; `--theme` takes `light` or `dark`. Both apply to every picture of the run and to nothing else: a page still opens in its diagram's own style and the reader's theme, with a picker for the style and a switch for the theme (see [Publish and share](../how-to/publish-and-share.md#share-an-interactive-page)).

**Requires the viewer shell.** An installed `diagc` ships it. From a checkout you must build it once (`pnpm build:cli`); until then publish exits `1` with `viewer shell not built`.

**PNG export needs a browser.** If none is found, publish prints `No Chrome found — writing HTML only` on stderr and continues without images. See `CHROME_PATH` below.

**Remote includes resolve locked**, same as `compile`; `diagc publish --update-includes` refreshes and re-pins them first. Publish always compiles the whole source tree regardless of `files...` (that only filters which pages are rendered below it), so an `--update-includes` run here prunes unreferenced entries whenever every source compiles — there is no scoped/unpruned form the way a filtered `compile` run has. A source that fails may never have reached its includes, so then nothing is pruned.

### `show`

Prints a diagram as text on stdout: boxes, frames, lines and labels in box-drawing characters.

```bash
diagc show shop
diagc show shop --depth 1             # only the top level of groups open
diagc show shop --plane infra --layers security
diagc show shop --root checkout       # one group's inside
diagc show shop --ascii --no-color    # plain ASCII, no escapes
```

- **Input:** one diagram name, or a path under `.diagrams/src`, read as `eject` reads one. The source is loaded and validated as `lint` loads it, so the picture is the source as it is now, compiled or not. The layout beside it (`<name>.layout.json`) gives the flow's direction and the export's folds; positions in it are not used. A layout that does not read as one is named on stderr and drawn without.
- **What is drawn:** the first plane, or `--plane`'s; the plane's own layers, or `--layers`' (`''` for none); every group open except those the layout's `export.collapsed` folds — the PNG's folds — or, with `--depth n`, only the top `n` levels open. `--root <id>` draws one group's inside, as drilling into it does.
- **Colour:** when stdout is a terminal, or with `--color`; never with `--no-color` or a non-empty `NO_COLOR`. `FORCE_COLOR` colours a pipe. 24-bit colour where `COLORTERM` says the terminal has it, the 256-colour palette otherwise.
- **Width:** on a terminal narrower than the picture, one line on stderr says so and suggests `less -S` or `diagc tui`; stdout keeps the whole picture.
- **Legend:** a declared one is printed under the picture, framed, after a blank line: over it for a `top-` position, against its right edge for a `-right` one (at its left edge when the legend is the wider). A legend that is only on offer, for shapes that say nothing about themselves, is left out, as the PNG leaves it out.
- **Leaves out:** saved positions, the layouts of their own that the plan, git-graph and activity notations have in the browser (they draw as an ordinary graph; a fishbone is drawn as the fish), icons, images, drawings and notes.
- **Exit code:** `0`, also for a view with nothing in it (`diagc: nothing to draw in <name>` on stderr); `1` with the reason on stderr for no name, an unknown name, a source that does not load, an unknown plane, layer or node, a `--root` that holds nothing, or `--color` with `--no-color`.

Remote includes resolve locked, as for `lint`; `show` refuses `--update-includes`. See [Look at a diagram in the terminal](../how-to/look-at-a-diagram-in-the-terminal.md).

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

Remote includes resolve locked here too, same as `compile` — `studio` refuses `--update-includes`; run `diagc compile --update-includes` first if a lock entry is missing.

### `tui`

A full-screen, read-only viewer in the terminal: the list of diagrams, or the one named.

```bash
diagc tui
diagc tui shop
```

It runs the studio's compile watcher on `./.diagrams/src` and redraws the open diagram when its source compiles or its layout changes; a failed compile keeps the last picture and shows the error in the bottom row. A diagram opens as the published page opens it: the first plane, its layers, and the groups its layout saved as unfolded. A picture bigger than the screen gets an overview in the corner, drawn as an image where the terminal speaks kitty's graphics protocol and in braille elsewhere, and a declared legend shows in the corner it names; `L` hides it. A diagram in the `dos` style is drawn in it, and `s` switches it on and off. Keys and mouse are in [Look at a diagram in the terminal](../how-to/look-at-a-diagram-in-the-terminal.md#browse-a-diagram); `?` lists them in the viewer.

- **Style:** `--style dos` draws every diagram in the DOS style, `--style clean` every one in the terminal's own colours; any other id exits `1`. Without colour (`NO_COLOR`, `TERM=dumb`) it draws in its own look whatever the style. See [The DOS style](../how-to/look-at-a-diagram-in-the-terminal.md#the-dos-style).
- **Needs a terminal:** with stdin or stdout not a terminal it exits `1` and points at `show`.
- **Exit code:** `0` when quit; `1` for a name with no source, checked first, or for a `--style` other than `dos` or `clean`.

Remote includes resolve locked, as in the studio; `tui` refuses `--update-includes`.

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

Like `studio`, `eject`'s post-swap recompile resolves remote includes locked, and `eject`
refuses `--update-includes`.

### `guide`

Prints how to write a diagram, as Markdown on stdout — for a person, or for a coding agent that reads it before it writes one.

```bash
diagc guide            # the DSL, the vocabularies, the rules, and the list of topics
diagc guide c4         # one diagram type: its conventions, its node types, its starter
diagc guide all        # everything
```

- **Topics:** `activity`, `c4`, `causal-loop`, `deployment`, `er`, `fishbone`, `git-graph`, `plan`, `second-order`, `threat-model`.
- **Matches the install.** The text ships in the package, the node types and relation kinds it lists are the ones [`lint`](#lint) checks against, and every listing in it is compiled by the test suite. It needs no network and no diagrams in the current directory.
- **Also online:** <https://ferroman.github.io/diagc/llms.txt> is `diagc guide all` for the current `main`, for a model with no shell to run the command in.
- **Exit code:** `0`; `1` for a topic that does not exist (the topics are listed on stderr) or for more than one, or when the install's guide or starter files are missing (the line says to reinstall diagc).

## Flags

A command takes only the flags its row lists; any other exits `1` with the usage, as an unknown flag does, naming the commands that take it. Two flags go with any command, or none: `--help` (`-h`) prints the usage, and `--version` the version number alone, and both exit `0`.

| Flag | Applies to | Default | Meaning |
| --- | --- | --- | --- |
| `--out <dir>` | `compile`, `watch`, `publish`, `eject`, `diff` | `.diagrams/.artifacts` (`diff`: `.diagrams/diff/<from>..<to>`) | Where artifacts are written — for `publish`, the artifacts only, its pages and images still go under `.diagrams/`; for `eject`, the dir its post-swap recompile writes into; for `diff`, its pages and images. |
| `--no-images` | `publish`, `diff` | off | Skip PNG export; write HTML only. |
| `--link <url>` | `publish` | none | Link the index header to this `http(s)` address. |
| `--style <id>` | `publish`, `tui` | each diagram's own | `publish`: draw the PNGs in this [style preset](model.md#style-presets); a page keeps its diagram's own style. `tui`: draw every diagram in `dos` or `clean`, the two styles a terminal has. |
| `--theme <light\|dark>` | `publish` | `light` | Draw the PNGs in this theme; a page keeps following its reader's. |
| `--plane <id>` | `show` | the first | Draw this plane. |
| `--layers <a,b>` | `show` | the plane's own | Draw these layers in place of the plane's; `''` for none. |
| `--depth <n>` | `show` | every group open | Open only the top `n` levels of groups; `0` folds them all. |
| `--root <id>` | `show` | none | Draw this group's inside only. |
| `--ascii` | `show` | off | Plain ASCII in place of box-drawing characters. |
| `--color`, `--no-color` | `show` | colour on a terminal | Colour the picture, or do not, whatever stdout is. |
| `--labels <a,b>` | `diff` | the refs | Names for the before and after sides. |
| `--image-url <template>` | `diff` | relative | `summary.md`'s image links; `{path}` stands for each PNG's path. |
| `--json` | `lint`, `diff` | off | Print the findings (lint) or the changes (diff) as JSON. |
| `--type <type>` | `init` | `basic` | Which starter to copy. |
| `--agents` | `init` | off | Write the coding-agent block into `AGENTS.md` / `CLAUDE.md`, and the Claude Code skill where there is a `.claude/` folder or a `CLAUDE.md`. |
| `--update-includes` | `compile`, `publish` | off | Refetch every remote `include`, vendor it under `.diagrams/includes/`, and rewrite `.diagrams/includes.lock.json`. Entries the run didn't touch are pruned only when every source compiled, and on `compile` only with no `files...` given (a full-tree run); `publish` always compiles the whole tree. |

Anything not recognised as a flag is collected as `files...`: any number for `compile`, `lint`, `publish`, `diff` and `guide`, one at most for `watch`, `eject`, `init` and `tui`, one for `show`, none for `studio`.

## Environment variables

| Variable | Read by | Meaning |
| --- | --- | --- |
| `CHROME_PATH` | `publish` | Path to a Chrome/Chromium binary for PNG export. Checked before the default locations. |
| `DIAGC_AUTH_TOKENS` | `--update-includes` | Credentials for private include hosts: `;`-separated `token@host` (bearer) or `user:pass@host` (basic). Sent over https only, to the named host only. See [Compose diagrams](../how-to/compose-diagrams.md#private-hosts). |
| `DIAGRAMS_DIR` | studio server | Source directory. Set by `diagc studio`. |
| `ARTIFACTS_DIR` | studio server | Artifact directory. Set by `diagc studio`. |
| `DIAGRAMS_CWD` | studio dev server | Extra path added to Vite's filesystem allow-list (checkout layout only). |
| `DIAGRAMS_OPEN` | studio server | `1` opens a browser on start. |
| `NO_COLOR` | `show`, `tui` | Non-empty: no colour, unless `show --color` asks for it. |
| `FORCE_COLOR` | `show` | Set and not `0`: colour even when stdout is not a terminal. |
| `COLORTERM` | `show`, `tui` | `truecolor` or `24bit`: 24-bit colour in place of the 256-colour palette. |
| `TERM` | `show`, `tui` | `dumb`: no colour. |

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
| `AGENTS.md`, `CLAUDE.md` | you; `init --agents` owns the text between the `diagc` markers | yes |
| `.claude/skills/diagc/SKILL.md` | `init --agents`; the text outside the `diagc` markers is yours | yes |

## See also

- [Add diagc to an existing repository](../how-to/set-up-in-another-repo.md)
- [Publish and share](../how-to/publish-and-share.md)
- [Eject a diagram to TypeScript](../how-to/eject-to-typescript.md)
- [Compose diagrams](../how-to/compose-diagrams.md) — includes, `key`, and snapshotting remote includes
