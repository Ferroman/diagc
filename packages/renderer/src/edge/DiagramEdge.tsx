import { BaseEdge, type EdgeProps } from '@xyflow/react';
import { useContext } from 'react';
import type { EdgeLabel, EdgeLabelSide, NotationId, Point, Polarity, RelationStyle, Side } from '@diagc/core/internal';
import { LoopHighlightContext, type LoopHighlight } from '../loops/loop-highlight';
import type { AnnotationCounts } from '../notes/comment-badge';
import { notationProfile } from '../notations';
import type { KindStyle, Registry } from '../registry';
import type { StylePreset } from '../sketch/stylePresets';
import { EdgeLabels } from './EdgeLabels';
import { EdgeMarkerDefs } from './EdgeMarkerDefs';
import { EdgeMarks } from './EdgeMarks';
import { EdgeNoteBadges } from './EdgeNoteBadges';
import { edgeStroke, strokeStyle } from './edge-stroke';
import { FixedSideDots } from './FixedSideDots';
import { useEdgeAnchors } from './useEdgeAnchors';
import { useEdgePath } from './useEdgePath';

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
  const anchors = useEdgeAnchors(
    { source, target, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition },
    data,
  );
  const profile = notationProfile(data?.notation);
  const { path, renderPath, curve, label, labelSpot } = useEdgePath(id, anchors, data, profile);
  const look = edgeStroke(id, data, profile);
  // Loop highlight: when a loop badge is active, glow this edge if it's a member,
  // otherwise dim it. Wraps the whole edge (path + marks + marker) as one group.
  const highlight = useContext(LoopHighlightContext);
  return (
    <>
      <g className={loopEdgeClass(highlight, id)}>
        <EdgeMarkerDefs end={look.end} start={look.start} stroke={look.stroke} size={look.markerSize} />
        <BaseEdge
          id={id}
          path={renderPath}
          {...(look.end !== undefined ? { markerEnd: `url(#${look.end.id})` } : {})}
          {...(look.start !== undefined ? { markerStart: `url(#${look.start.id})` } : {})}
          style={strokeStyle(look)}
        />
        {/* transparent hit-path: widens the hover/title target. A double-click here
          adds no label: a real double-click's first click remounts the edges layer,
          so the native dblclick never lands on the edge. DiagramView detects the
          double-click from click events and threads `pendingAdd`. */}
        <path d={path} fill="none" stroke="transparent" strokeWidth={14}>
          <title>{hoverTitle(data)}</title>
        </path>
        {data !== undefined && <EdgeMarks curve={curve} data={data} profile={profile} look={look} />}
      </g>
      {data !== undefined && <FixedSideDots ends={anchors.ends} data={data} />}
      {data !== undefined && <EdgeLabels data={data} curve={curve} label={label} labelSpot={labelSpot} />}
      {data !== undefined && <EdgeNoteBadges id={id} data={data} curve={curve} profile={profile} />}
    </>
  );
}

/** the hit-path's hover text: the kind, the bundle's size, and a joined label in full */
function hoverTitle(data: DiagramEdgeData | undefined): string {
  return `${data?.kind ?? ''}${data !== undefined && data.constituentCount > 1 ? ` ×${data.constituentCount}` : ''}${
    data?.labels === undefined && data?.label !== undefined ? ` — ${data.label}` : ''
  }`;
}

// 'loop': members glow, rest strong-dim. 'focus': members stay normal, rest light-dim.
function loopEdgeClass(highlight: LoopHighlight, id: string): string | undefined {
  return !highlight.active
    ? undefined
    : highlight.edges.has(id)
      ? highlight.variant === 'loop'
        ? 'dg-loop-edge-hl'
        : undefined
      : highlight.variant === 'loop'
        ? 'dg-loop-edge-dim'
        : 'dg-focus-edge-dim';
}
