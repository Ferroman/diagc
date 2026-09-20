import {
  SO_DECISION_TYPE,
  SO_LEADS_TO_KIND,
  consequenceTypeOf,
  isSecondOrderNode,
  uniqueNodeId,
  type DiagramModel,
  type EditorCommand,
  type Valence,
} from '@diagc/core';

/**
 * "And then what?" — a consequence of `fromId`, already wired to it. ONE batch,
 * so it is one undo step and the model never passes through a state validation
 * refuses (a consequence nothing leads to). The name is empty: the caller opens
 * it for typing straight away. Shared by the panel's buttons and the Tab key.
 * The new node inherits `fromId`'s plane (createNodeAt's scoping): a shared
 * consequence would otherwise leak into every plane a decision does not.
 */
export function thenWhat(model: DiagramModel, fromId: string, valence: Valence): { command: EditorCommand; id: string } | null {
  const from = model.nodes.find((n) => n.id === fromId);
  if (from === undefined || !isSecondOrderNode(from)) return null;
  const id = uniqueNodeId(model, 'consequence');
  return {
    id,
    command: {
      type: 'batch',
      commands: [
        { type: 'add-node', node: { id, name: '', type: consequenceTypeOf(valence), ...(from.plane !== undefined ? { plane: from.plane } : {}) } },
        { type: 'add-relation', from: fromId, to: id, opts: { kind: SO_LEADS_TO_KIND } },
      ],
    },
  };
}

/** `plane` is the plane new decisions belong to — the active plane, when it
 * keeps nodes of its own (createNodeAt's scoping); undefined adds a shared node. */
export function addDecision(model: DiagramModel, plane?: string): { command: EditorCommand; id: string } {
  const id = uniqueNodeId(model, 'decision');
  return { id, command: { type: 'add-node', node: { id, name: '', type: SO_DECISION_TYPE, ...(plane !== undefined ? { plane } : {}) } } };
}
