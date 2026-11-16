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
 * brackets that stands alone (begins the text or follows a space, and is followed by one)
 * or comes straight after a closing `]` (`[x]/ y`, spaces allowed between), so a slash
 * inside a word (`a/b`) stays in the trigger. Whatever is not that guard or that effect
 * (an unclosed `[`, a second bracket pair, the text around them) stays in the trigger as
 * typed, so no text is lost. Empty parts are omitted and runs of whitespace in the trigger collapse. */
export function parseTransition(text: string): TransitionParts {
  let trigger = '';
  let guard: string | undefined;
  let effect: string | undefined;
  let depth = 0;
  let groupStart = -1;
  // whether the last character outside brackets, spaces aside, closed a bracket pair
  let afterGroup = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    const standsAlone = (i === 0 || text[i - 1] === ' ') && text[i + 1] === ' ';
    if (depth === 0 && ch === '/' && (afterGroup || standsAlone)) {
      effect = text.slice(i + 1);
      break;
    }
    if (ch === '[') {
      if (depth === 0) groupStart = i;
      depth++;
    } else if (ch === ']' && depth > 0) {
      depth--;
      if (depth === 0) {
        afterGroup = true;
        if (guard === undefined) guard = text.slice(groupStart + 1, i);
        else trigger += text.slice(groupStart, i + 1);
        groupStart = -1;
      }
    } else if (depth === 0) {
      trigger += ch;
      if (ch !== ' ') afterGroup = false;
    }
  }
  if (depth > 0) trigger += text.slice(groupStart);
  return trimmedParts(trigger.replace(/\s+/g, ' '), guard, effect);
}

/** the parts with surrounding whitespace dropped, and an empty one omitted */
function trimmedParts(trigger: string, guard = '', effect = ''): TransitionParts {
  const parts: TransitionParts = {};
  if (trigger.trim() !== '') parts.trigger = trigger.trim();
  if (guard.trim() !== '') parts.guard = guard.trim();
  if (effect.trim() !== '') parts.effect = effect.trim();
  return parts;
}
