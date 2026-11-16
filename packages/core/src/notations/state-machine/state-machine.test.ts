import { describe, expect, it } from 'vitest';
import type { DiagramModel } from '../../types';
import {
  SM_MACHINE_TYPE,
  SM_REGION_TYPE,
  SM_STATE_TYPE,
  SM_TYPES,
  isOrthogonal,
  isPseudoState,
  isStateMachineType,
} from './state-machine';

const withEdges = (containment: DiagramModel['containment'], extra: Partial<DiagramModel> = {}): DiagramModel => ({
  version: 1,
  id: 'sm',
  name: 'sm',
  nodes: [
    { id: 'm', name: 'M', type: SM_MACHINE_TYPE },
    { id: 's', name: 'S', type: SM_STATE_TYPE },
    { id: 'r', name: 'R', type: SM_REGION_TYPE },
  ],
  containment,
  relations: [],
  layers: [],
  planes: [],
  ...extra,
});

describe('isStateMachineType', () => {
  it('knows the sm- types and nothing else', () => {
    expect(isStateMachineType('sm-state')).toBe(true);
    expect(isStateMachineType('activity-start')).toBe(false);
    expect(isStateMachineType(undefined)).toBe(false);
  });
});

describe('isPseudoState', () => {
  it('is false for machine, state and region and true for the other ten', () => {
    expect(SM_TYPES.filter(isPseudoState)).toHaveLength(10);
    for (const t of [SM_MACHINE_TYPE, SM_STATE_TYPE, SM_REGION_TYPE]) expect(isPseudoState(t)).toBe(false);
    expect(isPseudoState(undefined)).toBe(false);
    expect(isPseudoState('activity-start')).toBe(false);
  });
});

describe('isOrthogonal', () => {
  it('is true when the node holds a region on the plane', () => {
    expect(isOrthogonal(withEdges([{ parent: 's', child: 'r' }]), undefined, 's')).toBe(true);
    expect(isOrthogonal(withEdges([{ parent: 'm', child: 's' }]), undefined, 'm')).toBe(false);
  });

  it('reads only the given plane', () => {
    const model = withEdges([{ parent: 's', child: 'r', plane: 'other' }], {
      planes: [
        { id: 'main', name: 'Main' },
        { id: 'other', name: 'Other' },
      ],
    });
    expect(isOrthogonal(model, 'main', 's')).toBe(false);
    expect(isOrthogonal(model, 'other', 's')).toBe(true);
  });
});
