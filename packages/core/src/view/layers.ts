import type { DiagramModel, DiagramRelation } from '../types';

/** The layer a relation is drawn on: its own `layer`, else the first
 * `layerRules` entry whose every named field (`kind`, `style.color`) matches,
 * else undefined (the base sheet). Rules exist so a host can layer relations
 * that arrived through an include; they never override an explicit layer.
 * One function, so the view compiler and the legend cannot disagree. */
export function relationLayer(m: DiagramModel, r: DiagramRelation): string | undefined {
  if (r.layer !== undefined) return r.layer;
  for (const rule of m.layerRules ?? []) {
    if (rule.kind !== undefined && rule.kind !== r.kind) continue;
    if (rule.color !== undefined && rule.color !== r.style?.color) continue;
    return rule.layer;
  }
  return undefined;
}
