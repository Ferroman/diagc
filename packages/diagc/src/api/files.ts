import { readdir } from 'node:fs/promises';
import path from 'node:path';

/** Recursively collect every file under `dir` whose name ends in `suffix`,
 * posix-joined relative to `dir` with the suffix stripped. Missing dir → [].
 * Shared by the diagram-source and layout-overlay walks. */
export async function walkFiles(dir: string, suffix: string): Promise<string[]> {
  const names: string[] = [];
  const walk = async (d: string, prefix: string): Promise<void> => {
    let entries;
    try {
      entries = await readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isDirectory()) await walk(path.join(d, e.name), `${prefix}${e.name}/`);
      else if (e.name.endsWith(suffix)) names.push(`${prefix}${e.name.slice(0, -suffix.length)}`);
    }
  };
  await walk(dir, '');
  return names;
}

/** Recursively collect `<name>` for every `*.diagram.json` under `dir`
 * (posix-joined, suffix stripped). Missing dir → []. */
export async function walkDiagramJson(dir: string): Promise<string[]> {
  return walkFiles(dir, '.diagram.json');
}
