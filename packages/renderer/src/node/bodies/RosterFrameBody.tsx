import type { CSSProperties } from 'react';
import { NodeChrome } from '../chrome';
import { dropTargetAttrs, nodeIcon, planHit, sketchOf } from '../node-look';
import { NodeChips } from '../NodeChips';
import type { BodyProps } from './types';

/**
 * A plan team drawn as the frame around its members' badges in the roster
 * (DiagramNodeData.rosterFrame). The badges are roots beside it, not children,
 * so it is a leaf of the model laid out as a container: rounded in every look,
 * washed and edged in the team's colour, with a header row of the team's icon,
 * name and eye — no type line, since the frame itself says it is a team.
 */
export function RosterFrameBody({ id, data, selected, width, height, profile, parts }: BodyProps) {
  const { style, name, loopClass, highlight } = parts;
  const { hitStyle, hitAttrs } = planHit(id, data, profile, highlight);
  const Icon = nodeIcon(data, style);
  // the edge and the wash are both drawn from it (styles.css .dg-roster-frame)
  const tint = data.color === undefined ? undefined : ({ '--dg-frame': data.color } as CSSProperties);
  return (
    <div
      className={`dg-group dg-roster-frame${loopClass}`}
      style={data.stylePreset?.rough !== undefined ? hitStyle : { ...tint, ...hitStyle }}
      data-type={data.typeId}
      {...hitAttrs}
      {...dropTargetAttrs(data)}
    >
      {sketchOf(data, 'rounded', { id, width, height }, 'wash')}
      <NodeChrome id={id} data={data} selected={selected} uses={['link', 'threat', 'comment', 'quickAdd']} />
      {/* a group header, so every look's font and stacking reach it */}
      <div className="dg-group-header dg-roster-frame-header">
        {Icon !== undefined && <Icon size={16} className="dg-icon" />}
        {name}
        <NodeChips id={id} data={data} profile={profile} focusId={highlight.focusId} />
      </div>
      <NodeChrome id={id} data={data} selected={selected} uses={['handles']} />
    </div>
  );
}
