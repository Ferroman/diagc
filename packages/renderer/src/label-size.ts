import type { FontScale } from '@diagramming/core';

export const MIN_LABEL_WIDTH = 120;
export const MAX_LABEL_WIDTH = 260;
const PAD_X = 20;
const PAD_Y = 16;
const METRICS: Record<FontScale, { char: number; line: number }> = {
  sm: { char: 5.5, line: 13 },
  md: { char: 7.2, line: 17 },
  lg: { char: 11, line: 26 },
};

/** Deterministic (no-DOM) box size for a multiline label, fed into elk so it
 * reserves height and neighbors don't overlap. Approximate — the real DOM shares
 * the CSS, so it lands close. */
export function estimateLabelSize(text: string, fontScale: FontScale = 'md'): { width: number; height: number } {
  const { char, line } = METRICS[fontScale];
  const maxText = MAX_LABEL_WIDTH - PAD_X;
  let lineCount = 0;
  let longest = 0;
  for (const hard of text.split('\n')) {
    const w = hard.length * char;
    longest = Math.max(longest, Math.min(w, maxText));
    lineCount += Math.max(1, Math.ceil(w / maxText));
  }
  return {
    width: Math.min(MAX_LABEL_WIDTH, Math.max(MIN_LABEL_WIDTH, Math.round(longest + PAD_X))),
    height: Math.round(Math.max(1, lineCount) * line + PAD_Y),
  };
}
