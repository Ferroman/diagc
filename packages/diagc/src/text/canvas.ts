import { DOWN, LEFT, RIGHT, UP, type Corner, type Glyphs, type Weight } from './glyphs';
import { charWidth, isControl } from './width';

/** A colour: a 24-bit one (a node's own), or one of the terminal's 16 (0–15). */
export type Color = { rgb: [number, number, number] } | { ansi: number };

export interface Style {
  fg?: Color;
  /** the cell's background */
  bg?: Color;
  bold?: boolean;
  dim?: boolean;
  inverse?: boolean;
}

/** One cell of a finished picture. `ch` is `''` in the second cell of a wide
 * character, which the character before it already covers. */
export interface Cell {
  ch: string;
  style: Style;
}

export interface CellPoint {
  x: number;
  y: number;
}

/** A rectangle of cells: from (x, y) to (x + width − 1, y + height − 1). */
export interface CellRect extends CellPoint {
  width: number;
  height: number;
}

interface Slot {
  ch: string;
  style: Style;
  /** directions lines leave this cell in; 0 = the cell holds `ch` instead */
  mask: number;
  weight: Weight;
  /** the directions drawn at `weight`; the rest of `mask` is lighter */
  top: number;
  corner?: Corner;
  /** the style under what is drawn here (`Canvas.ground`) */
  ground?: Style;
}

const RANK: Record<Weight, number> = { dashed: 0, light: 1, heavy: 2, double: 3 };

const blank = (): Slot => ({ ch: ' ', style: {}, mask: 0, weight: 'dashed', top: 0 });

/**
 * A grid of character cells that lines, boxes and text are drawn into. Lines are
 * kept as direction masks until `cells` resolves them, so whatever meets in a cell
 * — a crossing, an edge leaving a box, a frame's corner — merges into one junction.
 * Anything drawn outside the grid is dropped, which lets callers draw without
 * clipping first.
 */
export class Canvas {
  private readonly slots: Slot[][];

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.slots = Array.from({ length: Math.max(0, height) }, () => Array.from({ length: Math.max(0, width) }, blank));
  }

  private slot(x: number, y: number): Slot | undefined {
    return this.slots[y]?.[x];
  }

  /** Adds line directions to a cell. The heavier weight wins a shared cell, and the
   * directions drawn lighter are kept, for a junction that can show both. */
  stroke({ x, y }: CellPoint, mask: number, weight: Weight, style?: Style): void {
    const s = this.slot(x, y);
    if (s === undefined) return;
    const was = s.mask;
    if (was === 0) this.unwide(x, y);
    s.mask |= mask;
    if (was === 0 || RANK[weight] > RANK[s.weight]) [s.weight, s.top] = [weight, mask];
    else if (weight === s.weight) s.top |= mask;
    if (style !== undefined) s.style = style;
  }

  /** An axis-aligned line from `a` to `b`, both ends included. */
  segment(a: CellPoint, b: CellPoint, weight: Weight, style?: Style): void {
    if (a.x !== b.x && a.y !== b.y) throw new Error(`not an axis-aligned segment: ${a.x},${a.y} → ${b.x},${b.y}`);
    if (a.y === b.y) {
      const [from, to] = a.x <= b.x ? [a.x, b.x] : [b.x, a.x];
      for (let x = from; x <= to; x++) {
        this.stroke({ x, y: a.y }, (x > from ? LEFT : 0) | (x < to ? RIGHT : 0) || LEFT | RIGHT, weight, style);
      }
      return;
    }
    const [from, to] = a.y <= b.y ? [a.y, b.y] : [b.y, a.y];
    for (let y = from; y <= to; y++) {
      this.stroke({ x: a.x, y }, (y > from ? UP : 0) | (y < to ? DOWN : 0) || UP | DOWN, weight, style);
    }
  }

  /** A rectangle's border. */
  rect({ x, y, width, height }: CellRect, weight: Weight, style?: Style, corner?: Corner): void {
    const right = x + width - 1;
    const bottom = y + height - 1;
    this.segment({ x, y }, { x: right, y }, weight, style);
    this.segment({ x, y: bottom }, { x: right, y: bottom }, weight, style);
    this.segment({ x, y }, { x, y: bottom }, weight, style);
    this.segment({ x: right, y }, { x: right, y: bottom }, weight, style);
    if (corner === undefined) return;
    for (const [cx, cy] of [
      [x, y],
      [right, y],
      [x, bottom],
      [right, bottom],
    ] as const) {
      const s = this.slot(cx, cy);
      if (s !== undefined) s.corner = corner;
    }
  }

  /** Blanks a rectangle: what was drawn there, lines included, is gone. */
  clear({ x, y, width, height }: CellRect): void {
    for (let cy = y; cy < y + height; cy++) {
      for (let cx = x; cx < x + width; cx++) {
        if (this.slot(cx, cy) === undefined) continue;
        this.unwide(cx, cy);
        this.slots[cy]![cx] = blank();
      }
    }
  }

  /** Puts one character in a cell, over whatever was there but its ground. */
  put({ x, y }: CellPoint, ch: string, style: Style = {}): void {
    const s = this.slot(x, y);
    if (s === undefined) return;
    this.unwide(x, y);
    this.slots[y]![x] = { ch, style, mask: 0, weight: 'dashed', top: 0, ...(s.ground ? { ground: s.ground } : {}) };
  }

  /** Lays a style under a rectangle: what is drawn there, before or after, takes its
   * colours where it sets none of its own. A box's fill is its ground, which the text
   * written in it keeps. `clear` takes the ground away with the rest. */
  ground({ x, y, width, height }: CellRect, style: Style): void {
    for (let cy = y; cy < y + height; cy++) {
      for (let cx = x; cx < x + width; cx++) {
        const s = this.slot(cx, cy);
        if (s !== undefined) s.ground = style;
      }
    }
  }

  /**
   * Writes `text` from (x, y) rightwards, stopping before `maxX` (exclusive) or the
   * edge, and never splitting a wide character. A combining mark joins the cell
   * before it. Returns the cells written.
   */
  text({ x, y }: CellPoint, text: string, style: Style = {}, maxX = this.width): number {
    const limit = Math.min(maxX, this.width);
    let cx = x;
    for (const ch of text) {
      const cp = ch.codePointAt(0)!;
      // never sent to the terminal, where it would move the cursor instead of drawing
      if (isControl(cp)) continue;
      const w = charWidth(cp);
      if (w === 0) {
        const prev = this.slot(cx - 1, y);
        if (prev !== undefined && cx > x) prev.ch += ch;
        continue;
      }
      if (cx + w > limit) break;
      if (cx >= 0) {
        this.put({ x: cx, y }, ch, style);
        if (w === 2) this.put({ x: cx + 1, y }, '', style);
      }
      cx += w;
    }
    return cx - x;
  }

  /** Merges `patch` into the style of every cell in a rectangle. */
  restyle({ x, y, width, height }: CellRect, patch: Style): void {
    for (let cy = y; cy < y + height; cy++) {
      for (let cx = x; cx < x + width; cx++) {
        const s = this.slot(cx, cy);
        if (s !== undefined) s.style = { ...s.style, ...patch };
      }
    }
  }

  /** The finished picture, lines resolved with `glyphs`. */
  cells(glyphs: Glyphs): Cell[][] {
    return this.slots.map((row) =>
      row.map((s) => ({
        ch: s.mask === 0 ? s.ch : glyphs.line(s.mask, s.weight, s.corner, s.mask & ~s.top),
        style: s.ground === undefined ? s.style : { ...s.ground, ...s.style },
      })),
    );
  }

  /** Before a cell is overwritten: if it is half of a wide character, blank the other
   * half, so no orphaned half is left to shift the rest of the row. */
  private unwide(x: number, y: number): void {
    const s = this.slot(x, y);
    if (s === undefined || s.mask !== 0) return;
    if (s.ch === '') {
      const left = this.slot(x - 1, y);
      if (left !== undefined && left.mask === 0) left.ch = ' ';
      s.ch = ' ';
    } else if (this.slot(x + 1, y)?.ch === '') {
      this.slots[y]![x + 1]!.ch = ' ';
    }
  }
}
