import type { CellPoint } from '../text/canvas';
import type { BoxGeometry } from '../text/layout';

// Moving about a picture: which box is "up" from another, which one a click hit, and
// how far to scroll to keep a box in view. Pure geometry over the layout's boxes.

export type Direction = 'up' | 'down' | 'left' | 'right';

/** The window onto the picture: its size, and the bottom-right corner of it the
 * overview covers while it is on. */
export interface View {
  width: number;
  height: number;
  corner?: { width: number; height: number };
}

/** Room kept around a box scrolled into view, in cells. */
const MARGIN = 2;

/** A box's centre, its rows counted double: a cell is about twice as tall as it is
 * wide, so a box two rows down is about as far as one four columns across. */
const centre = (b: BoxGeometry): CellPoint => ({ x: b.x + b.width / 2, y: (b.y + b.height / 2) * 2 });

/** How far `d` is along `dir` from `c`, and how far off to the side. */
function along(c: CellPoint, d: CellPoint, dir: Direction): [primary: number, secondary: number] {
  const dx = d.x - c.x;
  const dy = d.y - c.y;
  if (dir === 'up') return [-dy, dx];
  if (dir === 'down') return [dy, dx];
  if (dir === 'left') return [-dx, dy];
  return [dx, dy];
}

/** The box to go to from `from` in `dir`: of those whose centre lies that way, the
 * nearest, where being off to the side counts double. */
export function nearest(boxes: ReadonlyMap<string, BoxGeometry>, from: string, dir: Direction): string | undefined {
  const start = boxes.get(from);
  if (start === undefined) return undefined;
  const c = centre(start);
  let best: string | undefined;
  let bestScore = Infinity;
  for (const [id, box] of boxes) {
    if (id === from) continue;
    const [primary, secondary] = along(c, centre(box), dir);
    if (primary <= 0) continue;
    const score = primary + 2 * Math.abs(secondary);
    if (score < bestScore) [best, bestScore] = [id, score];
  }
  return best;
}

/** Every box, top to bottom, then left to right: the order Tab steps through. */
export function readingOrder(boxes: ReadonlyMap<string, BoxGeometry>): string[] {
  return [...boxes].sort(([, a], [, b]) => a.y - b.y || a.x - b.x).map(([id]) => id);
}

/** The box a click at (x, y) means: the smallest that holds the cell, so a click
 * inside a child picks the child, not the container around it. */
export function hitTest(boxes: ReadonlyMap<string, BoxGeometry>, x: number, y: number): string | undefined {
  let hit: string | undefined;
  let area = Infinity;
  for (const [id, b] of boxes) {
    if (x < b.x || x >= b.x + b.width || y < b.y || y >= b.y + b.height) continue;
    if (b.width * b.height < area) [hit, area] = [id, b.width * b.height];
  }
  return hit;
}

/** One axis of `follow`: the least move that shows [start, start + size) and a margin
 * within a window of `span` at `at`; the start, for something bigger than the window. */
function followAxis(at: number, start: number, size: number, span: number): number {
  const low = start - MARGIN;
  const high = start + size + MARGIN;
  if (high - low > span || low < at) return Math.max(0, low);
  if (high > at + span) return high - span;
  return at;
}

/** `scroll` moved on until `box` and its margin are clear of the view's corner: up or
 * left of it, whichever is the shorter move that keeps the box's start on screen. */
function clearCorner(scroll: CellPoint, box: BoxGeometry, view: View): CellPoint {
  if (view.corner === undefined) return scroll;
  const left = box.x + box.width + MARGIN - (scroll.x + view.width - view.corner.width);
  const up = box.y + box.height + MARGIN - (scroll.y + view.height - view.corner.height);
  if (left <= 0 || up <= 0) return scroll;
  const byX = box.x >= scroll.x + left ? left : Infinity;
  const byY = box.y >= scroll.y + up ? up : Infinity;
  if (byX === Infinity && byY === Infinity) return scroll;
  return byY <= byX ? { x: scroll.x, y: scroll.y + byY } : { x: scroll.x + byX, y: scroll.y };
}

/** The scroll that brings `box` into `view`, out from under the overview, moving as
 * little as it can. */
export function follow(scroll: CellPoint, box: BoxGeometry, view: View): CellPoint {
  const seen = {
    x: followAxis(scroll.x, box.x, box.width, view.width),
    y: followAxis(scroll.y, box.y, box.height, view.height),
  };
  return clearCorner(seen, box, view);
}

/** `scroll` kept where the view still shows content: never before the start, never so
 * far that the view is past the end, but for the overview's corner: as far past the
 * right and the bottom as that covers, so nothing has to stay under it. */
export function clampScroll(scroll: CellPoint, content: { width: number; height: number }, view: View): CellPoint {
  const clamp = (v: number, max: number): number => Math.max(0, Math.min(v, Math.max(0, max)));
  const room = view.corner ?? { width: 0, height: 0 };
  return {
    x: clamp(scroll.x, content.width + room.width - view.width),
    y: clamp(scroll.y, content.height + room.height - view.height),
  };
}
