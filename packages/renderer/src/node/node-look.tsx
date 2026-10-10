import type { CSSProperties, ReactElement } from 'react';
import { NodeResizeControl } from '@xyflow/react';
import { PLAN_LAYOUT } from '../layout/plan-layout';
import type { NotationProfile } from '../notations';
import { SketchShape, type SketchFill } from '../sketch/SketchShape';
import type { SketchShapeKind } from '../sketch/sketch';
import { outlineInk } from './outline-ink';
import type { DiagramNodeData } from './DiagramNode';

/** accent-colored border + subtle same-color fill; undefined color = registry
 * look. --dg-node-accent-tint is a HOOK, not a theme token of its own: no
 * theme sets it globally, so it is undefined almost everywhere and the
 * literal 14% fallback — today's one shared look, unchanged in both themes —
 * is what every ordinary accented node gets. A notation opts a root INTO a
 * theme-tuned strength by setting the var on that root's own selector in
 * styles.css (today only the plan zone does, via ThemeTokens.planZoneTint);
 * this function stays ignorant of which notation, if any, did that. */
export function accentStyle(color: string | undefined): CSSProperties | undefined {
  if (color === undefined) return undefined;
  return {
    borderColor: color,
    background: `color-mix(in srgb, ${color} var(--dg-node-accent-tint, 14%), var(--dg-node-fill))`,
  };
}

const sketchKind = (shape: string): SketchShapeKind =>
  shape === 'circle' ||
  shape === 'cylinder' ||
  shape === 'hexagon' ||
  shape === 'bubble' ||
  shape === 'person' ||
  shape === 'diamond' ||
  shape === 'bar' ||
  shape === 'start-dot' ||
  shape === 'end-bullseye' ||
  shape === 'send-signal' ||
  shape === 'receive-signal' ||
  shape === 'note' ||
  shape === 'ellipse' ||
  shape === 'store'
    ? (shape as SketchShapeKind)
    : 'box';

/** Resolve a node image ref to a URL. '/library/…' refs are bundled icons: served
 * verbatim where a static server exposes them, or re-prefixed with libraryBase in
 * hosts without one (the Obsidian plugin). Other absolute refs pass through; a
 * bare content-hash ref is served from assetBase (user-uploaded assets). */
export const assetUrl = (assetBase: string | undefined, libraryBase: string | undefined, ref: string): string => {
  if (libraryBase !== undefined && ref.startsWith('/library/')) {
    return `${libraryBase}${ref.slice('/library/'.length)}`;
  }
  return ref.startsWith('/') || /^https?:/.test(ref) ? ref : `${assetBase ?? ''}${ref}`;
};

/** The node's hand-drawn outline, under a style preset with rough parameters
 * and once the node has a measured size; null otherwise. */
export const sketchOf = (
  data: DiagramNodeData,
  shape: string,
  { id, width, height }: { id: string; width?: number | undefined; height?: number | undefined },
  fill: SketchFill = 'preset',
): ReactElement | null =>
  data.stylePreset?.rough !== undefined && width !== undefined && height !== undefined && width > 0 && height > 0 ? (
    <SketchShape
      id={id}
      kind={sketchKind(shape)}
      width={width}
      height={height}
      preset={data.stylePreset}
      fill={fill}
      color={data.color === undefined ? undefined : fill === 'none' ? outlineInk(data.color) : data.color}
    />
  ) : null;

/** The notation's x-only handles (a plan zone): left and right, never a
 * corner — height is the layout's. minWidth is one day, the smallest span. */
export function XResizer({ id, data, selected }: { id: string; data: DiagramNodeData; selected: boolean | undefined }) {
  if (data.resizeAxis !== 'x' || data.onResize === undefined || selected !== true) return null;
  const onResize = data.onResize;
  const end = (_e: unknown, p: { x: number; y: number; width: number; height: number }) =>
    onResize(id, p.width, p.height, { x: p.x, y: p.y });
  return (
    <>
      <NodeResizeControl
        position="left"
        resizeDirection="horizontal"
        minWidth={PLAN_LAYOUT.DAY}
        className="dg-x-resize"
        onResizeEnd={end}
      />
      <NodeResizeControl
        position="right"
        resizeDirection="horizontal"
        minWidth={PLAN_LAYOUT.DAY}
        className="dg-x-resize"
        onResizeEnd={end}
      />
    </>
  );
}

/** A causal-loop group: a node with members on a notation that draws untyped
 * nodes as text. It has a disclosure toggle instead of fold and enter, and
 * draws only a name tag while open. */
export const isCausalGroup = (data: DiagramNodeData, profile: NotationProfile): boolean =>
  profile.node?.typelessAsText === true && data.typeId === undefined && data.state !== 'leaf';
