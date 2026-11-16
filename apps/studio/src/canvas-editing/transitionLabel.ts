import {
  formatTransition,
  hasTransitionParts,
  parseTransition,
  relationLabels,
  SM_TRANSITION_KIND,
  TRANSITION_LABEL_ID,
  type EdgeLabelSide,
  type DiagramModel,
  type DiagramRelation,
  type EditorCommand,
  type TransitionParts,
} from '@diagc/core/internal';

type RelationPatch = Extract<EditorCommand, { type: 'update-relation' }>['patch'];

/**
 * What a transition's stored labels become once its parts are `parts`. A stored first
 * label (one dragged, or added in place) is the transition's own: it shows the parts'
 * text, so that text is rewritten to match, and with no parts left it is dropped — the
 * old text would otherwise be drawn again, and the inspector offers no way to remove
 * it. Empty for a transition with no stored label. Every edit of the parts goes
 * through here, on the canvas and in the inspector.
 */
export function transitionLabelsPatch(
  relation: Pick<DiagramRelation, 'labels'>,
  parts: TransitionParts,
): Pick<RelationPatch, 'labels'> {
  const [first, ...rest] = relation.labels ?? [];
  if (first === undefined) return {};
  const labels = hasTransitionParts(parts) ? [{ ...first, text: formatTransition(parts) }, ...rest] : rest;
  return { labels: labels.length > 0 ? labels : null };
}

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
  const [own] = relationLabels(relation);
  if ('labelId' in where && own?.id !== where.labelId) return undefined;
  const parts = parseTransition(text);
  const patch: RelationPatch = {
    trigger: parts.trigger ?? null,
    guard: parts.guard ?? null,
    effect: parts.effect ?? null,
    label: null,
  };
  if (relation.labels?.[0] === undefined) {
    // An added label keeps the place it was clicked at; an edit of the
    // synthesized label has none to keep, so it stays synthesized. Text that
    // parses to no part (blank, or `[]`) adds nothing: an empty label would be drawn.
    if ('labelId' in where || !hasTransitionParts(parts)) return patch;
    return {
      ...patch,
      labels: [{ id: TRANSITION_LABEL_ID, text: formatTransition(parts), t: where.t, side: where.side }],
    };
  }
  return { ...patch, ...transitionLabelsPatch(relation, parts) };
}
