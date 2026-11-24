import { useMemo } from 'react';
import { useNodes, ViewportPortal } from '@xyflow/react';
import {
  PLAN_INTERRUPTS,
  atOf,
  dayOf,
  isPlanEvent,
  periodSpanOf,
  planPeriodsOf,
  planSubtreeRange,
  spanOf,
  type DiagramModel,
  type PlanSpan,
} from '@diagc/core/internal';
import { absoluteRects } from '../loops/loops';
import { PLAN_LAYOUT, planGraphCached, planX } from '../layout/plan-layout';
import { MARGIN_AFTER, MARGIN_BEFORE, timeAxis } from './time-axis';

export interface TimeAxisOverlayProps {
  model: DiagramModel;
  plane: string | undefined;
  /** the host's date (`YYYY-MM-DD`) for the today line; null or absent draws
   * none — an export must never bake in a line that is wrong tomorrow */
  today?: string | null;
  /** the zone opened on its own (the drill root): the header shows its dates,
   * and the rules its events, not the whole plan's */
  root?: string;
}

const { MONTH_H, WEEK_H, DAY_H } = PLAN_LAYOUT;
/** a day's two lines of text, centred in the day band: the weekday letter over
 * the day of the month (both fit a 20px day stacked, neither fits beside) */
const WEEKDAY_Y = -DAY_H + 10;
const DATE_Y = -9;
/** the hatch pattern's id; every plan header on a page defines the same one */
const HATCH_ID = 'dg-time-axis-hatch';

/** A period's days, shaded across the chart. One pausing no row in particular
 * pauses everyone: shaded under every bar, like a weekend (`holidays`); one
 * pausing rows is hatched on those bars instead. The zone opened on its own is
 * not drawn in its own view, so a period pausing it has no bar to hatch: that
 * pause spans the whole opened chart, hatched as the bar would be and clipped to
 * the zone's days (`rootPauses`). */
function periodShades(
  model: DiagramModel,
  periods: readonly string[],
  range: PlanSpan,
  root: string | undefined,
): { holidays: PlanSpan[]; rootPauses: (PlanSpan & { id: string })[] } {
  const byId = new Map(model.nodes.map((n) => [n.id, n] as const));
  const interrupting = new Set(model.relations.filter((r) => r.kind === PLAN_INTERRUPTS).map((r) => r.from));
  const holidays = periods
    .filter((id) => !interrupting.has(id))
    .map((id) => periodSpanOf(byId.get(id)!))
    .filter((s): s is PlanSpan => s !== undefined && s.start <= range.end && s.end >= range.start);
  const rootSpan = root === undefined ? undefined : spanOf(byId.get(root)!);
  const rootPauses =
    root === undefined || rootSpan === undefined
      ? []
      : planPeriodsOf(model, root).flatMap((id) => {
          const s = periodSpanOf(byId.get(id)!);
          if (s === undefined) return [];
          const start = Math.max(s.start, rootSpan.start);
          const end = Math.min(s.end, rootSpan.end);
          return start <= end ? [{ id, start, end }] : [];
        });
  return { holidays, rootPauses };
}

/** The periods' days down the chart (`periodShades`): a wash for everyone's
 * holiday, the bar's hatch for the opened zone's own pause. Drawn under the
 * grid, the rules and today. */
function PeriodShades({
  holidays,
  rootPauses,
  origin,
  height,
}: ReturnType<typeof periodShades> & { origin: number; height: number }) {
  const { DAY } = PLAN_LAYOUT;
  return (
    <>
      {rootPauses.length > 0 && (
        <defs>
          {/* the bar stripe's hatch (.dg-stripe): a 2px line every 7px, at 135° */}
          <pattern id={HATCH_ID} width={7} height={7} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect className="dg-time-axis-hatch" x={0} y={0} width={2} height={7} />
          </pattern>
        </defs>
      )}
      {holidays.map((s) => (
        <rect
          key={s.start}
          className="dg-time-axis-period"
          x={planX(s.start, origin)}
          y={-DAY_H}
          width={(s.end - s.start + 1) * DAY}
          height={height}
        />
      ))}
      {rootPauses.map((s) => (
        <rect
          key={s.id}
          className="dg-time-axis-period dg-time-axis-period-hatched"
          x={planX(s.start, origin)}
          y={-DAY_H}
          width={(s.end - s.start + 1) * DAY}
          height={height}
        />
      ))}
    </>
  );
}

/**
 * The calendar header of a plan: month, week and day bands above y = 0,
 * weekends shaded and a faint grid line per week down to the content, a period
 * that interrupts no row shaded the same way (a holiday for everyone), a dashed
 * rule under each root event, and today as its own marked day. Reads RENDERED positions from the store (like
 * GitLanesOverlay) so the grid follows a drag; must be mounted inside
 * <ReactFlow>. Dates come from the cached plan graph, never from the DOM.
 */
export function TimeAxisOverlay({ model, plane, today, root }: TimeAxisOverlayProps) {
  const nodes = useNodes();
  const rects = useMemo(() => absoluteRects(nodes), [nodes]);
  const g = planGraphCached(model, plane);
  // the same dates the layout scoped the drilled view to (plan-layout's planRun)
  const range = useMemo(
    () => (root === undefined ? g.range : (planSubtreeRange(g, model, root) ?? g.range)),
    [g, model, root],
  );
  const axis = useMemo(
    () => (range !== undefined && g.origin !== undefined ? timeAxis(range, g.origin) : undefined),
    [range, g],
  );
  if (axis === undefined || g.origin === undefined || range === undefined) return null;
  const { DAY, HEADER_H, PAD } = PLAN_LAYOUT;
  const origin = g.origin;
  let bottom = 0;
  for (const r of rects.values()) bottom = Math.max(bottom, r.y + r.height);
  bottom += PAD;
  const byId = new Map(model.nodes.map((n) => [n.id, n] as const));
  // the view's top-level events: the plan's, or the opened zone's own
  const rootEvents = g.events.filter((id) => g.parent.get(id) === root && isPlanEvent(byId.get(id)!));
  const { holidays, rootPauses } = periodShades(model, g.periods, range, root);
  const todayDay = today === undefined || today === null ? undefined : dayOf(today);
  // "inside the drawn extent" is the axis's own question, so it reads the
  // axis's own margins rather than a second copy of 7 and 8
  const todayX =
    todayDay !== undefined && todayDay >= range.start - MARGIN_BEFORE && todayDay < range.end + MARGIN_AFTER
      ? planX(todayDay, origin) + DAY / 2
      : undefined;
  const todayBand = todayX === undefined ? undefined : axis.days.find((d) => d.day === todayDay);
  return (
    <ViewportPortal>
      <svg className="dg-time-axis" aria-hidden="true">
        {/* opaque, under everything: the frame and the weekend wash are
            tints, and through them the canvas dots (one every 20px, so one
            per day) fell between the two digits of a day's number */}
        <rect className="dg-time-axis-backing" x={axis.x0} y={-HEADER_H} width={axis.x1 - axis.x0} height={HEADER_H} />
        {/* the frame is what content-bounds measures: the header must reach the PNG */}
        <rect className="dg-time-axis-frame" x={axis.x0} y={-HEADER_H} width={axis.x1 - axis.x0} height={HEADER_H} />
        {/* first, so the grid, the rules and today all draw over the shading */}
        {axis.weekends.map((w) => (
          <rect key={w.x} className="dg-time-axis-weekend" x={w.x} y={-DAY_H} width={w.width} height={DAY_H + bottom} />
        ))}
        <PeriodShades holidays={holidays} rootPauses={rootPauses} origin={origin} height={DAY_H + bottom} />
        {axis.months.map((m) => (
          <g key={m.x}>
            <line className="dg-time-axis-tick" x1={m.x} y1={-HEADER_H} x2={m.x} y2={0} />
            {m.label !== '' && (
              <text className="dg-time-axis-month" x={m.x + 6} y={-HEADER_H + MONTH_H / 2} dominantBaseline="middle">
                {m.label}
              </text>
            )}
          </g>
        ))}
        {axis.weeks.map((w) => (
          <g key={w.x}>
            <line className="dg-time-axis-tick" x1={w.x} y1={-DAY_H - WEEK_H} x2={w.x} y2={0} />
            <line className="dg-time-axis-grid" x1={w.x} y1={0} x2={w.x} y2={bottom} />
            {w.label !== '' && (
              <text className="dg-time-axis-week" x={w.x + 4} y={-DAY_H - WEEK_H / 2} dominantBaseline="middle">
                {w.label}
              </text>
            )}
          </g>
        ))}
        {axis.days.map((d) => (
          <g key={d.x}>
            <text className="dg-time-axis-weekday" x={d.x + d.width / 2} y={WEEKDAY_Y} dominantBaseline="middle">
              {d.weekday}
            </text>
            <text className="dg-time-axis-day" x={d.x + d.width / 2} y={DATE_Y} dominantBaseline="middle">
              {d.date}
            </text>
          </g>
        ))}
        {rootEvents.map((id) => {
          const at = atOf(byId.get(id)!);
          if (at === undefined) return null;
          const x = planX(at, origin) + DAY / 2;
          return <line key={id} className="dg-time-axis-event" x1={x} y1={0} x2={x} y2={bottom} />;
        })}
        {/* Today is its own day, filled: a "today" word in the week band sat
            on the week's label whenever the two shared a week. The cell and
            its text go after the line, so the line runs out from under it. */}
        {todayX !== undefined && todayBand !== undefined && (
          <g>
            <line className="dg-time-axis-today" x1={todayX} y1={-DAY_H} x2={todayX} y2={bottom} />
            <rect
              className="dg-time-axis-today-day"
              x={todayBand.x}
              y={-DAY_H}
              width={todayBand.width}
              height={DAY_H}
            />
            <text
              className="dg-time-axis-today-text dg-time-axis-today-weekday"
              x={todayX}
              y={WEEKDAY_Y}
              dominantBaseline="middle"
            >
              {todayBand.weekday}
            </text>
            <text className="dg-time-axis-today-text" x={todayX} y={DATE_Y} dominantBaseline="middle">
              {todayBand.date}
            </text>
          </g>
        )}
      </svg>
    </ViewportPortal>
  );
}
