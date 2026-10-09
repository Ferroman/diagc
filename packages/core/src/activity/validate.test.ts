import { describe, expect, it } from 'vitest';
import { validate } from '../validate/index';
import type { ContainmentEdge, DiagramModel, DiagramNode } from '../types';

describe('validateActivity', () => {
  const base = (nodes: DiagramNode[], containment: ContainmentEdge[]): DiagramModel => ({
    version: 1,
    id: 'd',
    name: 'd',
    nodes,
    containment,
    relations: [],
    layers: [],
    planes: [],
  });

  it('accepts frame ⊃ lane ⊃ elements ⊃ region', () => {
    const m = base(
      [
        { id: 'f', name: 'f', type: 'activity-frame' },
        { id: 'l', name: 'l', type: 'activity-lane' },
        { id: 'r', name: 'r', type: 'activity-region' },
        { id: 'a', name: 'a', type: 'activity-action' },
      ],
      [
        { parent: 'f', child: 'l' },
        { parent: 'l', child: 'r' },
        { parent: 'r', child: 'a' },
      ],
    );
    expect(validate(m).filter((i) => i.code.startsWith('activity'))).toEqual([]);
  });

  it('flags a parentless lane and a lane under a non-frame', () => {
    const m = base(
      [
        { id: 'loose', name: 'loose', type: 'activity-lane' },
        { id: 'box', name: 'box', type: 'service' },
        { id: 'l2', name: 'l2', type: 'activity-lane' },
      ],
      [{ parent: 'box', child: 'l2' }],
    );
    const codes = validate(m).map((i) => [i.code, i.ref]);
    expect(codes).toContainEqual(['activity-lane-parent', 'loose']);
    expect(codes).toContainEqual(['activity-lane-parent', 'l2']);
  });

  it('flags a non-lane child of a frame, once', () => {
    const m = base(
      [
        { id: 'f', name: 'f', type: 'activity-frame' },
        { id: 'l', name: 'l', type: 'activity-lane' },
        { id: 'a', name: 'a', type: 'activity-action' },
      ],
      [
        { parent: 'f', child: 'l' },
        { parent: 'f', child: 'a' },
      ],
    );
    const hits = validate(m).filter((i) => i.code === 'activity-frame-children');
    expect(hits).toHaveLength(1);
    expect(hits[0]!.ref).toBe('a');
  });

  it('flags a region outside a lane; a loose region is legal', () => {
    const m = base(
      [
        { id: 'f', name: 'f', type: 'activity-frame' },
        { id: 'r', name: 'r', type: 'activity-region' },
        { id: 'r2', name: 'r2', type: 'activity-region' },
      ],
      [{ parent: 'f', child: 'r' }],
    );
    const codes = validate(m).map((i) => i.code);
    expect(codes).toContain('activity-region-parent');
    // r2 has no parent — legal (only WRONG parents are flagged)
    expect(validate(m).filter((i) => i.ref === 'r2')).toEqual([]);
  });

  it('loose activity leaf elements are legal', () => {
    const m = base([{ id: 'a', name: 'a', type: 'activity-action' }], []);
    expect(validate(m).filter((i) => i.code.startsWith('activity'))).toEqual([]);
  });
});
