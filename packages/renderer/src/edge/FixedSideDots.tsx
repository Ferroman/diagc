import type { ReactElement } from 'react';
import type { DiagramEdgeData } from './DiagramEdge';
import { sideFromPosition, type EdgeParams } from './floating';

/** fixed-side dot radius (px) */
const FIXED_SIDE_DOT_R = 5;
/** how far a fixed-side dot sits off the edge line, along the perpendicular (px) — kept
 * clear of React Flow's endpoint reconnect grab zone so click-to-fix and
 * drag-to-reattach don't fight over the same pixels */
const FIXED_SIDE_DOT_OFFSET = 16;

/** Fixed-side dots: only for the active sole-relation edge whose host wired the
 * side callback (edit mode). Each dot toggles its end between floating and
 * frozen-at-the-current-facing-side; positioned off the line, from the floating
 * ends, so it doesn't steal React Flow's reconnect grab. */
export function FixedSideDots({ ends, data }: { ends: EdgeParams; data: DiagramEdgeData }): ReactElement | null {
  const onSetSide = data.onSetSide;
  if (onSetSide === undefined || data.fixedSideDotsShown !== true || data.constituentCount !== 1) return null;
  const dx = ends.tx - ends.sx;
  const dy = ends.ty - ends.sy;
  const len = Math.hypot(dx, dy) || 1;
  const ox = (-dy / len) * FIXED_SIDE_DOT_OFFSET;
  const oy = (dx / len) * FIXED_SIDE_DOT_OFFSET;
  const fromSideFixed = data.relStyle?.fromSide !== undefined;
  const toSideFixed = data.relStyle?.toSide !== undefined;
  return (
    <>
      <FixedSideDot
        end="from"
        cx={ends.sx + ox}
        cy={ends.sy + oy}
        fixed={fromSideFixed}
        onToggle={() => onSetSide('from', fromSideFixed ? null : sideFromPosition(ends.sourcePos))}
      />
      <FixedSideDot
        end="to"
        cx={ends.tx + ox}
        cy={ends.ty + oy}
        fixed={toSideFixed}
        onToggle={() => onSetSide('to', toSideFixed ? null : sideFromPosition(ends.targetPos))}
      />
    </>
  );
}

function FixedSideDot({
  end,
  cx,
  cy,
  fixed,
  onToggle,
}: {
  end: 'from' | 'to';
  cx: number;
  cy: number;
  fixed: boolean;
  onToggle: () => void;
}) {
  return (
    <circle
      className={`dg-edge-pin${fixed ? ' pinned' : ''}`}
      data-end={end}
      cx={cx}
      cy={cy}
      r={FIXED_SIDE_DOT_R}
      role="button"
      aria-label={`${fixed ? 'Unpin' : 'Pin'} ${end === 'from' ? 'source' : 'target'} end`}
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
