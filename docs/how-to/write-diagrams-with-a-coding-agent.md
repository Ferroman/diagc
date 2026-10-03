# Write diagrams with a coding agent

Have an agent — Claude Code, Codex, Cursor, anything with a shell in your repository — write and maintain `.diagram.ts` files and check its own work. The installed CLI carries everything it needs; the agent never has to read this repository.

## Point the agent at the guide

```bash
diagc init --agents
```

In a repository that already has diagrams this adds no starter. It appends whichever of the build-output lines `.gitignore` is missing, and writes a short block into `AGENTS.md` and `CLAUDE.md`, whichever exist (a new `AGENTS.md` when neither does), between `<!-- diagc:begin -->` and `<!-- diagc:end -->`:

```markdown
## Diagrams

Diagrams live in `.diagrams/src/*.diagram.ts` and are built with `diagc`.

- Run `diagc guide` before writing or changing one; `diagc guide <type>` covers one diagram type.
- Run `diagc lint --json` until it reports nothing.
- Run `diagc publish <name>` and look at `.diagrams/static/<name>.png` to check the picture.
```

The block names commands, not DSL details, so it does not go stale as the DSL grows; a later `diagc init --agents` replaces it in place. Edit around it freely — only the text between the markers is diagc's. In a repository with no diagrams yet, the same command also writes and compiles the starter.

## The Claude Code skill

In a repository that has a `.claude/` folder or a `CLAUDE.md`, the same command also writes `.claude/skills/diagc/SKILL.md`. Claude Code loads a skill only when the task matches its description — here, a request to draw or change a diagram — so the skill says more than the block does, and on any other task it costs only that description: read the guide first, run the lint loop, look at the PNG, never write positions, leave `<name>.layout.json` and a studio-drawn `.diagram.json` alone, and what to commit.

Like the block, it names commands and files and no DSL, and only the text between its markers is diagc's: a later `diagc init --agents` replaces that and keeps what you wrote around it, the frontmatter included. Where there is neither a `.claude/` folder nor a `CLAUDE.md` the step is skipped, and the output says so; make the folder and run the command again to get the skill.

## What the agent reads

`diagc guide` prints the DSL, the node types and relation kinds the linter accepts, the rules a diagram must follow, and the list of topics. `diagc guide c4` — or `er`, `deployment`, `activity`, any topic in that list — adds one diagram type's conventions and a complete starter. The text ships inside the CLI, so it describes the version the agent is running, and every listing in it is compiled by diagc's own test suite.

For a model with no shell, <https://ferroman.github.io/diagc/llms.txt> is `diagc guide all` for the current `main`. Paste it in, or point the model at it.

## The loop

An agent working from the block follows its three lines:

1. **Write.** Create or edit `.diagrams/src/<name>.diagram.ts`.
2. **Lint.** `diagc lint --json` prints `[]` and exits 0 when everything is clean. Otherwise each finding carries `file`, `severity`, `code` and `message`: an `error` is a diagram that does not compile, a `warning` compiles but is probably a mistake — a misspelled type comes with a *did you mean*. A source that throws while it loads is one `load` finding, with `line` and `column` when the stack places it. The agent fixes and runs again until the exit code is 0.
3. **Look.** `diagc publish <name>` writes `.diagrams/static/<name>.png` — every group open, the first plane, that plane's own layers — and an agent that reads images checks the picture against what was meant. It needs Chrome; without one, publish writes the HTML page only and says so (`CHROME_PATH` points it at a browser).

Nothing in the loop needs the studio. Open it yourself afterwards, to read the result or to drag boxes into place: positions are saved beside the source in `<name>.layout.json`, and the agent's next edit to the `.diagram.ts` leaves them alone ([Place boxes on a generated diagram](position-a-generated-diagram.md)).

## Asking for a diagram

The guide's rules do most of the work; what the agent cannot know is what the diagram is *for*. Say which diagram type (`diagc guide` lists them), what the reader should see first — groups rest folded, so the top level is the overview — and which details belong on a layer rather than in the base picture. Point it at the code or the document to draw from: diagc does not read your code, so the agent is the one doing the reading.

## See also

- [`diagc` reference → `guide`](../reference/cli.md#guide) and [`lint`](../reference/cli.md#lint)
- [Add diagc to an existing repository](set-up-in-another-repo.md) — `diagc lint` in CI catches what the loop missed
- [Author diagrams in TypeScript](author-in-typescript.md) — the DSL, for a person
