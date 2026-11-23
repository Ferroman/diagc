import { useMemo } from 'react';
import { useNodes, ViewportPortal } from '@xyflow/react';
import { atOf, dayOf, isPlanEvent, planSubtreeRange, type DiagramModel } from '@diagc/core/internal';
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

/**
 * The calendar header of a plan: month, week and day bands above y = 0,
 * weekends shaded and a faint grid line per week down to the content, a dashed
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
