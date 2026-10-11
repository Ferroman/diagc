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

/** `${prefix}${n}` for the first `n` from `first` up that `taken` does not hold. A
 * scan rather than a counter: ids stay short and readable, and a deleted id is
 * handed out again instead of the numbers climbing forever. */
export function nextFreeId(prefix: string, taken: ReadonlySet<string>, first = 1): string {
  for (let n = first; ; n++) if (!taken.has(`${prefix}${n}`)) return `${prefix}${n}`;
}

/** An id made from `name` that `taken` does not hold: lower case, each run of
 * characters outside `a-z0-9` one hyphen, none at either end, or `fallback` when
 * nothing is left; then `-2`, `-3`… on a collision. Ids stay ASCII so they read
 * the same in a URL, a file name and a `.diagram.ts` source. */
export function uniqueSlug(name: string, taken: ReadonlySet<string>, fallback: string): string {
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || fallback;
  return taken.has(slug) ? nextFreeId(`${slug}-`, taken, 2) : slug;
}

/**
 * `true` when `A` and `B` are the same set of keys, else `false`: a list kept
 * beside an interface asserts `const _x: SameKeys<…> = true` and stops compiling
 * the day a field is added to one and not the other. Each side is wrapped in a
 * tuple so the check does not distribute over the union, where a missing member
 * would still compile: distributed, `'a' | 'b'` against `'a'` gives `true | false`,
 * which is `boolean`, and `= true` is a valid `boolean`.
 */
export type SameKeys<A extends string, B extends string> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
