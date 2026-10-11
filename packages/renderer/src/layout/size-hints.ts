import {
  DEFAULT_IMAGE_NODE_SIZE,
  runsToPlainText,
  type DiagramModel,
  type DiagramNode,
  type LayoutOverlay,
} from '@diagc/core/internal';
import { FORCED_SIZE_SHAPES } from './box-size';
import type { SizeHint } from './layout-graph';
import { CAPTION_HEIGHT, captionWidth, estimateLabelSize, glyphCaptionSize } from '../node/label-size';
import { tableSize } from '../node/table-ports';
import type { NotationProfile } from '../notations';
import type { Registry, TypeStyle } from '../registry';

export interface SizeHintContext {
  profile: NotationProfile;
  typeRegistry: Registry<TypeStyle>;
  /** the overlay's saved sizes: an explicit resize */
  sizes: LayoutOverlay['sizes'];
}

type Rule = (n: DiagramNode, ctx: SizeHintContext) => SizeHint | undefined;

/** db-table nodes: the intrinsic footprint for the header and all rows, so elk
 * lays out the full table, not a default box. Rows a column layer hides are
 * subtracted per view (withShownTableRows). */
const tableRule: Rule = (n, ctx) => {
  if (n.type !== 'db-table' || n.columns === undefined) return undefined;
  if (ctx.sizes?.[n.id] !== undefined) return undefined;
  return tableSize(n.columns, n.name);
};

/** Multiline or rich leaf box labels: an estimated footprint, so elk does not
 * overlap neighbours around a taller-than-default box. A glyph is drawn at the
 * size it is given, not around its label (a diamond, a bar, a process ellipse),
 * so a line break in its name does not resize it; image and silhouette nodes
 * are sized by their other rules. */
const labelRule: Rule = (n, ctx) => {
  if (n.image !== undefined || n.shape !== undefined) return undefined;
  if (n.type !== undefined && FORCED_SIZE_SHAPES.has(ctx.typeRegistry.resolve(n.type).shape)) return undefined;
  const plain = n.rich !== undefined ? runsToPlainText(n.rich) : n.name;
  if (n.rich === undefined && !plain.includes('\n')) return undefined; // single-line plain = default LEAF_SIZE
  if (ctx.sizes?.[n.id] !== undefined) return undefined;
  return estimateLabelSize(plain, n.fontScale);
};

/** Silhouette nodes honour their saved size like image nodes; without one they
 * take the label-based estimate. */
const shapeRule: Rule = (n, ctx) => {
  if (n.shape === undefined) return undefined;
  const s = ctx.sizes?.[n.id];
  return s !== undefined ? { width: s.w, height: s.h } : undefined;
};

/** Image nodes: their saved size, else a fixed default (the studio seeds real
 * dimensions at creation), widened to the caption. The icon letterboxes inside
 * the wider box (object-fit: contain), so this widens the footprint without
 * distorting the artwork. The caption's HEIGHT cannot be had the same way — a
 * taller box would shrink the icon — so that strip is reserved in the layout
 * only and never drawn (SizeHint.reserveBottom). A cornerBadge type draws the
 * image as container chrome and the label inside the box: nothing hangs below. */
const imageRule: Rule = (n, ctx) => {
  if (n.image === undefined) return undefined;
  if (n.type !== undefined && ctx.typeRegistry.resolve(n.type).cornerBadge === true) return undefined;
  const s = ctx.sizes?.[n.id];
  const base =
    s !== undefined
      ? { width: s.w, height: s.h }
      : { width: DEFAULT_IMAGE_NODE_SIZE.w, height: DEFAULT_IMAGE_NODE_SIZE.h };
  const caption = n.name ?? n.id;
  return {
    ...base,
    width: Math.max(base.width, captionWidth(caption)),
    reserveBottom: caption !== '' ? CAPTION_HEIGHT : undefined,
  };
};

/** A registry-declared default size (activity dots, bars, diamonds): how a
 * fixed-geometry glyph gets a real footprint from the DSL, where no palette
 * template seeded dimensions; a saved size wins. A named glyph's caption hangs
 * below it, wider than the diamond or dot it names: elk is told about it, or
 * neighbours and arrows run through it. */
const defaultSizeRule: Rule = (n, ctx) => {
  if (n.type === undefined) return undefined;
  const style = ctx.typeRegistry.resolve(n.type);
  const ds = style.defaultSize;
  if (ds === undefined) return undefined;
  const s = ctx.sizes?.[n.id];
  const name = style.captionBelow === true ? (n.name ?? '').trim() : '';
  return {
    ...(s !== undefined ? { width: s.w, height: s.h } : ds),
    caption: name !== '' ? glyphCaptionSize(name) : undefined,
  };
};

/** the notation's leaf size (a causal-loop variable drawn as text) */
const notationRule: Rule = (n, ctx) => ctx.profile.node?.leafSize?.(n);

const RULES: readonly Rule[] = [tableRule, labelRule, shapeRule, imageRule, defaultSizeRule, notationRule];

/**
 * The size elk is told for one node before its view state is known (withBoxSizes
 * lays the box estimates over these per view). The first rule that applies wins,
 * in this order: a table, a multiline label, a silhouette's saved size, an image,
 * a registry default size, the notation's leaf size. Undefined: the layout's own
 * leaf size.
 */
export function sizeHintFor(n: DiagramNode, ctx: SizeHintContext): SizeHint | undefined {
  for (const rule of RULES) {
    const hint = rule(n, ctx);
    if (hint !== undefined) return hint;
  }
  return undefined;
}

/** every node's hint, by id; a node with none is absent */
export function sizeHintsOf(model: DiagramModel, ctx: SizeHintContext): Map<string, SizeHint> {
  const hints = new Map<string, SizeHint>();
  for (const n of model.nodes) {
    const hint = sizeHintFor(n, ctx);
    if (hint !== undefined) hints.set(n.id, hint);
  }
  return hints;
}
