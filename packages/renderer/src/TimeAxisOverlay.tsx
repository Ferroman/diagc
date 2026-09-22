import { useMemo } from 'react';
import { useNodes, ViewportPortal } from '@xyflow/react';
import { atOf, dayOf, isPlanEvent, type DiagramModel } from '@diagc/core';
import { absoluteRects } from './loops';
import { PLAN_LAYOUT, planGraphCached, planX } from './plan-layout';
import { timeAxis } from './time-axis';

export interface TimeAxisOverlayProps {
  model: DiagramModel;
  plane: string | undefined;
  /** the host's date (`YYYY-MM-DD`) for the today line; null or absent draws
   * none — an export must never bake in a line that is wrong tomorrow */
  today?: string | null;
}

const BAND_H = PLAN_LAYOUT.HEADER_H / 2;

/**
 * The calendar header of a plan: a month band and a week band above y = 0, a
 * faint grid line per week down to the content, a dashed rule under each root
 * event and the today line. Reads RENDERED positions from the store (like
 * GitLanesOverlay) so the grid follows a drag; must be mounted inside
 * <ReactFlow>. Dates come from the cached plan graph, never from the DOM.
 */
export function TimeAxisOverlay({ model, plane, today }: TimeAxisOverlayProps) {
  const nodes = useNodes();
  const rects = useMemo(() => absoluteRects(nodes), [nodes]);
  const g = planGraphCached(model, plane);
  const axis = useMemo(() => (g.range !== undefined && g.origin !== undefined ? timeAxis(g.range, g.origin) : undefined), [g]);
  if (axis === undefined || g.origin === undefined || g.range === undefined) return null;
  const { DAY, HEADER_H, PAD } = PLAN_LAYOUT;
  const origin = g.origin;
  let bottom = 0;
  for (const r of rects.values()) bottom = Math.max(bottom, r.y + r.height);
  bottom += PAD;
  const byId = new Map(model.nodes.map((n) => [n.id, n] as const));
  const rootEvents = g.events.filter((id) => !g.parent.has(id) && isPlanEvent(byId.get(id)!));
  const todayDay = today === undefined || today === null ? undefined : dayOf(today);
  const todayX =
    todayDay !== undefined && todayDay >= g.range.start - 7 && todayDay < g.range.end + 8 ? planX(todayDay, origin) + DAY / 2 : undefined;
  return (
    <ViewportPortal>
      <svg className="dg-time-axis" aria-hidden="true">
        {/* the frame is what content-bounds measures: the header must reach the PNG */}
        <rect className="dg-time-axis-frame" x={axis.x0} y={-HEADER_H} width={axis.x1 - axis.x0} height={HEADER_H} />
        {axis.months.map((m) => (
          <g key={m.x}>
            <line className="dg-time-axis-tick" x1={m.x} y1={-HEADER_H} x2={m.x} y2={0} />
            <text className="dg-time-axis-month" x={m.x + 6} y={-HEADER_H + BAND_H / 2} dominantBaseline="middle">
              {m.label}
            </text>
          </g>
        ))}
        {axis.weeks.map((w) => (
          <g key={w.x}>
            <line className="dg-time-axis-tick" x1={w.x} y1={-BAND_H} x2={w.x} y2={0} />
            <line className="dg-time-axis-grid" x1={w.x} y1={0} x2={w.x} y2={bottom} />
            {w.label !== '' && (
              <text className="dg-time-axis-week" x={w.x + 4} y={-BAND_H / 2} dominantBaseline="middle">
                {w.label}
              </text>
            )}
          </g>
        ))}
        {rootEvents.map((id) => {
          const at = atOf(byId.get(id)!);
          if (at === undefined) return null;
          const x = planX(at, origin) + DAY / 2;
          return <line key={id} className="dg-time-axis-event" x1={x} y1={0} x2={x} y2={bottom} />;
        })}
        {todayX !== undefined && (
          <g>
            <line className="dg-time-axis-today" x1={todayX} y1={-BAND_H} x2={todayX} y2={bottom} />
            <text className="dg-time-axis-today-label" x={todayX + 4} y={-BAND_H / 2} dominantBaseline="middle">
              today
            </text>
          </g>
        )}
      </svg>
    </ViewportPortal>
  );
}
