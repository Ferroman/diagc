import { NodeChrome } from '../chrome';
import { FoldChip } from '../NodeChips';
import type { BodyProps } from './types';

/** An open causal-loop group. Its members render as their own loose React
 * Flow nodes within this node's (now transparent) bounds; it draws only a
 * small name tag and the collapse toggle. */
export function CausalGroupBody({ id, data, selected, parts }: BodyProps) {
  return (
    <div className={`dg-cld-group${parts.loopClass}`}>
      <span className="dg-group-tag">
        <span className="dg-label">{data.label}</span>
        <FoldChip id={id} data={data} group />
      </span>
      <NodeChrome id={id} data={data} selected={selected} uses={['handles']} />
    </div>
  );
}
