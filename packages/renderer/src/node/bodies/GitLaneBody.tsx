import { NodeChrome } from '../chrome';
import { accentStyle } from '../node-look';
import type { BodyProps } from './types';

/** A git lane is a row, not a box: no border, no fill, none of the fold/enter
 * chrome (the notation keeps it expanded). Its name sits in a tinted box at
 * the band's right end — the reference's "Master / Nightly" labels. Width and
 * inset mirror GIT_LAYOUT.LABEL_W / MARGIN in styles.css. The quick-add button
 * (append a commit) keeps its default spot, just past the row's right end —
 * beside the name, where the lane is grabbed. */
export function GitLaneBody({ id, data, selected, parts }: BodyProps) {
  return (
    <div className={`dg-lane${parts.loopClass}`}>
      <span
        className="dg-lane-label"
        style={
          data.color !== undefined ? { ...accentStyle(data.color), color: data.textColor ?? data.color } : undefined
        }
      >
        {parts.name}
      </span>
      <NodeChrome id={id} data={data} selected={selected} uses={['quickAdd', 'handles']} />
    </div>
  );
}
