import {
  FB_CATEGORY_TYPE,
  FB_CAUSE_TYPE,
  FB_EFFECT_TYPE,
  LEAF_SIZE,
  fishboneTree,
  type CompiledView,
  type DiagramModel,
  type FishboneCategory,
  type FishboneTree,
  type ViewEdge,
  type ViewNode,
} from '@diagramming/core';
import { textWidth } from './box-size';
import { LANE_PALETTE } from './git-layout';
import type { EdgePoint, LayoutResult, NodeGeometry } from './layout';

/** Flow-pixel constants of the fish. Tuned against real renders; tests derive
 * their expectations from these, never from literals. */
export const FISHBONE_LAYOUT = {
  /** horizontal run per unit of vertical drop of a bone (tan 30°: a 60° bone) */
  BONE_K: 0.577,
  /** pitch between two bare cause lines. Keeps ROW − TEXT_H/2 ≥ HEAD_H/2: the
   * innermost cause text's spine-facing edge must clear the head node's own
   * half-height band around the spine, or the two overlap and click/selection
   * targeting on that strip depends on node paint order. */
  ROW: 36,
  /** height of a cause / sub-cause text node (styles.css `.dg-fb-cause`) */
  TEXT_H: 22,
  /** horizontal padding inside a text node (styles.css `.dg-fb-cause`) */
  TEXT_PAD: 6,
  /** the size the text is measured at — must match `.dg-fb-cause`'s font. The
   * cause text itself draws at weight 400 while `textWidth`'s advances are
   * calibrated for 600, so the measure is a slight over-estimate — the line
   * starts a few px right of the last glyph, never through it. */
  FONT_PX: 12,
  /** vertical rise of a sub-cause tick off its cause line */
  SUB_RISE: 22,
  /** gap between neighbouring sub-cause texts along a line */
  SUB_GAP: 12,
  /** the first tick foot's distance from the bone */
  SUB_INSET: 18,
  /** shortest cause line */
  MIN_LINE: 40,
  /** category box */
  LABEL_W: 132,
  LABEL_H: 36,
  /** the effect node's height (the head box fills it) */
  HEAD_H: 48,
  HEAD_MIN_W: 140,
  HEAD_PAD: 16,
  /** the size the effect name is measured at — must match `.dg-fb-head-box`'s
   * font (`font: 600 14px/1.2`). `textWidth`'s per-character advances are
   * already calibrated for that 600-weight face, so no extra weight allowance
   * is needed here beyond using this larger size. */
  HEAD_FONT_PX: 14,
  /** spine past the last column before the head box */
  HEAD_GAP: 32,
  MARGIN: 24,
  COLUMN_GAP: 48,
} as const;

/** Bone colours by column, for categories that set none. The git lane palette:
 * both are "one hue per band of a notation" and the eye should meet the same
 * set across the tool. */
export const BONE_PALETTE = LANE_PALETTE;

// fishboneTree is cheap but asked by the layout, both colour hooks and the
// studio on every render; one derivation per model object keeps the answers
// identical and the work single. Plane-independent (the tree reads relations).
const treeCache = new WeakMap<DiagramModel, FishboneTree>();
function fishboneTreeCached(model: DiagramModel): FishboneTree {
  let t = treeCache.get(model);
  if (t === undefined) {
    t = fishboneTree(model);
    treeCache.set(model, t);
  }
  return t;
}

const colorCache = new WeakMap<FishboneTree, Map<string, string>>();

/** category id → its bone colour, and each of its causes and sub-causes → the
 * same (their lines and ticks are drawn in it). Own `color`, else the model's
 * `typeColors` for `fb-category`, else the palette by COLUMN — a column's two
 * categories meet the spine at one point and read as one rib. */
export function fishboneNodeColors(model: DiagramModel): ReadonlyMap<string, string> {
  const t = fishboneTreeCached(model);
  const hit = colorCache.get(t);
  if (hit !== undefined) return hit;
  const byType = model.typeColors?.[FB_CATEGORY_TYPE] ?? model.typeColors?.['*'];
  const own = new Map(model.nodes.map((n) => [n.id, n.color]));
  const colors = new Map<string, string>();
  t.categories.forEach((cat, i) => {
    const c = own.get(cat.id) ?? byType ?? BONE_PALETTE[Math.floor(i / 2) % BONE_PALETTE.length]!;
    colors.set(cat.id, c);
    for (const cause of cat.causes) {
      colors.set(cause.id, c);
      for (const s of cause.subs) colors.set(s, c);
    }
  });
  colorCache.set(t, colors);
  return colors;
}

/** a bone, a cause line or a tick takes the colour of the node it starts from */
export function fishboneEdgeColor(e: ViewEdge, model: DiagramModel): string | undefined {
  return fishboneNodeColors(model).get(e.from);
}

/** a point or a box on one side of the spine, before mirroring: `x` is
 * relative to the side's spine join, `h` is the distance from the spine */
interface SidePoint {
  x: number;
  h: number;
}
interface SideText {
  id: string;
  x: number;
  hLo: number;
  width: number;
  height: number;
}
interface Side {
  above: boolean;
  /** spine → the category box's spine-facing edge */
  height: number;
  texts: SideText[];
  /** child end first, parent (arrowhead) end last */
  links: { from: string; to: string; a: SidePoint; b: SidePoint }[];
  /** reach left of the join (negative) and right of it (≥ 0) */
  left: number;
  right: number;
}

/**
 * The fish: the effect spans the spine with its head at the right end,
 * categories alternate above / below in relation order and pair into columns
 * left to right, causes stack down each bone on horizontal lines, sub-causes
 * sit on ticks along those lines. Pure and synchronous; it replaces elk for a
 * fishbone plane (see NotationProfile.layout). Everything is a root, so the
 * parent-relative geometry elk output would carry is absolute here; routes are
 * absolute like elk's.
 */
export function fishboneLayout(
  view: CompiledView,
  model: DiagramModel,
  _plane: string | undefined,
  sizeHints?: ReadonlyMap<string, { width: number; height: number }>,
): LayoutResult {
  const { BONE_K, ROW, TEXT_H, TEXT_PAD, FONT_PX, HEAD_FONT_PX, SUB_RISE, SUB_GAP, SUB_INSET, MIN_LINE, LABEL_W, LABEL_H, HEAD_H, HEAD_MIN_W, HEAD_PAD, HEAD_GAP, MARGIN, COLUMN_GAP } =
    FISHBONE_LAYOUT;
  const tree = fishboneTreeCached(model);
  const geometry = new Map<string, NodeGeometry>();
  const routes = new Map<string, EdgePoint[]>();
  const nameOf = new Map(model.nodes.map((n) => [n.id, n.name]));
  const measure = (id: string): number => Math.ceil(textWidth(nameOf.get(id) ?? '', FONT_PX));
  const textW = (id: string): number => measure(id) + 2 * TEXT_PAD;

  // Only what the view shows is placed: a layer-hidden node is absent, and elk
  // output follows the same rule. A hidden category takes its causes off the
  // fish with it (they land in the stray row below).
  const shown = new Set<string>();
  const walk = (n: ViewNode): void => {
    shown.add(n.id);
    n.children.forEach(walk);
  };
  view.roots.forEach(walk);

  // A link's route is keyed by the view edge that draws it — the first edge
  // between the pair, as the tree took the first relation. Hidden-layer links
  // included, as elk does: toggling a layer must not move anything.
  const edgeIds = new Map<string, string>();
  for (const e of view.layoutEdges) {
    const key = `${e.from} ${e.to}`;
    if (!edgeIds.has(key)) edgeIds.set(key, e.id);
  }

  const effect = tree.effect !== undefined && shown.has(tree.effect) ? tree.effect : undefined;

  const side = (cat: FishboneCategory, above: boolean): Side => {
    const causes = cat.causes.filter((c) => shown.has(c.id)).map((c) => ({ id: c.id, subs: c.subs.filter((s) => shown.has(s)) }));
    // One text row per cause; a cause with sub-causes also needs the row above
    // its line for their texts, plus the ticks' rise. A final ROW keeps the
    // lowest line off the spine; a bare bone is still two rows long.
    const pitch = (c: { subs: string[] }): number => ROW + (c.subs.length > 0 ? SUB_RISE + TEXT_H : 0);
    const height = Math.max(2 * ROW, causes.reduce((sum, c) => sum + pitch(c), 0) + ROW);
    const labelX = -BONE_K * height;
    const texts: SideText[] = [{ id: cat.id, x: labelX - LABEL_W / 2, hLo: height, width: LABEL_W, height: LABEL_H }];
    const links: Side['links'] = [];
    if (effect !== undefined) links.push({ from: cat.id, to: effect, a: { x: labelX, h: height }, b: { x: 0, h: 0 } });
    let h = height;
    for (const c of causes) {
      h -= pitch(c);
      const bx = -BONE_K * h; // where the bone passes at this height
      // The line is as long as its sub-cause texts need — each sits left of its
      // tick head, the heads themselves sit BONE_K·SUB_RISE left of their feet.
      const subSpan = c.subs.reduce((sum, s) => sum + textW(s) + SUB_GAP, 0);
      const line = c.subs.length === 0 ? MIN_LINE : Math.max(MIN_LINE, SUB_INSET + subSpan + BONE_K * SUB_RISE);
      const width = textW(c.id);
      texts.push({ id: c.id, x: bx - line - width, hLo: h - TEXT_H / 2, width, height: TEXT_H });
      links.push({ from: c.id, to: cat.id, a: { x: bx - line, h }, b: { x: bx, h } });
      let foot = bx - SUB_INSET;
      for (const s of c.subs) {
        const subWidth = textW(s);
        const head: SidePoint = { x: foot - BONE_K * SUB_RISE, h: h + SUB_RISE };
        texts.push({ id: s, x: head.x - subWidth, hLo: head.h, width: subWidth, height: TEXT_H });
        links.push({ from: s, to: c.id, a: head, b: { x: foot, h } });
        foot -= subWidth + SUB_GAP;
      }
    }
    return {
      above,
      height,
      texts,
      links,
      left: Math.min(...texts.map((t) => t.x)),
      // a short bone's box reaches right past its own join
      right: Math.max(0, labelX + LABEL_W / 2),
    };
  };

  const sides = effect === undefined ? [] : tree.categories.filter((c) => shown.has(c.id)).map((c, i) => side(c, i % 2 === 0));
  const columns: Side[][] = [];
  sides.forEach((s, i) => {
    const col = columns[Math.floor(i / 2)];
    if (col === undefined) columns.push([s]);
    else col.push(s);
  });
  const tallest = (above: boolean): number => sides.filter((s) => s.above === above).reduce((max, s) => Math.max(max, s.height), 0);
  const topH = tallest(true);
  const bottomH = tallest(false);
  // No top side: the head alone decides where the spine runs.
  const spineY = MARGIN + (topH > 0 ? LABEL_H + topH : HEAD_H / 2);
  const bottom = spineY + (bottomH > 0 ? bottomH + LABEL_H : HEAD_H / 2);

  let columnLeft: number = MARGIN;
  let lastRight: number = MARGIN;
  for (const col of columns) {
    const join = columnLeft + Math.max(...col.map((s) => -s.left));
    const right = join + Math.max(...col.map((s) => s.right));
    for (const s of col) {
      const at = (p: SidePoint): EdgePoint => ({ x: join + p.x, y: s.above ? spineY - p.h : spineY + p.h });
      for (const t of s.texts) {
        geometry.set(t.id, { x: join + t.x, y: s.above ? spineY - t.hLo - t.height : spineY + t.hLo, width: t.width, height: t.height });
      }
      for (const l of s.links) {
        const id = edgeIds.get(`${l.from} ${l.to}`);
        if (id !== undefined) routes.set(id, [at(l.a), at(l.b)]);
      }
    }
    columnLeft = right + COLUMN_GAP;
    lastRight = right;
  }
  if (effect !== undefined) {
    // The head box is its own font size (HEAD_FONT_PX, 14px), not a cause's
    // (FONT_PX, 12px) — measuring it at the wrong size under-estimates the box
    // and the CSS-drawn head (flex: none; white-space: nowrap) then steals the
    // difference from the spine, eventually crossing back over the last column.
    const headW = Math.max(HEAD_MIN_W, Math.ceil(textWidth(nameOf.get(effect) ?? '', HEAD_FONT_PX)) + 2 * HEAD_PAD);
    geometry.set(effect, { x: MARGIN, y: spineY - HEAD_H / 2, width: lastRight + HEAD_GAP + headW - MARGIN, height: HEAD_H });
  }
  // Everything placed so far is ON the fish, and stays where the fish puts it
  // (see LayoutResult.fixed). Taken before the spare row: a stray has no line
  // to break, so it may be moved aside like any other box.
  const fixed = new Set(geometry.keys());

  // Spare row: everything the view shows that is not on the fish — a cause
  // nothing hangs on yet, a second effect, a comment — packed left to right so
  // an in-progress edit never throws and nothing vanishes.
  const rowY = (effect !== undefined ? bottom : 0) + MARGIN;
  let cursor: number = MARGIN;
  const straySize = (n: ViewNode): { width: number; height: number } =>
    sizeHints?.get(n.id) ??
    (n.node.type === FB_CAUSE_TYPE
      ? { width: textW(n.id), height: TEXT_H }
      : n.node.type === FB_CATEGORY_TYPE
        ? { width: LABEL_W, height: LABEL_H }
        : n.node.type === FB_EFFECT_TYPE
          ? { width: HEAD_GAP + HEAD_MIN_W, height: HEAD_H }
          : LEAF_SIZE);
  const placeLoose = (n: ViewNode): void => {
    if (!geometry.has(n.id)) {
      const size = straySize(n);
      geometry.set(n.id, { x: cursor, y: rowY, width: size.width, height: size.height });
      cursor += size.width + COLUMN_GAP;
    }
    n.children.forEach(placeLoose);
  };
  view.roots.forEach(placeLoose);

  return { geometry, routes, labelSpots: new Map(), algorithm: 'fishbone', fixed };
}
