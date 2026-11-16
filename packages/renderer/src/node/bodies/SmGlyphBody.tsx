import type { ReactElement } from 'react';
import {
  SM_DEEP_HISTORY_TYPE,
  SM_ENTRY_TYPE,
  SM_EXIT_TYPE,
  SM_HISTORY_TYPE,
  SM_TERMINATE_TYPE,
} from '@diagc/core/internal';
import { NodeChrome } from '../chrome';
import { sketchOf } from '../node-look';
import type { BodyProps } from './types';

/** The pseudo-states the registry's shapes cannot draw: history, entry, exit and
 * terminate. The others (initial, final, junction, choice, bar) are shapes, so the
 * box body draws them. */
export const SM_GLYPH_TYPES: ReadonlySet<string> = new Set([
  SM_HISTORY_TYPE,
  SM_DEEP_HISTORY_TYPE,
  SM_ENTRY_TYPE,
  SM_EXIT_TYPE,
  SM_TERMINATE_TYPE,
]);

const X_PATH = 'M3 3 L21 21 M21 3 L3 21';

/** One of those glyphs in a fixed neutral stroke: `color` is ignored, as it is on the
 * activity bars and dots. A name is a caption below, like any glyph's. */
export function SmGlyphBody({ id, data, selected, width, height, parts }: BodyProps) {
  const { loopClass, name } = parts;
  const ringed = data.typeId !== SM_TERMINATE_TYPE;
  return (
    <div className={`dg-sm-glyph${ringed ? ' dg-sm-ring' : ''}${loopClass}`} data-type={data.typeId}>
      {/* sketchOf tints the outline with the node's colour; these glyphs have none */}
      {ringed && sketchOf({ ...data, color: undefined }, 'circle', { id, width, height })}
      <GlyphMark type={data.typeId} />
      {(data.label !== '' || data.labelEditing === true) && <div className="dg-node-row dg-glyph-caption">{name}</div>}
      <NodeChrome id={id} data={data} selected={selected} uses={['quickAdd', 'handles']} />
    </div>
  );
}

function GlyphMark({ type }: { type: string | undefined }): ReactElement | string | null {
  if (type === SM_HISTORY_TYPE) return 'H';
  if (type === SM_DEEP_HISTORY_TYPE) return 'H*';
  if (type !== SM_EXIT_TYPE && type !== SM_TERMINATE_TYPE) return null;
  return (
    <svg
      className="dg-sm-x"
      data-testid={type === SM_EXIT_TYPE ? 'sm-exit-x' : 'sm-terminate-x'}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d={X_PATH} />
    </svg>
  );
}
