/**
 * Where the corresponding source lives, for the AGPL section 13 offer.
 *
 * Shared rather than written out at each use: it appears in the studio chrome and in
 * every page `publish` stamps, and a stale URL in a licence notice is a compliance
 * defect, not a cosmetic one. Core owns it because both a browser app and the CLI need
 * it, and core is the only thing both already depend on.
 */
export const SOURCE_URL = 'https://github.com/Ferroman/diagc';

/** Message extraction for `unknown` catch values, replacing `(e as Error).message`. */
export function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** `T` with each key that may be undefined made optional and never undefined. */
export type Defined<T> = { [K in keyof T as undefined extends T[K] ? never : K]: T[K] } & {
  [K in keyof T as undefined extends T[K] ? K : never]?: Exclude<T[K], undefined>;
};

/**
 * `obj` without the keys whose value is undefined, the rest in their order. Model
 * code builds optional fields with this instead of writing `{ key: undefined }`:
 * eject's round trip compares models with isDeepStrictEqual, which tells the two apart.
 */
export function defined<T extends object>(obj: T): Defined<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) if (value !== undefined) out[key] = value;
  return out as Defined<T>;
}
