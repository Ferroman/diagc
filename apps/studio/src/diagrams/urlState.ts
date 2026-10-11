/** Hash-route codec for shareable deep links: `#/<diagram>/<node-id>/…`.
 * Every segment is URI-encoded so ids/names may contain `/`, `#`, spaces. */
export interface UrlState {
  diagram: string;
  path: string[];
}

/** Parse a `location.hash`. Returns null for anything that is not a route:
 * empty/`#`/`#/`, a missing diagram segment, or undecodable percent-escapes. */
export function parseHash(hash: string): UrlState | null {
  if (!hash.startsWith('#/')) return null;
  let decoded: string[];
  try {
    decoded = hash.slice(2).split('/').map(decodeURIComponent);
  } catch {
    return null; // malformed percent-encoding
  }
  const [diagram, ...rest] = decoded;
  if (diagram === undefined || diagram === '') return null;
  return { diagram, path: rest.filter((seg) => seg !== '') };
}

export function formatHash(diagram: string, path: string[]): string {
  return `#/${[diagram, ...path].map(encodeURIComponent).join('/')}`;
}
