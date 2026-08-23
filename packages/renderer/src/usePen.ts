import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { simplifyStroke } from './drawings';

type Handler = (e: ReactPointerEvent<HTMLElement>) => void;

export interface PenHandlers {
  onPointerDownCapture: Handler;
  onPointerMoveCapture: Handler;
  onPointerUpCapture: Handler;
  onPointerCancelCapture: Handler;
}

export interface PenOptions {
  enabled: boolean;
  /** screen → flow coordinates (reactFlow.screenToFlowPosition) */
  toFlow: (p: { x: number; y: number }) => { x: number; y: number };
  /** one finished stroke: rounded, simplified flow points */
  onStroke: (points: number[]) => void;
}

/**
 * Freehand capture as CAPTURE-PHASE handlers for the canvas wrapper. Stopping
 * propagation there is what keeps React Flow out of the gesture: its pane
 * (d3-zoom pan) and its nodes (d3-drag) listen further down the tree, so they
 * never see the pointer and cannot start a pan, a drag or a selection. Wheel is
 * not intercepted — scroll-pan and ctrl/pinch zoom keep working mid-drawing.
 * Only the primary button draws; anything else propagates untouched.
 */
export function usePen({ enabled, toFlow, onStroke }: PenOptions): { live: number[] | null; handlers: PenHandlers } {
  const [live, setLive] = useState<number[] | null>(null);
  const pointsRef = useRef<number[] | null>(null);
  const pointerIdRef = useRef<number | null>(null);

  const push = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const pts = pointsRef.current;
      if (pts === null) return;
      const native = e.nativeEvent as PointerEvent & { getCoalescedEvents?: () => PointerEvent[] };
      // Coalesced events carry the samples the browser merged into this one
      // move; a fast stroke without them is visibly polygonal.
      const samples = typeof native.getCoalescedEvents === 'function' ? native.getCoalescedEvents() : [];
      for (const s of samples.length > 0 ? samples : [native]) {
        const p = toFlow({ x: s.clientX, y: s.clientY });
        pts.push(p.x, p.y);
      }
      setLive([...pts]);
    },
    [toFlow],
  );

  const onPointerDownCapture = useCallback<Handler>(
    (e) => {
      if (!enabled || e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
      // jsdom has no pointer capture; browsers need it so a stroke that leaves
      // the canvas still ends with the pointerup.
      e.currentTarget.setPointerCapture?.(e.pointerId);
      pointerIdRef.current = e.pointerId;
      const p = toFlow({ x: e.clientX, y: e.clientY });
      pointsRef.current = [p.x, p.y];
      setLive([p.x, p.y]);
    },
    [enabled, toFlow],
  );

  const onPointerMoveCapture = useCallback<Handler>(
    (e) => {
      if (pointerIdRef.current !== e.pointerId) return;
      e.stopPropagation();
      push(e);
    },
    [push],
  );

  const finish = useCallback(
    (e: ReactPointerEvent<HTMLElement>, report: boolean) => {
      if (pointerIdRef.current !== e.pointerId) return;
      e.stopPropagation();
      const pts = pointsRef.current;
      pointsRef.current = null;
      pointerIdRef.current = null;
      setLive(null);
      if (report && pts !== null) onStroke(simplifyStroke(pts.map((v) => Math.round(v))));
    },
    [onStroke],
  );

  const onPointerUpCapture = useCallback<Handler>((e) => finish(e, true), [finish]);
  const onPointerCancelCapture = useCallback<Handler>((e) => finish(e, false), [finish]);

  return { live, handlers: { onPointerDownCapture, onPointerMoveCapture, onPointerUpCapture, onPointerCancelCapture } };
}
