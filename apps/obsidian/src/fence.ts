/** A `diagram` code fence's contents, resolved to what the embed needs to mount
 * DiagramView read-only: which diagram, which plane/layers/root to open on, and
 * how tall to size the embed. */
export interface EmbedSpec {
  name: string;
  plane?: string;
  layers?: string[];
  root?: string;
  height: number;
}

const KEYS = new Set(['name', 'plane', 'layers', 'root', 'height']);
const DEFAULT_HEIGHT = 480;

/** Parse a `diagram` fence body: one `key: value` per line, blank lines and
 * `#`-comments skipped, split on the FIRST colon (a value may contain one of
 * its own — none of the five keys need that today, but the rule stays
 * unconditional so it doesn't silently change if one grows to). Returns the
 * spec, or `{ error }` for anything a fence author needs to fix. */
export function parseFence(source: string): EmbedSpec | { error: string } {
  const fields: Record<string, string> = {};
  for (const raw of source.split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const colon = line.indexOf(':');
    const key = (colon === -1 ? line : line.slice(0, colon)).trim();
    const value = (colon === -1 ? '' : line.slice(colon + 1)).trim();
    if (!KEYS.has(key)) return { error: `Unknown key '${key}'` };
    fields[key] = value;
  }

  const name = fields['name'];
  if (name === undefined || name === '') return { error: "Missing 'name'" };

  const heightRaw = fields['height'];
  let height = DEFAULT_HEIGHT;
  if (heightRaw !== undefined) {
    const parsed = Number.parseInt(heightRaw, 10);
    if (Number.isNaN(parsed)) return { error: `Invalid height '${heightRaw}'` };
    height = parsed;
  }

  const plane = fields['plane'];
  const root = fields['root'];
  const layersRaw = fields['layers'];
  // Filtered after the trim-map: a trailing comma or an empty `layers:` value
  // would otherwise leave a stray '' entry (`['sec', 'ops', '']`).
  const layers =
    layersRaw !== undefined ? layersRaw.split(',').map((s) => s.trim()).filter((s) => s !== '') : undefined;

  return {
    name,
    ...(plane !== undefined ? { plane } : {}),
    ...(layers !== undefined ? { layers } : {}),
    ...(root !== undefined ? { root } : {}),
    height,
  };
}
