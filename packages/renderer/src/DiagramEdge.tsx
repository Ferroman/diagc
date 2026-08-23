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
import { useContext, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import type { Column, EdgeLabel, EdgeLabelSide, NotationId, Polarity, RelationStyle } from '@diagramming/core';
import { bowPath, DEFAULT_CURVATURE, edgePoint, edgeTangent, nearestT, type BowSide, type EdgePathParams, type EdgeShape, type Point } from './edge-geometry';
import { getEdgeParams, sideFromPosition, type Side } from './floating';
import { truncateEdgeLabel } from './label-size';
import { LoopHighlightContext } from './loop-highlight';
import { notationProfile } from './notations';
import type { KindStyle, Registry } from './registry';
import { seedFrom, sketchEdge } from './sketch';
import { anchorToRow } from './table-ports';
import type { StylePreset } from './stylePresets';

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
  /** FK column on the source table — anchors the source end to that row (db-table) */
  fromColumn?: string;
  /** referenced column on the target table — anchors the target end to that row */
  toColumn?: string;
  /** elk-computed absolute waypoints for orthogonal routing (set only when the
   * plane uses orthogonal edges and both endpoints sit at their elk spot) */
  route?: Point[];
  /** draw this edge as a polyline through `route` instead of a floating bezier */
  orthogonal?: boolean;
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
  pendingAdd?: { x: number; y: number };
  onPendingAddConsumed?: () => void;
  /** commit an edited label; empty text signals removal to the host */
  onEditLabel?: (labelId: string, text: string) => void;
  /** commit a dragged label's new position (parameter `t` + perpendicular side) */
  onMoveLabel?: (labelId: string, t: number, side: EdgeLabelSide) => void;
  /** edit mode, sole-relation edges only: pin/unpin an endpoint. The renderer
   * knows the live facing side, so it passes the side to freeze at (or null to
   * re-float). */
  onSetSide?: (end: 'from' | 'to', side: Side | null) => void;
  /** this edge is the active pin-editing target — show its endpoint pin dots.
   * Driven by DiagramView's relation-keyed selection (not React Flow's edge
   * `selected`, whose id changes when a pin toggles). */
  pinsActive?: boolean;
}

/** SVG path through orthogonal waypoints with lightly rounded corners. */
function roundedPolyline(points: Point[], radius = 8): string {
  if (points.length < 2) return '';
  if (points.length === 2) return `M${points[0]!.x},${points[0]!.y} L${points[1]!.x},${points[1]!.y}`;
  let d = `M${points[0]!.x},${points[0]!.y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1]!;
    const cur = points[i]!;
    const next = points[i + 1]!;
    const inLen = Math.hypot(cur.x - prev.x, cur.y - prev.y) || 1;
    const outLen = Math.hypot(next.x - cur.x, next.y - cur.y) || 1;
    const r = Math.min(radius, inLen / 2, outLen / 2);
    const p1x = cur.x - ((cur.x - prev.x) / inLen) * r;
    const p1y = cur.y - ((cur.y - prev.y) / inLen) * r;
    const p2x = cur.x + ((next.x - cur.x) / outLen) * r;
    const p2y = cur.y + ((next.y - cur.y) / outLen) * r;
    d += ` L${p1x},${p1y} Q${cur.x},${cur.y} ${p2x},${p2y}`;
  }
  const last = points[points.length - 1]!;
  d += ` L${last.x},${last.y}`;
  return d;
}

type Props = Pick<
  EdgeProps,
  | 'id'
  | 'source'
  | 'target'
  | 'sourceX'
  | 'sourceY'
  | 'targetX'
  | 'targetY'
  | 'sourcePosition'
  | 'targetPosition'
> & { data?: DiagramEdgeData };

/** marker geometry per end style, in a 0..10 viewBox (refY 5) */
const END_SHAPES: Record<string, { refX: number; el: ReactElement } | undefined> = {
  arrow: { refX: 9, el: <path d="M0,0 L10,5 L0,10 z" /> },
  dot: { refX: 5, el: <circle cx="5" cy="5" r="4" /> },
  square: { refX: 5, el: <rect x="1.2" y="1.2" width="7.6" height="7.6" /> },
  diamond: { refX: 5, el: <path d="M5,0 L10,5 L5,10 L0,5 z" /> },
  crowsfoot: { refX: 0, el: <path d="M10,1 L0,5 L10,9 M0,5 L10,5" fill="none" /> },
  one: { refX: 8, el: <path d="M5,1 L5,9" fill="none" /> },
  // explicit "no head" for kind styles (a bare unknown id also draws none)
  none: undefined,
};

/** line-based (unfilled) end shapes: these need the marker to carry a `stroke`
 * so their strokes actually draw. Filled shapes (arrow/dot/…) must NOT get a
 * stroke, or they render an unwanted same-color outline (regression guard). */
const LINE_MARKERS = new Set(['crowsfoot', 'one']);

/** endpoint pin dot radius (px) */
const PIN_R = 5;
/** how far a pin dot sits off the edge line, along the perpendicular (px) — kept
 * clear of React Flow's endpoint reconnect grab zone so click-to-pin and
 * drag-to-reattach don't fight over the same pixels */
const PIN_OFFSET = 16;

/** how far the polarity glyph sits off the path, along the normal (px) */
const POLARITY_OFFSET = 12;
/** delay mark: half-length of each hash line, along the normal (px) */
const DELAY_HALF_LEN = 6;
/** delay mark: how far apart the two hash lines sit, along the tangent (px) */
const DELAY_GAP = 3;

/** interrupt zigzag: half-length of the lightning jog along the tangent (px) */
const ZIGZAG_HALF = 12;

/** perpendicular offset for top/bottom positioned labels (px) */
const LABEL_OFFSET = 14;

/** signed perpendicular distance (px) beyond which a projected point counts as
 * top/bottom rather than a centered label */
const SIDE_THRESHOLD = 8;
/** pointer travel (px) before a label press becomes a drag (below it stays a
 * click, preserving double-click-to-edit) */
const DRAG_THRESHOLD = 3;

/** which side of the line a signed perpendicular distance lands on */
function sideFromPerp(perp: number): EdgeLabelSide {
  return perp > SIDE_THRESHOLD ? 'top' : perp < -SIDE_THRESHOLD ? 'bottom' : 'center';
}

/** rendered position of a label at (t, side): the point on the edge plus the
 * top/bottom perpendicular offset — mirrors how labels are drawn, so the
 * inline editor and the drag ghost sit exactly where the label will land. */
function labelXY(
  shape: EdgeShape,
  params: EdgePathParams,
  curvature: number | undefined,
  t: number,
  side: EdgeLabelSide,
  bowSide: BowSide,
): Point {
  const lp = edgePoint(shape, params, curvature, t, bowSide);
  if (side !== 'top' && side !== 'bottom') return lp;
  const tan = edgeTangent(shape, params, curvature, t, bowSide);
  let nx = -tan.y;
  let ny = tan.x;
  if (ny > 0) {
    nx = -nx;
    ny = -ny;
  }
  const s = side === 'top' ? 1 : -1;
  return { x: lp.x + s * LABEL_OFFSET * nx, y: lp.y + s * LABEL_OFFSET * ny };
}

/** point + local frame (unit tangent/normal) at `t` along the clean path, for
 * positioning CLD marks without touching the (possibly sketch-roughened)
 * rendered path. */
function markFrame(shape: EdgeShape, params: EdgePathParams, curvature: number | undefined, t: number, side: BowSide) {
  const point = edgePoint(shape, params, curvature, t, side);
  const tangent = edgeTangent(shape, params, curvature, t, side);
  const normal = { x: -tangent.y, y: tangent.x };
  return { point, tangent, normal };
}

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
  const [edit, setEdit] = useState<{ labelId: string | null; t: number; side: EdgeLabelSide; x: number; y: number } | null>(
    null,
  );
  const [drag, setDrag] = useState<{ labelId: string; x: number; y: number } | null>(null);
  const dragRef = useRef<{ labelId: string; startX: number; startY: number; moved: boolean } | null>(null);
  const measured =
    (sourceNode?.measured?.width ?? 0) > 0 && (targetNode?.measured?.width ?? 0) > 0;
  const rel = data?.relStyle;
  const p =
    measured && sourceNode !== undefined && targetNode !== undefined
      ? getEdgeParams(sourceNode, targetNode, {
          ...(rel?.fromSide !== undefined ? { sourceSide: rel.fromSide } : {}),
          ...(rel?.toSide !== undefined ? { targetSide: rel.toSide } : {}),
        })
      : { sx: sourceX, sy: sourceY, tx: targetX, ty: targetY, sourcePos: sourcePosition, targetPos: targetPosition };

  // Row-port anchoring: for FK edges into/out of db-table nodes, pin the y of
  // each endpoint to the referenced column's row (x stays on the facing
  // left/right border — anchorToRow is a no-op for top/bottom faces or an
  // unknown column, so non-table endpoints float exactly as before).
  const srcRect = sourceNode !== undefined
    ? { x: sourceNode.internals.positionAbsolute.x, y: sourceNode.internals.positionAbsolute.y,
        width: sourceNode.measured?.width ?? 0, height: sourceNode.measured?.height ?? 0,
        columns: (sourceNode.data as { columns?: Column[] }).columns }
    : undefined;
  const tgtRect = targetNode !== undefined
    ? { x: targetNode.internals.positionAbsolute.x, y: targetNode.internals.positionAbsolute.y,
        width: targetNode.measured?.width ?? 0, height: targetNode.measured?.height ?? 0,
        columns: (targetNode.data as { columns?: Column[] }).columns }
    : undefined;
  let sx = p.sx, sy = p.sy, tx = p.tx, ty = p.ty;
  if (measured && data?.fromColumn !== undefined && srcRect?.columns !== undefined) {
    const a = anchorToRow({ x: p.sx, y: p.sy, pos: p.sourcePos }, srcRect, data.fromColumn);
    sx = a.x; sy = a.y;
  }
  const tgtCol = data?.toColumn ?? tgtRect?.columns?.find((c) => c.pk === true)?.name;
  if (measured && tgtCol !== undefined && tgtRect?.columns !== undefined && (data?.fromColumn !== undefined || data?.toColumn !== undefined)) {
    const a = anchorToRow({ x: p.tx, y: p.ty, pos: p.targetPos }, tgtRect, tgtCol);
    tx = a.x; ty = a.y;
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
  // Orthogonal routing: draw along elk's precomputed waypoints (absolute flow
  // coords, same space as the floating anchors) when the plane opted in and a
  // valid route was threaded through. Per-relation `shape` still wins.
  const route = data?.orthogonal === true ? data.route : undefined;
  const useRoute = route !== undefined && route.length >= 2 && rel?.shape === undefined;
  let path: string;
  let labelX: number;
  let labelY: number;
  if (useRoute) {
    path = roundedPolyline(route);
    const mid = route[Math.floor(route.length / 2)]!;
    labelX = mid.x;
    labelY = mid.y;
  } else if (shape === 'straight') {
    [path, labelX, labelY] = getStraightPath({ sourceX: sx, sourceY: sy, targetX: tx, targetY: ty });
  } else if (shape === 'step') {
    [path, labelX, labelY] = getSmoothStepPath(pathParams);
  } else if (bowed) {
    const bowCurvature = curvature ?? DEFAULT_CURVATURE;
    const mid = edgePoint('bow', pathParams, curvature, 0.5, bowSide);
    path = bowPath(pathParams, bowCurvature, bowSide);
    labelX = mid.x;
    labelY = mid.y;
  } else {
    [path, labelX, labelY] = getBezierPath({ ...pathParams, ...(curvature !== undefined ? { curvature } : {}) });
  }

  // Sketch theme: replace the clean path with a seeded rough stroke (stable per
  // edge id, memoized so it doesn't re-wobble each render). Label position and
  // marker still use the clean path's endpoints.
  const renderPath = useMemo(
    () => (data?.stylePreset?.rough !== undefined ? sketchEdge(path, seedFrom(id), data.stylePreset.rough) : path),
    [data?.stylePreset, path, id],
  );

  // Precedence: per-relation override > layer tint > notation colour > notation
  // polarity > kind registry > defaults. The notation colour (e.g. a git link's
  // lane) sits below the tint for the same reason polarity does — an explicit
  // authored grouping should never go inert because a notation also wants a say.
  const kind: KindStyle = data?.kindRegistry.resolve(data.kind) ?? {};
  const polarityColor = data?.polarity !== undefined ? profile.edge?.polarityColors?.[data.polarity] : undefined;
  const stroke = rel?.color ?? data?.tint ?? data?.notationColor ?? polarityColor ?? 'var(--dg-edge)';
  const strokeWidth = rel?.width ?? kind.width ?? 1.5;
  const line = rel?.line ?? (kind.dashed === true ? 'dashed' : 'solid');
  const animated = rel?.animated ?? kind.animated === true;
  const dashArray =
    line === 'dashed' ? '6 4' : line === 'dotted' ? `0.1 ${Math.max(5, strokeWidth * 3)}` : animated ? '6 4' : undefined;

  const kindStart = kind.startMarker;
  const end = rel?.end ?? kind.endMarker ?? 'arrow';
  const endShape = END_SHAPES[end];
  const startShape = kindStart !== undefined ? END_SHAPES[kindStart] : undefined;
  // svg ids must be unique per document; edge ids contain '=>' etc., so sanitize
  const markerId = `dg-end-${id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  const startMarkerId = `dg-start-${id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  const markerSize = 10 + strokeWidth * 2;

  // CLD polarity/delay marks: gated on the notation profile *and* the edge
  // actually carrying the datum; computed from the clean path params (like
  // the label/marker above) so they track the arrow rather than a sketch
  // roughening. Rendered beside the END_SHAPES marker, never replacing it.
  const showMarks = profile.edge?.marks === true;
  const polarityFrame =
    showMarks && data?.polarity !== undefined ? markFrame(effectiveShape, pathParams, curvature, 0.82, bowSide) : undefined;
  const delayFrame =
    showMarks && data?.delay === true ? markFrame(effectiveShape, pathParams, curvature, 0.5, bowSide) : undefined;

  // UML interrupt flow: a lightning jog at the midpoint. Gated on the KIND
  // style (not the notation profile) — activity edges appear on any canvas.
  const zigzagFrame = kind.zigzag === true ? markFrame(effectiveShape, pathParams, curvature, 0.5, bowSide) : undefined;

  // Loop highlight: when a loop badge is active, glow this edge if it's a member,
  // otherwise dim it. Wraps the whole edge (path + marks + marker) as one group.
  const highlight = useContext(LoopHighlightContext);
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

  // Endpoint pin dots: only for the active sole-relation edge whose host wired
  // the pin callback (edit mode). Each dot toggles its end between floating and
  // frozen-at-the-current-facing-side; positioned off the line so it doesn't
  // steal React Flow's reconnect grab.
  const onSetSide = data?.onSetSide;
  const showPins = onSetSide !== undefined && data?.pinsActive === true && (data?.constituentCount ?? 0) === 1;
  const pinDots = showPins
    ? (() => {
        const dx = p.tx - p.sx;
        const dy = p.ty - p.sy;
        const len = Math.hypot(dx, dy) || 1;
        const ox = (-dy / len) * PIN_OFFSET;
        const oy = (dx / len) * PIN_OFFSET;
        const fromPinned = rel?.fromSide !== undefined;
        const toPinned = rel?.toSide !== undefined;
        return (
          <>
            <PinDot
              end="from"
              cx={p.sx + ox}
              cy={p.sy + oy}
              pinned={fromPinned}
              onToggle={() => onSetSide('from', fromPinned ? null : sideFromPosition(p.sourcePos))}
            />
            <PinDot
              end="to"
              cx={p.tx + ox}
              cy={p.ty + oy}
              pinned={toPinned}
              onToggle={() => onSetSide('to', toPinned ? null : sideFromPosition(p.targetPos))}
            />
          </>
        );
      })()
    : null;

  // Project a screen point onto the *effective* (rendered) shape — the label
  // render already keys off `effectiveShape`/`bowSide`, and so must the
  // click/drag projection, or a placed label would slide off a bowed CLD edge.
  const project = (clientX: number, clientY: number): { t: number; side: EdgeLabelSide } => {
    const { t, perp } = nearestT(effectiveShape, pathParams, curvature, rf.screenToFlowPosition({ x: clientX, y: clientY }), bowSide);
    return { t, side: sideFromPerp(perp) };
  };
  const editableLabels = data?.editableLabels === true;

  // Correlation-driven add: DiagramView sets `pendingAdd` (flow coords) when a

  return (
    <>
      <g className={loopEdgeClass}>
      {endShape !== undefined && (
        <defs>
          <marker
            id={markerId}
            viewBox="0 0 10 10"
            refX={endShape.refX}
            refY="5"
            markerWidth={markerSize}
            markerHeight={markerSize}
            markerUnits="userSpaceOnUse"
            orient="auto-start-reverse"
            fill={stroke}
            {...(LINE_MARKERS.has(end) ? { stroke, strokeWidth: 1.2 } : {})}
          >
            {endShape.el}
          </marker>
        </defs>
      )}
      {startShape !== undefined && (
        <defs>
          <marker
            id={startMarkerId}
            viewBox="0 0 10 10"
            refX={startShape.refX}
            refY="5"
            markerWidth={markerSize}
            markerHeight={markerSize}
            markerUnits="userSpaceOnUse"
            orient="auto-start-reverse"
            fill={stroke}
            {...(kindStart !== undefined && LINE_MARKERS.has(kindStart) ? { stroke, strokeWidth: 1.2 } : {})}
          >
            {startShape.el}
          </marker>
        </defs>
      )}
      <BaseEdge
        id={id}
        path={renderPath}
        {...(endShape !== undefined ? { markerEnd: `url(#${markerId})` } : {})}
        {...(startShape !== undefined ? { markerStart: `url(#${startMarkerId})` } : {})}
        style={{
          stroke,
          strokeWidth,
          ...(dashArray !== undefined ? { strokeDasharray: dashArray } : {}),
          ...(line === 'dotted' ? { strokeLinecap: 'round' as const } : {}),
          ...(animated ? { animation: 'dg-flow 0.7s linear infinite' } : {}),
        }}
        {...(data?.labels === undefined && data?.label !== undefined
          ? {
              // Shortened here, not in CSS: React Flow renders this as SVG
              // <text>, where text-overflow does nothing. The full text is on the
              // hit-path's <title> below.
              label: truncateEdgeLabel(data.label),
              labelX,
              labelY,
              labelStyle: { fill: 'var(--dg-text)', fontSize: 10 },
              labelBgStyle: { fill: 'var(--dg-edge-label-bg)' },
              labelBgPadding: [6, 3] as [number, number],
              labelBgBorderRadius: 6,
            }
          : {})}
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
      {polarityFrame !== undefined && data?.polarity !== undefined && (
        <text
          className="dg-polarity"
          x={polarityFrame.point.x + polarityFrame.normal.x * POLARITY_OFFSET}
          y={polarityFrame.point.y + polarityFrame.normal.y * POLARITY_OFFSET}
          textAnchor="middle"
          dominantBaseline="central"
          /* The glyph annotates the line, so it takes the line's colour — but
             only where the notation colours by sign; elsewhere it stays text-
             coloured as before. Inline style, not a `fill` attribute: the
             stylesheet's `.dg-polarity { fill }` outranks presentation attrs. */
          {...(polarityColor !== undefined ? { style: { fill: stroke } } : {})}
        >
          {data.polarity === '-' ? '−' : '+'}
        </text>
      )}
      {delayFrame !== undefined && (
        <g className="dg-delay">
          {[-DELAY_GAP, DELAY_GAP].map((gap) => {
            const cx = delayFrame.point.x + delayFrame.tangent.x * gap;
            const cy = delayFrame.point.y + delayFrame.tangent.y * gap;
            return (
              <line
                key={gap}
                x1={cx - delayFrame.normal.x * DELAY_HALF_LEN}
                y1={cy - delayFrame.normal.y * DELAY_HALF_LEN}
                x2={cx + delayFrame.normal.x * DELAY_HALF_LEN}
                y2={cy + delayFrame.normal.y * DELAY_HALF_LEN}
              />
            );
          })}
        </g>
      )}
      {zigzagFrame !== undefined && (
        <polyline
          className="dg-edge-zigzag"
          points={[
            [-ZIGZAG_HALF, 4],
            [2, -2],
            [-2, 2],
            [ZIGZAG_HALF, -4],
          ]
            .map(([a, b]) => {
              const { point, tangent, normal } = zigzagFrame;
              return `${point.x + a! * tangent.x + b! * normal.x},${point.y + a! * tangent.y + b! * normal.y}`;
            })
            .join(' ')}
          fill="none"
          strokeWidth={1.75}
          stroke={stroke}
        />
      )}
      </g>
      {pinDots}
      {data?.labels !== undefined &&
        data.labels.map((lb) => {
          const lt = lb.t ?? 0.5;
          const side: EdgeLabelSide = lb.side ?? 'center';
          const base = labelXY(effectiveShape, pathParams, curvature, lt, side, bowSide);
          const live = drag !== null && drag.labelId === lb.id ? drag : null;
          const lx = live?.x ?? base.x;
          const ly = live?.y ?? base.y;
          const editingThis = edit !== null && edit.labelId === lb.id;
          return (
            <EdgeLabelRenderer key={lb.id}>
              <div
                className={`dg-edge-label dg-edge-label-${side} nodrag nopan`}
                style={{ position: 'absolute', transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)`, pointerEvents: 'all' }}
                onPointerDown={(e) => {
                  // don't fight the inline input for the press, and don't let
                  // React Flow steal the gesture / clear selection
                  if (!editableLabels || editingThis) return;
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
                  const pos = labelXY(effectiveShape, pathParams, curvature, t, s, bowSide);
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
          const { t, perp } = nearestT(effectiveShape, pathParams, curvature, data.pendingAdd, bowSide);
          const side = sideFromPerp(perp);
          const pos = labelXY(effectiveShape, pathParams, curvature, t, side, bowSide);
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
    </>
  );
}

function PinDot({
  end,
  cx,
  cy,
  pinned,
  onToggle,
}: {
  end: 'from' | 'to';
  cx: number;
  cy: number;
  pinned: boolean;
  onToggle: () => void;
}) {
  return (
    <circle
      className={`dg-edge-pin${pinned ? ' pinned' : ''}`}
      data-end={end}
      cx={cx}
      cy={cy}
      r={PIN_R}
      role="button"
      aria-label={`${pinned ? 'Unpin' : 'Pin'} ${end === 'from' ? 'source' : 'target'} end`}
      // stop pointerdown too, or React Flow treats the press as a canvas
      // interaction and clears the edge selection out from under the dot
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    />
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
