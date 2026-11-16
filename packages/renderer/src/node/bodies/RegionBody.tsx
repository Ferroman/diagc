import { NodeChrome } from '../chrome';
import type { BodyProps } from './types';

/** An orthogonal region: no border of its own, only its optional name at the top
 * left. The dashed line between regions belongs to the edge they share, which the
 * parent draws, so a lone region (the same as none) shows no line at all. */
export function RegionBody({ id, data, selected, parts }: BodyProps) {
  return (
    <div className={`dg-sm-region${parts.loopClass}`} data-type={data.typeId}>
      {(data.label !== '' || data.labelEditing === true) && <span className="dg-sm-region-name">{parts.name}</span>}
      <NodeChrome id={id} data={data} selected={selected} uses={['quickAdd', 'handles']} />
    </div>
  );
}
