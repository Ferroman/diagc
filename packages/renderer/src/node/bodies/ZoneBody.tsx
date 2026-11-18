import type { CSSProperties } from 'react';
import { NodeChrome } from '../chrome';
import type { BodyProps } from './types';

/** A state machine's zone: a square, lightly washed area with its title at the
 * top left in the zone's colour and, when it has one, a note under the title.
 * Deliberately not a rounded box: a zone is where states are drawn, not a state.
 * The layout leaves the header its room above the zone's content (containerPad). */
export function ZoneBody({ id, data, selected, parts }: BodyProps) {
  return (
    <div
      className={`dg-sm-zone${parts.loopClass}`}
      style={data.color !== undefined ? ({ '--dg-sm-zone': data.color } as CSSProperties) : undefined}
      data-type={data.typeId}
    >
      <div className="dg-sm-zone-head">
        <span className="dg-sm-zone-title">{parts.name}</span>
        {data.zoneNote !== undefined && <span className="dg-sm-zone-note">{data.zoneNote}</span>}
      </div>
      <NodeChrome id={id} data={data} selected={selected} uses={['quickAdd', 'handles']} />
    </div>
  );
}
