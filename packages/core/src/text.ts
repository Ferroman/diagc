import type { TextRun } from './types';

export function runsToPlainText(runs: TextRun[]): string {
  return runs.map((r) => r.text).join('');
}

/** Canonical form: drop empty runs, coerce falsey marks away, merge adjacent
 * runs whose marks match. */
export function normalizeRuns(runs: TextRun[]): TextRun[] {
  const out: TextRun[] = [];
  for (const r of runs) {
    if (r.text === '') continue;
    const run: TextRun = { text: r.text };
    if (r.bold === true) run.bold = true;
    if (r.italic === true) run.italic = true;
    const prev = out[out.length - 1];
    if (prev !== undefined && Boolean(prev.bold) === Boolean(run.bold) && Boolean(prev.italic) === Boolean(run.italic)) {
      prev.text += run.text;
    } else {
      out.push(run);
    }
  }
  return out;
}
