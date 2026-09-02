# Eject a diagram to TypeScript

Promote a diagram you started by drawing in the studio — a `.diagram.json` — to a generated
`.diagram.ts` module, moving it from designer ownership to code ownership: reviewable diffs,
comments, and every builder method available for the next edit. The swap is verified, not a
blind file rename — the generated source is executed and must rebuild the exact model before
anything on disk changes.

## When to eject

Reach for it once a diagram drawn in the studio has outgrown the canvas: you want it reviewed
as a diff, want to script part of it (a loop generating repeated nodes, say), or just want it
to live next to the rest of the code that owns the system it depicts. After ejecting, the
diagram is a `.diagram.ts` like any other — see [Author diagrams in TypeScript](author-in-typescript.md)
for how to keep editing it, and [Place boxes by hand on a generated diagram](position-a-generated-diagram.md)
for how to keep its layout: it becomes **read-only** in the studio the moment it's TypeScript,
same as any generated diagram.

## In the studio

1. Select an editable (JSON-owned) diagram, outside edit mode.
2. Click the **Eject** chip in the toolbar and confirm the dialog — it names the diagram and
   states plainly what's about to happen: the JSON source is replaced by a generated
   `.diagram.ts`, and the diagram becomes read-only here.
3. On success the chip disappears — the diagram now shows the same `read-only` chip a
   `.diagram.ts` always does. The model, layout and current selection are untouched; only
   ownership flipped.

If the server refuses (see below), the studio alerts that the diagram could not be ejected and
changes nothing.

## On the command line

```bash
diagc eject shop
```

The argument is a diagram name — or a path under `.diagrams/src`; either way only the name is
kept (`.diagrams/src/` prefix and `.diagram.ts`/`.diagram.json` suffix are both stripped). On
success it prints the new source path and exits `0`; on refusal it prints the reason to stderr
and exits `1`.

## What the verify step guarantees

`eject` reads and validates the JSON, generates a `.diagram.ts` module from it, then **executes
that generated source in a throwaway location** — outside `.diagrams/src`, so a running compile
watcher never sees the candidate file — and deep-compares the model it rebuilds against the
model it started from. Only once the two match exactly does it write the `.diagram.ts` and
delete the `.diagram.json`. If the generated source fails to execute at all, it refuses with the
underlying error; if it executes but rebuilds a model that differs from the JSON, it refuses
instead, naming the paths where the two models first differ.

## Sidecars survive

`<name>.layout.json`, `<name>.drawings.json`, and anything else keyed by diagram name are
never touched by eject — same file, same name, still applies once the diagram is TypeScript.
Positions you placed in the studio are exactly where you left them; see
[Place boxes by hand on a generated diagram](position-a-generated-diagram.md) for how a
generated diagram keeps them from here on.

## Errors, and what they leave behind

Every refusal leaves `.diagrams/src` exactly as it was — nothing is written, nothing is
deleted:

| Case | What you get |
| --- | --- |
| No `<name>.diagram.json` | Refuses: no such diagram. |
| `<name>.diagram.ts` already exists | Refuses: already TypeScript-owned. |
| The JSON does not parse, fails validation, or holds a value the generated code cannot express | Refuses, naming the parse error, listing the validation issues, or naming the diagram and the underlying error. |
| The generated source fails to execute | Refuses, surfacing the underlying execution error. |
| The generated source executes but rebuilds a model that differs from the JSON | Refuses, naming the paths where the two models first differ. |

## Crash recovery

The `.diagram.ts` is written **before** the `.diagram.json` is deleted, so a crash between
those two steps leaves both files behind. Nothing is lost, but nothing picks a winner for you
either: run `diagc compile` and you'll see both sources logged, each naming the same artifact
path — that's your signal. Recovery is deleting one of the two: keep the `.diagram.ts` (eject
had already proven it reproduces the model) or discard it and keep the `.diagram.json` to try
again later.

## See also

- [`diagc` CLI reference](../reference/cli.md#eject) — the command, its input, its exit codes
- [Author diagrams in TypeScript](author-in-typescript.md) — editing it once it's TypeScript
- [Place boxes by hand on a generated diagram](position-a-generated-diagram.md) — keeping layout across the swap
- [Builder API reference](../reference/builder-api.md) — every method the generated source can call
