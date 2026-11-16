import type { DiagramRelation, EdgeLabel } from './types';
import { TRANSITION_LABEL_ID, formatTransition, hasTransitionParts } from './notations/state-machine/transition';

/** Effective labels for a relation, bridging the legacy single `label` string.
 * `labels` (when present) is authoritative; otherwise a non-empty legacy
 * `label` becomes one centered label; otherwise none. A transition's parts
 * (trigger, guard, effect) win over both: they are the text, and the first label
 * only keeps its placement. */
export function relationLabels(r: DiagramRelation): EdgeLabel[] {
  if (hasTransitionParts(r)) {
    const text = formatTransition(r);
    const [first, ...rest] = r.labels ?? [];
    if (first === undefined) return [{ id: TRANSITION_LABEL_ID, text, t: 0.5, side: 'center' }];
    return [{ ...first, text }, ...rest];
  }
  if (r.labels !== undefined) return r.labels;
  if (r.label !== undefined && r.label !== '') return [{ id: 'legacy', text: r.label, t: 0.5, side: 'center' }];
  return [];
}
