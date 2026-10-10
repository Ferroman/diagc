import { NodeChrome } from '../chrome';
import type { BodyProps } from './types';

/** An activity region: an outline inside a lane, named when it has a name. */
export function ActivityRegionBody({ id, data, selected, parts }: BodyProps) {
  return (
    <div className={`dg-activity-region${parts.loopClass}`}>
      {(data.label !== '' || data.labelEditing === true) && (
        <span className="dg-activity-region-name">{parts.name}</span>
      )}
      <NodeChrome id={id} data={data} selected={selected} uses={['handles']} />
    </div>
  );
}
