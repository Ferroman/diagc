import {
  FB_CATEGORY_TYPE,
  FB_CAUSE_OF_KIND,
  FB_CAUSE_TYPE,
  FB_EFFECT_TYPE,
  FISHBONE_PRESETS,
  fishboneTree,
  isFishboneNode,
  presetId,
  uniqueNodeId,
  type DiagramModel,
  type EditorCommand,
  type FishbonePreset,
  type FishboneTree,
} from '@diagramming/core';

/** The depth rule: a sub-cause (the third level below the effect) cannot take
 * children — `fishboneTree` has already worked out where `id` hangs, so this
 * just reads that answer instead of re-deriving it (shared by `addChild` and
 * the panel, so the two can never disagree on where the limit falls). */
export function isSubCause(tree: FishboneTree, id: string): boolean {
  return tree.categories.some((c) => c.causes.some((cause) => cause.subs.includes(id)));
}

/** `plane` is the plane the effect belongs to — the active plane, when it keeps
 * nodes of its own (createNodeAt's scoping); undefined adds a shared node. */
export function addEffect(model: DiagramModel, plane?: string): { command: EditorCommand; id: string } {
  const id = uniqueNodeId(model, 'effect');
  return { id, command: { type: 'add-node', node: { id, name: '', type: FB_EFFECT_TYPE, ...(plane !== undefined ? { plane } : {}) } } };
}

/**
 * The child `parentId` can take — a category under the effect, a cause under a
 * category or a cause, nothing under a sub-cause — already hung on it. ONE
 * batch, so it is one undo step and the model never passes through a state
 * validation refuses (a cause nothing holds). The name is empty: the caller
 * opens it for typing straight away. Shared by the panel's button and the Tab
 * key. The new node inherits the parent's plane (createNodeAt's scoping): a
 * shared cause would otherwise leak into every plane its bone does not.
 */
export function addChild(model: DiagramModel, parentId: string): { command: EditorCommand; id: string } | null {
  const parent = model.nodes.find((n) => n.id === parentId);
  if (parent === undefined || !isFishboneNode(parent)) return null;
  if (parent.type === FB_CAUSE_TYPE) {
    // On the fish, a cause's level is where it hangs; off it, the tree cannot
    // say, and a stray cause is treated as a cause (validation sorts it out).
    if (isSubCause(fishboneTree(model), parentId)) return null;
  }
  const type = parent.type === FB_EFFECT_TYPE ? FB_CATEGORY_TYPE : FB_CAUSE_TYPE;
  const id = uniqueNodeId(model, type === FB_CATEGORY_TYPE ? 'category' : 'cause');
  return {
    id,
    command: {
      type: 'batch',
      commands: [
        { type: 'add-node', node: { id, name: '', type, ...(parent.plane !== undefined ? { plane: parent.plane } : {}) } },
        { type: 'add-relation', from: id, to: parentId, opts: { kind: FB_CAUSE_OF_KIND } },
      ],
    },
  };
}

/** A standard category set hung on `effectId`, as one batch (one undo step). */
export function seedCategories(model: DiagramModel, effectId: string, preset: FishbonePreset): { command: EditorCommand; ids: string[] } | null {
  const effect = model.nodes.find((n) => n.id === effectId);
  if (effect === undefined || effect.type !== FB_EFFECT_TYPE) return null;
  const commands: EditorCommand[] = [];
  const ids: string[] = [];
  // ids are made unique against the model AND the batch so far
  let nodes = model.nodes;
  for (const name of FISHBONE_PRESETS[preset]) {
    const id = uniqueNodeId({ ...model, nodes }, presetId(name));
    nodes = [...nodes, { id, name }];
    ids.push(id);
    commands.push({ type: 'add-node', node: { id, name, type: FB_CATEGORY_TYPE, ...(effect.plane !== undefined ? { plane: effect.plane } : {}) } });
    commands.push({ type: 'add-relation', from: id, to: effectId, opts: { kind: FB_CAUSE_OF_KIND } });
  }
  return { ids, command: { type: 'batch', commands } };
}
