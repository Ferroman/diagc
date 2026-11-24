import { useCallback, useEffect, useRef, useState, type MutableRefObject, type RefObject } from 'react';
import type { ReactFlowInstance, Viewport } from '@xyflow/react';
import { isPlanZone, planSubtreeRange, type DiagramModel } from '@diagc/core/internal';
import { PLAN_LAYOUT, planGraphCached } from '../layout/plan-layout';
import type { RootFitInput } from './useRootFit';
import type { DiagramViewProps } from './view-types';

/** The next width a day button gives: the next step up or down from `width`,
 * which an opened zone may have set between two steps; held at the ends. */
export function nextDayWidth(width: number, dir: 1 | -1): number {
  const steps = PLAN_LAYOUT.DAY_STEPS;
  if (dir > 0) return steps.find((s) => s > width) ?? PLAN_LAYOUT.DAY_MAX;
  return [...steps].reverse().find((s) => s < width) ?? PLAN_LAYOUT.DAY_MIN;
}

/** Drawn px per saved px on x for a canvas whose days are drawn `drawn` wide
 * (the width its layout landed at; `width` before the first one): a
 * saved x is kept at `PLAN_LAYOUT.DAY` (saved-frame.ts); 1 for a notation that
 * does not stretch time. */
export const savedScale = (stretches: boolean, drawn: number | undefined, width: number): number =>
  stretches ? drawnDayWidth(drawn, width) / PLAN_LAYOUT.DAY : 1;

/** The width the days on screen are drawn at: the last layout's, so the header
 * and the gestures switch with the bars, not a frame ahead of them. */
export const drawnDayWidth = (settled: number | undefined, width: number): number => settled ?? width;

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
  /** the width the last finished layout drew the days at (useViewLayout) */
  settledWidth: number | undefined;
  reactFlow: Pick<ReactFlowInstance, 'getViewport' | 'setViewport'>;
  wrapperRef: RefObject<HTMLElement | null>;
}): void {
  const { days, settledWidth, reactFlow, wrapperRef } = input;
  useEffect(() => {
    const pan = days.pendingPanRef.current;
    // the boxes move when their layout lands at the new width, not when the
    // width changes: panning earlier flings the old boxes for a frame
    if (pan === null || pan.to !== settledWidth) return;
    days.pendingPanRef.current = null;
    const canvasWidth = wrapperRef.current?.clientWidth ?? 0;
    void reactFlow.setViewport(centredViewport(reactFlow.getViewport(), canvasWidth, pan.from, pan.to));
    /* eslint-disable-next-line react-hooks/exhaustive-deps -- the pan waits for the layout's width; the refs are stable */
  }, [settledWidth]);
}

/** The share of the canvas an opened zone's days fill: a little room either side. */
const OPENED_FILL = 0.9;

/** The day width that stretches `days` across `canvasWidth`, in the allowed range. */
export function openedZoneWidth(canvasWidth: number, days: number): number {
  const width = Math.floor((canvasWidth * OPENED_FILL) / days);
  return Math.min(PLAN_LAYOUT.DAY_MAX, Math.max(PLAN_LAYOUT.DAY_MIN, width));
}

/** The width opening `root` stretches to: its interior's dates across the
 * canvas; undefined for a root that is not a dated zone. */
function stretchFor(model: DiagramModel, plane: string | undefined, root: string, canvasWidth: number) {
  const node = model.nodes.find((n) => n.id === root);
  if (node === undefined || !isPlanZone(node)) return undefined;
  const range = planSubtreeRange(planGraphCached(model, plane), model, root);
  return range === undefined ? undefined : openedZoneWidth(canvasWidth, range.end - range.start + 1);
}

/** How many leading levels two drill paths share. */
function sharedDepth(a: readonly string[], b: readonly string[]): number {
  let k = 0;
  while (k < a.length && k < b.length && a[k] === b[k]) k++;
  return k;
}

export interface OpenedZoneStretchInput {
  days: DayWidth;
  /** the drill trail, outermost first */
  path: readonly string[];
  model: DiagramModel;
  plane: string | undefined;
  /** the notation stretches time (NotationProfile.stretchesTime) */
  stretches: boolean;
  canvasWidth: () => number;
}

/**
 * Opening a zone on its own stretches its days across the canvas; leaving it
 * gives back the width it had before, whatever was done inside (each level
 * remembers the width before it, so going in twice and back out restores both
 * in turn). The new width is decided DURING the render the drill lands in and
 * returned at once, so the drill's camera fit can wait for a layout at that
 * width (useRootFit): set from an effect alone, the first layout to settle
 * would be the old width's, and the fit would frame it. A different diagram
 * starts afresh (useDayWidth puts the width back to the default).
 */
/** A drill's landing width: a number, or a zone to measure once the canvas has
 * a width (the render a view mounts in has none: its wrapper is not there yet) */
type Landing = number | { measure: string };

export function useOpenedZoneStretch(input: OpenedZoneStretchInput): number | null {
  const { days, path, model, plane, stretches } = input;
  // seen as the top level at first, so a view that mounts inside a zone (a deep
  // link, a reload) stretches it as an open would
  const seen = useRef<{ path: readonly string[]; modelId: string }>({ path: [], modelId: model.id });
  const before = useRef<number[]>([]);
  const pending = useRef<Landing | null>(null);
  if (seen.current.modelId !== model.id) {
    seen.current = { path, modelId: model.id };
    before.current = [];
    pending.current = null;
  } else if (stretches && sharedDepth(seen.current.path, path) !== Math.max(seen.current.path.length, path.length)) {
    const old = seen.current.path;
    const k = sharedDepth(old, path);
    let width = typeof pending.current === 'number' ? pending.current : days.width;
    if (old.length > k) width = before.current[k] ?? width;
    before.current = before.current.slice(0, k);
    for (let i = k; i < path.length; i++) before.current.push(width);
    const root = path[path.length - 1];
    const opens = path.length > k && root !== undefined && stretchFor(model, plane, root, 1) !== undefined;
    const canvas = input.canvasWidth();
    pending.current =
      opens && canvas === 0 ? { measure: root } : opens ? (stretchFor(model, plane, root, canvas) ?? width) : width;
    seen.current = { path, modelId: model.id };
  }
  useEffect(() => {
    const landing = pending.current;
    if (landing === null) return;
    pending.current = null;
    // by now the wrapper is there to measure (still none: the width stays)
    const width =
      typeof landing === 'number'
        ? landing
        : input.canvasWidth() > 0
          ? (stretchFor(model, plane, landing.measure, input.canvasWidth()) ?? days.width)
          : days.width;
    if (width !== days.width) days.set(width);
  });
  // null: not known until the canvas is measured — a fit waits for it
  return pending.current === null ? days.width : typeof pending.current === 'number' ? pending.current : null;
}

/** What a drill's camera fit needs from a view that stretches time: the width
 * the drill lands on (the fit waits for a layout at it), and, inside a plan
 * zone, a fit of the width alone. Empty for any other notation. */
export function useDrillStretch(input: {
  days: DayWidth;
  path: readonly string[];
  drillRoot: string | undefined;
  model: DiagramModel;
  plane: string | undefined;
  stretches: boolean;
  /** a view with no chrome (an export) keeps the width it was given */
  chromeless: boolean;
  wrapperRef: RefObject<HTMLElement | null>;
}): Pick<RootFitInput, 'dayWidth' | 'widthFit'> {
  const { wrapperRef, drillRoot, model } = input;
  const stretches = input.stretches && !input.chromeless;
  const canvas = useCallback(
    () => ({ width: wrapperRef.current?.clientWidth ?? 0, height: wrapperRef.current?.clientHeight ?? 0 }),
    [wrapperRef],
  );
  const landsAt = useOpenedZoneStretch({ ...input, stretches, canvasWidth: () => canvas().width });
  if (!stretches) return {};
  const opened = drillRoot !== undefined && model.nodes.some((n) => n.id === drillRoot && isPlanZone(n));
  return { dayWidth: landsAt, ...(opened ? { widthFit: { canvas } } : {}) };
}
