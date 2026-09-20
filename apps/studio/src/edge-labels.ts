import { relationLabels, type DiagramModel, type EdgeLabel, type EdgeLabelSide } from '@diagc/core';

/**
 * Pure edge-label CRUD over a relation's effective labels, extracted from the
 * App component so the projection/update rules are directly unit-testable
 * (previously only reachable through the shell test). Each helper projects the
 * relation's effective labels through relationLabels() (bridging a legacy
 * `label`), computes the next array, and the caller dispatches update-relation
 * { labels }. A relation upgrades from a legacy `label` to `labels` on its
 * first edit.
 */

/** The relation's effective labels (via relationLabels()), or null when the id
 * doesn't resolve to a relation. */
export function edgeLabelsOf(model: DiagramModel, relationId: string): EdgeLabel[] | null {
  const r = model.relations.find((rel) => rel.id === relationId);
  return r !== undefined ? relationLabels(r) : null;
}

/** First free `l<n>` id for the given labels. */
export function nextLabelId(labels: EdgeLabel[]): string {
  let n = 1;
  while (labels.some((l) => l.id === `l${n}`)) n++;
  return `l${n}`;
}

/** Append a new label (auto id). */
export function addEdgeLabel(labels: EdgeLabel[], text: string, t: number, side: EdgeLabelSide): EdgeLabel[] {
  return [...labels, { id: nextLabelId(labels), text, t, side }];
}

/** Edit a label's text, or delete it when blank. Returns null when the deletion
 * clears the last label (the caller should then patch `labels: null`, dropping
 * the field so a legacy `label` reverts). */
export function editEdgeLabel(labels: EdgeLabel[], labelId: string, text: string): EdgeLabel[] | null {
  const next =
    text.trim() === ''
      ? labels.filter((l) => l.id !== labelId)
      : labels.map((l) => (l.id === labelId ? { ...l, text } : l));
  return next.length > 0 ? next : null;
}

/** Relocate a label's position along the edge + perpendicular side. */
export function moveEdgeLabel(
  labels: EdgeLabel[],
  labelId: string,
  t: number,
  side: EdgeLabelSide,
): EdgeLabel[] {
  return labels.map((l) => (l.id === labelId ? { ...l, t, side } : l));
}
