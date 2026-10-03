# diagc

Diagrams as code, with a local studio. diagc turns diagram sources that live in your repository into things other people can open.

- **Pages and pictures.** `diagc publish` writes one self-contained HTML page per diagram, and a PNG. The page folds, zooms and switches views in the browser, with no server behind it. Host the pages on GitHub Pages, GitLab Pages or any static host, and put the PNG in a README.
- **A local studio.** `diagc studio` opens a browser app against your repository. Draw a diagram there and the studio saves it as a file in the repository. `diagc eject` turns a drawn diagram into TypeScript.

Diagrams are plain files in your repository, so they diff, review and refactor like the rest of it.

```bash
npm i -g @diagc/cli   # or: npx @diagc/cli studio
```

Needs Node ≥ 22.

## Quickstart

```bash
diagc init shop    # a starter diagram in .diagrams/src/, the .gitignore lines, compiled
diagc studio       # opens the editor, recompiling as you edit
```

`npm i -D @diagc/core` as well if you want types and completion on `.diagram.ts` files — the CLI compiles them either way.

## Commands

| Command | What it does |
| --- | --- |
| `diagc init` | Set a repository up: a starter diagram (`--type c4` for a C4 one), the `.gitignore` lines, and with `--agents` a pointer to the guide for coding agents (`AGENTS.md` / `CLAUDE.md`, and a Claude Code skill). |
| `diagc compile` | Compile `.diagrams/src/**/*.diagram.{ts,json}` into validated artifacts under `.diagrams/.artifacts/`. The default command. |
| `diagc lint` | Report what compiles but is probably a mistake — typos, duplicates, unused or undrawn parts. `--json` for a script or an agent; exit 1 until clean. |
| `diagc watch` | The same, recompiling on change. |
| `diagc studio` | Serve the visual editor against the current directory (default `http://127.0.0.1:5173`). Diagrams drawn here are saved back as `.diagram.json`. |
| `diagc publish` | Write self-contained HTML pages to `.diagrams/html/` and PNGs to `.diagrams/static/`. |
| `diagc guide` | Print how to write a diagram: the DSL, then one topic per diagram type (`diagc guide c4`). Written for a coding agent as much as for a person. |

Flags: `--type <type>` and `--agents` (init), `--out <dir>` (artifact directory), `--json` (lint findings as JSON), `--no-images` (publish HTML only), `--link <url>` (link the published index to an address), `--help`.

PNG export drives headless Chrome. Without one, `publish` writes HTML and says so; point `CHROME_PATH` at a browser to get images.

## Two ways to author, one model

Write a `.diagram.ts` with the builder DSL, or draw one in the studio and it writes a `.diagram.json` for you. Both compile to the same validated model, so a diagram is never trapped in the tool that made it. Positions live in a separate `<name>.layout.json`, which keeps meaning and coordinates in different diffs.

Commit `.diagrams/src/`. `.diagrams/.artifacts/`, `.diagrams/html/` and `.diagrams/diff/` are build output — `diagc init` gitignores them.

## Documentation

Website and live examples: <https://ferroman.github.io/diagc/>

Full docs, tutorials, and the model reference: <https://github.com/Ferroman/diagc>

## License

[AGPL-3.0-only](https://github.com/Ferroman/diagc/blob/main/LICENSE), with additional permissions under section 7: diagrams you author, and the pages and images built from them, are yours to license however you like. A commercial license is available. See the [project README](https://github.com/Ferroman/diagc#license).
