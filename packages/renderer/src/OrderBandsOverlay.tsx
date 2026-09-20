import { useMemo } from 'react';
import { useNodes, ViewportPortal } from '@xyflow/react';
import { SO_DECISION_TYPE, consequenceOrders, type DiagramModel, type LayoutDirection } from '@diagc/core';
import { absoluteRects } from './loops';
import { bandLabel, computeBands } from './order-bands';

export interface OrderBandsOverlayProps {
  model: DiagramModel;
  direction: LayoutDirection;
}

/**
 * The stripes and headers of a second-order diagram. Reads RENDERED positions
 * from the store (like GitLanesOverlay), so the bands follow a drag and a saved
 * position; must be mounted inside <ReactFlow>. The order comes from the graph,
 * so a box dragged above its cause keeps its band and the stripes overlap —
 * left visible: it is the picture telling the truth about the drag.
 */
export function OrderBandsOverlay({ model, direction }: OrderBandsOverlayProps) {
  const nodes = useNodes();
  const orders = useMemo(() => consequenceOrders(model).orders, [model]);
  const decisions = useMemo(() => model.nodes.filter((n) => n.type === SO_DECISION_TYPE && orders.get(n.id) === 0).length, [model, orders]);
  const bands = useMemo(() => computeBands(absoluteRects(nodes), orders, direction), [nodes, orders, direction]);
  if (bands.length === 0) return null;
  return (
    <ViewportPortal>
      <svg className="dg-order-bands" aria-hidden="true">
        {bands.map((b, i) => (
          <g key={b.order}>
            <rect className={`dg-order-band${i % 2 === 1 ? ' dg-order-band-alt' : ''}`} x={b.x} y={b.y} width={b.width} height={b.height} rx={6} />
            <text className="dg-order-band-header" x={b.header.x} y={b.header.y} dominantBaseline="hanging">
              {bandLabel(b.order, decisions)}
            </text>
          </g>
        ))}
      </svg>
    </ViewportPortal>
  );
}
