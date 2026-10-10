import { NodeChrome } from '../chrome';
import { sketchOf } from '../node-look';
import type { BodyProps } from './types';

/** A plan event: the box is a small diamond (drawn by ::before — the generic
 * diamond clip-paths its root, which would clip the name away) and the name
 * hangs beside it, outside the layout footprint like a commit's tag. */
export function PlanEventBody({ id, data, selected, width, height, parts }: BodyProps) {
  const { name, loopClass, ghost } = parts;
  return (
    <div
      className={`dg-node dg-event-node${ghost.className}${loopClass}`}
      style={data.stylePreset?.rough !== undefined || data.color === undefined ? undefined : { color: data.color }}
      data-type={data.typeId}
      {...ghost.title}
    >
      {sketchOf(data, 'diamond', { id, width, height })}
      {(data.label !== '' || data.labelEditing === true) && <span className="dg-event-tag">{name}</span>}
      <NodeChrome id={id} data={data} selected={selected} uses={['link', 'comment', 'quickAdd', 'handles']} />
    </div>
  );
}
