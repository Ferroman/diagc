import { useViewport } from '@xyflow/react';
import { strokePath } from './drawings';
import type { LaserTrail } from './useLaser';

export interface LaserLayerProps {
  /** released gestures, each mid-fade */
  trails: readonly LaserTrail[];
  /** the gesture under the pointer right now, drawn solid */
  live: number[] | null;
}

/**
 * The laser pointer overlay: a second flow-space SVG above the drawings layer
 * (z-index 5 vs 4), transformed by the viewport so a trail stays on what it
 * pointed at when the presenter pans mid-fade. Every trail is a halo + core
 * pair in screen-constant widths (see styles.css); finished trails carry the
 * CSS fade, the live one is solid until release. Always mounted and always
 * pointer-transparent — it is a light that never takes a click.
 */
export function LaserLayer({ trails, live }: LaserLayerProps) {
  const { x, y, zoom } = useViewport();
  const trail = (key: string | number, points: number[], fading: boolean) => {
    const d = strokePath(points);
    return (
      <g key={key} className={`dg-laser-trail ${fading ? 'dg-laser-fade' : 'dg-laser-live'}`}>
        <path className="dg-laser-halo" d={d} vectorEffect="non-scaling-stroke" />
        <path className="dg-laser-core" d={d} vectorEffect="non-scaling-stroke" />
      </g>
    );
  };
  return (
    <svg className="dg-laser" aria-hidden="true">
      <g transform={`translate(${x} ${y}) scale(${zoom})`}>
        {trails.map((t) => trail(t.id, t.points, true))}
        {live !== null && live.length >= 2 && trail('live', live, false)}
      </g>
    </svg>
  );
}
