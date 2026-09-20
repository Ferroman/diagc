import { describe, expect, it } from 'vitest';
import { emptyDrawings, emptyLayout, model, type EditorState } from '@diagc/core';
import { dispatch, HISTORY_CAP, isDirty, redo, startSession, undo } from './reducer';

function state(): EditorState {
  const m = model('draft');
  const a = m.node('a', { type: 'service' });
  const sys = m.node('sys', { type: 'system' });
  sys.contains(a);
  return { model: m.toJSON(), layout: emptyLayout(), drawings: emptyDrawings() };
}

describe('editor reducer', () => {
  it('dispatch applies, records history, marks dirty, and undo/redo round-trip', () => {
    let s = startSession('draft', state());
    expect(isDirty(s)).toBe(false);
    s = dispatch(s, { type: 'rename-node', id: 'a', name: 'Alpha' });
    expect(s.state.model.nodes[0]?.name).toBe('Alpha');
    expect(isDirty(s)).toBe(true);
    s = undo(s);
    expect(s.state.model.nodes[0]?.name).toBe('a');
    expect(s.future).toHaveLength(1);
    s = redo(s);
    expect(s.state.model.nodes[0]?.name).toBe('Alpha');
    expect(s.future).toHaveLength(0);
  });

  it('failed commands set error and leave state and history untouched', () => {
    let s = startSession('draft', state());
    s = dispatch(s, { type: 'rename-node', id: 'ghost', name: 'x' });
    expect(s.error).toContain('ghost');
    expect(s.past).toHaveLength(0);
    expect(isDirty(s)).toBe(false);
    s = dispatch(s, { type: 'rename-node', id: 'a', name: 'ok' });
    expect(s.error).toBeUndefined();
  });

  it('new edits clear the redo stack and history is capped', () => {
    let s = startSession('draft', state());
    s = dispatch(s, { type: 'rename-node', id: 'a', name: 'one' });
    s = undo(s);
    s = dispatch(s, { type: 'rename-node', id: 'a', name: 'two' });
    expect(s.future).toHaveLength(0);
    for (let i = 0; i < HISTORY_CAP + 20; i++) {
      s = dispatch(s, { type: 'rename-node', id: 'a', name: `n${i}` });
    }
    expect(s.past).toHaveLength(HISTORY_CAP);
  });

  it('add-relation records lastRelationId', () => {
    let s = startSession('draft', state());
    s = dispatch(s, { type: 'add-relation', from: 'sys', to: 'a', opts: { kind: 'sync' } });
    expect(s.lastRelationId).toBe('sys->a#0');
    expect(s.state.model.relations.at(-1)?.id).toBe('sys->a#0');
  });

  it('first plane migrates the default overlay bucket', () => {
    let s = startSession('draft', state());
    s = dispatch(s, { type: 'set-position', nodeId: 'a', x: 7, y: 8 });
    expect(s.state.layout.planes['default']?.['a']).toEqual({ x: 7, y: 8 });
    s = dispatch(s, { type: 'upsert-plane', plane: { id: 'arch', name: 'Architecture' } });
    expect(s.state.layout.planes['arch']?.['a']).toEqual({ x: 7, y: 8 });
    expect(s.state.layout.planes['default']).toBeUndefined();
    // and undo restores the pre-migration shape
    s = undo(s);
    expect(s.state.layout.planes['default']?.['a']).toEqual({ x: 7, y: 8 });
  });

  it('first plane migrates the default drawings bucket alongside the layout bucket', () => {
    let s = startSession('draft', state());
    s = dispatch(s, { type: 'add-stroke', stroke: { id: 'k1', points: [1, 2, 3, 4] } });
    expect(s.state.drawings.planes['default']).toHaveLength(1);
    s = dispatch(s, { type: 'upsert-plane', plane: { id: 'arch', name: 'Architecture' } });
    expect(s.state.drawings.planes['arch']).toHaveLength(1);
    expect(s.state.drawings.planes['default']).toBeUndefined();
    s = undo(s);
    expect(s.state.drawings.planes['default']).toHaveLength(1);
  });

  it('migrates BOTH default buckets when positions and strokes exist together', () => {
    // The two migrations chain off `nextState`, not off the raw command result,
    // so the second must build on the first. Filling only one bucket (as the two
    // tests above do) cannot tell a chain from a pair of independent rewrites of
    // `state` — this one can: dropping the chaining loses the layout bucket.
    let s = startSession('draft', state());
    s = dispatch(s, { type: 'set-position', nodeId: 'a', x: 7, y: 8 });
    s = dispatch(s, { type: 'add-stroke', stroke: { id: 'k1', points: [1, 2, 3, 4] } });
    s = dispatch(s, { type: 'upsert-plane', plane: { id: 'arch', name: 'Architecture' } });

    expect(s.state.layout.planes['arch']?.['a']).toEqual({ x: 7, y: 8 });
    expect(s.state.drawings.planes['arch']).toHaveLength(1);
    expect(s.state.layout.planes['default']).toBeUndefined();
    expect(s.state.drawings.planes['default']).toBeUndefined();
  });

  it('migrates the default buckets when the first plane arrives via a batch, not just a bare upsert-plane', () => {
    let s = startSession('draft', state());
    s = dispatch(s, { type: 'set-position', nodeId: 'a', x: 7, y: 8 });
    s = dispatch(s, { type: 'add-stroke', stroke: { id: 'k1', points: [1, 2, 3, 4] } });
    s = dispatch(s, {
      type: 'batch',
      commands: [{ type: 'upsert-plane', plane: { id: 'arch', name: 'Architecture' } }],
    });

    expect(s.state.layout.planes['arch']?.['a']).toEqual({ x: 7, y: 8 });
    expect(s.state.drawings.planes['arch']).toHaveLength(1);
    expect(s.state.layout.planes['default']).toBeUndefined();
    expect(s.state.drawings.planes['default']).toBeUndefined();
  });

  it('a batch is one undo step, and an empty batch records nothing', () => {
    let s = startSession('draft', state());
    s = dispatch(s, {
      type: 'batch',
      commands: [
        { type: 'add-node', node: { id: 'db', name: 'DB', type: 'database' }, parent: { id: 'sys' } },
        { type: 'add-relation', from: 'a', to: 'db', opts: { kind: 'sync' } },
        { type: 'rename-node', id: 'db', name: 'Orders DB' },
      ],
    });
    expect(s.past).toHaveLength(1);
    // A batch never sets lastRelationId, even one ending in add-relation: that
    // field exists solely to let App.tsx select the edge a canvas connect
    // gesture just drew, and a batch is never a connect gesture (e.g. the Git
    // panel's own batches end in add-relation but must not steal selection
    // away from the panel's own onSelect).
    expect(s.lastRelationId).toBeUndefined();
    s = undo(s);
    expect(s.state.model.nodes.some((n) => n.id === 'db')).toBe(false);
    expect(s.state.model.relations).toHaveLength(0);
    s = dispatch(s, { type: 'batch', commands: [] });
    expect(s.past).toHaveLength(0);
    expect(isDirty(s)).toBe(false);
  });

  it('a bare add-relation dispatch still sets lastRelationId (unlike a batch)', () => {
    let s = startSession('draft', state());
    s = dispatch(s, { type: 'add-relation', from: 'a', to: 'sys', opts: { kind: 'sync' } });
    expect(s.lastRelationId).toBe(s.state.model.relations[0]?.id);
  });
});
