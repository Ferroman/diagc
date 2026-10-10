import { EdgeLabelRenderer, useReactFlow } from '@xyflow/react';
import { useRef, useState, type PointerEvent, type ReactElement } from 'react';
import type { EdgeLabel, EdgeLabelSide, Point } from '@diagc/core/internal';
import type { DiagramEdgeData } from './DiagramEdge';
import { nearestOnCurve, type EdgeCurve } from './edge-geometry';

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

// A label nobody has placed (the default middle-of-the-line) sits on elk's
// reserved spot while the route stands; one that WAS placed follows the line.
const unplaced = (lb: EdgeLabel): boolean => (lb.t === undefined || lb.t === 0.5) && (lb.side ?? 'center') === 'center';

/** An edge's text, in the HTML label layer: a bundle's joined label, or a sole
 * relation's positioned labels, which edit mode adds, edits and slides along
 * the line (view mode slides them while Alt is held). */
export function EdgeLabels({
  data,
  curve,
  label,
  labelSpot,
}: {
  data: DiagramEdgeData;
  curve: EdgeCurve;
  /** where a bundle's joined label sits */
  label: Point;
  /** elk's reserved spot, while the route stands */
  labelSpot: Point | undefined;
}): ReactElement {
  // The label being edited in place. A brand-new one is DiagramView's
  // `pendingAdd`, drawn by NewLabelEditor.
  const [edit, setEdit] = useState<{
    labelId: string | null;
    t: number;
    side: EdgeLabelSide;
    x: number;
    y: number;
  } | null>(null);
  const slide = useLabelSlide(data, curve);
  const editableLabels = data.editableLabels === true;
  return (
    <>
      {/* The joined label of a bundled arrow. An HTML element in the label layer, not
          React Flow's SVG `label`: that one lives inside this edge's own <svg>,
          so every edge painted later drew its line straight across the text. It
          takes no pointer events — the press falls through to the hit-path under
          it, whose <title> carries the untruncated text. */}
      {data.labels === undefined && data.label !== undefined && (
        <EdgeLabelRenderer>
          <div
            className="dg-edge-label dg-edge-chip"
            style={{ position: 'absolute', transform: `translate(-50%, -50%) translate(${label.x}px, ${label.y}px)` }}
          >
            {data.label}
          </div>
        </EdgeLabelRenderer>
      )}
      {data.labels !== undefined &&
        data.labels.map((lb) => {
          const lt = lb.t ?? 0.5;
          const side: EdgeLabelSide = lb.side ?? 'center';
          const base =
            labelSpot !== undefined && data.labels?.length === 1 && unplaced(lb) ? labelSpot : labelXY(curve, lt, side);
          const live = slide.drag !== null && slide.drag.labelId === lb.id ? slide.drag : null;
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
                {...slide.handlers(lb.id, editingThis)}
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
                      if (v !== null) data.onEditLabel?.(lb.id, v.trim());
                    }}
                  />
                ) : (
                  lb.text
                )}
              </div>
            </EdgeLabelRenderer>
          );
        })}
      {editableLabels && data.pendingAdd !== undefined && (
        <NewLabelEditor data={data} curve={curve} at={data.pendingAdd} />
      )}
    </>
  );
}

/** Sliding a positioned label along (and across) its line: the press, the live
 * ghost position, and the commit on release. */
function useLabelSlide(data: DiagramEdgeData, curve: EdgeCurve) {
  const rf = useReactFlow();
  // `drag` holds the live ghost position while a label is being slid; `dragRef`
  // tracks the press so a click/double-click below the threshold never
  // registers as a drag.
  const [drag, setDrag] = useState<{ labelId: string; x: number; y: number } | null>(null);
  const dragRef = useRef<{ labelId: string; startX: number; startY: number; moved: boolean } | null>(null);
  // Project a screen point onto `curve`, the shape as drawn (useEdgePath's
  // `effectiveShape`/`bowSide`, or the route): the labels are placed along it,
  // and so must the click/drag projection be, or a placed label would slide
  // off a bowed CLD edge.
  const project = (clientX: number, clientY: number): { t: number; side: EdgeLabelSide } => {
    const { t, perp } = nearestOnCurve(curve, rf.screenToFlowPosition({ x: clientX, y: clientY }));
    return { t, side: sideFromPerp(perp) };
  };
  // Edit mode slides a label freely; view mode only with Alt held.
  const canSlide = (e: { altKey: boolean }): boolean =>
    data.editableLabels === true || (data.movableLabels === true && e.altKey);
  const handlers = (labelId: string, editing: boolean) => ({
    onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
      // don't fight the inline input for the press, and don't let
      // React Flow steal the gesture / clear selection
      if (!canSlide(e) || editing) return;
      e.stopPropagation();
      dragRef.current = { labelId, startX: e.clientX, startY: e.clientY, moved: false };
      if (typeof e.currentTarget.setPointerCapture === 'function') e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: PointerEvent<HTMLDivElement>) => {
      const d = dragRef.current;
      if (d === null || d.labelId !== labelId) return;
      // below the threshold it's still a click (preserves dblclick)
      if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < DRAG_THRESHOLD) return;
      d.moved = true;
      const { t, side: s } = project(e.clientX, e.clientY);
      const pos = labelXY(curve, t, s);
      setDrag({ labelId, x: pos.x, y: pos.y });
    },
    onPointerUp: (e: PointerEvent<HTMLDivElement>) => {
      const d = dragRef.current;
      dragRef.current = null;
      if (d === null || d.labelId !== labelId) return;
      if (typeof e.currentTarget.releasePointerCapture === 'function')
        e.currentTarget.releasePointerCapture(e.pointerId);
      if (d.moved) {
        const { t, side: s } = project(e.clientX, e.clientY);
        data.onMoveLabel?.(labelId, t, s);
      }
      setDrag(null);
    },
  });
  return { drag, handlers };
}

/** New-label editor. Derived from data.pendingAdd (a DiagramView state) rather
 * than local state, because a double-click selects the edge and remounts the
 * edges layer — local editor state would be destroyed by that remount, but a
 * remounted edge still receives pendingAdd and re-derives the editor. The
 * request is cleared (onPendingAddConsumed) only when the user commits/cancels. */
function NewLabelEditor({ data, curve, at }: { data: DiagramEdgeData; curve: EdgeCurve; at: Point }): ReactElement {
  const { t, perp } = nearestOnCurve(curve, at);
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
            if (v !== null && v.trim() !== '') data.onAddLabel?.(v.trim(), t, side);
            data.onPendingAddConsumed?.();
          }}
        />
      </div>
    </EdgeLabelRenderer>
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
