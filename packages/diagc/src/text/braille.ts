/** A rectangle of dots: from (x, y) to (x + width − 1, y + height − 1). */
export interface DotRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Each dot's bit in its braille character, by its row and column in the cell: the
 * standard numbering, which runs down the left column, then the right, with the
 * bottom row added last. */
const BIT = [
  [0x01, 0x08],
  [0x02, 0x10],
  [0x04, 0x20],
  [0x40, 0x80],
] as const;

const BRAILLE_BLANK = 0x2800;

/**
 * Cells as a grid of dots, two across and four down in each, drawn with braille
 * characters: the finest a terminal draws in text, for a picture too small to
 * letter. A cell is about twice as tall as it is wide, so a dot is about square.
 * Anything drawn outside the grid is dropped, as on the canvas.
 */
export class Dots {
  private readonly bits: Uint8Array;

  constructor(
    readonly columns: number,
    readonly rows: number,
  ) {
    this.bits = new Uint8Array(Math.max(0, columns) * Math.max(0, rows));
  }

  get width(): number {
    return this.columns * 2;
  }

  get height(): number {
    return this.rows * 4;
  }

  set(x: number, y: number): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    this.bits[(y >> 2) * this.columns + (x >> 1)]! |= BIT[y & 3]![x & 1]!;
  }

  /** The rectangle's border, a dot thick. */
  outline({ x, y, width, height }: DotRect): void {
    if (width <= 0 || height <= 0) return;
    const [right, bottom] = [x + width - 1, y + height - 1];
    for (let i = x; i <= right; i++) {
      this.set(i, y);
      this.set(i, bottom);
    }
    for (let j = y; j <= bottom; j++) {
      this.set(x, j);
      this.set(right, j);
    }
  }

  /** The cell's character: its dots, or a space for none — a blank braille character
   * shows as a box in fonts without braille, and copies as something that is not a
   * space. */
  char(column: number, row: number): string {
    const bits = this.bits[row * this.columns + column] ?? 0;
    return bits === 0 ? ' ' : String.fromCodePoint(BRAILLE_BLANK + bits);
  }
}
