import { SM_TRANSITION_KIND } from './state-machine';

/** The width a wrapping label's line keeps within, in characters on a canvas and in
 * cells in a terminal: past it a label goes on to another line. */
export const LABEL_LINE_MAX = 24;

/**
 * The kinds whose label wraps onto more lines instead of being cut short with an
 * ellipsis. A transition's `trigger [guard] / effect` is one statement and every
 * part of it is meaning, so an ellipsis would drop the very guard or effect a
 * reader came for; a state machine also carries a handful of arrows, not the
 * hundreds the cut protects a platform view from.
 */
const WRAPPING_KINDS: ReadonlySet<string> = new Set([SM_TRANSITION_KIND]);

export const wrapsLabel = (kind: string | undefined): boolean => kind !== undefined && WRAPPING_KINDS.has(kind);

/** How wide a piece of text is: characters by default, a terminal passes its cells. */
export type Measure = (text: string) => number;

const characters: Measure = (s) => [...s].length;

/** `word` in pieces no wider than `max`; a character wider than `max` is a piece alone. */
function pieces(word: string, max: number, measure: Measure): string[] {
  const out: string[] = [];
  let piece = '';
  for (const ch of word) {
    if (piece !== '' && measure(piece + ch) > max) {
      out.push(piece);
      piece = '';
    }
    piece += ch;
  }
  if (piece !== '') out.push(piece);
  return out;
}

/** The runs of words a line break may not split while they fit on one line: a
 * bracketed guard, and a `/` with the word after it. */
function units(words: readonly string[]): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < words.length; i++) {
    const word = words[i]!;
    if (word.startsWith('[')) {
      const close = words.findIndex((w, j) => j >= i && w.endsWith(']'));
      const end = close === -1 ? i : close;
      out.push(words.slice(i, end + 1));
      i = end;
    } else out.push(word === '/' && i + 1 < words.length ? [word, words[++i]!] : [word]);
  }
  return out;
}

/**
 * `text` as lines no wider than `max`, broken between words. A bracketed guard
 * stays on one line while it fits (`reloadPage` / `[clean and idle]`), and a `/`
 * travels with the word after it, so a transition breaks before its effect
 * (`requestEdit [owns d]` / `/ send load`) rather than leaving the separator
 * dangling; a word wider than a line is cut into pieces. One copy for the
 * canvas's layout and label and for the terminal's picture, so both break a
 * label in the same places.
 */
export function labelLines(text: string, max: number = LABEL_LINE_MAX, measure: Measure = characters): string[] {
  const words = text
    .trim()
    .split(/\s+/)
    .filter((w) => w !== '');
  const lines: string[] = [];
  let line = '';
  const place = (piece: string): void => {
    if (line === '') line = piece;
    else if (measure(`${line} ${piece}`) <= max) line = `${line} ${piece}`;
    else {
      lines.push(line);
      line = piece;
    }
  };
  for (const unit of units(words)) {
    const whole = unit.join(' ');
    if (measure(whole) <= max) place(whole);
    else for (const word of unit) for (const piece of pieces(word, max, measure)) place(piece);
  }
  if (line !== '') lines.push(line);
  return lines;
}
