import type { MutableRefObject } from 'react';
import type { Point } from '@diagc/core/internal';
import type { EditingApi } from './view-types';

/** What sits between where a node is drawn and where its position is saved,
 * beyond the parent chain: the layout's `savedFrame` (an opened plan zone's
 * children are drawn in the zone's interior, translated to the zone's place)
 * and its `viewShift` (a top-level plan zone drawn higher under a fold). */
export interface SavedFrames {
  savedFrameRef: MutableRefObject<ReadonlyMap<string, Point>>;
  viewShiftRef: MutableRefObject<ReadonlyMap<string, number>>;
}

/** An on-screen (parent-relative) position as the position to save: the one
 * conversion every move, snapshot and resize report goes through, so each
 * saves what the same gesture saves in the whole view. */
export function toSaved({ savedFrameRef, viewShiftRef }: SavedFrames, id: string, p: Point): Point {
  const frame = savedFrameRef.current.get(id);
  const dy = viewShiftRef.current.get(id) ?? 0;
  return { x: p.x - (frame?.x ?? 0), y: p.y - (frame?.y ?? 0) - dy };
}

/** `edit` with its resize report at the saved position (`toSaved`); the same
 * object back when it reports no resize. */
export function savedResize(edit: EditingApi | undefined, frames: SavedFrames): EditingApi | undefined {
  const onResize = edit?.onResize;
  if (edit === undefined || onResize === undefined) return edit;
  return { ...edit, onResize: (id, w, h, pos) => onResize(id, w, h, toSaved(frames, id, pos)) };
}
