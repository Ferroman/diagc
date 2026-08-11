/** Message extraction for `unknown` catch values, replacing `(e as Error).message`. */
export function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
