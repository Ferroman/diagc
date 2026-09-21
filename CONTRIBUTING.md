# Contributing

Contributions are welcome — bug reports, fixes, docs, and features alike.

## The CLA, and why it exists

Every contributor signs a [Contributor License Agreement](CLA.md) before their first
pull request is merged. A bot comments on your PR with a link; signing takes a minute
and covers everything you contribute afterwards.

It is worth being direct about why, because CLAs are often sprung on people:

This project is **dual-licensed**. Everyone gets it under AGPL-3.0, and separately, a
commercial licence is available to anyone who needs terms the AGPL does not give them —
embedding it in a proprietary product, or running it as a hosted service without
publishing their source. That second option is only possible if one party can license
the whole codebase, and copyright law means every contributor owns their own
contribution by default. Without a CLA, a single merged pull request would permanently
remove the ability to license the files it touched.

In exchange, [section 4 of the CLA](CLA.md#4-our-commitment-to-you) commits that your
contribution stays available under the AGPL permanently. It cannot be quietly moved to
a closed licence later.

You keep your copyright. The CLA is a licence, not an assignment — you can reuse your
own work anywhere you like.

If you would rather not sign, please still open an issue describing the bug or the idea.
A clear report is genuinely useful and carries no paperwork.

## Getting set up

Needs **Node ≥ 22** and **pnpm 10** (`corepack enable` once).

```bash
pnpm install
pnpm dev          # compile watcher + studio at http://localhost:5173
```

## Before you open a pull request

```bash
pnpm test         # vitest, whole repo
pnpm typecheck    # six chained tsc projects
pnpm lint         # eslint
```

CI runs the same three on every pull request, plus the release build (`pnpm build:dist`) —
running them first saves a round trip.

## Conventions worth knowing

- **Tests live beside the code** (`foo.ts` + `foo.test.ts`) and coverage is close to
  complete. A new module without a sibling test is out of step with the codebase.
- **Comments explain why, not what.** Several dependency arrays and render-phase refs in
  `DiagramView`, `useEditor` and `useDeepLink` encode fixed race conditions — read the
  surrounding comment before changing one.
- **New editing capability means a new `EditorCommand`** in `packages/core/src/commands.ts`
  with tests, then UI wiring — not ad-hoc mutation in a component.
- **`packages/core` depends on nothing.** No React, no filesystem. That boundary is the
  one structural rule worth preserving: the model does not know it is going to be drawn.
- **Generated files are generated.** `apps/studio/src/library/packs.aws.ts` and
  `apps/studio/public/library/**` come from the scripts in `scripts/` — edit the script,
  not its output.

The architecture and the reasoning behind it live in `docs/explanation/`. Reading that
first will save you time on anything non-trivial.

## Diagrams and their images

The docs' figures and the [examples](docs/examples/README.md) are built with the tool, from
sources in `.diagrams/src/`. Their PNGs in `.diagrams/static/` are committed, because
GitHub renders the docs straight from the repo.

- **A new example goes under `.diagrams/src/examples/<type>/` or `examples/features/`,** and
  gets an entry in `docs/examples/README.md`. A test fails if it has none, or if a link or
  an image in the docs points nowhere.
- **Render only what you changed:** `pnpm build:cli` once, then
  `pnpm publish-diagrams <name> …`. The export is stable run to run, but another Chrome
  build redraws other diagrams a few bytes differently, and those diffs are noise.
- **Look at the PNG before you commit it,** and commit it with the source change. Automatic
  layout is usually right; when it is not, give the diagram layout settings or positions.

CI compiles every source (`pnpm compile`), and the Pages workflow publishes them all to
the live site.

## Third-party assets

If your contribution adds an icon, logo, font, or any other third-party asset, say so in
the pull request and note its licence. Marks and logos carry trademark terms that no
software licence covers — see [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
