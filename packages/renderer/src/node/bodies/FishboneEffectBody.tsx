import { NodeChrome } from '../chrome';
import type { BodyProps } from './types';

/** The effect IS the spine: fishboneLayout sizes this node across the whole
 * fish, the line fills it and the head box sits at its right end (the git-lane
 * trick — no canvas overlay needed). Flex lets the line take whatever the box
 * leaves, so nothing here needs to know the box's width. */
export function FishboneEffectBody({ id, data, selected, parts }: BodyProps) {
  return (
    <div className={`dg-fb-head${parts.loopClass}`}>
      <span className="dg-fb-spine" aria-hidden="true" />
      <span className="dg-fb-head-box">{parts.name}</span>
      <NodeChrome id={id} data={data} selected={selected} uses={['quickAdd', 'handles']} />
    </div>
  );
}
