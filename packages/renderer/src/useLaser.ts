import { useCallback, useEffect, useRef, useState } from 'react';
import { usePen, type PenHandlers } from './usePen';

/** How long a released laser trail stays on screen (the CSS fade in
 * styles.css runs for the same duration — keep the two in step). */
export const LASER_FADE_MS = 1000;

export interface LaserTrail {
  id: number;
  /** flow coordinates, flat [x0, y0, x1, y1, …] like a Stroke */
  points: number[];
}

export interface LaserOptions {
  enabled: boolean;
  /** screen → flow coordinates (reactFlow.screenToFlowPosition) */
  toFlow: (p: { x: number; y: number }) => { x: number; y: number };
}

/**
 * The laser pointer: pen capture (same capture-phase handlers, so React Flow
 * never sees the drag) whose strokes are never reported to anyone. A finished
 * gesture becomes a trail that removes itself after LASER_FADE_MS; the host
 * draws the trail with a matching CSS fade so it is gone by the time it is
 * unmounted. Trails are keyed by a counter rather than content — two identical
 * gestures must fade independently.
 */
export function useLaser({ enabled, toFlow }: LaserOptions): {
  live: number[] | null;
  trails: LaserTrail[];
  handlers: PenHandlers;
} {
  const [trails, setTrails] = useState<LaserTrail[]>([]);
  const nextIdRef = useRef(0);
  const timersRef = useRef(new Set<ReturnType<typeof setTimeout>>());

  const onStroke = useCallback((points: number[]) => {
    const id = nextIdRef.current++;
    setTrails((ts) => [...ts, { id, points }]);
    const timer = setTimeout(() => {
      timersRef.current.delete(timer);
      setTrails((ts) => ts.filter((t) => t.id !== id));
    }, LASER_FADE_MS);
    timersRef.current.add(timer);
  }, []);

  // Pending fades must not outlive the canvas (a diagram switch unmounts it).
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const t of timers) clearTimeout(t);
      timers.clear();
    };
  }, []);

  const pen = usePen({ enabled, toFlow, onStroke });
  return { live: pen.live, trails, handlers: pen.handlers };
}
