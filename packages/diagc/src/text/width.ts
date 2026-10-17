// How many terminal cells text takes. A box is drawn to the width of its name, so a
// name measured in characters instead of cells pushes the right border of every row
// that holds a wide character out of line with the rows that do not.
//
// Measured per code point, which is what a terminal does short of joining emoji
// sequences (a ZWJ sequence draws as one glyph on some terminals and as its parts on
// others; counting the parts keeps the frame wide enough on both).

// [first, last] code points drawn two cells wide: East Asian Wide and Fullwidth, and
// the emoji drawn in emoji presentation by default.
const WIDE: readonly (readonly [number, number])[] = [
  [0x1100, 0x115f],
  [0x231a, 0x231b],
  [0x2329, 0x232a],
  [0x23e9, 0x23ec],
  [0x23f0, 0x23f0],
  [0x23f3, 0x23f3],
  [0x25fd, 0x25fe],
  [0x2614, 0x2615],
  [0x2648, 0x2653],
  [0x267f, 0x267f],
  [0x2693, 0x2693],
  [0x26a1, 0x26a1],
  [0x26aa, 0x26ab],
  [0x26bd, 0x26be],
  [0x26c4, 0x26c5],
  [0x26ce, 0x26ce],
  [0x26d4, 0x26d4],
  [0x26ea, 0x26ea],
  [0x26f2, 0x26f3],
  [0x26f5, 0x26f5],
  [0x26fa, 0x26fa],
  [0x26fd, 0x26fd],
  [0x2705, 0x2705],
  [0x270a, 0x270b],
  [0x2728, 0x2728],
  [0x274c, 0x274c],
  [0x274e, 0x274e],
  [0x2753, 0x2755],
  [0x2757, 0x2757],
  [0x2795, 0x2797],
  [0x27b0, 0x27b0],
  [0x27bf, 0x27bf],
  [0x2b1b, 0x2b1c],
  [0x2b50, 0x2b50],
  [0x2b55, 0x2b55],
  [0x2e80, 0x303e],
  [0x3041, 0x33ff],
  [0x3400, 0x4dbf],
  [0x4e00, 0x9fff],
  [0xa000, 0xa4cf],
  [0xa960, 0xa97f],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe10, 0xfe19],
  [0xfe30, 0xfe6f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
  [0x1f004, 0x1f004],
  [0x1f0cf, 0x1f0cf],
  [0x1f18e, 0x1f18e],
  [0x1f191, 0x1f19a],
  [0x1f200, 0x1f251],
  [0x1f300, 0x1f64f],
  [0x1f680, 0x1f6ff],
  [0x1f7e0, 0x1f7eb],
  [0x1f900, 0x1f9ff],
  [0x1fa70, 0x1faff],
  [0x20000, 0x3fffd],
];

// [first, last] code points that take no cell of their own: combining marks, which
// draw over the character before them, and the invisible joiners and selectors.
const ZERO: readonly (readonly [number, number])[] = [
  [0x0300, 0x036f],
  [0x0483, 0x0489],
  [0x0591, 0x05bd],
  [0x1ab0, 0x1aff],
  [0x1dc0, 0x1dff],
  [0x200b, 0x200f],
  [0x2060, 0x2064],
  [0x20d0, 0x20ff],
  [0xfe00, 0xfe0f],
  [0xfe20, 0xfe2f],
  [0xfeff, 0xfeff],
  [0xe0100, 0xe01ef],
];

function inRanges(cp: number, ranges: readonly (readonly [number, number])[]): boolean {
  // Binary search: both tables are sorted and disjoint.
  let lo = 0;
  let hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const [first, last] = ranges[mid]!;
    if (cp < first) hi = mid - 1;
    else if (cp > last) lo = mid + 1;
    else return true;
  }
  return false;
}

/** A C0 or C1 control character, or DEL: a terminal acts on one (a line break, an
 * escape) instead of drawing it. */
export const isControl = (cp: number): boolean => cp < 0x20 || (cp >= 0x7f && cp < 0xa0);

/** `text` with every control character a space: what a name, a label or a description
 * may hold (a line break typed in the studio, a tab) and a terminal must not be sent. */
export function printable(text: string): string {
  let out = '';
  for (const ch of text) out += isControl(ch.codePointAt(0)!) ? ' ' : ch;
  return out;
}

/** The cells one code point takes: 0 for a mark, a joiner or a control character. */
export function charWidth(cp: number): 0 | 1 | 2 {
  if (cp < 0x20 || (cp >= 0x7f && cp < 0xa0)) return 0;
  if (inRanges(cp, ZERO)) return 0;
  return inRanges(cp, WIDE) ? 2 : 1;
}

/** The cells `text` takes in a terminal. */
export function cellWidth(text: string): number {
  let width = 0;
  for (const ch of text) width += charWidth(ch.codePointAt(0)!);
  return width;
}

/** `text` cut to `max` cells, ending in `ellipsis` (one cell) when anything was cut. */
export function fitCells(text: string, max: number, ellipsis = '…'): string {
  if (cellWidth(text) <= max) return text;
  if (max <= 0) return '';
  let out = '';
  let width = 0;
  for (const ch of text) {
    const w = charWidth(ch.codePointAt(0)!);
    if (width + w > max - 1) break;
    out += ch;
    width += w;
  }
  return `${out}${ellipsis}`;
}

/** A word wider than `max`, in pieces of at most `max` cells. */
function splitWord(word: string, max: number): string[] {
  const pieces: string[] = [];
  let piece = '';
  let width = 0;
  for (const ch of word) {
    const w = charWidth(ch.codePointAt(0)!);
    if (width + w > max && piece !== '') {
      pieces.push(piece);
      piece = '';
      width = 0;
    }
    piece += ch;
    width += w;
  }
  pieces.push(piece);
  return pieces;
}

/** `text` wrapped at spaces into lines of at most `max` cells; a word wider than a
 * line is split. Empty text is one empty line, so a box always has a title row. */
export function wrapCells(text: string, max: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ').filter((w) => w !== '')) {
    for (const piece of cellWidth(word) > max ? splitWord(word, max) : [word]) {
      const joined = line === '' ? piece : `${line} ${piece}`;
      if (cellWidth(joined) <= max) line = joined;
      else {
        lines.push(line);
        line = piece;
      }
    }
  }
  lines.push(line);
  return lines;
}
