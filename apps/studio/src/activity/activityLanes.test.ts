import { describe, expect, it } from 'vitest';
import { applyCommand, emptyDrawings, emptyLayout, model, type DiagramModel } from '@diagc/core/internal';
import { activityContext, moveLaneCommand, reorderLanesCommand } from './activityLanes';

/** frame f ⊃ lane l ⊃ region r */
function frameLaneRegionModel(): DiagramModel {
  const m = model('a');
  const frame = m.activity('f', { name: 'Fulfillment' });
  const lane = frame.lane('l', { name: 'Warehouse' });
  lane.region('r', 'Retry region');
  return m.toJSON();
}

/** frame f ⊃ lanes a, b, c */
function threeLanes(): DiagramModel {
  const m = model('a');
  const frame = m.activity('f', { name: 'Fulfillment' });
  for (const id of ['a', 'b', 'c']) frame.lane(id, { name: id.toUpperCase() });
  return m.toJSON();
}

describe('reorderLanesCommand', () => {
  it('walks each lane up into its slot', () => {
    const step = (child: string) => ({ type: 'move-child', parent: 'f', child, offset: -1 });
    expect(reorderLanesCommand('f', ['a', 'b', 'c'], ['c', 'a', 'b'], undefined)).toEqual({
      type: 'batch',
      commands: [step('c'), step('c')],
    });
    expect(reorderLanesCommand('f', ['a', 'b'], ['b', 'a'], undefined)).toEqual(step('b'));
    expect(reorderLanesCommand('f', ['a', 'b'], ['a', 'b'], undefined)).toBeNull();
  });
});

describe('moveLaneCommand', () => {
  const order = (m: DiagramModel) => m.containment.filter((e) => e.parent === 'f').map((e) => e.child);
  const run = (offset: number) => {
    const command = moveLaneCommand('f', 'a', offset, undefined);
    if (command === null) return null;
    return order(
      applyCommand({ model: threeLanes(), layout: emptyLayout(), drawings: emptyDrawings() }, command).state.model,
    );
  };

  it('moves a lane several slots as one command, either way', () => {
    expect(run(2)).toEqual(['b', 'c', 'a']);
    expect(run(1)).toEqual(['b', 'a', 'c']);
    const up = moveLaneCommand('f', 'c', -2, 'p');
    expect(up).toEqual({
      type: 'batch',
      commands: [0, 1].map(() => ({ type: 'move-child', parent: 'f', child: 'c', offset: -1, plane: 'p' })),
    });
  });

  it('is null when the lane did not move', () => {
    expect(run(0)).toBeNull();
  });
});

describe('activityContext', () => {
  it('finds the frame above any selection, and the nearest lane or region as the target', () => {
    const m = frameLaneRegionModel();
    expect(activityContext(m, { kind: 'node', id: 'r' }, undefined)).toMatchObject({
      frame: { id: 'f' },
      target: { id: 'r' },
    });
    expect(activityContext(m, { kind: 'node', id: 'l' }, undefined)).toMatchObject({
      frame: { id: 'f' },
      target: { id: 'l' },
    });
    expect(activityContext(m, { kind: 'node', id: 'f' }, undefined)?.target).toBeUndefined();
  });

  it('needs a selection to pick between frames', () => {
    const m = model('two');
    m.activity('f1');
    m.activity('f2');
    expect(activityContext(m.toJSON(), null, undefined)).toBeUndefined();
    expect(activityContext(m.toJSON(), { kind: 'node', id: 'f2' }, undefined)?.frame.id).toBe('f2');
  });
});
