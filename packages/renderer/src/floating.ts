import { Position } from '@xyflow/react';
import { SIDES, type Side } from '@diagc/core';

// Re-export: floating.ts is the renderer's established source for the Side
// type (index.tsx and callers import it from here) — keep that path working.
export type { Side };

/** the subset of an InternalNode the floating computation needs */
export interface FloatingNode {
  internals: { positionAbsolute: { x: number; y: number } };
  measured?: { width?: number; height?: number };
}

export interface EdgeParams {
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  sourcePos: Position;
  targetPos: Position;
}

const rectOf = (n: FloatingNode) => ({
  x: n.internals.positionAbsolute.x,
  y: n.internals.positionAbsolute.y,
  width: n.measured?.width ?? 0,
  height: n.measured?.height ?? 0,
});

/**
 * Point where the line between the two node centers crosses `node`'s border.
 * Standard React Flow floating-edges math (rect treated via the diamond
 * transform); guards keep zero-sized (unmeasured) nodes from dividing by zero.
 */
function intersect(node: FloatingNode, other: FloatingNode): { x: number; y: number } {
  const a = rectOf(node);
  const b = rectOf(other);
  const w = a.width / 2 || 1;
  const h = a.height / 2 || 1;
  const x2 = a.x + w;
  const y2 = a.y + h;
  const x1 = b.x + (b.width / 2 || 1);
  const y1 = b.y + (b.height / 2 || 1);

  const xx1 = (x1 - x2) / (2 * w) - (y1 - y2) / (2 * h);
  const yy1 = (x1 - x2) / (2 * w) + (y1 - y2) / (2 * h);
  const scale = 1 / (Math.abs(xx1) + Math.abs(yy1) || 1);
  const xx3 = scale * xx1;
  const yy3 = scale * yy1;
  return { x: w * (xx3 + yy3) + x2, y: h * (-xx3 + yy3) + y2 };
}

/** which side of `node` the point sits on (for bezier control direction) */
function sideOf(node: FloatingNode, point: { x: number; y: number }): Position {
  const r = rectOf(node);
  const nx = Math.round(r.x);
  const ny = Math.round(r.y);
  const px = Math.round(point.x);
  const py = Math.round(point.y);
  if (px <= nx + 1) return Position.Left;
  if (px >= nx + r.width - 1) return Position.Right;
  if (py <= ny + 1) return Position.Top;
  if (py >= ny + r.height - 1) return Position.Bottom;
  return Position.Top;
}

const asSide = (handle: string | null | undefined): Side | undefined =>
  // Core's SIDES is a narrow `as const` tuple; widen to `readonly string[]` so
  // the membership test accepts any handle string.
  handle !== null && handle !== undefined && (SIDES as readonly string[]).includes(handle) ? (handle as Side) : undefined;

/** Pins for the sides a connect gesture actually used, so a new relation
 * attaches where the user dragged instead of re-floating to the facing sides.
 * An end with no (or an unrecognized) handle id stays unpinned. */
export function connectionSides(conn: { sourceHandle?: string | null; targetHandle?: string | null }): {
  fromSide?: Side;
  toSide?: Side;
} {
  const fromSide = asSide(conn.sourceHandle);
  const toSide = asSide(conn.targetHandle);
  return {
    ...(fromSide !== undefined ? { fromSide } : {}),
    ...(toSide !== undefined ? { toSide } : {}),
  };
}

const SIDE_POSITION: Record<Side, Position> = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
};

/** the Side a React Flow Position denotes (Position values already carry the
 * side strings; this keeps the mapping typed for callers pinning to the side an
 * endpoint currently faces) */
export function sideFromPosition(pos: Position): Side {
  switch (pos) {
    case Position.Top:
      return 'top';
    case Position.Right:
      return 'right';
    case Position.Bottom:
      return 'bottom';
    case Position.Left:
      return 'left';
  }
}

/**
 * Decide how a reconnect drag changes the dragged endpoint's pin. Dropping an
 * end on a *different* node re-floats it (side cleared); re-dropping it on the
 * *same* node pins it to the side the loose-mode gesture snapped to. `draggedEnd`
 * comes from onReconnectStart ('source'/'target'); when it's unknown we infer
 * the moved end from the node diff (which can't detect same-node side changes).
 * Returns undefined when nothing meaningful moved.
 */
export function reconnectPin(
  draggedEnd: 'source' | 'target' | null,
  conn: { source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null },
  rel: { from: string; to: string },
): { end: 'from' | 'to'; side: Side | null } | undefined {
  const end: 'source' | 'target' | null =
    draggedEnd ?? (conn.source !== rel.from ? 'source' : conn.target !== rel.to ? 'target' : null);
  if (end === 'source') {
    const sameNode = conn.source === rel.from;
    return { end: 'from', side: sameNode ? (asSide(conn.sourceHandle) ?? null) : null };
  }
  if (end === 'target') {
    const sameNode = conn.target === rel.to;
    return { end: 'to', side: sameNode ? (asSide(conn.targetHandle) ?? null) : null };
  }
  return undefined;
}

/** midpoint of a node border side (for pinned connection points) */
function sideAnchor(node: FloatingNode, side: Side): { x: number; y: number } {
  const r = rectOf(node);
  switch (side) {
    case 'top':
      return { x: r.x + r.width / 2, y: r.y };
    case 'bottom':
      return { x: r.x + r.width / 2, y: r.y + r.height };
    case 'left':
      return { x: r.x, y: r.y + r.height / 2 };
    case 'right':
      return { x: r.x + r.width, y: r.y + r.height / 2 };
  }
}

/**
 * Excalidraw-style floating anchors: each edge leaves/enters through the point
 * where the center-to-center line crosses the node border, whichever side that
 * is, instead of fixed top/bottom handles. A pinned side overrides the
 * automatic choice for that endpoint.
 */
export function getEdgeParams(
  source: FloatingNode,
  target: FloatingNode,
  pins?: { sourceSide?: Side; targetSide?: Side },
): EdgeParams {
  const s = pins?.sourceSide !== undefined ? sideAnchor(source, pins.sourceSide) : intersect(source, target);
  const t = pins?.targetSide !== undefined ? sideAnchor(target, pins.targetSide) : intersect(target, source);
  return {
    sx: s.x,
    sy: s.y,
    tx: t.x,
    ty: t.y,
    sourcePos: pins?.sourceSide !== undefined ? SIDE_POSITION[pins.sourceSide] : sideOf(source, s),
    targetPos: pins?.targetSide !== undefined ? SIDE_POSITION[pins.targetSide] : sideOf(target, t),
  };
}
