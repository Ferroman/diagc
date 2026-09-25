import { FISHBONE_TYPES, PLAN_ZONE_TYPE, runsToPlainText, type DiagramNode, type FontScale, type ViewNode } from '@diagc/core';
import type { Registry, ShapeId, TypeStyle } from './registry';
import type { SizeHint } from './layout-graph';
import { typeSubtitle } from './type-subtitle';

/** Leaf shapes with no CSS-natural size (padding/min-width zeroed): the RF
 * wrapper must get the layout's size explicitly, like image/shape leaves.
 * The DFD pair are here for the other reason a shape belongs on this list —
 * an ellipse and a data store read as a FOOTPRINT, not as a wrapper around a
 * label: a label-hugging ellipse drawn inside the 150×90 the layout reserved
 * for it looks broken, and the two rules of a store have nothing to hug at all.
 * The registry `defaultSize` reaches elk through useViewLayout, and an overlay
 * `sizes` entry (a resize, a studio template) still wins there. */
export const FORCED_SIZE_SHAPES: ReadonlySet<string> = new Set([
  'circle',
  'diamond',
  'bar',
  'start-dot',
  'end-bullseye',
  'ellipse',
  'store',
]);
/** activity chrome renders width/height:100% of its wrapper — an EMPTY lane or
 * frame is compiled 'leaf' and would otherwise collapse to 0×0 */
export const ACTIVITY_CHROME_TYPES: ReadonlySet<string> = new Set(['activity-frame', 'activity-lane', 'activity-region']);
/** leaves a notation's own layout sizes exactly — the head spans the spine, a
 * cause is text on a line whose route ends at the text's edge: a CSS-natural
 * size a few px off would leave the line short of, or into, the text. A
 * childless `plan-zone` belongs here too: its width IS its dates,
 * `(end − start + 1) × DAY` — that span cannot round-trip through a
 * CSS-natural, label-hugging width, and the studio's resize reads the drawn
 * width back into `end`, so the wrapper must carry the layout's width exactly. */
export const LAYOUT_SIZED_TYPES: ReadonlySet<string> = new Set([...FISHBONE_TYPES, PLAN_ZONE_TYPE]);

/**
 * Deterministic (no-DOM) footprint of an ordinary box node — the branch of
 * DiagramNode that React Flow sizes from its CSS rather than from an inline
 * width/height.
 *
 * Why this exists: elk used to be told every such leaf was `LEAF_SIZE` (160x80)
 * and every folded container `COLLAPSED_SIZE` (200x88), while the DOM draws
 * 142x34 for an untyped box, 142x50 for a typed one, ~150x50 for a folded
 * container — and keeps widening past 160 with the label, because a box label
 * never wraps. Measured in headless Chrome over the published pages, that gap
 * was the single largest source of bad automatic layouts:
 *
 *  - a label longer than ~20 characters overflowed its reserved 160px and sat
 *    on top of its neighbour;
 *  - every box floated at the top of a slot more than twice its height, so
 *    rows looked twice as loose as the spacing setting said, containers carried
 *    a band of dead space along the bottom, and edges elk had centred on the
 *    slot arrived off-centre on the box.
 *
 * The constants mirror styles.css (`.dg-node`, `.dg-node-row`, `.dg-type`,
 * `.dg-meta-badge`, `.dg-count`); the per-character widths are averages for the
 * system-ui stack, rounded UP so a miss leaves a little air rather than an
 * overlap. Anything sized some other way — images, silhouettes, glyphs, tables,
 * multiline/rich labels, notation chips — has its own hint in `useViewLayout`
 * and never comes through here.
 */
export interface BoxSizeInput {
  /** the single-line plain label */
  name: string;
  fontScale?: FontScale;
  /** a leading 16px glyph on the title row: a type/explicit icon or an image thumb */
  hasIcon?: boolean;
  /** the type subtitle as drawn (registry label + technology); '' or absent = no row */
  subtitle?: string;
  metaBadges?: readonly string[];
  shape?: ShapeId;
  /** C4 outline boxes carry a 2px border */
  outline?: boolean;
  /** set for a folded container: its hidden-descendant count, drawn as a badge
   * beside the fold/pin chrome */
  collapsedCount?: number;
}

// .dg-node: `min-width: 120px` on the content box, `padding: 8px 10px`, and a
// 1.5px border that rasterizes to 1px at the 1x the layout is computed in.
const MIN_CONTENT_WIDTH = 120;
const PAD_X = 20;
const PAD_Y = 16;
const BORDER = 2;
const PILL_EXTRA_PAD_X = 12; // .dg-shape-pill: padding 8px 16px
const SIGNAL_EXTRA_PAD_X = 10; // send/receive-signal: one side padded to 20px
const PERSON_HEAD = 14; // .dg-shape-person: margin-top 14px, inside the RF wrapper

// title row: 600-weight label; the row is as tall as its 16px icon, or the line
const LABEL: Record<FontScale, { px: number; line: number }> = {
  sm: { px: 9, line: 16 },
  md: { px: 12, line: 16 },
  lg: { px: 20, line: 26 },
};
const ICON = 16;
const ROW_GAP = 6;

// second row: `.dg-type` (10px) followed inline by the `.dg-meta` badges (9px)
const SECOND_ROW = 16;
const TYPE_PX = 10;
const META_PX = 9;
const META_PAD = 10;
const META_GAP = 4;

// folded container: `.dg-count` badge, then the enter + pin buttons
const COUNT_PAD = 12;
const COUNT_CHAR = 6;
const FOLD_CHROME = 26;

// Advance widths in 1/1000 em, measured in headless Chrome for the 600-weight
// system-ui face the labels are set in. A flat per-character average was off by
// 15% on the labels that matter most — 'PaymentGateway' (capitals, m, w) came out
// 14px narrower than drawn, and a box wider than elk was told overlaps whatever
// elk put beside it, or pokes through its container's wall. Lighter text (the
// 10px subtitle) is a few percent narrower than this, which errs on the safe
// side: an over-estimate is drawn exactly (the box is floored at it), only an
// under-estimate shows.
const ADVANCE: Record<string, number> = {};
const advances = (chars: string, em: number): void => {
  for (const c of chars) ADVANCE[c] = em;
};
advances(" ", 260);
advances("ijl.,:;'!|", 300);
advances('Jf()[]-"I', 385);
advances('rt/_?', 440);
advances('cszE', 510);
advances('F*LSZTkvxy0123456789+=<>~$', 575);
advances('abdegopqPRYV#KXBA', 640);
advances('hnuC&', 665);
advances('DGHNOQU', 770);
advances('w@', 880);
advances('mMW', 975);
const DEFAULT_ADVANCE = 640; // anything else Latin-ish
const WIDE_ADVANCE = 1000; // CJK and other full-width scripts

/** the drawn width of one line of text at `px`, without a DOM */
export function textWidth(text: string, px: number): number {
  let em = 0;
  for (const c of text) em += ADVANCE[c] ?? ((c.codePointAt(0) ?? 0) >= 0x2e80 ? WIDE_ADVANCE : DEFAULT_ADVANCE);
  return (em / 1000) * px;
}

export function estimateBoxSize(input: BoxSizeInput): { width: number; height: number } {
  const label = LABEL[input.fontScale ?? 'md'];
  // the row is a flex line with a 6px gap, and always ends in the (possibly
  // empty) badges span — so one gap trails the label even on a bare box
  let title = textWidth(input.name, label.px) + ROW_GAP;
  if (input.hasIcon === true) title += ICON + ROW_GAP;
  if (input.collapsedCount !== undefined) {
    title += ROW_GAP + COUNT_PAD + String(input.collapsedCount).length * COUNT_CHAR + ROW_GAP + FOLD_CHROME;
  }

  const subtitle = input.subtitle ?? '';
  const badges = input.metaBadges ?? [];
  const hasSecondRow = subtitle !== '' || badges.length > 0;
  const second =
    textWidth(subtitle, TYPE_PX) +
    badges.reduce((w, b) => w + textWidth(b, META_PX) + META_PAD, 0) +
    Math.max(0, badges.length - 1) * META_GAP;

  const extraPad =
    input.shape === 'pill'
      ? PILL_EXTRA_PAD_X
      : input.shape === 'send-signal' || input.shape === 'receive-signal'
        ? SIGNAL_EXTRA_PAD_X
        : 0;
  const border = input.outline === true ? BORDER + 2 : BORDER;

  return {
    width: Math.ceil(Math.max(MIN_CONTENT_WIDTH, title, second)) + PAD_X + extraPad + border,
    height:
      PAD_Y + border + label.line + (hasSecondRow ? SECOND_ROW : 0) + (input.shape === 'person' ? PERSON_HEAD : 0),
  };
}

type Size = { width: number; height: number };

export interface BoxSizeContext {
  typeRegistry: Registry<TypeStyle>;
  /** the metadata keys drawn as badges on the node (DiagramView's `onNodeMetaKeys`) */
  metaKeys: readonly string[];
  /** hidden-descendant count per folded container — the number in its badge */
  hiddenCounts: ReadonlyMap<string, number>;
  /** the notation's own leaf footprint (a CLD text chip); a folded typeless
   * node is drawn as the same chip, so it takes the same size */
  leafSize?: (n: DiagramNode) => Size | undefined;
}

function boxInputOf(n: ViewNode, ctx: BoxSizeContext): BoxSizeInput {
  const node = n.node;
  const style = node.type !== undefined ? ctx.typeRegistry.resolve(node.type) : undefined;
  // a folded container draws its label on one row whatever the leaf would do;
  // reserve the longest line of a multiline/rich name
  const plain = node.rich !== undefined ? runsToPlainText(node.rich) : node.name;
  const name = plain.split('\n').reduce((longest, l) => (l.length > longest.length ? l : longest), '');
  const metaBadges = ctx.metaKeys
    .map((k) => node.metadata?.[k])
    .filter((v): v is NonNullable<typeof v> => v !== undefined && v !== null)
    .map(String);
  return {
    name,
    ...(node.fontScale !== undefined ? { fontScale: node.fontScale } : {}),
    hasIcon: node.icon !== undefined || style?.icon !== undefined || node.image !== undefined,
    subtitle: node.type !== undefined ? typeSubtitle(style?.label ?? node.type, node.technology) : '',
    metaBadges,
    ...(style !== undefined ? { shape: style.shape } : {}),
    ...(style?.outline === true ? { outline: true } : {}),
  };
}

/**
 * `hints` plus a box estimate for every node in the view that is drawn as an
 * ordinary CSS-sized box. State-aware, which the model-keyed hints cannot be:
 *
 *  - a FOLDED container is a box whatever its leaf form would be (an image
 *    container folds to a titled box with a thumb), so its estimate replaces any
 *    leaf hint;
 *  - an UNFOLDED one gets nothing — elk sizes it from its children;
 *  - a leaf is estimated only when nothing else sized it and the view does not
 *    force-size it (glyphs, activity chrome, silhouettes without a stored size
 *    all take the layout's size inline, so `LEAF_SIZE` IS their drawn size).
 */
export function withBoxSizes(
  roots: readonly ViewNode[],
  hints: ReadonlyMap<string, SizeHint>,
  ctx: BoxSizeContext,
): Map<string, SizeHint> {
  const out = new Map(hints);
  const walk = (n: ViewNode): void => {
    if (n.state === 'expanded') {
      n.children.forEach(walk);
      return;
    }
    if (n.state === 'collapsed') {
      out.set(
        n.id,
        (n.node.type === undefined ? ctx.leafSize?.(n.node) : undefined) ??
          estimateBoxSize({ ...boxInputOf(n, ctx), collapsedCount: ctx.hiddenCounts.get(n.id) ?? 0 }),
      );
      return;
    }
    if (n.node.shape !== undefined) return;
    const style = n.node.type !== undefined ? ctx.typeRegistry.resolve(n.node.type) : undefined;
    if (n.node.type !== undefined && ACTIVITY_CHROME_TYPES.has(n.node.type)) return;
    if (style !== undefined && FORCED_SIZE_SHAPES.has(style.shape)) return;
    const hinted = out.get(n.id);
    if (hinted === undefined) {
      out.set(n.id, estimateBoxSize(boxInputOf(n, ctx)));
      return;
    }
    // A registry default size on a CSS-sized box (a send/receive signal, a note)
    // is a FLOOR, not a size: the label never wraps, so a long one still widens
    // the box past it — and then sticks out through the wall of whatever elk
    // sized around the default.
    if (style?.defaultSize !== undefined && n.node.image === undefined) {
      const width = estimateBoxSize(boxInputOf(n, ctx)).width;
      if (width > hinted.width) out.set(n.id, { ...hinted, width });
    }
  };
  roots.forEach(walk);
  return out;
}
