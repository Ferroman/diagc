import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
  useInternalNode,
  useReactFlow,
  type EdgeProps,
} from '@xyflow/react';
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  type Column,
  type EdgeLabel,
  type EdgeLabelSide,
  type NotationId,
  type Point,
  type Polarity,
  type RelationStyle,
  type Side,
} from '@diagc/core/internal';
import { commentBadgeProps, type AnnotationCounts } from '../notes/comment-badge';
import {
  bowPath,
  DEFAULT_CURVATURE,
  markFrame,
  nearestOnCurve,
  nearestOnRoute,
  roundedRoute,
  routeCurve,
  routeEndSides,
  shapeCurve,
  snapRouteEnds,
  tidyRoute,
  type BowSide,
  type EdgeCurve,
  type EdgeShape,
  type MarkFrame,
} from './edge-geometry';
import { EdgeMarkerDefs } from './EdgeMarkerDefs';
import { EdgeMarks } from './EdgeMarks';
import { edgeStroke, strokeStyle } from './edge-stroke';
import { FixedSideDots } from './FixedSideDots';
import { getEdgeParams } from './floating';
import { CAPTION_HEIGHT, glyphCaptionSize } from '../node/label-size';
import { LoopHighlightContext } from '../loops/loop-highlight';
import { NoteStateContext } from '../notes/note-state';
import { AddThreatButton, NoteBadge } from '../notes/NoteBadge';
import { notationProfile } from '../notations';
import type { DiagramNodeData } from '../node/DiagramNode';
import type { KindStyle, Registry } from '../registry';
import { seedFrom, sketchEdge } from '../sketch/sketch';
import { anchorToRow } from '../node/table-ports';
import type { StylePreset } from '../sketch/stylePresets';
import { threatBadgeProps } from '../notes/threat-badge';

export interface DiagramEdgeData {
  // --- rendering: kind, marks, route -------------------------------------
  kind: string;
  label?: string;
  /** positioned labels (sole-relation edges); replaces the single `label` for those */
  labels?: EdgeLabel[];
  tint?: string;
  /** notation-resolved stroke (e.g. a git link's lane colour) */
  notationColor?: string;
  /** per-relation overrides (single-constituent edges only) */
  relStyle?: RelationStyle;
  constituentCount: number;
  kindRegistry: Registry<KindStyle>;
  /** style preset with rough params — roughen the stroke (absent = crisp) */
  stylePreset?: StylePreset;
  /** active visual language (e.g. 'causal-loop'); selects the notation profile (see notations.ts) that drives notation-specific rendering (CLD marks/text nodes) */
  notation?: NotationId;
  /** causal-loop-diagram polarity of the sole constituent; drives the +/− mark rendered beside the edge when the notation profile enables marks */
  polarity?: Polarity;
  /** causal-loop-diagram delay marker of the sole constituent; drives the hash-mark rendered on the edge when the notation profile enables marks */
  delay?: boolean;
  /** open/total STRIDE threats on the element; absent when it carries none
   * (summed over every constituent — see buildEdgeData) */
  threats?: { open: number; total: number };
  /** comment/link counts on the element; absent when it carries neither
   * (summed over every constituent — see buildEdgeData) */
  annotations?: AnnotationCounts;
  /** FK column on the source table — anchors the source end to that row (db-table) */
  fromColumn?: string;
  /** referenced column on the target table — anchors the target end to that row */
  toColumn?: string;
  /** the layout's absolute waypoints for this edge (elk's, or a notation's own).
   * Drawn instead of the floating shape — but only while both endpoints still
   * stand where the layout put them (`routeFrom`/`routeTo`): a route is what
   * keeps the line off the boxes elk steered it around, and a stale one is
   * worse than none. */
  route?: Point[];
  /** corner radius the route is drawn with (soft for curved planes, tight for orthogonal) */
  routeCorner?: number;
  /** where the layout put the source / target (absolute top-left) */
  routeFrom?: Point;
  routeTo?: Point;
  /** the spot (centre) elk reserved for this edge's label; used while the route
   * stands and the label has not been placed by hand */
  labelSpot?: Point;
  // --- edit callbacks (sole-relation edges, edit mode) --------------------
  /** edit mode, sole-relation edges only: labels can be added (double-click the
   * edge), edited (double-click a label), and slid along/across the edge
   * (drag a label). Gates every label interaction below. */
  editableLabels?: boolean;
  /** commit a new label placed by double-clicking the edge hit-path */
  onAddLabel?: (text: string, t: number, side: EdgeLabelSide) => void;
  /** edit: a double-click landed on this edge (flow coords) — open the add-label
   * editor here; the renderer projects the point and clears via onPendingAddConsumed.
   * DiagramView correlates the double-click to a preceding edge click, because the
   * native dblclick never lands on the edge itself (the first click remounts the
   * edges layer, so the second click falls through to the pane). */
  pendingAdd?: Point;
  onPendingAddConsumed?: () => void;
  /** commit an edited label; empty text signals removal to the host */
  onEditLabel?: (labelId: string, text: string) => void;
  /** commit a dragged label's new position (parameter `t` + perpendicular side) */
  onMoveLabel?: (labelId: string, t: number, side: EdgeLabelSide) => void;
  /** view mode: labels slide along the edge while Alt is held (the modifier
   * that unlocks dragging there); add/edit stay edit-mode only */
  movableLabels?: boolean;
  /** edit mode, sole-relation edges only: fix or free an endpoint's side. The renderer
   * knows the live facing side, so it passes the side to freeze at (or null to
   * re-float). */
  onSetSide?: (end: 'from' | 'to', side: Side | null) => void;
  /** this edge is the active fixed-side target — show its fixed-side dots.
   * Driven by DiagramView's relation-keyed selection (not React Flow's edge
   * `selected`, whose id changes when a side is fixed or freed). */
  fixedSideDotsShown?: boolean;
  /** edit mode, sole-relation edges only: open a new threat row on this flow's
   * note (see EditingApi.onAddThreat). buildEdgeData has already bound the
   * relation, so the badge calls it with nothing. */
  onAddThreat?: () => void;
  /** the sole relation this edge draws, when it draws exactly one — what the
   * counting badge toggles the note of. A bundle names none: its threats
   * belong to particular relations and no note exists for the bundle. */
  threatRelation?: string;
}

type Props = Pick<
  EdgeProps,
  'id' | 'source' | 'target' | 'sourceX' | 'sourceY' | 'targetX' | 'targetY' | 'sourcePosition' | 'targetPosition'
> & { data?: DiagramEdgeData };

/** how far the threat badge sits off the path, along the normal (px) */
const THREAT_OFFSET = 10;
/** how many segments a threat-carrying flow's line is sampled into for the
 * notes' placement — a note is far wider than one step, so it cannot lie
 * across the line between two samples */
const LINE_SAMPLES = 24;
/** perpendicular offset for top/bottom positioned labels (px) */
const LABEL_OFFSET = 14;

/** signed perpendicular distance (px) beyond which a projected point counts as
 * top/bottom rather than a centered label */
const SIDE_THRESHOLD = 8;
/** pointer travel (px) before a label press becomes a drag (below it stays a
 * click, preserving double-click-to-edit) */
const DRAG_THRESHOLD = 3;

/** room a node's caption takes below its drawn box: an image leaf's name hangs
 * under the picture, and so does a named activity glyph's (both mirror the hint
 * useViewLayout gives elk). A cornerBadge type draws its image as chrome and its
 * label inside the box — no caption. */
function captionReserve(d: DiagramNodeData | undefined): number {
  if (d === undefined || d.state !== 'leaf' || d.label === '') return 0;
  if (d.image === undefined && d.typeId !== undefined && d.typeRegistry.resolve(d.typeId).captionBelow === true) {
    return glyphCaptionSize(d.label).height;
  }
  if (d.image === undefined || d.shape !== undefined) return 0;
  if (d.typeId !== undefined && d.typeRegistry.resolve(d.typeId).cornerBadge === true) return 0;
  return CAPTION_HEIGHT;
}

/** which side of the line a signed perpendicular distance lands on */
function sideFromPerp(perp: number): EdgeLabelSide {
  return perp > SIDE_THRESHOLD ? 'top' : perp < -SIDE_THRESHOLD ? 'bottom' : 'center';
}

/** rendered position of a label at (t, side): the point on the edge plus the
 * top/bottom perpendicular offset — mirrors how labels are drawn, so the
 * inline editor and the drag ghost sit exactly where the label will land. */
function labelXY(curve: EdgeCurve, t: number, side: EdgeLabelSide): Point {
  const lp = curve.point(t);
  if (side !== 'top' && side !== 'bottom') return lp;
  const tan = curve.tangent(t);
  let nx = -tan.y;
  let ny = tan.x;
  if (ny > 0) {
    nx = -nx;
    ny = -ny;
  }
  const s = side === 'top' ? 1 : -1;
  return { x: lp.x + s * LABEL_OFFSET * nx, y: lp.y + s * LABEL_OFFSET * ny };
}

/** Where a badge sits: its frame's point, pushed off the line along the normal.
 * One helper for both badges (threat at t = 0.75, comment at t = 0.25), because
 * the reported note anchor is read back off whichever of the two is drawing —
 * two copies of this sum could disagree and hang a note off nothing. */
export const badgePosition = (f: MarkFrame): Point => ({
  x: f.point.x + f.normal.x * THREAT_OFFSET,
  y: f.point.y + f.normal.y * THREAT_OFFSET,
});

export function DiagramEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: Props) {
  // Floating anchors: route through the border points facing the other node
  // (any side), like a whiteboard tool. Until both nodes are measured (first
  // frame, jsdom) fall back to the handle-based coordinates React Flow passed.
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  const rf = useReactFlow();
  // Local label-interaction state (edit mode only). `edit.labelId === null` is a
  // brand-new label being placed at the double-clicked point; a non-null id
  // edits that label in place. `drag` holds the live ghost position while a
  // label is being slid; `dragRef` tracks the press so a click/double-click
  // below the threshold never registers as a drag.
  const [edit, setEdit] = useState<{
    labelId: string | null;
    t: number;
    side: EdgeLabelSide;
    x: number;
    y: number;
  } | null>(null);
  const [drag, setDrag] = useState<{ labelId: string; x: number; y: number } | null>(null);
  const dragRef = useRef<{ labelId: string; startX: number; startY: number; moved: boolean } | null>(null);
  const measured = (sourceNode?.measured?.width ?? 0) > 0 && (targetNode?.measured?.width ?? 0) > 0;
  const rel = data?.relStyle;
  const p =
    measured && sourceNode !== undefined && targetNode !== undefined
      ? getEdgeParams(sourceNode, targetNode, { sourceSide: rel?.fromSide, targetSide: rel?.toSide })
      : { sx: sourceX, sy: sourceY, tx: targetX, ty: targetY, sourcePos: sourcePosition, targetPos: targetPosition };

  // Row-port anchoring: for FK edges into/out of db-table nodes, hold the y of
  // each endpoint to the referenced column's row (x stays on the facing
  // left/right border — anchorToRow is a no-op for top/bottom faces or an
  // unknown column, so non-table endpoints float exactly as before).
  const srcRect =
    sourceNode !== undefined
      ? {
          x: sourceNode.internals.positionAbsolute.x,
          y: sourceNode.internals.positionAbsolute.y,
          width: sourceNode.measured?.width ?? 0,
          height: sourceNode.measured?.height ?? 0,
          columns: (sourceNode.data as { columns?: Column[] }).columns,
        }
      : undefined;
  const tgtRect =
    targetNode !== undefined
      ? {
          x: targetNode.internals.positionAbsolute.x,
          y: targetNode.internals.positionAbsolute.y,
          width: targetNode.measured?.width ?? 0,
          height: targetNode.measured?.height ?? 0,
          columns: (targetNode.data as { columns?: Column[] }).columns,
        }
      : undefined;
  let sx = p.sx,
    sy = p.sy,
    tx = p.tx,
    ty = p.ty;
  if (measured && data?.fromColumn !== undefined && srcRect?.columns !== undefined) {
    const a = anchorToRow({ x: p.sx, y: p.sy, pos: p.sourcePos }, srcRect, data.fromColumn);
    sx = a.x;
    sy = a.y;
  }
  const tgtCol = data?.toColumn ?? tgtRect?.columns?.find((c) => c.pk === true)?.name;
  if (
    measured &&
    tgtCol !== undefined &&
    tgtRect?.columns !== undefined &&
    (data?.fromColumn !== undefined || data?.toColumn !== undefined)
  ) {
    const a = anchorToRow({ x: p.tx, y: p.ty, pos: p.targetPos }, tgtRect, tgtCol);
    tx = a.x;
    ty = a.y;
  }

  const shape = rel?.shape ?? 'curved';
  const pathParams = {
    sourceX: sx,
    sourceY: sy,
    targetX: tx,
    targetY: ty,
    sourcePosition: p.sourcePos,
    targetPosition: p.targetPos,
  };
  const profile = notationProfile(data?.notation);
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
  // Routed: draw along the layout's waypoints (absolute flow coords, the same
  // space as the floating anchors). Only while BOTH endpoints still stand where
  // the layout put them — a saved position, a drag in flight, a nudge or a
  // moved ancestor all leave the route pointing at where the node used to be,
  // and the edge floats instead. What the author fixed by hand also floats: a
  // per-relation shape, a table-row anchor, and a fixed side the route does
  // not happen to use (elk knows none of these). A fixed side the route DOES honour —
  // the common case, since a connect gesture fixes whatever sides faced each
  // other — costs nothing, so such an edge still gets its route.
  const stands = (n: typeof sourceNode, at: Point | undefined): boolean =>
    n !== undefined &&
    at !== undefined &&
    Math.abs(n.internals.positionAbsolute.x - at.x) < 0.5 &&
    Math.abs(n.internals.positionAbsolute.y - at.y) < 0.5;
  const useRoute =
    data?.route !== undefined &&
    data.route.length >= 2 &&
    rel?.shape === undefined &&
    (rel?.fromSide === undefined || rel.fromSide === routeEndSides(data.route).from) &&
    (rel?.toSide === undefined || rel.toSide === routeEndSides(data.route).to) &&
    data.fromColumn === undefined &&
    data.toColumn === undefined &&
    stands(sourceNode, data.routeFrom) &&
    stands(targetNode, data.routeTo);
  let path: string;
  let labelX: number;
  let labelY: number;
  // What labels and marks are placed ALONG: the route when one is drawn, else
  // the floating shape.
  let curve: EdgeCurve = shapeCurve(effectiveShape, pathParams, curvature, bowSide);
  // elk reserved a spot for the label — nothing else is routed through it
  let labelSpot: Point | undefined;
  if (useRoute && data?.route !== undefined) {
    // The ends land on the boxes as DRAWN (measured), not as estimated — where
    // "the box" of a captioned icon includes the caption hanging under it: elk
    // was told about that strip (SizeHint.reserveBottom) and starts the line
    // below the text, and snapping it up to the picture would strike it through.
    const drawn = (n: typeof sourceNode, r: typeof srcRect) =>
      !measured || r === undefined
        ? undefined
        : { ...r, height: r.height + captionReserve(n?.data as DiagramNodeData | undefined) };
    const pts = snapRouteEnds(tidyRoute(data.route), drawn(sourceNode, srcRect), drawn(targetNode, tgtRect));
    path = roundedRoute(pts, data.routeCorner ?? 8);
    curve = routeCurve(pts);
    // elk centred the label ON the route it returned; tidying and end-snapping
    // may since have slid that leg a few px, so the spot is re-seated on the
    // line as drawn — a label beside its own line reads as belonging to nothing.
    labelSpot = data.labelSpot !== undefined ? nearestOnRoute(pts, data.labelSpot) : undefined;
    const mid = labelSpot ?? curve.point(0.5);
    labelX = mid.x;
    labelY = mid.y;
  } else if (shape === 'straight') {
    [path, labelX, labelY] = getStraightPath({ sourceX: sx, sourceY: sy, targetX: tx, targetY: ty });
  } else if (shape === 'step') {
    [path, labelX, labelY] = getSmoothStepPath(pathParams);
  } else if (bowed) {
    const bowCurvature = curvature ?? DEFAULT_CURVATURE;
    const mid = curve.point(0.5);
    path = bowPath(pathParams, bowCurvature, bowSide);
    labelX = mid.x;
    labelY = mid.y;
  } else {
    [path, labelX, labelY] = getBezierPath({ ...pathParams, ...(curvature !== undefined ? { curvature } : {}) });
  }

  const look = edgeStroke(id, data, profile);

  // Sketch theme: replace the clean path with a seeded rough stroke (stable per
  // edge id, memoized so it doesn't re-wobble each render). Label position and
  // marker still use the clean path's endpoints.
  const renderPath = useMemo(
    () => (data?.stylePreset?.rough !== undefined ? sketchEdge(path, seedFrom(id), data.stylePreset.rough) : path),
    [data?.stylePreset, path, id],
  );

  // Threat badge: gated on the edge carrying threats, not on the notation — a
  // flow can be threat-modelled on any plane. An empty register is not a clean
  // bill of health, so `total === 0` draws nothing — the same rule ThreatBadge
  // states for a node. At t = 0.75 rather than the midpoint, so a centred flow
  // label keeps the middle of the line.
  const threats = data?.threats !== undefined && data.threats.total > 0 ? data.threats : undefined;
  const threatBadge = threats !== undefined ? threatBadgeProps(threats) : undefined;
  // Where there is nothing to count yet, the same spot offers the flow's first
  // threat instead — the offer the node badge makes (see ThreatBadge), gated
  // the same way: a host listening (edit mode) where the notation offers threats.
  // Exactly one of the two ever draws, so they share one frame.
  const addThreat =
    threats === undefined && data?.onAddThreat !== undefined && profile.offersThreats === true
      ? data.onAddThreat
      : undefined;
  const threatFrame = threats !== undefined || addThreat !== undefined ? markFrame(curve, 0.75) : undefined;
  const threatBadgeAt = threatFrame === undefined ? undefined : badgePosition(threatFrame);
  const threatTransform =
    threatBadgeAt === undefined
      ? undefined
      : `translate(-50%, -50%) translate(${threatBadgeAt.x}px, ${threatBadgeAt.y}px)`;

  // Comment badge: at t = 0.25, the other side of the label from the threat
  // badge, so a flow that has both shows both. Same passive/toggle split.
  const commentBadge = data?.annotations !== undefined ? commentBadgeProps(data.annotations) : undefined;
  const commentFrame = commentBadge !== undefined ? markFrame(curve, 0.25) : undefined;
  const commentBadgeAt = commentFrame === undefined ? undefined : badgePosition(commentFrame);
  const commentTransform =
    commentBadgeAt === undefined
      ? undefined
      : `translate(-50%, -50%) translate(${commentBadgeAt.x}px, ${commentBadgeAt.y}px)`;

  // Loop highlight: when a loop badge is active, glow this edge if it's a member,
  // otherwise dim it. Wraps the whole edge (path + marks + marker) as one group.
  const highlight = useContext(LoopHighlightContext);
  // Which notes this canvas has open, and the switch the counting badge is —
  // null on a canvas that draws none, where the badge stays passive.
  const notes = useContext(NoteStateContext);
  // Whose note the flow's badges switch: its sole relation's. A bundle names
  // no relation, so its badges stay the passive count.
  const noteTarget = data?.threatRelation !== undefined ? { relation: data.threatRelation } : undefined;
  // Where the relation's note hangs off, reported up: the threat badge when
  // there is one (it was first), else the comment badge — whichever badge this
  // relation actually has. Only this component knows the routed curve. The
  // same numbers the reporting badge's own transform is written from, so the
  // two cannot disagree. A bundle names no relation and both badges are
  // passive, so it reports nothing.
  // The line goes with it, sampled end to end, so the notes can keep off
  // it. The curve is rebuilt every render, so the samples are keyed by their
  // rounded coordinates: the effect re-reports only when the line moved.
  const badgeRelation = threats !== undefined || commentBadge !== undefined ? data?.threatRelation : undefined;
  const anchorX = threats !== undefined ? threatBadgeAt?.x : commentBadgeAt?.x;
  const anchorY = threats !== undefined ? threatBadgeAt?.y : commentBadgeAt?.y;
  const anchorNx = threats !== undefined ? threatFrame?.normal.x : commentFrame?.normal.x;
  const anchorNy = threats !== undefined ? threatFrame?.normal.y : commentFrame?.normal.y;
  const lineRef = useRef<Point[]>([]);
  let lineKey = '';
  if (notes !== null && badgeRelation !== undefined) {
    lineRef.current = Array.from({ length: LINE_SAMPLES + 1 }, (_, k) => {
      const p = curve.point(k / LINE_SAMPLES);
      return { x: Math.round(p.x), y: Math.round(p.y) };
    });
    lineKey = lineRef.current.map((p) => `${p.x},${p.y}`).join(';');
  }
  useEffect(() => {
    if (
      notes !== null &&
      badgeRelation !== undefined &&
      anchorX !== undefined &&
      anchorY !== undefined &&
      anchorNx !== undefined &&
      anchorNy !== undefined
    )
      notes.placeBadge(badgeRelation, { x: anchorX, y: anchorY }, { x: anchorNx, y: anchorNy }, lineRef.current);
    // lineKey stands in for lineRef.current, which is rebuilt every render
  }, [notes, badgeRelation, anchorX, anchorY, anchorNx, anchorNy, lineKey]);
  // 'loop': members glow, rest strong-dim. 'focus': members stay normal, rest light-dim.
  const loopEdgeClass = !highlight.active
    ? undefined
    : highlight.edges.has(id)
      ? highlight.variant === 'loop'
        ? 'dg-loop-edge-hl'
        : undefined
      : highlight.variant === 'loop'
        ? 'dg-loop-edge-dim'
        : 'dg-focus-edge-dim';

  // Project a screen point onto the *effective* (rendered) shape — the label
  // render already keys off `effectiveShape`/`bowSide`, and so must the
  // click/drag projection, or a placed label would slide off a bowed CLD edge.
  const project = (clientX: number, clientY: number): { t: number; side: EdgeLabelSide } => {
    const { t, perp } = nearestOnCurve(curve, rf.screenToFlowPosition({ x: clientX, y: clientY }));
    return { t, side: sideFromPerp(perp) };
  };
  const editableLabels = data?.editableLabels === true;
  // Edit mode slides a label freely; view mode only with Alt held.
  const canSlide = (e: { altKey: boolean }): boolean => editableLabels || (data?.movableLabels === true && e.altKey);
  // A label nobody has placed (the default middle-of-the-line) sits on elk's
  // reserved spot while the route stands; one that WAS placed follows the line.
  const unplaced = (lb: EdgeLabel): boolean =>
    (lb.t === undefined || lb.t === 0.5) && (lb.side ?? 'center') === 'center';

  // Correlation-driven add: DiagramView sets `pendingAdd` (flow coords) when a

  return (
    <>
      <g className={loopEdgeClass}>
        <EdgeMarkerDefs end={look.end} start={look.start} stroke={look.stroke} size={look.markerSize} />
        <BaseEdge
          id={id}
          path={renderPath}
          {...(look.end !== undefined ? { markerEnd: `url(#${look.end.id})` } : {})}
          {...(look.start !== undefined ? { markerStart: `url(#${look.start.id})` } : {})}
          style={strokeStyle(look)}
        />
        {/* transparent hit-path: widens the hover/title target. Adding a label is
          no longer triggered here (a real double-click's first click remounts the
          edges layer, so the native dblclick never lands on the edge) — DiagramView
          detects the double-click from click events and threads `pendingAdd`. */}
        <path d={path} fill="none" stroke="transparent" strokeWidth={14}>
          <title>{`${data?.kind ?? ''}${data !== undefined && data.constituentCount > 1 ? ` ×${data.constituentCount}` : ''}${
            data?.labels === undefined && data?.label !== undefined ? ` — ${data.label}` : ''
          }`}</title>
        </path>
        {data !== undefined && <EdgeMarks curve={curve} data={data} profile={profile} look={look} />}
      </g>
      {data !== undefined && <FixedSideDots ends={p} data={data} />}
      {/* The joined label of a bundled arrow. An HTML element in the label layer, not
          React Flow's SVG `label`: that one lives inside this edge's own <svg>,
          so every edge painted later drew its line straight across the text. It
          takes no pointer events — the press falls through to the hit-path under
          it, whose <title> carries the untruncated text. */}
      {data?.labels === undefined && data?.label !== undefined && (
        <EdgeLabelRenderer>
          <div
            className="dg-edge-label dg-edge-chip"
            style={{ position: 'absolute', transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            {data.label}
          </div>
        </EdgeLabelRenderer>
      )}
      {data?.labels !== undefined &&
        data.labels.map((lb) => {
          const lt = lb.t ?? 0.5;
          const side: EdgeLabelSide = lb.side ?? 'center';
          const base =
            labelSpot !== undefined && data.labels?.length === 1 && unplaced(lb) ? labelSpot : labelXY(curve, lt, side);
          const live = drag !== null && drag.labelId === lb.id ? drag : null;
          const lx = live?.x ?? base.x;
          const ly = live?.y ?? base.y;
          const editingThis = edit !== null && edit.labelId === lb.id;
          return (
            <EdgeLabelRenderer key={lb.id}>
              <div
                className={`dg-edge-label dg-edge-label-${side} nodrag nopan`}
                style={{
                  position: 'absolute',
                  transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)`,
                  pointerEvents: 'all',
                }}
                onPointerDown={(e) => {
                  // don't fight the inline input for the press, and don't let
                  // React Flow steal the gesture / clear selection
                  if (!canSlide(e) || editingThis) return;
                  e.stopPropagation();
                  dragRef.current = { labelId: lb.id, startX: e.clientX, startY: e.clientY, moved: false };
                  if (typeof e.currentTarget.setPointerCapture === 'function')
                    e.currentTarget.setPointerCapture(e.pointerId);
                }}
                onPointerMove={(e) => {
                  const d = dragRef.current;
                  if (d === null || d.labelId !== lb.id) return;
                  // below the threshold it's still a click (preserves dblclick)
                  if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < DRAG_THRESHOLD) return;
                  d.moved = true;
                  const { t, side: s } = project(e.clientX, e.clientY);
                  const pos = labelXY(curve, t, s);
                  setDrag({ labelId: lb.id, x: pos.x, y: pos.y });
                }}
                onPointerUp={(e) => {
                  const d = dragRef.current;
                  dragRef.current = null;
                  if (d === null || d.labelId !== lb.id) return;
                  if (typeof e.currentTarget.releasePointerCapture === 'function')
                    e.currentTarget.releasePointerCapture(e.pointerId);
                  if (d.moved) {
                    const { t, side: s } = project(e.clientX, e.clientY);
                    data?.onMoveLabel?.(lb.id, t, s);
                  }
                  setDrag(null);
                }}
                onDoubleClick={(e) => {
                  if (!editableLabels) return;
                  e.stopPropagation();
                  setEdit({ labelId: lb.id, t: lt, side, x: base.x, y: base.y });
                }}
              >
                {editingThis ? (
                  <InlineLabel
                    label={lb.text}
                    onCommit={(v) => {
                      setEdit(null);
                      // empty text is a real commit — the host removes the label
                      if (v !== null) data?.onEditLabel?.(lb.id, v.trim());
                    }}
                  />
                ) : (
                  lb.text
                )}
              </div>
            </EdgeLabelRenderer>
          );
        })}
      {/* New-label editor. Derived from data.pendingAdd (a DiagramView state) rather
          than local state, because a double-click selects the edge and remounts the
          edges layer — local editor state would be destroyed by that remount, but a
          remounted edge still receives pendingAdd and re-derives the editor. The
          request is cleared (onPendingAddConsumed) only when the user commits/cancels. */}
      {editableLabels &&
        data?.pendingAdd !== undefined &&
        (() => {
          const { t, perp } = nearestOnCurve(curve, data.pendingAdd);
          const side = sideFromPerp(perp);
          const pos = labelXY(curve, t, side);
          return (
            <EdgeLabelRenderer>
              <div
                className="dg-edge-label-edit nodrag nopan"
                style={{
                  position: 'absolute',
                  transform: `translate(-50%, -50%) translate(${pos.x}px, ${pos.y}px)`,
                  pointerEvents: 'all',
                }}
              >
                <InlineLabel
                  label=""
                  onCommit={(v) => {
                    if (v !== null && v.trim() !== '') data?.onAddLabel?.(v.trim(), t, side);
                    data?.onPendingAddConsumed?.();
                  }}
                />
              </div>
            </EdgeLabelRenderer>
          );
        })()}
      {threatFrame !== undefined && threatBadge !== undefined && (
        <EdgeLabelRenderer>
          {/* `data-edge`: every badge goes into React Flow's single
              EdgeLabelRenderer portal — one flat layer of absolutely positioned
              elements — so without the edge id on the badge itself the only thing
              saying WHICH flow it belongs to is where it happens to sit. The
              value is the view-edge id (`from=>to:layer`), stable across
              re-layouts; state/text/title come from the shared derivation the
              node badge uses, so the two cannot drift apart in what they say. */}
          <NoteBadge
            className="dg-threat-badge dg-edge-threat"
            target={noteTarget}
            edge={id}
            state={threatBadge.state}
            title={threatBadge.title}
            text={threatBadge.text}
            style={{ transform: threatTransform }}
          />
        </EdgeLabelRenderer>
      )}
      {commentFrame !== undefined && commentBadge !== undefined && (
        <EdgeLabelRenderer>
          {/* Same portal, same `data-edge` reasoning as the threat badge above,
              and the same noteTarget, so the two badges never disagree about
              which flows get a switch. */}
          <NoteBadge
            className="dg-comment-badge dg-edge-comment"
            target={noteTarget}
            edge={id}
            title={commentBadge.title}
            text={commentBadge.text}
            style={{ transform: commentTransform }}
          />
        </EdgeLabelRenderer>
      )}
      {threatFrame !== undefined && addThreat !== undefined && (
        <EdgeLabelRenderer>
          {/* `data-edge` for the same reason the counting badge carries it: the
              label portal is one flat layer, so the badge itself must say which
              flow it belongs to. Unlike that badge this one is clickable, so it
              needs pointer events back (the base badge rule turns them off —
              see styles.css) and must keep the press from starting a drag. */}
          <AddThreatButton
            className="dg-threat-badge dg-edge-threat nodrag nopan"
            edge={id}
            state="empty"
            style={{ transform: threatTransform }}
            onAdd={addThreat}
          />
        </EdgeLabelRenderer>
      )}
    </>
  );
}

function InlineLabel({ label, onCommit }: { label: string; onCommit?: (value: string | null) => void }) {
  const done = useRef(false); // Enter commits then blurs; don't commit twice
  const finish = (value: string | null) => {
    if (done.current) return;
    done.current = true;
    onCommit?.(value);
  };
  return (
    <input
      aria-label="Edge label"
      defaultValue={label}
      autoFocus
      onFocus={(e) => e.target.select()}
      onBlur={(e) => finish(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') finish((e.target as HTMLInputElement).value);
        else if (e.key === 'Escape') finish(null);
      }}
    />
  );
}
