import type { DiagramModel, DiagramRelation } from '../types';

/** The layer a relation is drawn on: its own `layer`, else the first
 * `layerRules` entry whose every named field (`kind`, `style.color`) matches,
 * else undefined (the base sheet). Rules exist so a host can layer relations
 * that arrived through an include; they never override an explicit layer.
 * One function, so the view compiler and the legend cannot disagree. */
export function relationLayer(model: DiagramModel, relation: DiagramRelation): string | undefined {
  if (relation.layer !== undefined) return relation.layer;
  for (const rule of model.layerRules ?? []) {
    if (rule.kind !== undefined && rule.kind !== relation.kind) continue;
    if (rule.color !== undefined && rule.color !== relation.style?.color) continue;
    return rule.layer;
  }
  return undefined;
}
