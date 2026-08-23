import { useViewport } from '@xyflow/react';
import { DEFAULT_STROKE_WIDTH, type Stroke } from '@diagramming/core';
import { strokePath } from './drawings';

export interface LiveStroke {
  points: number[];
  color?: string;
  width: number;
}

export interface DrawingsLayerProps {
  strokes: readonly Stroke[];
  /** the stroke under the pen right now, drawn by the same layer so preview and result cannot differ */
  live?: LiveStroke | null;
  visible: boolean;
  /** eraser tool active: every stroke grows a wide invisible twin that takes the click */
  erasing: boolean;
  onErase?: (id: string) => void;
}

/** Px a thin line is widened to for eraser hit-testing, in SCREEN space —
 * divided by zoom so a hairline at 25% zoom is still clickable. */
const HIT_MIN_SCREEN_PX = 12;

/**
 * The freehand overlay: one SVG in FLOW coordinates, transformed by the
 * viewport like React Flow's own layers. Rendered as a child of <ReactFlow>, so
 * it sits above the renderer (nodes included — it is tracing paper) and below
 * the panels. `pointer-events: none` on the svg keeps nodes clickable; only the
 * eraser's hit paths opt back in. Hidden with display:none rather than
 * unmounted so toggling never re-creates hundreds of paths.
 */
export function DrawingsLayer({ strokes, live, visible, erasing, onErase }: DrawingsLayerProps) {
  const { x, y, zoom } = useViewport();
  return (
    <svg
      className="dg-drawings"
      aria-hidden="true"
      style={visible ? undefined : { display: 'none' }}
    >
      <g transform={`translate(${x} ${y}) scale(${zoom})`}>
        {strokes.map((s) => (
          <path
            key={s.id}
            className="dg-stroke"
            data-stroke-id={s.id}
            d={strokePath(s.points)}
            stroke={s.color ?? 'var(--dg-ink)'}
            strokeWidth={s.width ?? DEFAULT_STROKE_WIDTH}
          />
        ))}
        {erasing &&
          strokes.map((s) => (
            <path
              key={`hit-${s.id}`}
              className="dg-stroke-hit"
              data-stroke-id={s.id}
              d={strokePath(s.points)}
              strokeWidth={Math.max(s.width ?? DEFAULT_STROKE_WIDTH, HIT_MIN_SCREEN_PX / zoom)}
              onClick={() => onErase?.(s.id)}
            />
          ))}
        {live !== undefined && live !== null && live.points.length >= 2 && (
          <path
            className="dg-stroke dg-stroke-live"
            d={strokePath(live.points)}
            stroke={live.color ?? 'var(--dg-ink)'}
            strokeWidth={live.width}
          />
        )}
      </g>
    </svg>
  );
}
