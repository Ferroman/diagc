/** The ascii preset's frames: nine-slice SVG masks in which every slice is one
 * character cell holding the glyph a monospace text diagram would type there —
 * `+--+` round a box, `+==+` round a data store, dots and `:` round a group.
 * presets.css paints them in the box's hue through `-webkit-mask-box-image`,
 * slicing at the cell size, so the glyphs repeat along each side. */
const CELL_W = 8;
const CELL_H = 14;
const LINE = "stroke='black' stroke-width='1.4' fill='none' stroke-linecap='round'";

/** Each glyph drawn in one 8×14 cell, its strokes on the cell's centre lines so
 * corners and sides meet the way typed characters line up. */
const GLYPHS = {
  plus: "<rect x='1.5' y='6.25' width='5' height='1.5'/><rect x='3.25' y='4.5' width='1.5' height='5'/>",
  dash: "<rect x='1.5' y='6.25' width='5' height='1.5'/>",
  equals: "<rect x='1.5' y='4.8' width='5' height='1.3'/><rect x='1.5' y='7.9' width='5' height='1.3'/>",
  pipe: "<rect x='3.25' y='1' width='1.5' height='12'/>",
  colon: "<circle cx='4' cy='4.5' r='1'/><circle cx='4' cy='9.5' r='1'/>",
  dot: "<circle cx='4' cy='7' r='1'/>",
  baseDot: "<circle cx='4' cy='10' r='1.05'/>",
  tick: "<rect x='3.35' y='2.5' width='1.3' height='4'/>",
  slash: `<path d='M1.8 12 L6.2 2' ${LINE}/>`,
  backslash: `<path d='M1.8 2 L6.2 12' ${LINE}/>`,
  openParen: `<path d='M5.6 1.5 Q1.6 7 5.6 12.5' ${LINE}/>`,
  closeParen: `<path d='M2.4 1.5 Q6.4 7 2.4 12.5' ${LINE}/>`,
} as const;

type Glyph = keyof typeof GLYPHS;

/** The eight border cells, clockwise from the top-left corner. */
type Ring = [Glyph, Glyph, Glyph, Glyph, Glyph, Glyph, Glyph, Glyph];

/** Where each ring cell sits in the 3×3 grid (column, row), in Ring order. */
const RING_CELLS: readonly (readonly [number, number])[] = [
  [0, 0],
  [1, 0],
  [2, 0],
  [2, 1],
  [2, 2],
  [1, 2],
  [0, 2],
  [0, 1],
];

function frame(ring: Ring): string {
  const cells = ring.map((glyph, i) => {
    const [col, row] = RING_CELLS[i]!;
    return `<g transform='translate(${col * CELL_W} ${row * CELL_H})'>${GLYPHS[glyph]}</g>`;
  });
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${3 * CELL_W}' height='${3 * CELL_H}'>${cells.join('')}</svg>`;
  return `url("data:image/svg+xml,${svg.replace(/</g, '%3C').replace(/>/g, '%3E').replace(/#/g, '%23')}")`;
}

/** The frames as the canvas variables presets.css reads. */
export function asciiFrameVars(): Record<string, string> {
  return {
    '--dg-ascii-box': frame(['plus', 'dash', 'plus', 'pipe', 'plus', 'dash', 'plus', 'pipe']),
    '--dg-ascii-table': frame(['plus', 'equals', 'plus', 'pipe', 'plus', 'equals', 'plus', 'pipe']),
    '--dg-ascii-hex': frame(['slash', 'dash', 'backslash', 'pipe', 'slash', 'dash', 'backslash', 'pipe']),
    '--dg-ascii-pill': frame(['baseDot', 'dash', 'baseDot', 'closeParen', 'tick', 'dash', 'tick', 'openParen']),
    '--dg-ascii-group': frame(['dot', 'dot', 'dot', 'colon', 'dot', 'dot', 'dot', 'colon']),
  };
}
