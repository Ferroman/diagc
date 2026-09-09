import { ViewportPortal } from '@xyflow/react';
import type { Guide } from './guides';

/** The alignment guides drawn while a node is dragged. Flow coordinates —
 * ViewportPortal applies the viewport transform — and purely visual: the
 * layer never catches the pointer, the drag continues underneath it. */
export function GuidesLayer({ lines }: { lines: readonly Guide[] }) {
  if (lines.length === 0) return null;
  return (
    <ViewportPortal>
      <svg className="dg-guides" aria-hidden="true">
        {lines.map((l, i) =>
          l.axis === 'x' ? (
            <line key={i} className="dg-guide" x1={l.at} x2={l.at} y1={l.from} y2={l.to} />
          ) : (
            <line key={i} className="dg-guide" y1={l.at} y2={l.at} x1={l.from} x2={l.to} />
          ),
        )}
      </svg>
    </ViewportPortal>
  );
}
