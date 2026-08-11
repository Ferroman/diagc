import type { DiagramRelation, EdgeLabel } from './types';

/** Effective labels for a relation, bridging the legacy single `label` string.
 * `labels` (when present) is authoritative; otherwise a non-empty legacy
 * `label` becomes one centered label; otherwise none. */
export function relationLabels(r: DiagramRelation): EdgeLabel[] {
  if (r.labels !== undefined) return r.labels;
  if (r.label !== undefined && r.label !== '') return [{ id: 'legacy', text: r.label, t: 0.5, side: 'center' }];
  return [];
}
