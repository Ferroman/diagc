import type { CSSProperties } from 'react';
import type { RelationStyle } from '@diagc/core/internal';
import type { NotationProfile } from '../notations';
import type { KindStyle } from '../registry';
import type { DiagramEdgeData } from './DiagramEdge';
import type { EdgeLook } from '../sketch/stylePresets';
import { END_SHAPES, OPEN_ARROW, type EdgeMarker } from './EdgeMarkerDefs';

/** How an edge's line is drawn, and the markers on its ends. */
export interface EdgeStroke {
  /** the kind's registry style (its zigzag is drawn as a mark) */
  kind: KindStyle;
  stroke: string;
  strokeWidth: number;
  line: NonNullable<RelationStyle['line']>;
  animated: boolean;
  dashArray: string | undefined;
  /** the notation's colour for the link's sign, where it colours links by sign */
  polarityColor: string | undefined;
  end: EdgeMarker | undefined;
  start: EdgeMarker | undefined;
  /** markers grow with the stroke */
  markerSize: number;
}

export function edgeStroke(id: string, data: DiagramEdgeData | undefined, profile: NotationProfile): EdgeStroke {
  const rel = data?.relStyle;
  const kind: KindStyle = data?.kindRegistry.resolve(data.kind) ?? {};
  const strokeWidth = rel?.width ?? kind.width ?? 1.5;
  const line = rel?.line ?? (kind.dashed === true ? 'dashed' : 'solid');
  const animated = rel?.animated ?? kind.animated === true;
  return {
    kind,
    ...colourOf(data, profile),
    strokeWidth,
    line,
    animated,
    dashArray: dashArrayOf(line, strokeWidth, animated, data?.edgeLook?.dash),
    ...markersOf(
      id,
      { end: rel?.end ?? kind.endMarker ?? 'arrow', start: kind.startMarker },
      data?.edgeLook?.openArrow,
    ),
    markerSize: 10 + strokeWidth * 2,
  };
}

/** The style the line is stroked with; its key order is the order of the drawn `style` attribute. */
export function strokeStyle(look: EdgeStroke): CSSProperties {
  return {
    stroke: look.stroke,
    strokeWidth: look.strokeWidth,
    ...(look.dashArray !== undefined ? { strokeDasharray: look.dashArray } : {}),
    ...(look.line === 'dotted' ? { strokeLinecap: 'round' as const } : {}),
    ...(look.animated ? { animation: 'dg-flow 0.7s linear infinite' } : {}),
  };
}

// Precedence: per-relation override > layer tint > notation colour > notation
// polarity > kind registry > defaults. The notation colour (e.g. a git link's
// lane) sits below the tint for the same reason polarity does — an explicit
// authored grouping should never go inert because a notation also wants a say.
function colourOf(
  data: DiagramEdgeData | undefined,
  profile: NotationProfile,
): Pick<EdgeStroke, 'stroke' | 'polarityColor'> {
  const polarityColor = data?.polarity !== undefined ? profile.edge?.polarityColors?.[data.polarity] : undefined;
  const stroke = data?.relStyle?.color ?? data?.tint ?? data?.notationColor ?? polarityColor ?? 'var(--dg-edge)';
  return { stroke, polarityColor };
}

/** A preset's dashes stand in for solid and dashed lines only: a dotted line is
 * already a row of dots, and an animated one marches on its own dash. */
function dashArrayOf(
  line: EdgeStroke['line'],
  strokeWidth: number,
  animated: boolean,
  dash: EdgeLook['dash'],
): string | undefined {
  return line === 'dashed'
    ? (dash?.dashed ?? '6 4')
    : line === 'dotted'
      ? `0.1 ${Math.max(5, strokeWidth * 3)}`
      : animated
        ? '6 4'
        : dash?.solid;
}

function markersOf(
  id: string,
  ends: { end: string; start: string | undefined },
  openArrow: boolean | undefined,
): Pick<EdgeStroke, 'end' | 'start'> {
  // svg ids must be unique per document; edge ids contain '=>' etc., so sanitize
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '_');
  return {
    end: markerOf(`dg-end-${safeId}`, ends.end, openArrow),
    start: markerOf(`dg-start-${safeId}`, ends.start, openArrow),
  };
}

/** One end's marker: its style's shape, the default arrow drawn open where the preset asks. */
function markerOf(id: string, style: string | undefined, openArrow: boolean | undefined): EdgeMarker | undefined {
  if (style === undefined) return undefined;
  if (style === 'arrow' && openArrow === true) return { id, style: 'open-arrow', shape: OPEN_ARROW };
  const shape = END_SHAPES[style];
  return shape !== undefined ? { id, style, shape } : undefined;
}
