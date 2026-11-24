import { useCallback, useEffect, useRef, useState, type MutableRefObject, type RefObject } from 'react';
import type { ReactFlowInstance, Viewport } from '@xyflow/react';
import { PLAN_LAYOUT } from '../layout/plan-layout';
import type { DiagramViewProps } from './view-types';

/** The next width a day button gives: the next step up or down from `width`,
 * which an opened zone may have set between two steps; held at the ends. */
export function nextDayWidth(width: number, dir: 1 | -1): number {
  const steps = PLAN_LAYOUT.DAY_STEPS;
  if (dir > 0) return steps.find((s) => s > width) ?? PLAN_LAYOUT.DAY_MAX;
  return [...steps].reverse().find((s) => s < width) ?? PLAN_LAYOUT.DAY_MIN;
}

/** The viewport that keeps the day under the canvas centre there once days go
 * from `from` to `to` px wide. Every x the plan draws is a day times the width
 * (planX counts from x = 0), so the centre's flow x scales by `to / from`; the
 * zoom stays, so text keeps its size. */
export function centredViewport(vp: Viewport, canvasWidth: number, from: number, to: number): Viewport {
  const cx = canvasWidth / 2;
  const flowX = ((cx - vp.x) / vp.zoom) * (to / from);
  return { ...vp, x: cx - flowX * vp.zoom };
}

/** A stretch waiting for its layout, so the pan lands with the boxes it keeps in place. */
interface PendingPan {
  from: number;
  to: number;
}

export interface DayWidth {
  /** px per day now: the host's when it holds it, else the view's own */
  width: number;
  /** go to a width; a stretch the user asked for (`keepCentre`) keeps the day
   * under the canvas centre where it is */
  set: (width: number, keepCentre?: boolean) => void;
  /** one day button: the next step wider (1) or narrower (-1) */
  step: (dir: 1 | -1) => void;
  pendingPanRef: MutableRefObject<PendingPan | null>;
}

/** The plan's day width: controlled by the host when it passes `dayWidth`,
 * else held here; back to the default for another diagram, since it is view
 * state of this one and never saved. */
export function useDayWidth(props: Pick<DiagramViewProps, 'dayWidth' | 'onDayWidthChange' | 'model'>): DayWidth {
  const [own, setOwn] = useState<number>(PLAN_LAYOUT.DAY);
  const width = props.dayWidth ?? own;
  const pendingPanRef = useRef<PendingPan | null>(null);
  const onChange = props.onDayWidthChange;
  const set = useCallback(
    (next: number, keepCentre = false) => {
      const clamped = Math.min(PLAN_LAYOUT.DAY_MAX, Math.max(PLAN_LAYOUT.DAY_MIN, next));
      if (clamped === width) return;
      pendingPanRef.current = keepCentre ? { from: width, to: clamped } : null;
      setOwn(clamped);
      onChange?.(clamped);
    },
    [width, onChange],
  );
  const step = useCallback((dir: 1 | -1) => set(nextDayWidth(width, dir), true), [set, width]);
  const modelId = props.model.id;
  const seenModel = useRef(modelId);
  useEffect(() => {
    if (seenModel.current === modelId) return;
    seenModel.current = modelId;
    pendingPanRef.current = null;
    set(PLAN_LAYOUT.DAY);
    /* eslint-disable-next-line react-hooks/exhaustive-deps -- only another diagram resets it; `set` changes with every width */
  }, [modelId]);
  return { width, set, step, pendingPanRef };
}

/** Pans for a stretch once its layout has landed (see centredViewport): before
 * it, the boxes still stand at the old width and the pan would jump them. */
export function useCentreDayPan(input: {
  days: DayWidth;
  geometry: unknown;
  reactFlow: Pick<ReactFlowInstance, 'getViewport' | 'setViewport'>;
  wrapperRef: RefObject<HTMLElement | null>;
}): void {
  const { days, geometry, reactFlow, wrapperRef } = input;
  useEffect(() => {
    const pan = days.pendingPanRef.current;
    if (pan === null || pan.to !== days.width) return;
    days.pendingPanRef.current = null;
    const canvasWidth = wrapperRef.current?.clientWidth ?? 0;
    void reactFlow.setViewport(centredViewport(reactFlow.getViewport(), canvasWidth, pan.from, pan.to));
    /* eslint-disable-next-line react-hooks/exhaustive-deps -- the pan waits for the layout (geometry); the refs are stable */
  }, [geometry, days.width]);
}
