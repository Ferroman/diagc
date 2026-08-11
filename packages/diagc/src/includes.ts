import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { DiagramModel, IncludeSource } from '@diagramming/core';

const isHttp = (s: string): boolean => /^https?:\/\//.test(s);

/** diagc's include IO: http(s) URLs via fetch, everything else via the
 * filesystem relative to the declaring file. Returns the canonical resolved
 * ref so compose can detect cycles across mixed URL/path chains. */
export async function resolveInclude(spec: string, fromRef: string): Promise<IncludeSource> {
  if (isHttp(spec) || isHttp(fromRef)) {
    const url = isHttp(spec) ? spec : new URL(spec, fromRef).href;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
    return { model: (await res.json()) as DiagramModel, ref: url };
  }
  const file = path.resolve(path.dirname(fromRef), spec);
  return { model: JSON.parse(await readFile(file, 'utf8')) as DiagramModel, ref: file };
}
