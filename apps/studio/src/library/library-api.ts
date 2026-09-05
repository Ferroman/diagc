import type { Library } from './types';
import { getHost } from '../host';

const EMPTY: Library = { categories: [], entries: [] };

/** GET the user library; any failure degrades to an empty library (static builds
 * have no middleware — the app still works with just the bundled packs). */
export async function loadUserLibrary(): Promise<Library> {
  try {
    const res = await getHost().apiFetch('/api/library');
    if (!res.ok) return EMPTY;
    const body = (await res.json()) as Partial<Library>;
    return { categories: body.categories ?? [], entries: body.entries ?? [] };
  } catch {
    return EMPTY;
  }
}

/** PUT the whole user library; throws with the server's issue message on failure. */
export async function saveUserLibrary(library: Library): Promise<void> {
  const res = await getHost().apiFetch('/api/library', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(library),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { issues?: { message: string }[] } | null;
    throw new Error(body?.issues?.[0]?.message ?? `Library save failed (${res.status})`);
  }
}
