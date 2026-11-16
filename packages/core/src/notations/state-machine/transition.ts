/** The three parts of a transition's label, UML style: `trigger [guard] / effect`.
 * The one definition of the shape; the builder and the model's relation fields alias it. */
export interface TransitionParts {
  trigger?: string;
  guard?: string;
  effect?: string;
}

/** Id of the label synthesized from a relation's parts when it has no label of its own. */
export const TRANSITION_LABEL_ID = 'transition';

export function hasTransitionParts(r: TransitionParts): boolean {
  return r.trigger !== undefined || r.guard !== undefined || r.effect !== undefined;
}

export function formatTransition(p: TransitionParts): string {
  const out: string[] = [];
  if (p.trigger !== undefined) out.push(p.trigger);
  if (p.guard !== undefined) out.push(`[${p.guard}]`);
  if (p.effect !== undefined) out.push(`/ ${p.effect}`);
  return out.join(' ');
}

/** Inverse of {@link formatTransition}. The guard is the first top-level bracket pair
 * (nesting counted, so `a[0] > 1` survives); the effect starts at the first `/` outside
 * brackets that begins the text or follows a space, so a slash inside a word
 * (`a/b`) stays in the trigger. Empty parts are omitted. */
export function parseTransition(text: string): TransitionParts {
  let trigger = '';
  let guard: string | undefined;
  let effect: string | undefined;
  let depth = 0;
  let guardStart = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (depth === 0 && ch === '/' && (i === 0 || text[i - 1] === ' ') && text[i + 1] === ' ') {
      effect = text.slice(i + 1);
      break;
    }
    if (ch === '[') {
      if (depth === 0 && guard === undefined) guardStart = i + 1;
      depth++;
    } else if (ch === ']' && depth > 0) {
      depth--;
      if (depth === 0 && guardStart >= 0) {
        guard = text.slice(guardStart, i);
        guardStart = -1;
        trigger += ' ';
      }
    } else if (depth === 0) trigger += ch;
  }
  const parts: TransitionParts = {};
  const t = trigger.trim();
  if (t !== '') parts.trigger = t;
  if (guard?.trim()) parts.guard = guard.trim();
  if (effect?.trim()) parts.effect = effect.trim();
  return parts;
}
