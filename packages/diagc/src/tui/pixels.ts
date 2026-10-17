import type { DotRect } from '../text/braille';
import type { CellPoint } from '../text/canvas';

/**
 * A picture in one colour, for a terminal that shows images: each pixel holds how much
 * of the colour it takes, 0 to 1, which becomes its alpha. Drawn in the terminal's own
 * text colour over a transparent ground, a share is what `dim` is on text — the
 * colour blended into whatever background the terminal has. A pixel keeps the most
 * anything drew it, so the order things are drawn in does not matter. Anything drawn
 * outside is dropped, as on the canvas.
 */
export class Pixels {
  private readonly shares: Float32Array;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.shares = new Float32Array(Math.max(0, width) * Math.max(0, height));
  }

  at(x: number, y: number): number {
    return this.shares[y * this.width + x] ?? 0;
  }

  dab(x: number, y: number, share: number): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = y * this.width + x;
    this.shares[i] = Math.max(this.shares[i]!, share);
  }

  fill({ x, y, width, height }: DotRect, share: number): void {
    for (let j = y; j < y + height; j++) for (let i = x; i < x + width; i++) this.dab(i, j, share);
  }

  /** The rectangle's border, a pixel thick. */
  outline({ x, y, width, height }: DotRect, share: number): void {
    if (width <= 0 || height <= 0) return;
    const [right, bottom] = [x + width - 1, y + height - 1];
    this.line({ x, y }, { x: right, y }, share);
    this.line({ x, y: bottom }, { x: right, y: bottom }, share);
    this.line({ x, y }, { x, y: bottom }, share);
    this.line({ x: right, y }, { x: right, y: bottom }, share);
  }

  /** Bresenham's line, both ends included. The ends are rounded first: off whole
   * pixels the walk would never land on the far end. */
  line(from: CellPoint, to: CellPoint, share: number): void {
    const end = { x: Math.round(to.x), y: Math.round(to.y) };
    let [x, y] = [Math.round(from.x), Math.round(from.y)];
    const [dx, dy] = [Math.abs(end.x - x), -Math.abs(end.y - y)];
    const [sx, sy] = [Math.sign(end.x - x), Math.sign(end.y - y)];
    let err = dx + dy;
    for (;;) {
      this.dab(x, y, share);
      if (x === end.x && y === end.y) return;
      const e2 = 2 * err;
      if (e2 >= dy) [err, x] = [err + dy, x + sx];
      if (e2 <= dx) [err, y] = [err + dx, y + sy];
    }
  }

  /** Every pixel outside `keep` at `factor` of its share. */
  dimOutside(keep: DotRect, factor: number): void {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const inside = x >= keep.x && x < keep.x + keep.width && y >= keep.y && y < keep.y + keep.height;
        if (!inside) this.shares[y * this.width + x]! *= factor;
      }
    }
  }

  /** The picture as RGBA bytes, row by row: `rgb` everywhere, its share the alpha. */
  rgba(rgb: readonly [number, number, number]): Uint8Array {
    const out = new Uint8Array(this.shares.length * 4);
    this.shares.forEach((share, i) => {
      out.set(rgb, i * 4);
      out[i * 4 + 3] = Math.round(share * 255);
    });
    return out;
  }
}
