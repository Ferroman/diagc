import type { CSSProperties } from 'react';
import type { BodyProps } from './types';

/** A stage is a frame across every lane of a git graph (see gitLayout). The
 * frame itself lets the pointer through — commits and lane lines sit inside it
 * and must stay clickable — so only its title can be grabbed. No chrome. */
export function GitStageBody({ data, parts }: BodyProps) {
  return (
    <div
      className={`dg-git-stage${parts.loopClass}`}
      style={data.color !== undefined ? ({ '--dg-stage': data.color } as CSSProperties) : undefined}
    >
      <span className="dg-git-stage-name" style={data.textColor !== undefined ? { color: data.textColor } : undefined}>
        {parts.name}
      </span>
    </div>
  );
}
