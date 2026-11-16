import {
  formatTransition,
  parseTransition,
  relationLabels,
  SM_TRANSITION_KIND,
  TRANSITION_LABEL_ID,
  type EdgeLabelSide,
  type DiagramModel,
  type EditorCommand,
} from '@diagc/core/internal';

type RelationPatch = Extract<EditorCommand, { type: 'update-relation' }>['patch'];

/**
 * The patch for typing a label on a transition. The label is a view of the
 * trigger, guard and effect, so the typed text is parsed back into them (an
 * absent part clears its field) and the stored `label` is dropped. A stored
 * label keeps its position and shows the same text; an added label with none
 * stored keeps the place it was clicked at.
 * `undefined` for any other kind, or a label that is not the transition's own,
 * which edit as plain labels.
 */
export function transitionLabelPatch(
  model: DiagramModel,
  relationId: string,
  text: string,
  where: { labelId: string } | { t: number; side: EdgeLabelSide },
): RelationPatch | undefined {
  const relation = model.relations.find((r) => r.id === relationId);
  if (relation?.kind !== SM_TRANSITION_KIND) return undefined;
  const [own, ...rest] = relationLabels(relation);
  if ('labelId' in where && own?.id !== where.labelId) return undefined;
  const parts = parseTransition(text);
  const patch: RelationPatch = {
    trigger: parts.trigger ?? null,
    guard: parts.guard ?? null,
    effect: parts.effect ?? null,
    label: null,
  };
  const first = relation.labels?.[0];
  if (first === undefined) {
    // An added label keeps the place it was clicked at; an edit of the
    // synthesized label has none to keep, so it stays synthesized.
    if ('labelId' in where || text.trim() === '') return patch;
    return {
      ...patch,
      labels: [{ id: TRANSITION_LABEL_ID, text: formatTransition(parts), t: where.t, side: where.side }],
    };
  }
  // Blank text drops the label, as the generic edit does; an empty one left in
  // place would be drawn.
  const labels = text.trim() === '' ? rest : [{ ...first, text: formatTransition(parts) }, ...rest];
  return { ...patch, labels: labels.length > 0 ? labels : null };
}
