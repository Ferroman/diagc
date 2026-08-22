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

/**
 * How many characters an edge's single label chip may show. ~24 characters is
 * about the width of two folded boxes at platform altitude; past that one arrow's
 * text starts covering its neighbours, and on a view with hundreds of arrows that
 * is the difference between a diagram and a wall of words.
 *
 * The core keeps aggregate labels short at the source (`AGG_LABEL_BUDGET` in
 * view/edges.ts collapses a long pile-up to "N relations"); this is the backstop
 * for the other case — ONE authored label that happens to be a sentence.
 */
export const EDGE_LABEL_MAX_CHARS = 24;

/**
 * Shorten an edge label to `EDGE_LABEL_MAX_CHARS`, ellipsis included in the
 * budget. Needed as a STRING operation, not CSS: React Flow draws `data.label` as
 * SVG <text>, where `text-overflow: ellipsis` has no effect.
 *
 * Counts characters by code point, so an astral character is never split into
 * halves of a surrogate pair, and trims a trailing separator or space so the
 * result reads as a shortened label rather than a broken one. The full text stays
 * available: the edge's hover title carries it.
 */
export function truncateEdgeLabel(text: string, max: number = EDGE_LABEL_MAX_CHARS): string {
  const chars = [...text];
  if (chars.length <= max) return text;
  const kept = chars.slice(0, Math.max(0, max - 1)).join('');
  return `${kept.replace(/[\s/|,;·-]+$/u, '')}…`;
}
