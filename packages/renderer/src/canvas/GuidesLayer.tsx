import { useViewport, ViewportPortal } from '@xyflow/react';
import type { Guide } from './guides';

/** The alignment guides drawn while a node is dragged. Flow coordinates —
 * ViewportPortal applies the viewport transform — and purely visual: the
 * layer never catches the pointer, the drag continues underneath it.
 *
 * ViewportPortal's transform is a CSS transform on an HTML ancestor of this
 * SVG, not an SVG-level transform — so `vector-effect: non-scaling-stroke`
 * (which only counteracts an SVG coordinate-system scale) does nothing here,
 * and the CSS `stroke-width`/`stroke-dasharray` inherit the zoom instead of
 * staying screen-constant. Divide by zoom explicitly on each line instead. */
export function GuidesLayer({ lines }: { lines: readonly Guide[] }) {
  const { zoom } = useViewport();
  if (lines.length === 0) return null;
  const strokeWidth = 1 / zoom;
  const strokeDasharray = `${4 / zoom} ${3 / zoom}`;
  return (
    <ViewportPortal>
      <svg className="dg-guides" aria-hidden="true">
        {lines.map((l, i) =>
          l.axis === 'x' ? (
            <line
              key={i}
              className="dg-guide"
              x1={l.at}
              x2={l.at}
              y1={l.from}
              y2={l.to}
              strokeWidth={strokeWidth}
              strokeDasharray={strokeDasharray}
            />
          ) : (
            <line
              key={i}
              className="dg-guide"
              y1={l.at}
              y2={l.at}
              x1={l.from}
              x2={l.to}
              strokeWidth={strokeWidth}
              strokeDasharray={strokeDasharray}
            />
          ),
        )}
      </svg>
    </ViewportPortal>
  );
}
