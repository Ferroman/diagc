import { NodeChrome } from '../chrome';
import type { BodyProps } from './types';

/** An orthogonal region: no border of its own, only its optional name at the top
 * left. The dashed line between two regions is the leading edge of the later one
 * (`regionSeparator`, set by the layout pass that stacked them), so the first
 * region, and a lone one (the same as none), show no line at all. */
export function RegionBody({ id, data, selected, parts }: BodyProps) {
  const separator = data.regionSeparator !== undefined ? ` dg-sm-region-sep-${data.regionSeparator}` : '';
  return (
    <div className={`dg-sm-region${separator}${parts.loopClass}`} data-type={data.typeId}>
      {(data.label !== '' || data.labelEditing === true) && <span className="dg-sm-region-name">{parts.name}</span>}
      <NodeChrome id={id} data={data} selected={selected} uses={['quickAdd', 'handles']} />
    </div>
  );
}
