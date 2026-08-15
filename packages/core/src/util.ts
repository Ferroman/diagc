/**
 * Where the corresponding source lives, for the AGPL section 13 offer.
 *
 * Shared rather than written out at each use: it appears in the studio chrome and in
 * every page `publish` stamps, and a stale URL in a licence notice is a compliance
 * defect, not a cosmetic one. Core owns it because both a browser app and the CLI need
 * it, and core is the only thing both already depend on.
 */
export const SOURCE_URL = 'https://github.com/Ferroman/diagramming';

/** Message extraction for `unknown` catch values, replacing `(e as Error).message`. */
export function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
