import { didYouMean, ModelBuilder, NodeRef } from '@diagc/core/internal';

/** The verbs an author reaches for when they want composition and the guide has
 * not told them it is a node option. */
const COMPOSE_VERBS = new Set(['include', 'includes', 'import', 'compose', 'embed']);
const COMPOSE_HINT =
  " — to pull another diagram in, give a node `include`: m.node('part', { include: './part.diagram.json' }); see 'diagc guide compose'";

/** The author API's method names: what a diagram calls on `m` and on a node handle.
 * The `add*` methods are the builder's own plumbing (NodeRef calls them), so a
 * suggestion never points at one. */
function authorMethods(): Set<string> {
  const names = new Set<string>();
  for (const proto of [ModelBuilder.prototype, NodeRef.prototype] as object[]) {
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (name === 'constructor' || /^add[A-Z]/.test(name)) continue;
      if (typeof (proto as Record<string, unknown>)[name] === 'function') names.add(name);
    }
  }
  return names;
}

/**
 * A load error's message with what the author probably meant, when the shape of
 * the message says: `x.y is not a function` is a method that does not exist, so
 * the closest one that does is named, by the lint's own did-you-mean rule — and a
 * composition verb gets told where composition lives instead, since no method is
 * close to what they wanted. Anything else is returned as it is.
 */
export function loadHint(message: string): string {
  const m = /^(\w+)\.(\w+) is not a function$/.exec(message);
  if (m === null) return message;
  const method = m[2]!;
  if (COMPOSE_VERBS.has(method)) return `${message}${COMPOSE_HINT}`;
  return `${message}${didYouMean(method, authorMethods())}`;
}
