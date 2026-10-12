import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { writeFileAtomic } from '../atomic-write';
import { refuse, type HandlerResult } from './result';

export async function readLibrary(diagramsDir: string): Promise<HandlerResult> {
  try {
    const raw = await readFile(path.join(diagramsDir, 'library.json'), 'utf8');
    return { status: 200, body: JSON.parse(raw) };
  } catch {
    return { status: 200, body: { categories: [], entries: [] } };
  }
}

// Must cover every NodeTemplate presentation channel — 'shape' included, or a
// user library holding an imported silhouette is rejected on save.
const TEMPLATE_STRING_KEYS = new Set(['type', 'color', 'image', 'shape']);
const TEMPLATE_NUMBER_KEYS = new Set(['width', 'height']);

/** The categories' ids, or why they cannot be saved: each needs a string id and
 * name, and no id may come twice. */
function checkCategories(categories: unknown[]): { ids: Set<string> } | { problem: string } {
  const ids = new Set<string>();
  for (const c of categories) {
    const cat = c as { id?: unknown; name?: unknown };
    if (typeof cat.id !== 'string' || typeof cat.name !== 'string') {
      return { problem: 'Category needs string id and name' };
    }
    if (ids.has(cat.id)) return { problem: `Duplicate category '${cat.id}'` };
    ids.add(cat.id);
  }
  return { ids };
}

/** Why the entries cannot be saved, or undefined. Each entry is checked whole before
 * the next: its fields, its category, its id, then its template. */
function checkEntries(entries: unknown[], categoryIds: ReadonlySet<string>): string | undefined {
  const ids = new Set<string>();
  for (const e of entries) {
    const entry = e as { id?: unknown; category?: unknown; name?: unknown; template?: unknown };
    if (typeof entry.id !== 'string' || typeof entry.name !== 'string' || typeof entry.category !== 'string') {
      return 'Entry needs string id, name, category';
    }
    if (!categoryIds.has(entry.category)) {
      return `Entry '${entry.id}' references unknown category '${entry.category}'`;
    }
    if (ids.has(entry.id)) return `Duplicate entry '${entry.id}'`;
    ids.add(entry.id);
    const problem = checkTemplate(entry.id, entry.template);
    if (problem !== undefined) return problem;
  }
  return undefined;
}

/** Why entry `id`'s template cannot be saved, or undefined: it is an object whose
 * every field is a presentation channel of the right type. */
function checkTemplate(id: string, template: unknown): string | undefined {
  const t = template as Record<string, unknown> | null;
  if (t === null || typeof t !== 'object' || Array.isArray(t)) return `Entry '${id}' missing template`;
  for (const [k, v] of Object.entries(t)) {
    const ok = TEMPLATE_STRING_KEYS.has(k)
      ? typeof v === 'string'
      : TEMPLATE_NUMBER_KEYS.has(k)
        ? typeof v === 'number'
        : false;
    if (!ok) return `Entry '${id}' has invalid template field '${k}'`;
  }
  return undefined;
}

/** Persist the whole user library. Validates internal consistency only — bundled
 * packs are merged client-side and never written here. */
export async function saveLibrary(diagramsDir: string, payload: unknown): Promise<HandlerResult> {
  const p = payload as { categories?: unknown; entries?: unknown } | null;
  if (p === null || !Array.isArray(p.categories) || !Array.isArray(p.entries)) {
    return refuse(400, 'Not a library { categories, entries }');
  }
  const categories = checkCategories(p.categories);
  if ('problem' in categories) return refuse(400, categories.problem);
  const problem = checkEntries(p.entries, categories.ids);
  if (problem !== undefined) return refuse(400, problem);
  const target = path.join(diagramsDir, 'library.json');
  await mkdir(path.dirname(target), { recursive: true });
  await writeFileAtomic(target, `${JSON.stringify(payload, null, 2)}\n`);
  return { status: 200, body: { ok: true } };
}
