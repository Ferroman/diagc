import { describe, expect, it } from 'vitest';
import { applyCommand, emptyDrawings, emptyLayout, model, type DiagramModel } from '@diagc/core';
import { deleteSelectionCommand } from './deleteSelection';

// service `a` and `b` with a relation, plus an activity frame containing a lane
// (frames accept only lanes, and the frame is CASCADE_DELETE_TYPES material)
const testModel = (): DiagramModel => {
  const m = model('t');
  const a = m.node('a', { name: 'a', type: 'service' });
  const b = m.node('b', { name: 'b', type: 'service' });
  m.relate(a, b, { kind: 'sync' });
  const frame = m.node('frame', { name: 'frame', type: 'activity-frame' });
  frame.contains(m.node('inner', { name: 'inner', type: 'activity-lane' }));
  return m.toJSON();
};

const apply = (m: DiagramModel, sel: { nodeIds: string[]; relationIds: string[] }): DiagramModel => {
  const cmd = deleteSelectionCommand(m, sel);
  expect(cmd).not.toBeNull();
  return applyCommand({ model: m, layout: emptyLayout(), drawings: emptyDrawings() }, cmd!).model;
};

describe('deleteSelectionCommand', () => {
  it('a single node yields one delete-node, no batch wrapper', () => {
    const cmd = deleteSelectionCommand(testModel(), { nodeIds: ['a'], relationIds: [] });
    expect(cmd).toEqual({ type: 'delete-node', id: 'a' });
  });

  it('multiple deletions collapse into one batch (one undo step)', () => {
    const m = testModel();
    const cmd = deleteSelectionCommand(m, { nodeIds: ['a', 'b'], relationIds: [] });
    expect(cmd?.type).toBe('batch');
    const next = apply(m, { nodeIds: ['a', 'b'], relationIds: [] });
    expect(next.nodes.map((n) => n.id)).toEqual(['frame', 'inner']);
    expect(next.relations).toEqual([]); // pruned with their endpoints
  });

  it('frames cascade, and a selected child inside the cascade is not double-deleted', () => {
    const m = testModel();
    // 'inner' is doomed by the frame's cascade — a second delete-node on it
    // would throw mid-batch and abort the whole gesture.
    const next = apply(m, { nodeIds: ['frame', 'inner'], relationIds: [] });
    expect(next.nodes.map((n) => n.id)).toEqual(['a', 'b']);
  });

  it('a relation deletes alongside its endpoint without tripping on the prune order', () => {
    const m = testModel();
    const relId = m.relations[0]!.id;
    const next = apply(m, { nodeIds: ['a'], relationIds: [relId] });
    expect(next.relations).toEqual([]);
    expect(next.nodes.some((n) => n.id === 'a')).toBe(false);
  });

  it('ids the model no longer knows are skipped; nothing left → null', () => {
    expect(deleteSelectionCommand(testModel(), { nodeIds: ['ghost'], relationIds: ['gone'] })).toBeNull();
  });
});
