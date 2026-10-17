import {
  fishboneTree,
  type CompiledView,
  type DiagramModel,
  type FishboneCategory,
  type ViewNode,
} from '@diagc/core/internal';
import type { CellPoint } from './canvas';
import type { BoxText } from './content';
import type { BoxGeometry, FishDrawing, Route, TextLayout } from './layout';
import { cellWidth, printable } from './width';

// A fishbone in cells, as the page draws it (the renderer's fishbone-layout.ts): the
// spine across with the head boxed at its right end, the categories alternately above
// and below it in relation order, two to a column from left to right, each on a bone
// slanting in to the spine. A slant is one cell a row, and a cell is about twice as
// tall as it is wide, so it comes out near the page's sixty degrees. A bone's causes
// hang on lines that end at it, the first nearest its label, and their sub-causes sit
// past those lines on ticks. What is not on the fish goes in a row of boxes under it.

/** The fish's spacing, in cells. */
export const FISH = {
  /** the shortest bone, in rows */
  BONE_MIN: 2,
  /** the shortest line from a cause's words to its bone */
  LINE_MIN: 2,
  /** from where a cause's line meets its bone to where its first sub-cause's tick
   * does: far enough that the tick does not read as a second bone */
  SUB_INSET: 4,
  /** between a sub-cause's words and the tick of the next one along */
  SUB_GAP: 2,
  /** between a column's bones and the next column's words, and before the head */
  COLUMN_GAP: 3,
  /** between the fish and the row under it of what is not on it */
  STRAY_ROW: 2,
  /** between two boxes in that row */
  STRAY_GAP: 4,
} as const;

/** A point on one side of the spine before it is placed: `x` from where the bone meets
 * the spine (so zero or less), `h` the rows out from the spine. */
interface SidePoint {
  x: number;
  h: number;
}

interface Side {
  category: string;
  above: boolean;
  /** the bone's length, in rows; its label is the row past it */
  height: number;
  words: Map<string, (SidePoint & { text: string })[]>;
  links: { from: string; to: string; points: SidePoint[] }[];
  /** the side's reach from where its bone meets the spine, leftwards and rightwards */
  left: number;
  right: number;
}

interface Fish {
  model: DiagramModel;
  boxes: ReadonlyMap<string, BoxText>;
  shown: ReadonlySet<string>;
}

/** A name on one line: what a category's label and a sub-cause's words are. */
const oneLine = (fish: Fish, id: string): string =>
  printable(
    fish.model.nodes
      .find((n) => n.id === id)!
      .name.split(/\r?\n/)
      .join(' '),
  );

/** A cause's words, wrapped as its box would wrap them. */
const linesOf = (fish: Fish, id: string): string[] =>
  fish.boxes.get(id)?.lines.map((l) => l.text) ?? [oneLine(fish, id)];

/**
 * One category's side of the spine: the causes from the spine outwards, the last one
 * nearest it, a blank row between, then the bone up past the outermost words and its
 * label. A cause's words end a space before its line, right-aligned when they wrap,
 * and hang from the line towards the spine. Its sub-causes go leftwards along the row
 * past the line, from near the bone, each on a tick that meets the line.
 */
function sideOf(fish: Fish, category: FishboneCategory, above: boolean): Side {
  const words: Side['words'] = new Map();
  const links: Side['links'] = [];
  const causes = category.causes.filter((c) => fish.shown.has(c.id));
  let start = FISH.BONE_MIN;
  let top = 0;
  for (const cause of [...causes].reverse()) {
    // Hung towards the spine, the words leave the row past the line to the sub-causes,
    // each on a tick of one cell, crossing nothing. There they may reach out over the
    // cause's words, which keeps the line short: it need only reach the ticks.
    const lines = linesOf(fish, cause.id);
    const h = start + lines.length - 1;
    const bone = -h;
    let land = bone - FISH.SUB_INSET;
    let line = bone - FISH.LINE_MIN;
    const subs = cause.subs.filter((s) => fish.shown.has(s));
    for (const sub of subs) {
      const text = oneLine(fish, sub);
      const tick = land - 1;
      const begin = tick - 1 - cellWidth(text);
      words.set(sub, [{ x: begin, h: h + 1, text }]);
      links.push({
        from: sub,
        to: cause.id,
        points: [
          { x: tick, h: h + 1 },
          { x: land, h },
        ],
      });
      line = Math.min(line, land);
      land = begin - FISH.SUB_GAP;
    }
    links.push({
      from: cause.id,
      to: category.id,
      points: [
        { x: line, h },
        { x: bone - 1, h },
      ],
    });
    const k = lines.length;
    words.set(
      cause.id,
      lines.map((text, i) => ({ x: line - 1 - cellWidth(text), h: above ? h - i : h - (k - 1 - i), text })),
    );
    top = h + (subs.length > 0 ? 1 : 0);
    start = top + 2;
  }
  const height = Math.max(FISH.BONE_MIN, top);
  const label = oneLine(fish, category.id);
  const labelX = -(height + 1) - Math.floor(cellWidth(label) / 2);
  words.set(category.id, [{ x: labelX, h: height + 1, text: label }]);
  const starts = [...words.values()].flat().map((w) => w.x);
  return {
    category: category.id,
    above,
    height,
    words,
    links,
    left: -Math.min(...starts),
    right: Math.max(0, labelX + cellWidth(label) - 1),
  };
}

const extent = (lines: readonly (CellPoint & { text: string })[]): BoxGeometry => {
  const x = Math.min(...lines.map((l) => l.x));
  const y = Math.min(...lines.map((l) => l.y));
  return {
    x,
    y,
    width: Math.max(...lines.map((l) => l.x + cellWidth(l.text))) - x,
    height: Math.max(...lines.map((l) => l.y)) - y + 1,
  };
};

/** Every node the view shows, parents before children. */
function shownNodes(view: CompiledView): ViewNode[] {
  const out: ViewNode[] = [];
  const walk = (vn: ViewNode): void => {
    out.push(vn);
    vn.children.forEach(walk);
  };
  view.roots.forEach(walk);
  return out;
}

/** What is not on the fish, boxed in a row from the left at `y`. */
function placeStrays(nodes: readonly ViewNode[], fish: Fish, y: number, boxes: Map<string, BoxGeometry>): void {
  let x = 0;
  for (const vn of nodes) {
    if (boxes.has(vn.id)) continue;
    const text = fish.boxes.get(vn.id);
    const [width, height] = [text?.width ?? 5, text?.height ?? 3];
    boxes.set(vn.id, { x, y, width, height });
    x += width + FISH.STRAY_GAP;
  }
}

/** The picture's size: every box and every route; the spine runs inside them. */
function measure(boxes: ReadonlyMap<string, BoxGeometry>, routes: ReadonlyMap<string, Route>): [number, number] {
  let [width, height] = [0, 0];
  for (const b of boxes.values()) [width, height] = [Math.max(width, b.x + b.width), Math.max(height, b.y + b.height)];
  for (const r of routes.values()) {
    for (const p of r.points) [width, height] = [Math.max(width, p.x + 1), Math.max(height, p.y + 1)];
  }
  return [width, height];
}

/**
 * The fish in cells, for a fishbone plane: every node the view shows gets a box, the
 * words' cells for one on the fish, and every drawn relation on the fish a route. A
 * view without its effect has no fish, only the row of boxes.
 */
export function fishCells(model: DiagramModel, view: CompiledView, boxes: ReadonlyMap<string, BoxText>): TextLayout {
  const nodes = shownNodes(view);
  const fish: Fish = { model, boxes, shown: new Set(nodes.map((n) => n.id)) };
  const tree = fishboneTree(model);
  const effect = tree.effect !== undefined && fish.shown.has(tree.effect) ? tree.effect : undefined;
  const placed = new Map<string, BoxGeometry>();
  const routes = new Map<string, Route>();
  if (effect === undefined) {
    placeStrays(nodes, fish, 0, placed);
    const [width, height] = measure(placed, routes);
    return { width, height, boxes: placed, routes };
  }
  const sides = tree.categories.filter((c) => fish.shown.has(c.id)).map((c, i) => sideOf(fish, c, i % 2 === 0));
  const head = boxes.get(effect)!;
  const reach = (above: boolean): number =>
    Math.max(0, ...sides.filter((s) => s.above === above).map((s) => s.height + 1));
  const spine = Math.max(reach(true), Math.floor(head.height / 2));
  const bottom = spine + Math.max(reach(false), head.height - 1 - Math.floor(head.height / 2));
  const edgeOf = new Map(view.edges.map((e) => [`${e.from} ${e.to}`, e.id]));
  const words: FishDrawing['words'] = new Map();
  let left = 0;
  for (let c = 0; c < sides.length; c += 2) {
    const column = sides.slice(c, c + 2);
    const join = left + Math.max(...column.map((s) => s.left));
    for (const side of column) {
      const at = (p: SidePoint): CellPoint => ({ x: join + p.x, y: side.above ? spine - p.h : spine + p.h });
      for (const [id, lines] of side.words) {
        const placedLines = lines.map((l) => ({ ...at(l), text: l.text }));
        words.set(id, placedLines);
        placed.set(id, extent(placedLines));
      }
      const bone = {
        from: side.category,
        to: effect,
        points: [
          { x: -side.height, h: side.height },
          { x: 0, h: 0 },
        ],
      };
      for (const link of [...side.links, bone]) {
        const id = edgeOf.get(`${link.from} ${link.to}`);
        if (id !== undefined) routes.set(id, { points: link.points.map(at) });
      }
    }
    left = join + Math.max(...column.map((s) => s.right)) + 1 + FISH.COLUMN_GAP;
  }
  // with no bones yet the head still ends a spine, a stub of one
  const headX = sides.length === 0 ? FISH.COLUMN_GAP + 1 : left;
  placed.set(effect, { x: headX, y: spine - Math.floor(head.height / 2), width: head.width, height: head.height });
  placeStrays(nodes, fish, bottom + 1 + FISH.STRAY_ROW, placed);
  const [width, height] = measure(placed, routes);
  const labels = new Set(sides.map((s) => s.category));
  return {
    width,
    height,
    boxes: placed,
    routes,
    fish: { spine: { y: spine, from: 0, to: headX }, head: effect, words, labels },
  };
}
