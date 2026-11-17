import type { BoxSize, ViewEdge } from '@diagc/core/internal';
import { LOOP_LABEL_GAP, loopHalfExtent, loopRise } from '../edge/self-loop';

/** an outside node label elk keeps free beside a box */
export interface RoomLabel {
  width: number;
  height: number;
  text: string;
  layoutOptions: Record<string, string>;
}

const ABOVE = { 'elk.nodeLabels.placement': 'OUTSIDE V_TOP H_CENTER' };
const RIGHT_OF = { 'elk.nodeLabels.placement': 'OUTSIDE H_RIGHT V_CENTER' };

/**
 * The room each node's drawn self-loops take outside its box, by node id, as an
 * outside label elk keeps neighbours, routes and the layer gap off — the same
 * device as a glyph's caption, so the box keeps its drawn size. A self-loop is
 * left out of the layout (it has no route), and it stands out of the side across
 * the flow (self-loop.ts): above the box in a sideways flow, right of it in an
 * upright one. The room reaches the outermost loop's crown and, when a loop has
 * a label, the widest one: centred `LOOP_LABEL_GAP` above that crown, or
 * starting that far right of it. Beside a box the room is also as tall as a
 * loop on a short side bulges to.
 */
export function selfLoopRooms(
  edges: readonly ViewEdge[],
  direction: string,
  labelOf: (e: ViewEdge) => BoxSize | undefined,
): Map<string, RoomLabel> {
  const loops = new Map<string, ViewEdge[]>();
  for (const e of edges) if (e.from === e.to) loops.set(e.from, [...(loops.get(e.from) ?? []), e]);
  const sideways = direction === 'RIGHT' || direction === 'LEFT';
  const rooms = new Map<string, RoomLabel>();
  for (const [id, own] of loops) {
    const rise = loopRise(own.length - 1);
    const labels = own.map(labelOf).filter((b): b is BoxSize => b !== undefined);
    const width = Math.max(0, ...labels.map((b) => b.width));
    const height = Math.max(0, ...labels.map((b) => b.height));
    // how far out the room reaches, given how far the label reaches past the crown's gap
    const out = (extent: number) => rise + (labels.length > 0 ? LOOP_LABEL_GAP + extent : 0);
    rooms.set(
      id,
      sideways
        ? { width: Math.max(1, width), height: out(height / 2), text: 'self-loops', layoutOptions: ABOVE }
        : {
            width: out(width),
            height: Math.max(2 * loopHalfExtent(0), height),
            text: 'self-loops',
            layoutOptions: RIGHT_OF,
          },
    );
  }
  return rooms;
}
