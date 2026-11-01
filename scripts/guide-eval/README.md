# Guide-coverage eval

Measures how much of diagc a coding agent can use from `diagc guide all` alone. One cold agent per case — no skills, no context files, no repository to browse — gets a brief and the guide, iterates until `diagc lint --json` is clean, and is then scored by assertions on the **compiled artifact**, never on what it says it did.

The first run, on 1.7.0 (2026-11-01, `pi -p` with an OpenAI model), scored 34/38 assertions over eight cases, 7/8 cases fully clean, one `lint` iteration each. The one failure was `compose`: the guide did not mention `include`, so the agent imported the parts' JSON and re-emitted their nodes — a diagram that compiled and linted clean while losing every composition semantic. The `compose` topic and `ref.included(id)` are the answer; this harness is how the next release checks it stayed answered.

## Run it

```bash
npm i -g @diagc/cli                      # measure what ships, not a checkout
export DIAGC_EVAL_AGENT='pi -p --model openai/chat-latest --thinking medium --no-skills --no-context-files --no-extensions --no-session --no-mcp'
scripts/guide-eval/run.sh                # every case
scripts/guide-eval/run.sh compose c4     # some
```

`DIAGC_EVAL_AGENT` is any command that takes the brief as its last argument and works in the current directory. Results land in `$DIAGC_EVAL_ROOT/results.txt` (default `<tmp>/diagc-guide-eval`), one block per case: the agent's exit code, wall time, lint iterations, the lint output, and each assertion as `PASS`/`FAIL` with a `SCORE n / m` line. Pin the model and record the diagc version (the script writes both at the top): pass@1 is a trend to watch across releases, not a gate — it moves with the model.

## Cases

`mkcases.py` holds them: a name, a brief, and declarative checks over the model `m` (plus the helpers at the top of the file). `compose` also writes the two parts the brief refers to. Add a case by adding an entry; keep the checks about the artifact's structure (ids, containment depth, polarity on every link), not about wording the agent chose.

The deterministic half of this measure runs in CI: `packages/diagc/src/guideContent.test.ts` fails when a node or relation option is neither named in the guide nor consciously left to the reference, and compiles the compose topic's own listing against the same assertions the `compose` case uses.
