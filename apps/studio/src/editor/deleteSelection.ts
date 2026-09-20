import { CASCADE_DELETE_TYPES, subtreeOf, type DiagramModel, type EditorCommand } from '@diagc/core';

/** Translate a canvas delete gesture (Backspace/Delete on the selection) into
 * one editor command, or null when nothing in the selection still exists.
 *
 * - Relations go first: one that also loses an endpoint node would otherwise
 *   be pruned by delete-node mid-batch and the later delete-relation would
 *   throw on the missing id.
 * - Frames and branches cascade, mirroring NodePanel's Delete button — and any
 *   OTHER selected node inside such a cascade is dropped from the command list,
 *   because the cascade already destroys it and a second delete-node on a gone
 *   id aborts the whole batch (requireNode throws).
 * - Several deletions collapse into one `batch`, so the gesture undoes as a
 *   single step.
 */
export function deleteSelectionCommand(
  model: DiagramModel,
  sel: { nodeIds: string[]; relationIds: string[] },
): EditorCommand | null {
  const typeOf = new Map(model.nodes.map((n) => [n.id, n.type]));
  const knownRelations = new Set(model.relations.map((r) => r.id));
  const isCascade = (id: string) => (CASCADE_DELETE_TYPES as readonly string[]).includes(typeOf.get(id) ?? '');
  // Everything a selected frame/branch takes with it — minus the roots
  // themselves, which keep their own delete-node command.
  const doomedByCascade = new Set<string>();
  for (const id of sel.nodeIds) {
    if (!typeOf.has(id) || !isCascade(id)) continue;
    for (const d of subtreeOf(model, id)) if (d !== id) doomedByCascade.add(d);
  }
  const commands: EditorCommand[] = [
    ...sel.relationIds
      .filter((id) => knownRelations.has(id))
      .map((id): EditorCommand => ({ type: 'delete-relation', id })),
    ...sel.nodeIds
      .filter((id) => typeOf.has(id) && !doomedByCascade.has(id))
      .map((id): EditorCommand => ({ type: 'delete-node', id, ...(isCascade(id) ? { cascade: true } : {}) })),
  ];
  if (commands.length === 0) return null;
  return commands.length === 1 ? commands[0]! : { type: 'batch', commands };
}
