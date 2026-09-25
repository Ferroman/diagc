import type { ThreatStatus } from '@diagc/core';
import type { NodeGeometry } from './layout';

export type Rect = NodeGeometry;

/** the bubble's width, in flow px. One constant, applied by NoteNode as an
 * inline style, so the placement and the box agree on how wide "the bubble"
 * is; the stylesheet sets no width. Lives here, not in NoteNode.tsx, because
 * the height estimate below needs it and NoteNode imports this module. */
export const NOTE_WIDTH = 220;

/** the status word a row shows; `n/a` because the full form would wrap the
 * row. Here beside the height estimate, which needs the word's width. */
export const STATUS_WORD: Record<ThreatStatus, string> = {
  open: 'open',
  mitigated: 'mitigated',
  accepted: 'accepted',
  'not-applicable': 'n/a',
};
export interface Point {
  x: number;
  y: number;
}

/** how the badge sits on an element — the three placements styles.css gives
 * `.dg-threat-badge`, mirrored here because the bubble has to know where its
 * tail is going before anything is measured */
export type BadgeKind = 'box' | 'ellipse' | 'group';

/** the counting badge is an 18px pill; its centre is what the tail points at */
export const BADGE_R = 9;
/** clearance between a bubble and the element (or pill) it hangs off */
export const NOTE_GAP = 14;
/** how far a bubble's edge reaches past the badge, so the tail base lands on
 * the bubble's side next to the badge rather than at a corner */
const TAIL_ROOM = 24;
/** a candidate spot farther than this from the badge (edge to centre) is "too
 * far": covering something nearby beats a clear spot the eye has to hunt for */
const NEAR = 240;
/** how far a taken spot is pushed outward, step by step, before the next
 * spot is tried at all — a bubble 40px further out still reads as beside its
 * element, where one on the far side of it may not */
const SLIDES = [0, 20, 40, 60, 80, 100, 120];
/** a flow's line as an obstacle: a dot this big at each sampled point — the
 * only shape an axis-aligned obstacle list can give a line at any angle */
const LINE_DOT = 8;
/** a container's header band — the title row a bubble must not sit on */
const GROUP_HEADER = 28;
/** a container's border, as a strip a bubble must not straddle */
const GROUP_BORDER = 2;

/**
 * Where the counting badge's centre is on an element's box (parent-relative
 * in, same space out). The offsets are the stylesheet's: `top/left: -6px` for
 * an 18px pill on a box; `top: 8px; left: 16px` on an ellipse, whose corner is
 * outside the curve; `top: 4px; right: 48px` in a group's header band, left of
 * the fold chips.
 */
export function badgeCenter(rect: Rect, kind: BadgeKind): Point {
  switch (kind) {
    case 'ellipse':
      return { x: rect.x + 16 + BADGE_R, y: rect.y + 8 + BADGE_R };
    case 'group':
      return { x: rect.x + rect.width - 48 - BADGE_R, y: rect.y + 4 + BADGE_R };
    default:
      return { x: rect.x - 6 + BADGE_R, y: rect.y - 6 + BADGE_R };
  }
}

/**
 * The rectangles a bubble must keep off. A leaf (or a folded container) is its
 * whole box. An expanded container is transparent inside — that is where its
 * members' bubbles belong — so only its header band and its four border strips
 * count, which also steers a bubble to sit wholly inside or wholly outside
 * rather than across the line.
 */
export function obstaclesOf(elements: readonly { rect: Rect; kind: 'box' | 'group' }[]): Rect[] {
  const out: Rect[] = [];
  for (const { rect, kind } of elements) {
    if (kind === 'box') {
      out.push(rect);
      continue;
    }
    const { x, y, width, height } = rect;
    out.push({ x, y, width, height: GROUP_HEADER });
    out.push({ x, y: y + height - GROUP_BORDER, width, height: GROUP_BORDER });
    out.push({ x, y, width: GROUP_BORDER, height });
    out.push({ x: x + width - GROUP_BORDER, y, width: GROUP_BORDER, height });
  }
  return out;
}

/**
 * A flow's routed line as obstacles: one small square per sampled point (the
 * edge samples its own curve — see DiagramEdge). A bubble is far wider than
 * the sampling step, so one that lay across the line would always cover a dot.
 */
export function lineObstacles(line: readonly Point[]): Rect[] {
  return line.map((p) => ({ x: p.x - LINE_DOT / 2, y: p.y - LINE_DOT / 2, width: LINE_DOT, height: LINE_DOT }));
}

const overlapArea = (a: Rect, b: Rect): number => {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
};

/** distance from a point to the nearest point of a rect (0 inside) */
const distanceTo = (p: Point, r: Rect): number => {
  const dx = Math.max(r.x - p.x, 0, p.x - (r.x + r.width));
  const dy = Math.max(r.y - p.y, 0, p.y - (r.y + r.height));
  return Math.hypot(dx, dy);
};

/**
 * Where a bubble opens: the first free spot next to its badge, in a fixed
 * order — above-left of the badge (the comic default), above-right, then to
 * the left and right of the element with the bubble's top near the badge,
 * then below, then left/right with its bottom near the badge — each spot
 * slid outward in steps (SLIDES) until it clears. "Free" means it covers no
 * obstacle. When nothing near is free, the least-covering near spot wins: a
 * bubble that hides part of a neighbour is still read next to the element it
 * is about, and one sent off to open space is not.
 *
 * `element` is the box the badge sits on (its bounding box for an ellipse),
 * or null for a flow's chip, which has no box beyond its own pill. `away`,
 * when given, is the unit direction the chip was pushed off its line: every
 * spot on that side is tried, at every slide, before any on the other, so a
 * flow's bubble keeps to its chip's side of the line — and off the labels
 * that sit on the line — whenever it can (the line itself is among the
 * obstacles, see lineObstacles). All coordinates share one space — the caller
 * decides which. Deterministic and pure: run in model order with earlier
 * bubbles among the obstacles, two open bubbles never stack.
 */
export function placeNote(
  badge: Point,
  element: Rect | null,
  size: { width: number; height: number },
  obstacles: readonly Rect[],
  away?: Point,
): Point {
  const e = element ?? { x: badge.x - BADGE_R, y: badge.y - BADGE_R, width: 2 * BADGE_R, height: 2 * BADGE_R };
  const { width: w, height: h } = size;
  const above = e.y - NOTE_GAP - h;
  const below = e.y + e.height + NOTE_GAP;
  const left = e.x - NOTE_GAP - w;
  const right = e.x + e.width + NOTE_GAP;
  const up = { x: 0, y: -1 };
  const down = { x: 0, y: 1 };
  const toLeft = { x: -1, y: 0 };
  const toRight = { x: 1, y: 0 };
  /** each spot and the direction it slides outward */
  const spots: { at: Point; out: Point }[] = [
    { at: { x: badge.x + TAIL_ROOM - w, y: above }, out: up },
    { at: { x: badge.x - TAIL_ROOM, y: above }, out: up },
    { at: { x: left, y: badge.y - TAIL_ROOM }, out: toLeft },
    { at: { x: right, y: badge.y - TAIL_ROOM }, out: toRight },
    { at: { x: badge.x + TAIL_ROOM - w, y: below }, out: down },
    { at: { x: badge.x - TAIL_ROOM, y: below }, out: down },
    { at: { x: left, y: badge.y + TAIL_ROOM - h }, out: toLeft },
    { at: { x: right, y: badge.y + TAIL_ROOM - h }, out: toRight },
  ];
  let groups: (typeof spots)[] = [spots];
  if (away !== undefined) {
    // how far a spot's centre lies along `away`: its side of the line
    const along = (s: { at: Point }) => (s.at.x + w / 2 - badge.x) * away.x + (s.at.y + h / 2 - badge.y) * away.y;
    groups = [spots.filter((s) => along(s) > 0), spots.filter((s) => along(s) <= 0)];
  }
  let best: Point | undefined;
  let bestCover = Infinity;
  for (const group of groups)
    for (const slide of SLIDES)
      for (const s of group) {
        const c = { x: s.at.x + s.out.x * slide, y: s.at.y + s.out.y * slide };
        const rect = { ...c, width: w, height: h };
        if (distanceTo(badge, rect) > NEAR) continue;
        let cover = 0;
        for (const o of obstacles) cover += overlapArea(rect, o);
        if (cover === 0) return c;
        if (cover < bestCover) {
          best = c;
          bestCover = cover;
        }
      }
  return best ?? spots[0]!.at;
}

/** the bubble's padding, top and bottom (see .dg-note) */
const PAD = 16;
/** the bubble's padding, left and right (see .dg-note) */
const PAD_X = 10;
/** one line of 12px text at line-height 1.35 */
const LINE = 16;
/** the header's margin below it */
const HEAD_GAP = 6;
/** a row's padding and the rule above it */
const ROW_PAD = 5;
/** the `+` row edit mode appends */
const ADD_ROW = 24;
/** an average glyph of the 12px body text, and of the 10px semibold status word */
const CHAR = 6.2;
const STATUS_CHAR = 5.6;
/** the header's name column: the padding, the gap and the `n / n` count */
const NAME_WIDTH = NOTE_WIDTH - 20 - 8 - 30;
/** what a row spends before its title: the padding, the STRIDE chip and the two gaps */
const ROW_FIXED = 20 + 15 + 6 + 6;
/** the status chip's padding and border around its word */
const STATUS_PAD = 12;
/** the ▸ button and its gap — every row in edit mode, rows with details otherwise */
const EXPAND = 16 + 6;
/** a section's border gap plus its title line (see .dg-note-section / -title) */
const SECTION = 6 + 6 + 14;
/** a comment's `by · at` line, below its text (see .dg-note-meta) */
const META = 13;

/**
 * A bubble's height before it is measured, from the text it will show — what
 * the placement collides with. An estimate on purpose: the real height arrives
 * a frame later and changes when a row's details open, and a placement that
 * followed it would jump under the pointer. Wrapping is guessed from glyph
 * averages at the stylesheet's sizes, per row, since the status word and the
 * details button take a share of the title's column; expanded details are not
 * counted.
 */
export function estimateNoteHeight(
  name: string,
  threats: readonly { title: string; status?: ThreatStatus; description?: string; mitigation?: string }[],
  editing: boolean,
  comments: readonly { text: string; by?: string; at?: string }[] = [],
  links: readonly { label: string }[] = [],
): number {
  const lines = (text: string, width: number, glyph: number) => Math.max(1, Math.ceil((text.length * glyph) / width));
  let height = PAD + lines(name, NAME_WIDTH, CHAR) * LINE + HEAD_GAP;
  for (const t of threats) {
    const word = STATUS_WORD[t.status ?? 'open'];
    const expand = editing || (t.description ?? '') !== '' || (t.mitigation ?? '') !== '';
    const width = NOTE_WIDTH - ROW_FIXED - (STATUS_PAD + word.length * STATUS_CHAR) - (expand ? EXPAND : 0);
    height += lines(t.title, width, CHAR) * LINE + ROW_PAD;
  }
  // A section is a title line plus its items; a comment's `by · at` is one
  // more small line. Text wraps across the bubble's full inner width.
  if (comments.length > 0) {
    height += SECTION;
    for (const c of comments) height += lines(c.text, NOTE_WIDTH - 2 * PAD_X, CHAR) * LINE + (c.by !== undefined || c.at !== undefined ? META : 0) + ROW_PAD;
  }
  if (links.length > 0) height += SECTION + links.length * (LINE + ROW_PAD);
  if (editing) height += ADD_ROW;
  return height;
}
