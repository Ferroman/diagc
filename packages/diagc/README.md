# diagc

Author software-architecture diagrams as code, edit them in a local visual studio, and publish them as shareable pages and images.

Diagrams are plain files in your repo, so they diff, review, and refactor like the rest of it.

```bash
npm i -g @diagc/cli   # or: npx @diagc/cli studio
```

Needs Node ≥ 22.

## Quickstart

```bash
mkdir -p .diagrams/src
cat > .diagrams/src/acme.diagram.ts <<'EOF'
import { model } from '@diagc/core';

const m = model('acme', { name: 'Acme platform' });
const web = m.node('web', { name: 'Web app', type: 'service' });
const db = m.node('db', { name: 'Postgres', type: 'database' });
m.relate(web, db, { kind: 'reads' });

export default m;
EOF

diagc studio       # opens the editor, recompiling as you edit
```

`npm i -D @diagc/core` as well if you want types and completion on `.diagram.ts` files — the CLI compiles them either way.

## Commands

| Command | What it does |
| --- | --- |
| `diagc compile` | Compile `.diagrams/src/**/*.diagram.{ts,json}` into validated artifacts under `.diagrams/.artifacts/`. The default command. |
| `diagc watch` | The same, recompiling on change. |
| `diagc studio` | Serve the visual editor against the current directory (default `http://127.0.0.1:5173`). Diagrams drawn here are saved back as `.diagram.json`. |
| `diagc publish` | Write self-contained HTML pages to `.diagrams/html/` and PNGs to `.diagrams/static/`. |

Flags: `--out <dir>` (artifact directory), `--no-images` (publish HTML only), `--link <url>` (link the published index to an address), `--help`.

PNG export drives headless Chrome. Without one, `publish` writes HTML and says so; point `CHROME_PATH` at a browser to get images.

## Two ways to author, one model

Write a `.diagram.ts` with the builder DSL, or draw one in the studio and it writes a `.diagram.json` for you. Both compile to the same validated model, so a diagram is never trapped in the tool that made it. Positions live in a separate `<name>.layout.json`, which keeps meaning and coordinates in different diffs.

Commit `.diagrams/src/`. `.diagrams/.artifacts/` and `.diagrams/html/` are build output.

## Documentation

Full docs, tutorials, and the model reference: <https://github.com/Ferroman/diagc>

## License

MIT
