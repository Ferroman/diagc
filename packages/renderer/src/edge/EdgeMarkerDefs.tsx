import type { ReactElement } from 'react';

/** marker geometry per end style, in a 0..10 viewBox (refY 5). Exported for the
 * legend, whose connection swatches must end the way the arrows they describe do. */
export const END_SHAPES: Record<string, { refX: number; el: ReactElement } | undefined> = {
  arrow: { refX: 9, el: <path d="M0,0 L10,5 L0,10 z" /> },
  dot: { refX: 5, el: <circle cx="5" cy="5" r="4" /> },
  square: { refX: 5, el: <rect x="1.2" y="1.2" width="7.6" height="7.6" /> },
  diamond: { refX: 5, el: <path d="M5,0 L10,5 L5,10 L0,5 z" /> },
  // Anchored at its open end (x = 10), not its apex: the foot's three toes touch the
  // table and the apex sits out on the line. Anchored at the apex, the whole shape fell
  // on the node's side of the vertex, under the table that paints over it.
  crowsfoot: { refX: 10, el: <path d="M10,1 L0,5 L10,9 M0,5 L10,5" fill="none" /> },
  one: { refX: 8, el: <path d="M5,1 L5,9" fill="none" /> },
  // explicit "no head" for kind styles (a bare unknown id also draws none)
  none: undefined,
};

/** line-based (unfilled) end shapes: these need the marker to carry a `stroke`
 * so their strokes actually draw. Filled shapes (arrow/dot/…) must NOT get a
 * stroke, or they render an unwanted same-color outline (regression guard). */
export const LINE_MARKERS = new Set(['crowsfoot', 'one']);

/** An end marker as drawn: its `<marker>` id, the end style it draws and that style's shape. */
export interface EdgeMarker {
  id: string;
  style: string;
  shape: NonNullable<(typeof END_SHAPES)[string]>;
}

/** The edge's own marker definitions, end first, each in its own `<defs>`. */
export function EdgeMarkerDefs({
  end,
  start,
  stroke,
  size,
}: {
  end: EdgeMarker | undefined;
  start: EdgeMarker | undefined;
  stroke: string;
  size: number;
}): ReactElement {
  return (
    <>
      {end !== undefined && <MarkerDef marker={end} stroke={stroke} size={size} />}
      {start !== undefined && <MarkerDef marker={start} stroke={stroke} size={size} />}
    </>
  );
}

function MarkerDef({ marker, stroke, size }: { marker: EdgeMarker; stroke: string; size: number }): ReactElement {
  return (
    <defs>
      <marker
        id={marker.id}
        viewBox="0 0 10 10"
        refX={marker.shape.refX}
        refY="5"
        markerWidth={size}
        markerHeight={size}
        markerUnits="userSpaceOnUse"
        orient="auto-start-reverse"
        fill={stroke}
        {...(LINE_MARKERS.has(marker.style) ? { stroke, strokeWidth: 1.2 } : {})}
      >
        {marker.shape.el}
      </marker>
    </defs>
  );
}
