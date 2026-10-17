import type { EndMark } from './vocabulary';

// The characters a picture is drawn with. A line is recorded on the canvas as the
// directions it leaves a cell in (a mask of the four below) and only turned into a
// character at the end, so wherever two lines meet the junction comes out right
// without the code that drew either knowing about the other.

export const UP = 1;
export const DOWN = 2;
export const LEFT = 4;
export const RIGHT = 8;

export type Weight = 'light' | 'heavy' | 'dashed';
export type Corner = 'round' | 'chamfer';
export type ArrowDirection = 'up' | 'down' | 'left' | 'right';

export interface Glyphs {
  /** the character for a cell whose lines leave it in `mask`'s directions; `corner`
   * applies only while the mask is a plain corner */
  line(mask: number, weight: Weight, corner?: Corner): string;
  arrow(direction: ArrowDirection): string;
  /** a line one cell a row, a fishbone's bone or tick: falling to the right, or rising */
  slant(falling: boolean): string;
  mark(mark: Exclude<EndMark, 'arrow' | 'none'>): string;
  /** one cell, for text cut short */
  ellipsis: string;
  /** what a folded container's note starts with */
  folded: string;
  /** what a drill view's stand-in for an outside node starts with */
  external: string;
  /** the marks a glyph type's box starts with: an activity's start and end, a decision */
  start: string;
  end: string;
  decision: string;
  /** a causal link's delay, after its label */
  delay: string;
}

/** Index a 16-entry table by mask; a lone direction draws as the whole line. */
function table(chars: string): (mask: number) => string {
  const list = [...chars];
  return (mask) => list[mask]!;
}

// By mask:        0    U    D    UD   L    UL   DL   UDL  R    UR   DR   UDR  LR   ULR  DLR  all
const LIGHT = table(' │││─┘┐┤─└┌├─┴┬┼');
const HEAVY = table(' ┃┃┃━┛┓┫━┗┏┣━┻┳╋');
const CORNERS = new Set([DOWN | RIGHT, DOWN | LEFT, UP | RIGHT, UP | LEFT]);

const ROUND: Record<number, string> = { [DOWN | RIGHT]: '╭', [DOWN | LEFT]: '╮', [UP | RIGHT]: '╰', [UP | LEFT]: '╯' };
const CHAMFER: Record<number, string> = {
  [DOWN | RIGHT]: '╱',
  [DOWN | LEFT]: '╲',
  [UP | RIGHT]: '╲',
  [UP | LEFT]: '╱',
};

export const UNICODE: Glyphs = {
  line(mask, weight, corner) {
    if (corner !== undefined && CORNERS.has(mask)) return (corner === 'round' ? ROUND : CHAMFER)[mask]!;
    if (weight === 'heavy') return HEAVY(mask);
    // The dashed set has no junctions: where a dashed line meets anything, the
    // meeting reads better solid than broken.
    if (weight === 'dashed' && (mask & (LEFT | RIGHT)) === 0) return '╎';
    if (weight === 'dashed' && (mask & (UP | DOWN)) === 0) return '╌';
    return LIGHT(mask);
  },
  arrow: (direction) => ({ up: '▲', down: '▼', left: '◀', right: '▶' })[direction],
  slant: (falling) => (falling ? '╲' : '╱'),
  mark: (mark) => ({ dot: '●', square: '■', diamond: '◆', many: '*', one: '1' })[mark],
  ellipsis: '…',
  folded: '+',
  external: '↗',
  start: '●',
  end: '◉',
  decision: '◇',
  delay: '‖',
};

const ASCII_ROUND: Record<number, string> = {
  [DOWN | RIGHT]: '.',
  [DOWN | LEFT]: '.',
  [UP | RIGHT]: "'",
  [UP | LEFT]: "'",
};
const ASCII_CHAMFER: Record<number, string> = {
  [DOWN | RIGHT]: '/',
  [DOWN | LEFT]: '\\',
  [UP | RIGHT]: '\\',
  [UP | LEFT]: '/',
};

export const ASCII: Glyphs = {
  line(mask, weight, corner) {
    if (corner !== undefined && CORNERS.has(mask)) return (corner === 'round' ? ASCII_ROUND : ASCII_CHAMFER)[mask]!;
    const vertical = (mask & (LEFT | RIGHT)) === 0;
    const horizontal = (mask & (UP | DOWN)) === 0;
    if (vertical) return weight === 'dashed' ? ':' : '|';
    if (horizontal) return weight === 'dashed' ? '.' : weight === 'heavy' ? '=' : '-';
    return '+';
  },
  arrow: (direction) => ({ up: '^', down: 'v', left: '<', right: '>' })[direction],
  slant: (falling) => (falling ? '\\' : '/'),
  mark: (mark) => ({ dot: 'o', square: '#', diamond: '@', many: '*', one: '1' })[mark],
  ellipsis: '~',
  folded: '+',
  external: '->',
  start: '*',
  end: '@',
  decision: '<>',
  delay: '||',
};
