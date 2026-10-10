import type { CSSProperties } from 'react';
import { ACTIVITY_FRAME_TYPE } from '@diagc/core/internal';
import { NodeChrome, QuickAddButton } from '../chrome';
import type { BodyProps } from './types';

/** An activity frame, or one of the lanes it stacks: a band with its name in
 * a strip. A lane offers to add a lane on either side. */
export function ActivityBandBody({ id, data, selected, parts }: BodyProps) {
  const isFrame = data.typeId === ACTIVITY_FRAME_TYPE;
  return (
    <div
      className={`${isFrame ? 'dg-activity-frame' : 'dg-activity-lane'}${parts.loopClass}`}
      style={data.color !== undefined ? ({ '--dg-act-accent': data.color } as CSSProperties) : undefined}
    >
      <span className="dg-activity-strip">
        <span className="dg-activity-name">{parts.name}</span>
      </span>
      <NodeChrome id={id} data={data} selected={selected} uses={['handles']} />
      {!isFrame && (
        <>
          <QuickAddButton id={id} data={data} selected={selected} side="before" />
          <QuickAddButton id={id} data={data} selected={selected} side="after" />
        </>
      )}
    </div>
  );
}
