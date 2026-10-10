import { NodeChrome } from '../chrome';
import type { BodyProps } from './types';

/** A cause is text on a line, not a box: no border, no fill, and no accent —
 * the bone colour belongs to the line (the profile's edge colour), the text
 * stays readable in the theme's own colour unless the author picks one. */
export function FishboneCauseBody({ id, data, selected, parts }: BodyProps) {
  return (
    <div
      className={`dg-fb-cause${parts.loopClass}`}
      style={data.textColor !== undefined ? { color: data.textColor } : undefined}
    >
      {parts.name}
      <NodeChrome id={id} data={data} selected={selected} uses={['quickAdd', 'handles']} />
    </div>
  );
}
