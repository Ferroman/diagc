---
name: diagc
description: Write, change or fix a diagc diagram (.diagrams/src/*.diagram.ts) — architecture, C4, deployment, ER, activity, threat model, causal loop, plan and more. Use when asked to draw or update a diagram in a repository that uses diagc.
---

<!-- diagc:begin -->
# Writing diagrams with diagc

A diagram is a TypeScript file under `.diagrams/src/`; `diagc` validates it, lays it out and draws it. The DSL is documented by the installed CLI, not here. Read it each time: it describes the version that is installed.

## Before writing

1. Run `diagc guide`: the DSL, the node types and relation kinds, the rules, and the list of diagram types.
2. Run `diagc guide <topic>` when the diagram is one of those types (C4, ER, deployment, …). Each topic prints a complete starter to begin from.

## The loop

1. Write or edit `.diagrams/src/<name>.diagram.ts`.
2. Run `diagc lint --json` until it prints `[]` and exits 0. Each finding has `file`, `severity`, `code` and `message`: an `error` does not compile, a `warning` compiles but is probably a mistake.
3. Run `diagc publish <name>` and look at `.diagrams/static/<name>.png`. It needs Chrome (set `CHROME_PATH` when none is found); without one it writes the HTML page only.

## Rules

- Never write positions or sizes. Layout is automatic. A person adjusts it in `diagc studio`, which saves `<name>.layout.json` beside the source: leave that file alone.
- A `.diagram.ts` diagram is read-only in the studio. Change it in its source.
- A `.diagram.json` file is a diagram drawn in the studio. Leave it to the studio unless asked; `diagc eject <name>` turns one into TypeScript.
- Commit `.diagrams/src/` and `.diagrams/static/`. `.diagrams/.artifacts/`, `.diagrams/html/` and `.diagrams/diff/` are build output.
- Do not paste guide text into the repository. Run `diagc guide` instead.
<!-- diagc:end -->
