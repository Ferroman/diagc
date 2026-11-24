/** Hash-route codec for shareable deep links:
 * `#/<diagram>/<node-id>/…?group=1&hide=<id>,<id>`.
 * Every segment is URI-encoded so ids/names may contain `/`, `#`, spaces. */
export interface UrlState {
  diagram: string;
  path: string[];
  /** a plan drawn in team lanes; absent when the link says nothing */
  grouped?: boolean;
  /** the hidden team/person ids; absent when the link says nothing */
  hidden?: string[];
}

/** A plan's team view: what the hash carries beside the route. */
export interface TeamViewState {
  grouped: boolean;
  hidden: readonly string[];
}

/** Parse a `location.hash`. Returns null for anything that is not a route:
 * empty/`#`/`#/`, a missing diagram segment, or undecodable percent-escapes. */
export function parseHash(hash: string): UrlState | null {
  if (!hash.startsWith('#/')) return null;
  // Ids are encoded, so a literal `?` can only be the start of the view part.
  const [route = '', query = ''] = hash.slice(2).split('?', 2);
  let decoded: string[];
  let hidden: string[];
  // Read raw, not through URLSearchParams: it would decode once itself and the
  // per-id decode below would then run on an already-decoded `%`.
  const raw = new Map(query.split('&').map((kv) => kv.split('=', 2) as [string, string | undefined]));
  try {
    decoded = route.split('/').map(decodeURIComponent);
    hidden = (raw.get('hide') ?? '')
      .split(',')
      .filter((id) => id !== '')
      .map(decodeURIComponent);
  } catch {
    return null; // malformed percent-encoding
  }
  const [diagram, ...rest] = decoded;
  if (diagram === undefined || diagram === '') return null;
  return {
    diagram,
    path: rest.filter((seg) => seg !== ''),
    ...(raw.get('group') === '1' ? { grouped: true } : {}),
    ...(hidden.length > 0 ? { hidden } : {}),
  };
}

/** The view part is written only when it is not the default, so a plain link
 * (and every link made before teams existed) stays exactly as it was. */
export function formatHash(diagram: string, path: string[], view?: TeamViewState): string {
  const route = `#/${[diagram, ...path].map(encodeURIComponent).join('/')}`;
  const parts: string[] = [];
  if (view?.grouped === true) parts.push('group=1');
  if (view !== undefined && view.hidden.length > 0) parts.push(`hide=${view.hidden.map(encodeURIComponent).join(',')}`);
  return parts.length > 0 ? `${route}?${parts.join('&')}` : route;
}
