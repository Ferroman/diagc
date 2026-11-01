/** The rules a builder call refuses on the spot, each named as a validation issue
 * names its code, so a lint that catches the throw can report the rule and not
 * just "the source threw". */
export type BuilderErrorCode = 'missing-kind' | 'duplicate-node' | 'not-an-include';

/**
 * A builder call that refused. Thrown from the call itself rather than left to
 * validation, so the error carries the author's line; `code` is what `diagc lint`
 * reports in place of `load`. Checked by `name`, not `instanceof`, where a diagram
 * runs in its own copy of core (jiti).
 */
export class BuilderError extends Error {
  constructor(
    readonly code: BuilderErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'BuilderError';
  }
}
