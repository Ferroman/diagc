import { describe, expect, it } from 'vitest';
import { validate } from './index';
import type { DiagramModel } from '../types';

function emptyModel(): DiagramModel {
  return { version: 1, id: 'm', name: 'm', nodes: [], containment: [], relations: [], layers: [], planes: [] };
}

const raw = (over: Partial<DiagramModel>): DiagramModel => ({
  version: 1,
  id: 'x',
  name: 'x',
  nodes: [],
  containment: [],
  relations: [],
  layers: [],
  planes: [],
  ...over,
});

describe('structure checks', () => {
  it('flags duplicate layer ids', () => {
    const m = emptyModel();
    m.layers = [
      { id: 'l', name: 'l' },
      { id: 'l', name: 'l2' },
    ];
    expect(validate(m)).toEqual([{ code: 'duplicate-layer', message: "Duplicate layer id 'l'", ref: 'l' }]);
  });

  it('flags containment cycles', () => {
    const m = emptyModel();
    m.nodes = [
      { id: 'a', name: 'a', type: 't' },
      { id: 'b', name: 'b', type: 't' },
    ];
    m.containment = [
      { parent: 'a', child: 'b' },
      { parent: 'b', child: 'a' },
    ];
    const issues = validate(m);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: 'containment-cycle' });
  });

  it('accepts a known plane notation and rejects unknown ones', () => {
    const good = emptyModel();
    good.planes = [{ id: 'p', name: 'P', notation: 'causal-loop' }];
    expect(validate(good)).toEqual([]);

    const bad = emptyModel();
    bad.planes = [{ id: 'p', name: 'P', notation: 'bogus' }];
    expect(validate(bad)).toEqual([
      { code: 'unknown-notation', message: "Plane 'p' has unknown notation 'bogus'", ref: 'p' },
    ]);
  });

  it('flags plane.hides referencing an unknown node', () => {
    const issues = validate(
      raw({
        nodes: [{ id: 'a', name: 'a', type: 't' }],
        planes: [{ id: 'p', name: 'p', hides: ['nope'] }],
      }),
    );
    expect(issues.some((i) => i.code === 'unknown-hidden-node' && i.ref === 'p')).toBe(true);
  });

  it('checks plane.hidesTree the same way as plane.hides', () => {
    const issues = validate(
      raw({
        nodes: [{ id: 'a', name: 'a', type: 't' }],
        planes: [{ id: 'p', name: 'p', hidesTree: ['nope'] }],
      }),
    );
    expect(issues.some((i) => i.code === 'unknown-hidden-node' && i.ref === 'p')).toBe(true);
    expect(
      validate(
        raw({
          nodes: [{ id: 'a', name: 'a', type: 't' }],
          planes: [{ id: 'p', name: 'p', hidesTree: ['a'] }],
        }),
      ),
    ).toEqual([]);
  });

  it('flags hiding a node that is already scoped to a plane (redundant)', () => {
    const issues = validate(
      raw({
        nodes: [{ id: 'a', name: 'a', type: 't', plane: 'p' }],
        planes: [{ id: 'p', name: 'p', hides: ['a'] }],
      }),
    );
    expect(issues.some((i) => i.code === 'redundant-hide' && i.ref === 'p')).toBe(true);
  });

  it('accepts hiding a shared node', () => {
    const issues = validate(
      raw({
        nodes: [{ id: 'a', name: 'a', type: 't' }],
        planes: [{ id: 'p', name: 'p', hides: ['a'] }],
      }),
    );
    expect(issues).toEqual([]);
  });
});
