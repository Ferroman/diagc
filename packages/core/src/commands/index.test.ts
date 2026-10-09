import { describe, expect, it } from 'vitest';
import { model } from '../builder/index';
import { applyCommand, emptyLayout, type EditorCommand, type EditorState } from './index';
import { emptyDrawings } from '../drawings';
import { CommandError } from '../command-error';

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

describe('applyCommand', () => {
  it('preserves identity of the untouched half of the state', () => {
    const before = state();
    const afterModel = apply(before, { type: 'rename-node', id: 'a', name: 'A!' });
    expect(afterModel.layout).toBe(before.layout);
    const afterLayout = apply(before, { type: 'set-position', nodeId: 'a', x: 10, y: 20 });
    expect(afterLayout.model).toBe(before.model);
  });

  it('undo round-trip: applying then restoring the snapshot is exact', () => {
    const before = state();
    const after = apply(before, { type: 'delete-node', id: 'a' });
    expect(after).not.toEqual(before);
    // the editor undoes by restoring the snapshot — identity must be intact
    expect(JSON.parse(JSON.stringify(before))).toEqual(state());
  });

  it('commands survive serialization', () => {
    const cmd = { type: 'add-relation', from: 'sys', to: 'a', opts: { kind: 'sync' } } as const;
    const s = apply(state(), JSON.parse(JSON.stringify(cmd)));
    expect(s.model.relations.at(-1)).toMatchObject({ from: 'sys', to: 'a', kind: 'sync' });
  });

  it('surfaces the id of the relation add-relation created', () => {
    const { state: s, relationId } = applyCommand(state(), {
      type: 'add-relation',
      from: 'sys',
      to: 'a',
      opts: { kind: 'sync' },
    });
    expect(relationId).toBe('sys->a#0');
    expect(s.model.relations.some((r) => r.id === relationId)).toBe(true);
    // non-relation commands carry no id
    expect(applyCommand(state(), { type: 'rename-node', id: 'a', name: 'A!' }).relationId).toBeUndefined();
  });

  it('throws CommandError on unknown command types and bad targets', () => {
    expect(() => apply(state(), { type: 'rename-node', id: 'ghost', name: 'x' })).toThrowError(CommandError);
    expect(() => apply(state(), { type: 'nope' } as unknown as Parameters<typeof applyCommand>[1])).toThrowError(
      CommandError,
    );
  });
});

describe('batch', () => {
  it('applies its members in order and surfaces the last relation id', () => {
    const { state: s, relationId } = applyCommand(state(), {
      type: 'batch',
      commands: [
        { type: 'add-node', node: { id: 'db', name: 'DB', type: 'database' }, parent: { id: 'sys' } },
        { type: 'add-relation', from: 'a', to: 'db', opts: { kind: 'sync' } },
        { type: 'batch', commands: [{ type: 'rename-node', id: 'db', name: 'Orders DB' }] },
      ],
    });
    expect(s.model.nodes.at(-1)?.name).toBe('Orders DB');
    expect(s.model.containment).toContainEqual({ parent: 'sys', child: 'db' });
    expect(s.model.relations).toHaveLength(1);
    expect(relationId).toBe(s.model.relations[0]?.id);
  });

  it('is atomic: a failing member throws and the input state is what the caller still holds', () => {
    const before = state();
    expect(() =>
      apply(before, {
        type: 'batch',
        commands: [
          { type: 'add-node', node: { id: 'db', name: 'DB', type: 'database' } },
          { type: 'add-node', node: { id: 'a', name: 'dup', type: 'service' } },
        ],
      }),
    ).toThrow(CommandError);
    expect(before.model.nodes.some((n) => n.id === 'db')).toBe(false);
  });

  it('an empty batch returns the same state object', () => {
    const before = state();
    expect(apply(before, { type: 'batch', commands: [] })).toBe(before);
  });
});

describe('the one entry point', () => {
  it('names no command with a type that is an Object member', () => {
    for (const type of ['toString', 'constructor', 'hasOwnProperty', '__proto__']) {
      expect(() => applyCommand(state(), { type } as unknown as EditorCommand)).toThrowError(
        new CommandError(`Unknown command type '${type}'`),
      );
    }
  });

  it('drops dead note entries after a model command, never after a layout or drawing command', () => {
    // a note entry for an element with nothing to show, as a hand-edited file can hold
    const before = state();
    const dead: EditorState = {
      ...before,
      layout: { ...before.layout, notes: { arch: { 'node:gone': { dx: 5, dy: 5 } } } },
    };
    expect(apply(dead, { type: 'rename-node', id: 'a', name: 'A!' }).layout.notes).toBeUndefined();
    expect(
      apply(dead, { type: 'add-relation', from: 'sys', to: 'a', opts: { kind: 'sync' } }).layout.notes,
    ).toBeUndefined();
    expect(apply(dead, { type: 'set-position', nodeId: 'a', x: 1, y: 2 }).layout.notes).toBe(dead.layout.notes);
    expect(apply(dead, { type: 'add-stroke', stroke: { id: 'k1', points: [0, 0, 10, 10] } }).layout).toBe(dead.layout);
  });
});
