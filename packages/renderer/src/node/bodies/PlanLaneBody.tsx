import type { CSSProperties } from 'react';
import type { BodyProps } from './types';

/** A grouped plan's lane header: the team's name after a swatch of its colour,
 * across the chart's width. A heading over the lane's bars, not a node of the
 * model — it has no rename, no badges and no handles, since nothing can link
 * to, comment on or connect a lane. */
export function PlanLaneBody({ data }: BodyProps) {
  return (
    <div
      className="dg-node dg-plan-lane"
      style={data.color === undefined ? undefined : ({ '--dg-lane': data.color } as CSSProperties)}
      data-type={data.typeId}
    >
      <span className="dg-plan-lane-swatch" aria-hidden="true" />
      <span className="dg-plan-lane-name">{data.label}</span>
    </div>
  );
}
