import { CommandError } from './mutate';
import type { Drawings, Stroke } from './types';

export const emptyDrawings = (): Drawings => ({ version: 1, planes: {} });

/** `k1`, `k2`, … — first free id in this plane's bucket. A deterministic scan
 * rather than a random id: stroke ids only need to be unique within one file,
 * and a counter keeps the sidecar diff readable and the tests mock-free. */
export function uniqueStrokeId(d: Drawings, key: string): string {
  const taken = new Set((d.planes[key] ?? []).map((s) => s.id));
  for (let i = 1; ; i++) {
    if (!taken.has(`k${i}`)) return `k${i}`;
  }
}

export function addStroke(d: Drawings, key: string, stroke: Stroke): Drawings {
  const bucket = d.planes[key] ?? [];
  if (bucket.some((s) => s.id === stroke.id)) throw new CommandError(`Duplicate stroke id '${stroke.id}'`);
  return { ...d, planes: { ...d.planes, [key]: [...bucket, stroke] } };
}

/** An emptied bucket is dropped, mirroring set-layout-settings hygiene, so
 * "does this plane have drawings?" stays a plain key lookup. */
export function deleteStroke(d: Drawings, key: string, id: string): Drawings {
  const bucket = d.planes[key];
  if (bucket === undefined || !bucket.some((s) => s.id === id)) throw new CommandError(`Unknown stroke '${id}'`);
  const kept = bucket.filter((s) => s.id !== id);
  const { [key]: _drop, ...rest } = d.planes;
  return { ...d, planes: kept.length > 0 ? { ...rest, [key]: kept } : rest };
}

/** Mirror hygiene for delete-plane. Returns the input unchanged when the
 * plane had no bucket, so unrelated state stays referentially stable. */
export function pruneDrawingsPlane(d: Drawings, plane: string): Drawings {
  if (!(plane in d.planes)) return d;
  const { [plane]: _drop, ...rest } = d.planes;
  return { ...d, planes: rest };
}
