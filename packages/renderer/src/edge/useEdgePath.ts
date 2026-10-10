import { getBezierPath, getSmoothStepPath, getStraightPath } from '@xyflow/react';
import { useMemo } from 'react';
import type { Point } from '@diagc/core/internal';
import type { DiagramNodeData } from '../node/DiagramNode';
import { CAPTION_HEIGHT, glyphCaptionSize } from '../node/label-size';
import type { NotationProfile } from '../notations';
import { seedFrom, sketchEdge } from '../sketch/sketch';
import type { DiagramEdgeData } from './DiagramEdge';
import {
  bowPath,
  DEFAULT_CURVATURE,
  nearestOnRoute,
  roundedRoute,
  routeCurve,
  routeEndSides,
  shapeCurve,
  snapRouteEnds,
  tidyRoute,
  type BowSide,
  type EdgeCurve,
  type EdgePathParams,
  type EdgeShape,
} from './edge-geometry';
import type { EdgeAnchors, EndBox } from './useEdgeAnchors';

/** The line an edge draws, and what its labels, marks and badges are placed along. */
export interface EdgePath {
  /** the clean path: the hit area follows it */
  path: string;
  /** what is stroked: the clean path, or its rough copy under a sketch preset */
  renderPath: string;
  /** the route when one is drawn, else the floating shape */
  curve: EdgeCurve;
  /** where a bundle's joined label sits */
  label: Point;
  /** the spot elk reserved for the label (nothing else is routed through it),
   * moved onto the route as drawn; only while the route is drawn */
  labelSpot: Point | undefined;
}

export function useEdgePath(
  id: string,
  anchors: EdgeAnchors,
  data: DiagramEdgeData | undefined,
  profile: NotationProfile,
): EdgePath {
  const route = standingRoute(anchors, data);
  const { path, curve, label, labelSpot } =
    route !== undefined && data !== undefined ? routedPath(route, anchors, data) : floatingPath(anchors, data, profile);

  // Sketch theme: replace the clean path with a seeded rough stroke (stable per
  // edge id, memoized so it doesn't re-wobble each render). Label position and
  // marker still use the clean path's endpoints.
  const renderPath = useMemo(
    () => (data?.stylePreset?.rough !== undefined ? sketchEdge(path, seedFrom(id), data.stylePreset.rough) : path),
    [data?.stylePreset, path, id],
  );
  return { path, renderPath, curve, label, labelSpot };
}

// Routed: draw along the layout's waypoints (absolute flow coords, the same
// space as the floating anchors). Only while BOTH endpoints still stand where
// the layout put them — a saved position, a drag in flight, a nudge or a
// moved ancestor all leave the route pointing at where the node used to be,
// and the edge floats instead. What the author fixed by hand also floats: a
// per-relation shape, a table-row anchor, and a fixed side the route does
// not happen to use (elk knows none of these). A fixed side the route DOES honour —
// the common case, since a connect gesture fixes whatever sides faced each
// other — costs nothing, so such an edge still gets its route.
function standingRoute(anchors: EdgeAnchors, data: DiagramEdgeData | undefined): Point[] | undefined {
  const route = data?.route;
  if (data === undefined || route === undefined || route.length < 2) return undefined;
  if (data.fromColumn !== undefined || data.toColumn !== undefined) return undefined;
  const rel = data.relStyle;
  const fixedSidesHold =
    rel?.shape === undefined &&
    (rel?.fromSide === undefined || rel.fromSide === routeEndSides(route).from) &&
    (rel?.toSide === undefined || rel.toSide === routeEndSides(route).to);
  return fixedSidesHold && stands(anchors.source, data.routeFrom) && stands(anchors.target, data.routeTo)
    ? route
    : undefined;
}

const stands = (box: EndBox | undefined, at: Point | undefined): boolean =>
  box !== undefined &&
  at !== undefined &&
  Math.abs(box.node.internals.positionAbsolute.x - at.x) < 0.5 &&
  Math.abs(box.node.internals.positionAbsolute.y - at.y) < 0.5;

function routedPath(route: Point[], anchors: EdgeAnchors, data: DiagramEdgeData): Omit<EdgePath, 'renderPath'> {
  // The ends land on the boxes as DRAWN (measured), not as estimated — where
  // "the box" of a captioned icon includes the caption hanging under it: elk
  // was told about that strip (SizeHint.reserveBottom) and starts the line
  // below the text, and snapping it up to the picture would strike it through.
  const drawn = (box: EndBox | undefined) =>
    !anchors.measured || box === undefined
      ? undefined
      : { ...box.rect, height: box.rect.height + captionReserve(box.node.data as CaptionSource) };
  const pts = snapRouteEnds(tidyRoute(route), drawn(anchors.source), drawn(anchors.target));
  const curve = routeCurve(pts);
  // elk centred the label ON the route it returned; tidying and end-snapping
  // may since have slid that leg a few px, so the spot is re-seated on the
  // line as drawn — a label beside its own line reads as belonging to nothing.
  const labelSpot = data.labelSpot !== undefined ? nearestOnRoute(pts, data.labelSpot) : undefined;
  return { path: roundedRoute(pts, data.routeCorner ?? 8), curve, label: labelSpot ?? curve.point(0.5), labelSpot };
}

function floatingPath(
  anchors: EdgeAnchors,
  data: DiagramEdgeData | undefined,
  profile: NotationProfile,
): Omit<EdgePath, 'renderPath'> {
  const rel = data?.relStyle;
  const shape = rel?.shape ?? 'curved';
  const params: EdgePathParams = {
    sourceX: anchors.from.x,
    sourceY: anchors.from.y,
    targetX: anchors.to.x,
    targetY: anchors.to.y,
    sourcePosition: anchors.ends.sourcePos,
    targetPosition: anchors.ends.targetPos,
  };
  const curvature = rel?.curvature ?? profile.edgeCurvature;
  // Floating anchors route through whichever border faces the other node, so
  // xyflow's `curvature` (which only bends a handle pointing *away* from the
  // other node) is inert for facing edges — a straight line no matter the
  // curvature. Notations that want visible arcs (CLD) opt into a symmetric
  // perpendicular bow instead, computed independently of handle facing; see
  // edge-geometry.ts's `bowPath`/`bowControlPoints`.
  const bowed = profile.edge?.bowed === true && shape === 'curved';
  const bowSide: BowSide = rel?.bow ?? 'left';
  const effectiveShape: EdgeShape = bowed ? 'bow' : shape;
  const curve = shapeCurve(effectiveShape, params, curvature, bowSide);
  let path: string;
  let labelX: number;
  let labelY: number;
  if (shape === 'straight') {
    [path, labelX, labelY] = getStraightPath({
      sourceX: params.sourceX,
      sourceY: params.sourceY,
      targetX: params.targetX,
      targetY: params.targetY,
    });
  } else if (shape === 'step') {
    [path, labelX, labelY] = getSmoothStepPath(params);
  } else if (bowed) {
    const mid = curve.point(0.5);
    path = bowPath(params, curvature ?? DEFAULT_CURVATURE, bowSide);
    labelX = mid.x;
    labelY = mid.y;
  } else {
    [path, labelX, labelY] = getBezierPath({ ...params, ...(curvature !== undefined ? { curvature } : {}) });
  }
  return { path, curve, label: { x: labelX, y: labelY }, labelSpot: undefined };
}

/** what {@link captionReserve} reads of a node's data */
type CaptionSource = Pick<DiagramNodeData, 'state' | 'label' | 'image' | 'shape' | 'typeId' | 'typeRegistry'>;

/** room a node's caption takes below its drawn box: an image leaf's name hangs
 * under the picture, and so does a named activity glyph's (both mirror the hint
 * useViewLayout gives elk). A cornerBadge type draws its image as chrome and its
 * label inside the box — no caption. */
function captionReserve(d: CaptionSource): number {
  if (d.state !== 'leaf' || d.label === '') return 0;
  if (d.image === undefined && d.typeId !== undefined && d.typeRegistry.resolve(d.typeId).captionBelow === true) {
    return glyphCaptionSize(d.label).height;
  }
  if (d.image === undefined || d.shape !== undefined) return 0;
  if (d.typeId !== undefined && d.typeRegistry.resolve(d.typeId).cornerBadge === true) return 0;
  return CAPTION_HEIGHT;
}
