import {
  formatTransition,
  parseTransition,
  relationLabels,
  SM_TRANSITION_KIND,
  type DiagramModel,
  type EditorCommand,
} from '@diagc/core/internal';

type RelationPatch = Extract<EditorCommand, { type: 'update-relation' }>['patch'];

/**
 * The patch for typing a label on a transition. The label is a view of the
 * trigger, guard and effect, so the typed text is parsed back into them (an
 * absent part clears its field) and the stored `label` is dropped. A stored
 * label keeps its position and shows the same text; without one the
 * synthesized label sits at its default place, so nothing is stored for it.
 * `undefined` for any other kind, or a label that is not the transition's own,
 * which edit as plain labels.
 */
export function transitionLabelPatch(
  model: DiagramModel,
  relationId: string,
  text: string,
  labelId?: string,
): RelationPatch | undefined {
  const relation = model.relations.find((r) => r.id === relationId);
  if (relation?.kind !== SM_TRANSITION_KIND) return undefined;
  const [own, ...rest] = relationLabels(relation);
  if (labelId !== undefined && own?.id !== labelId) return undefined;
  const parts = parseTransition(text);
  const patch: RelationPatch = {
    trigger: parts.trigger ?? null,
    guard: parts.guard ?? null,
    effect: parts.effect ?? null,
    label: null,
  };
  const first = relation.labels?.[0];
  if (first === undefined) return patch;
  // Blank text drops the label, as the generic edit does; an empty one left in
  // place would be drawn.
  const labels = text.trim() === '' ? rest : [{ ...first, text: formatTransition(parts) }, ...rest];
  return { ...patch, labels: labels.length > 0 ? labels : null };
}
