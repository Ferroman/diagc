import type { CSSProperties } from 'react';
import { NodeChrome } from '../chrome';
import { sketchOf } from '../node-look';
import type { BodyProps } from './types';

/** The frame of one machine: an outline with its name in a tab at the top left,
 * `sm Order`. Keyed on the type rather than the fold state, since an empty
 * machine compiles as a leaf and must still be a frame. */
export function MachineFrameBody({ id, data, selected, width, height, parts }: BodyProps) {
  return (
    <div
      className={`dg-sm-machine${parts.loopClass}`}
      style={data.color !== undefined ? ({ '--dg-sm-accent': data.color } as CSSProperties) : undefined}
      data-type={data.typeId}
    >
      {sketchOf(data, 'box', { id, width, height }, 'none')}
      <span className="dg-sm-machine-tab">sm {parts.name}</span>
      <NodeChrome id={id} data={data} selected={selected} uses={['quickAdd', 'handles']} />
    </div>
  );
}
