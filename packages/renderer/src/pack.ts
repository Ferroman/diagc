/**
 * Pack independent boxes — the connected components of one layout level — toward
 * a target aspect ratio. Look-alike boxes (same height: loose leaves, icons)
 * become a true grid in input order; a mixed bag is shelf-packed tallest first.
 *
 * Why we do this ourselves: elk's layered algorithm packs connected components
 * only on a graph it lays out level by level. Under `INCLUDE_CHILDREN` (which
 * every nested diagram needs, so an edge can see through a container wall) that
 * step is skipped outright, and everything with no incoming edge lands in the
 * first layer: a dozen unrelated boxes become one column a dozen boxes tall.
 * `elk.aspectRatio` is equally inert there. So the components are laid out one
 * by one and arranged here (see `layout-plan.ts` for who counts as independent).
 *
 * Pure and deterministic: the same boxes always pack the same way.
 */
export interface BoxSize {
  width: number;
  height: number;
}

export interface PackedBox extends BoxSize {
  x: number;
  y: number;
}

export interface Packing {
  /** one entry per input box, in INPUT order */
  boxes: PackedBox[];
  width: number;
  height: number;
}

/** A page's worth, portrait. Diagrams flow down by default (see core's
 * defaultLayoutDirection) for the reason that applies here too: they end up in
 * documents, where height scrolls and width gets shrunk to fit. */
export const DEFAULT_PACK_ASPECT = 0.75;

// A grid of look-alike boxes whose last row is short reads as an accident; a
// slightly worse aspect with full rows reads as a list or a table. The penalty
// is in the same unit as the score (|ln| of the aspect miss): 0.35 is about a
// 40% miss, enough to keep 3 boxes a column and 5 boxes a 2-wide grid.
const RAGGED_PENALTY = 0.35;
// "Look-alike" is about HEIGHT: a row of icons or of one-line boxes reads as a
// set whatever their widths (a caption or a long label widens one of them).
const UNIFORM_TOLERANCE = 1.25;

interface Attempt extends Packing {
  score: number;
}

function place(sizes: readonly BoxSize[], order: readonly number[], gap: number, limit: number): Packing {
  const boxes = new Array<PackedBox>(sizes.length);
  let y = 0;
  let rowHeight = 0;
  let width = 0;
  // the column being filled: short boxes stack under each other beside a tall
  // neighbour instead of each claiming the full row height
  let col: { x: number; width: number; used: number } | undefined;
  for (const i of order) {
    const b = sizes[i]!;
    if (col !== undefined && b.width <= col.width && col.used + gap + b.height <= rowHeight) {
      boxes[i] = { x: col.x, y: y + col.used + gap, ...b };
      col.used += gap + b.height;
      continue;
    }
    let x = col === undefined ? 0 : col.x + col.width + gap;
    if (col !== undefined && x + b.width > limit) {
      y += rowHeight + gap;
      rowHeight = 0;
      x = 0;
    }
    boxes[i] = { x, y, ...b };
    col = { x, width: b.width, used: b.height };
    rowHeight = Math.max(rowHeight, b.height);
    width = Math.max(width, x + b.width);
  }
  return { boxes, width, height: y + rowHeight };
}

/** Look-alike boxes as a true grid of `cols` columns, filled row by row in input
 * order: each column as wide as its widest member with the boxes centred in it
 * (so icons widened by their captions still line up), each row as tall as its
 * tallest. */
function grid(sizes: readonly BoxSize[], gap: number, cols: number): Packing {
  const colWidth = Array.from({ length: cols }, (_, c) =>
    Math.max(...sizes.filter((_, i) => i % cols === c).map((s) => s.width)),
  );
  const colX = colWidth.map((_, c) => colWidth.slice(0, c).reduce((x, w) => x + w + gap, 0));
  const boxes: PackedBox[] = [];
  let y = 0;
  for (let row = 0; row * cols < sizes.length; row++) {
    const members = sizes.slice(row * cols, (row + 1) * cols);
    members.forEach((b, c) => boxes.push({ x: colX[c]! + (colWidth[c]! - b.width) / 2, y, ...b }));
    y += Math.max(...members.map((b) => b.height)) + gap;
  }
  return { boxes, width: colX[cols - 1]! + colWidth[cols - 1]!, height: y - gap };
}

export function packBoxes(sizes: readonly BoxSize[], opts: { gap: number; aspect?: number }): Packing {
  if (sizes.length === 0) return { boxes: [], width: 0, height: 0 };
  const aspect = opts.aspect ?? DEFAULT_PACK_ASPECT;
  const score = (p: BoxSize) => Math.abs(Math.log(p.width / p.height / aspect));

  const tallest = Math.max(...sizes.map((s) => s.height));
  if (tallest <= Math.min(...sizes.map((s) => s.height)) * UNIFORM_TOLERANCE) {
    let best: Attempt | undefined;
    for (let cols = 1; cols <= sizes.length; cols++) {
      const p = grid(sizes, opts.gap, cols);
      const s = score(p) + (sizes.length % cols !== 0 ? RAGGED_PENALTY : 0);
      if (best === undefined || s < best.score - 1e-9) best = { ...p, score: s };
    }
    return { boxes: best!.boxes, width: best!.width, height: best!.height };
  }

  // Tallest first, so the first box of a shelf sets its height and everything
  // after it fits under that line; stable, so equal boxes keep their input
  // (model) order and a grid of them fills row by row as authored.
  const order = sizes.map((_, i) => i).sort((a, b) => sizes[b]!.height - sizes[a]!.height || a - b);

  const widths = sizes.map((s) => s.width);

  // Candidate shelf widths: every prefix of the ordered boxes laid side by
  // side. Nothing in between can change where a box wraps.
  const widest = Math.max(...widths);
  const limits = new Set<number>();
  let run = 0;
  for (const i of order) {
    run += (run === 0 ? 0 : opts.gap) + sizes[i]!.width;
    limits.add(Math.max(run, widest));
  }

  let best: Attempt | undefined;
  for (const limit of limits) {
    const p = place(sizes, order, opts.gap, limit);
    const s = score(p);
    const better =
      best === undefined ||
      s < best.score - 1e-9 ||
      (Math.abs(s - best.score) <= 1e-9 && p.width * p.height < best.width * best.height);
    if (better) best = { boxes: p.boxes, width: p.width, height: p.height, score: s };
  }
  return { boxes: best!.boxes, width: best!.width, height: best!.height };
}
