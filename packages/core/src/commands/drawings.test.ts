import { describe, expect, it } from 'vitest';
import { model } from '../builder/index';
import { applyCommand, emptyLayout, type EditorCommand, type EditorState } from './index';
import { emptyDrawings } from '../drawings';
import { CommandError } from '../command-error';
import { layoutPlaneKey } from '../planes';

/** The state a command leaves; most tests need nothing else. */
const apply = (state: EditorState, command: EditorCommand): EditorState => applyCommand(state, command).state;

function state(): EditorState {
  const m = model('t');
  m.plane('arch').plane('flow', { containmentOf: 'arch' });
  const a = m.node('a', { type: 'service' });
  const sys = m.node('sys', { type: 'system' });
  sys.contains(a);
  return { model: m.toJSON(), layout: emptyLayout(), drawings: emptyDrawings() };
}

// Declares two real planes, 'default' and 'arch', so `layoutPlaneKey` resolves
// each to its own id (rather than 'default' falling back from a no-planes-declared
// model) and per-plane scoping is genuinely exercised.
function emptyState(): EditorState {
  const m = model('t');
  m.plane('default').plane('arch');
  return { model: m.toJSON(), layout: emptyLayout(), drawings: emptyDrawings() };
}

describe('stroke commands', () => {
  const stroke = { id: 'k1', points: [0, 0, 10, 10] };

  it('add-stroke lands in the resolved plane bucket and leaves model/layout by reference', () => {
    const before = emptyState();
    const after = apply(before, { type: 'add-stroke', plane: 'arch', stroke });
    expect(after.drawings.planes['arch']).toEqual([stroke]);
    expect(after.model).toBe(before.model);
    expect(after.layout).toBe(before.layout);
  });

  it('add-stroke without a plane uses the layout plane key', () => {
    const s = apply(state(), { type: 'add-stroke', stroke });
    expect(s.drawings.planes[layoutPlaneKey(s.model)]).toEqual([stroke]);
  });

  it('delete-stroke removes it; unknown ids and duplicates are CommandErrors', () => {
    const s = apply(emptyState(), { type: 'add-stroke', plane: 'arch', stroke });
    expect(() => apply(s, { type: 'add-stroke', plane: 'arch', stroke })).toThrow(CommandError);
    const gone = apply(s, { type: 'delete-stroke', plane: 'arch', id: 'k1' });
    expect(gone.drawings.planes['arch']).toBeUndefined();
    expect(() => apply(gone, { type: 'delete-stroke', plane: 'arch', id: 'k1' })).toThrow(CommandError);
  });

  it('delete-plane prunes the plane bucket', () => {
    let s = apply(emptyState(), { type: 'add-stroke', plane: 'arch', stroke });
    s = apply(s, { type: 'add-stroke', plane: 'default', stroke });
    s = apply(s, { type: 'delete-plane', id: 'arch' });
    expect(s.drawings.planes).toEqual({ default: [stroke] });
  });

  it('every non-stroke command passes drawings through by reference', () => {
    const before = apply(state(), { type: 'add-stroke', stroke });
    const renamed = apply(before, { type: 'rename-node', id: 'a', name: 'A!' });
    expect(renamed.drawings).toBe(before.drawings);
    const moved = apply(before, { type: 'set-position', nodeId: 'a', x: 1, y: 2 });
    expect(moved.drawings).toBe(before.drawings);
    const { state: related } = applyCommand(before, {
      type: 'add-relation',
      from: 'a',
      to: 'a',
      opts: { kind: 'sync' },
    });
    expect(related.drawings).toBe(before.drawings);
  });
});
