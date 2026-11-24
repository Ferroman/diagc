import { NodeChrome } from '../chrome';
import type { BodyProps } from './types';

/** A plan period in the header: a bracket over its days — a line with a tick
 * down at each end — and its name on it. It is a stretch of the calendar, not
 * a bar of work, so it has no fill. Notes, links and comments still hang off
 * it like any node's. */
export function PlanPeriodBody({ id, data, selected, parts }: BodyProps) {
  const { name, loopClass, ghost } = parts;
  return (
    <div
      className={`dg-node dg-period-node${ghost.className}${loopClass}`}
      style={data.color === undefined ? undefined : { color: data.color }}
      data-type={data.typeId}
      {...ghost.title}
    >
      <span className="dg-period-bracket" aria-hidden="true" />
      {(data.label !== '' || data.labelEditing === true) && <span className="dg-period-name">{name}</span>}
      <NodeChrome id={id} data={data} selected={selected} uses={['link', 'comment', 'handles']} />
    </div>
  );
}
