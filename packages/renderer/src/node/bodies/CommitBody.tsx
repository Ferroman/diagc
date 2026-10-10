import { NodeChrome } from '../chrome';
import { accentStyle, sketchOf } from '../node-look';
import type { BodyProps } from './types';

/** A circle leaf: a git commit, or any type the registry draws as a circle. */
export function CommitBody({ id, data, selected, width, height, parts }: BodyProps) {
  const { name, loopClass, ghost } = parts;
  // The box is the circle; the tag hangs above it, outside the layout
  // footprint, so untagged commits and tagged ones take the same room.
  const tagColor = data.textColor ?? data.color;
  return (
    <div
      className={`dg-node dg-circle-node${ghost.className}${loopClass}`}
      style={data.stylePreset?.rough !== undefined ? undefined : accentStyle(data.color)}
      {...ghost.title}
    >
      {sketchOf(data, 'circle', { id, width, height })}
      {(data.label !== '' || data.labelEditing === true) && (
        <span className="dg-commit-tag" style={tagColor !== undefined ? { color: tagColor } : undefined}>
          {name}
        </span>
      )}
      <NodeChrome id={id} data={data} selected={selected} uses={['link', 'quickAdd', 'handles']} />
    </div>
  );
}
