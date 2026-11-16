import { SM_TRANSITION_KIND } from '@diagc/core/internal';
import { EDGE_LABEL_MAX_CHARS } from '../node/label-size';

/**
 * The kinds whose label wraps onto more lines instead of being cut at
 * EDGE_LABEL_MAX_CHARS. A transition's `trigger [guard] / effect` is one
 * statement and every part of it is meaning, so an ellipsis would drop the very
 * guard or effect a reader came for; a state machine also carries a handful of
 * arrows, not the hundreds the cut protects a platform view from.
 */
const WRAPPING_KINDS: ReadonlySet<string> = new Set([SM_TRANSITION_KIND]);

export const wrapsLabel = (kind: string | undefined): boolean => kind !== undefined && WRAPPING_KINDS.has(kind);

const length = (s: string): number => [...s].length;

/** `word` in pieces of at most `max` characters */
function pieces(word: string, max: number): string[] {
  const chars = [...word];
  const out: string[] = [];
  for (let i = 0; i < chars.length; i += max) out.push(chars.slice(i, i + max).join(''));
  return out;
}

/**
 * `text` as lines of at most `max` characters, broken between words. A
 * bracketed guard stays on one line while it fits (`reloadPage` /
 * `[clean and idle]`), and a `/` travels with the word after it, so a
 * transition breaks before its effect (`requestEdit [owns d]` / `/ send load`)
 * rather than leaving the separator dangling; a word longer than a line is cut
 * into pieces. One copy for the layout, which reserves the lines' room, and the
 * label, which draws them.
 */
export function labelLines(text: string, max: number = EDGE_LABEL_MAX_CHARS): string[] {
  const words = text
    .trim()
    .split(/\s+/)
    .filter((w) => w !== '');
  // the units a line break may not split, while they fit on one line: a
  // bracketed guard, and a `/` with the word after it
  const units: string[][] = [];
  for (let i = 0; i < words.length; i++) {
    const word = words[i]!;
    if (word.startsWith('[')) {
      const close = words.findIndex((w, j) => j >= i && w.endsWith(']'));
      const end = close === -1 ? i : close;
      units.push(words.slice(i, end + 1));
      i = end;
    } else units.push(word === '/' && i + 1 < words.length ? [word, words[++i]!] : [word]);
  }
  const lines: string[] = [];
  let line = '';
  const place = (piece: string): void => {
    if (line === '') line = piece;
    else if (length(line) + 1 + length(piece) <= max) line = `${line} ${piece}`;
    else {
      lines.push(line);
      line = piece;
    }
  };
  for (const unit of units) {
    const whole = unit.join(' ');
    if (length(whole) <= max) place(whole);
    else for (const word of unit) for (const piece of pieces(word, max)) place(piece);
  }
  if (line !== '') lines.push(line);
  return lines;
}
