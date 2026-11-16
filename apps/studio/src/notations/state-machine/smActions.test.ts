import { describe, expect, it } from 'vitest';
import { SM_INITIAL_TYPE, SM_REGION_TYPE, SM_STATE_TYPE, model } from '@diagc/core/internal';
import { addSmElement, glyphLabel } from './smActions';

const empty = () => model('m').toJSON();

describe('addSmElement', () => {
  it('numbers ids from the first free one, per type', () => {
    const m = empty();
    expect(addSmElement(m, SM_STATE_TYPE, undefined, {}).id).toBe('sm-state-1');
    const taken = { ...m, nodes: [{ id: 'sm-state-1', name: 'x' }] };
    expect(addSmElement(taken, SM_STATE_TYPE, undefined, {}).id).toBe('sm-state-2');
    expect(addSmElement(taken, SM_REGION_TYPE, undefined, {}).id).toBe('sm-region-1');
  });

  it('places inside a parent and tags the node and the edge with their own planes', () => {
    const { command, id } = addSmElement(empty(), SM_REGION_TYPE, 'p', { node: 'a', edge: 'b' });
    expect(command).toEqual({
      type: 'add-node',
      node: { id, name: '', type: SM_REGION_TYPE, plane: 'a' },
      parent: { id: 'p', plane: 'b' },
    });
  });

  it('adds no parent and no plane at top level, and names a state', () => {
    const { command } = addSmElement(empty(), SM_STATE_TYPE, undefined, {});
    expect(command).toEqual({ type: 'add-node', node: { id: 'sm-state-1', name: 'State', type: SM_STATE_TYPE } });
  });
});

describe('glyphLabel', () => {
  it('uses the legend label', () => {
    expect(glyphLabel(SM_INITIAL_TYPE)).toBe('Initial state');
  });
});
