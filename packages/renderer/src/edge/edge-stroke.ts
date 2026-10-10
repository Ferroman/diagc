import type { CSSProperties } from 'react';
import type { RelationStyle } from '@diagc/core/internal';
import type { NotationProfile } from '../notations';
import type { KindStyle } from '../registry';
import type { DiagramEdgeData } from './DiagramEdge';
import { END_SHAPES, type EdgeMarker } from './EdgeMarkerDefs';

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
    dashArray: dashArrayOf(line, strokeWidth, animated),
    ...markersOf(id, rel?.end ?? kind.endMarker ?? 'arrow', kind.startMarker),
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

function dashArrayOf(line: EdgeStroke['line'], strokeWidth: number, animated: boolean): string | undefined {
  return line === 'dashed'
    ? '6 4'
    : line === 'dotted'
      ? `0.1 ${Math.max(5, strokeWidth * 3)}`
      : animated
        ? '6 4'
        : undefined;
}

function markersOf(id: string, end: string, start: string | undefined): Pick<EdgeStroke, 'end' | 'start'> {
  // svg ids must be unique per document; edge ids contain '=>' etc., so sanitize
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '_');
  const endShape = END_SHAPES[end];
  const startShape = start !== undefined ? END_SHAPES[start] : undefined;
  return {
    end: endShape !== undefined ? { id: `dg-end-${safeId}`, style: end, shape: endShape } : undefined,
    start:
      start !== undefined && startShape !== undefined
        ? { id: `dg-start-${safeId}`, style: start, shape: startShape }
        : undefined,
  };
}
