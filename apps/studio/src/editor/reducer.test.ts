import { describe, expect, it } from 'vitest';
import { emptyLayout, model, type EditorState } from '@diagramming/core';
import { dispatch, HISTORY_CAP, isDirty, redo, startSession, undo } from './reducer';

function state(): EditorState {
  const m = model('draft');
  const a = m.node('a', { type: 'service' });
  const sys = m.node('sys', { type: 'system' });
  sys.contains(a);
  return { model: m.toJSON(), layout: emptyLayout() };
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
});
