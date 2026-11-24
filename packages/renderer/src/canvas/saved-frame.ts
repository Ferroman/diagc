import type { MutableRefObject } from 'react';
import type { Point } from '@diagc/core/internal';
import type { EditingApi } from './view-types';

/** What sits between where a node is drawn and where its position is saved,
 * beyond the parent chain: the layout's `savedFrame` (an opened plan zone's
 * children are drawn in the zone's interior, translated to the zone's place),
 * its `viewShift` (a top-level plan zone drawn higher under a fold), and the
 * day width (a plan stretched past 20 px a day). */
export interface SavedFrames {
  savedFrameRef: MutableRefObject<ReadonlyMap<string, Point>>;
  viewShiftRef: MutableRefObject<ReadonlyMap<string, number>>;
  /** drawn px per saved px on x: a plan at 80 px a day draws 4 for each 1 it
   * saves, since a saved x is kept at 20 px a day so a box keeps its day at
   * any width; absent or 1 everywhere else */
  scaleRef?: MutableRefObject<number>;
}

/** A drawn x distance or an absolute drawn x as saved: only the day width
 * stands between them (a drill frame is a position's, not a distance's). */
export const savedX = (frames: Pick<SavedFrames, 'scaleRef'>, x: number): number => x / (frames.scaleRef?.current ?? 1);

/** An on-screen (parent-relative) position as the position to save: the one
 * conversion every move, snapshot and resize report goes through, so each
 * saves what the same gesture saves in the whole view, at any day width. */
export function toSaved(frames: SavedFrames, id: string, p: Point): Point {
  const frame = frames.savedFrameRef.current.get(id);
  const dy = frames.viewShiftRef.current.get(id) ?? 0;
  return { x: savedX(frames, p.x - (frame?.x ?? 0)), y: p.y - (frame?.y ?? 0) - dy };
}

/** `edit` with every report that carries a drawn point made a saved one: a
 * double-click create, a library or image drop, a drop into a box (its point
 * inside the box). Only the day width stands between those and what is saved,
 * so this wraps `edit` before the layout's frames exist. The same object back
 * when it reports none of them. */
export function savedPoints(
  edit: EditingApi | undefined,
  frames: Pick<SavedFrames, 'scaleRef'>,
): EditingApi | undefined {
  if (edit === undefined) return edit;
  const { onCreateAt, onDropLibraryEntry, onImageFiles, onDropInto } = edit;
  if ([onCreateAt, onDropLibraryEntry, onImageFiles, onDropInto].every((f) => f === undefined)) return edit;
  const at = (p: Point): Point => ({ x: savedX(frames, p.x), y: p.y });
  return {
    ...edit,
    ...(onCreateAt !== undefined ? { onCreateAt: (pos: Point) => onCreateAt(at(pos)) } : {}),
    ...(onDropLibraryEntry !== undefined
      ? { onDropLibraryEntry: (e: string, pos: Point, target?: string) => onDropLibraryEntry(e, at(pos), target) }
      : {}),
    ...(onImageFiles !== undefined
      ? { onImageFiles: (files: File[], pos?: Point) => onImageFiles(files, pos === undefined ? pos : at(pos)) }
      : {}),
    ...(onDropInto !== undefined
      ? { onDropInto: (id: string, target: string, rel: Point) => onDropInto(id, target, at(rel)) }
      : {}),
  };
}

/** `edit` with its resize report saved: the position (`toSaved`), and the
 * width where the width is dates (a plan bar's, `widthIsDates`) — a box's own
 * width is not stretched, so it is reported as drawn — under the model id the
 * box draws (`modelIdOf`: a grouped plan's lane copy resizes its zone). Both
 * conversions read the canvas id; only the report names the model. The same
 * object back when it reports no resize. */
export function savedResize(
  edit: EditingApi | undefined,
  frames: SavedFrames,
  widthIsDates: (id: string) => boolean = () => false,
  modelIdOf: (id: string) => string = (id) => id,
): EditingApi | undefined {
  const onResize = edit?.onResize;
  if (edit === undefined || onResize === undefined) return edit;
  return {
    ...edit,
    onResize: (id, w, h, pos) =>
      onResize(modelIdOf(id), widthIsDates(id) ? savedX(frames, w) : w, h, toSaved(frames, id, pos)),
  };
}

/** Both conversions at once (savedPoints, savedResize): every report a host
 * might save from, in saved units — one boundary, so a host never has to know
 * how wide the days are drawn. */
export function savedEdit(
  edit: EditingApi | undefined,
  frames: SavedFrames,
  widthIsDates?: (id: string) => boolean,
): EditingApi | undefined {
  return savedResize(savedPoints(edit, frames), frames, widthIsDates);
}
