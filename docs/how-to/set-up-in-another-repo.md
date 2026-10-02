# Add `diagc` to an existing repository

Put diagrams into a project that already has code, people and CI: install the CLI, create the first diagram, decide what to commit, and keep the diagrams honest on every pull request.

## Install the CLI

Once per machine, not per project. One line, no Node required (macOS and Linux):

```bash
curl -fsSL https://raw.githubusercontent.com/Ferroman/diagc/main/install.sh | sh
```

With Node 22 or newer, `npm i -g @diagc/cli` does the same. Either way `diagc` runs against whatever directory you are in and installs nothing into it. Without a global install, `npx @diagc/cli <command>` works wherever `diagc` appears below.

## Create the first diagram

From the repository root:

```bash
diagc init shop                 # or: diagc init shop --type c4 — `diagc guide` lists the types
```

It writes `.diagrams/src/shop.diagram.ts` from a starter, adds the build output to `.gitignore`, compiles, and prints what to do next. It refuses rather than overwrite: a name whose `.diagram.ts` or `.diagram.json` already exists exits 1 with nothing written. Diagrams may live in folders — `diagc init platform/auth` makes `.diagrams/src/platform/auth.diagram.ts`, the diagram `platform/auth`.

Run `diagc init` again later, with no name, and it leaves your diagrams alone and only tops up `.gitignore`.

## What to commit

| Path | Commit? |
| --- | --- |
| `.diagrams/src/` — sources, layouts, drawings | **yes** |
| `.diagrams/static/*.png` — the images `diagc publish` renders | **yes** |
| `.diagrams/.artifacts/`, `.diagrams/html/`, `.diagrams/diff/` — build output | no — `init` has gitignored them |

One command regenerates the build output, so a clone with the sources has everything.

## Types in the editor

The CLI compiles `.diagram.ts` with nothing installed in your project. For completion and type errors in the editor, add the types as a dev dependency:

```bash
npm i -D @diagc/core            # or your package manager's equivalent
```

`init` prints this line, with the version to match, when it finds a `package.json`. Keep `@diagc/core` at the version of the `diagc` you run — the two are released together.

## Lint on every pull request

`diagc lint` exits 1 on anything suspicious — a source that fails to compile, a misspelled type or kind, a duplicate, an unused or undrawn part — and 0 when clean, so it slots into CI as it is:

```yaml
# .github/workflows/diagrams.yml
name: Diagrams
on: pull_request
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 24
      - run: npx --yes @diagc/cli lint
```

Pin the package (`@diagc/cli@<version>`) when a release must not change what the check says. For before-and-after pictures of what a pull request changes, add the [`pr-diagram-diff` action](show-what-changed.md#show-it-on-every-pull-request).

## Where the studio fits

`diagc studio` opens the editor against the repository. TypeScript diagrams are read-only there — positions can still be dragged and saved, see [Place boxes on a generated diagram](position-a-generated-diagram.md) — and diagrams drawn in the studio are saved as `.diagram.json` beside the TypeScript ones. Both compile to the same model, and [Eject](eject-to-typescript.md) turns a drawn one into TypeScript.

## Working on diagc itself

To run a checkout of this repository as `diagc`, see [CONTRIBUTING.md § Getting set up](../../CONTRIBUTING.md#getting-set-up).

## See also

- [`diagc` reference](../reference/cli.md) — every command, flag and environment variable
- [Write diagrams with a coding agent](write-diagrams-with-a-coding-agent.md)
- [Publish and share](publish-and-share.md)
