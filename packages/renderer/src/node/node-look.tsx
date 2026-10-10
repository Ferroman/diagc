import type { CSSProperties, ReactElement } from 'react';
import { NodeResizeControl } from '@xyflow/react';
import { PLAN_LAYOUT } from '../layout/plan-layout';
import type { LoopHighlight } from '../loops/loop-highlight';
import type { NotationProfile } from '../notations';
import type { TypeStyle } from '../registry';
import { SketchShape, type SketchFill } from '../sketch/SketchShape';
import type { SketchShapeKind } from '../sketch/sketch';
import { outlineInk } from './outline-ink';
import { typeSubtitle } from './type-subtitle';
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

/** The node's icon: its own, else its type's. An untyped node has none. */
export const nodeIcon = (data: DiagramNodeData, style: TypeStyle) =>
  data.icon !== undefined
    ? data.icons.resolve(data.icon)
    : data.typeId !== undefined
      ? data.icons.resolve(style.icon ?? '')
      : undefined;

/** The metadata values a node surfaces on itself (framework, language, tool). */
export function MetaBadges({ data }: { data: DiagramNodeData }): ReactElement | null {
  return data.metaBadges !== undefined && data.metaBadges.length > 0 ? (
    <span className="dg-meta">
      {data.metaBadges.map((m) => (
        <span key={m} className="dg-meta-badge">
          {m}
        </span>
      ))}
    </span>
  ) : null;
}

/**
 * The plan's reciprocal mark, on top of the loop dim: a zone whose role chip
 * matches the selected actor gets an outline in that chip's colour (the chip
 * carries the actor's own colour already — see planChips); going the other
 * way, an actor that `related` put in a selected zone's neighbourhood gets the
 * same outline in ITS OWN colour. Neither reads the dim set directly: a
 * zone's chip is the ground truth for which actor lit it up, and an actor's
 * own accent is its own to carry. The notation says which types are actors
 * (profile.node.actorOutline).
 */
export function planHit(
  id: string,
  data: DiagramNodeData,
  profile: NotationProfile,
  highlight: LoopHighlight,
): { hitStyle: CSSProperties | undefined; hitAttrs: { 'data-plan-hit'?: true } } {
  const focusId = highlight.focusId;
  const activeChip = focusId !== null ? data.chips?.find((c) => c.refId === focusId) : undefined;
  const isPlanActorType = data.typeId !== undefined && profile.node?.actorOutline?.(data.typeId) === true;
  const hitColor =
    activeChip !== undefined
      ? (activeChip.color ?? 'var(--dg-accent)')
      : focusId !== null && isPlanActorType && id !== focusId && highlight.nodes.has(id)
        ? (data.color ?? 'var(--dg-accent)')
        : undefined;
  return {
    hitStyle: hitColor !== undefined ? ({ '--dg-hit': hitColor } as CSSProperties) : undefined,
    hitAttrs: hitColor !== undefined ? { 'data-plan-hit': true } : {},
  };
}

/** The drag-over outline (see DiagramNodeData.dropTarget / EditingApi.onDropInto). */
export const dropTargetAttrs = (data: DiagramNodeData): { 'data-drop-target'?: true } =>
  data.dropTarget === true ? { 'data-drop-target': true } : {};

/** The type's subtitle under the name (C4's `[Software System]`, a type id
 * plus the technology). An explicit empty registry label (UML glyphs)
 * suppresses it entirely. */
export function TypeSubtitle({ data, style }: { data: DiagramNodeData; style: TypeStyle }): ReactElement | null {
  const typeLabel = data.typeId !== undefined ? typeSubtitle(style.label ?? data.typeId, data.technology) : undefined;
  return typeLabel !== undefined && typeLabel !== '' ? <span className="dg-type">{typeLabel}</span> : null;
}
