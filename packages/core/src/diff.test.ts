import { describe, expect, it } from 'vitest';
import { combineDiff, diffMarks, diffMarksByPlane, diffModels, isEmptyDiff } from './diff';
import type { DiagramModel } from './types';

function model(parts: Partial<DiagramModel>): DiagramModel {
  return {
    version: 1,
    id: 'm',
    name: 'M',
    nodes: [],
    containment: [],
    relations: [],
    layers: [],
    planes: [],
    ...parts,
  };
}

const base = model({
  nodes: [
    { id: 'sys', name: 'System', type: 'system' },
    { id: 'api', name: 'API', type: 'service' },
    { id: 'db', name: 'DB', type: 'database' },
    { id: 'old', name: 'Legacy', type: 'service' },
  ],
  containment: [
    { parent: 'sys', child: 'api' },
    { parent: 'sys', child: 'db' },
  ],
  relations: [
    { id: 'api->db#0', from: 'api', to: 'db', kind: 'reads' },
    { id: 'old->db#0', from: 'old', to: 'db', kind: 'writes' },
  ],
  layers: [{ id: 'sec', name: 'Security' }],
  planes: [{ id: 'arch', name: 'Architecture' }],
});

describe('diffModels', () => {
  it('finds nothing between a model and itself, nor across key order', () => {
    const reordered = model({
      ...base,
      nodes: base.nodes.map((n) => Object.fromEntries(Object.entries(n).reverse()) as typeof n),
    });
    expect(isEmptyDiff(diffModels(base, base))).toBe(true);
    expect(isEmptyDiff(diffModels(base, reordered))).toBe(true);
  });

  it('reports added, removed and changed nodes, with the changed fields', () => {
    const after = model({
      ...base,
      nodes: [
        { id: 'sys', name: 'System', type: 'system' },
        { id: 'api', name: 'API gateway', type: 'service', color: '#f00' },
        { id: 'db', name: 'DB', type: 'database' },
        { id: 'cache', name: 'Cache', type: 'cache' },
      ],
      relations: [base.relations[0]!],
    });
    const d = diffModels(base, after);
    expect(d.nodes.added.map((n) => n.id)).toEqual(['cache']);
    expect(d.nodes.removed.map((n) => n.id)).toEqual(['old']);
    expect(d.nodes.changed).toEqual([{ id: 'api', name: 'API gateway', fields: ['color', 'name'] }]);
    expect(d.relations.removed.map((r) => r.id)).toEqual(['old->db#0']);
  });

  it('counts a move to another container as a change', () => {
    const after = model({
      ...base,
      nodes: [...base.nodes, { id: 'edge', name: 'Edge', type: 'system' }],
      containment: [
        { parent: 'edge', child: 'api' },
        { parent: 'sys', child: 'db' },
      ],
    });
    expect(diffModels(base, after).nodes.changed).toEqual([{ id: 'api', name: 'API', fields: ['parent'] }]);
  });

  it('treats an explicit default plane like an omitted one', () => {
    const after = model({ ...base, containment: base.containment.map((e) => ({ ...e, plane: 'arch' })) });
    expect(isEmptyDiff(diffModels(base, after))).toBe(true);
  });

  it('pairs a relation whose id changed by its endpoints and kind', () => {
    const after = model({
      ...base,
      relations: [{ id: 'r-new', from: 'api', to: 'db', kind: 'reads', label: 'SQL' }, base.relations[1]!],
    });
    const d = diffModels(base, after);
    expect(d.relations.added).toEqual([]);
    expect(d.relations.removed).toEqual([]);
    expect(d.relations.changed).toEqual([{ before: 'api->db#0', after: 'r-new', fields: ['label'] }]);
  });

  it('ignores a renamed relation that is otherwise the same', () => {
    const after = model({ ...base, relations: [{ ...base.relations[0]!, id: 'x' }, base.relations[1]!] });
    expect(isEmptyDiff(diffModels(base, after))).toBe(true);
  });

  it('reports a relation that changed kind as removed and added', () => {
    const after = model({
      ...base,
      relations: [{ id: 'r2', from: 'api', to: 'db', kind: 'writes' }, base.relations[1]!],
    });
    const d = diffModels(base, after);
    expect(d.relations.added.map((r) => r.id)).toEqual(['r2']);
    expect(d.relations.removed.map((r) => r.id)).toEqual(['api->db#0']);
  });

  it('reports layers and planes by id', () => {
    const after = model({
      ...base,
      layers: [{ id: 'ops', name: 'Ops' }],
      planes: [...base.planes, { id: 'deploy', name: 'Deploy' }],
    });
    const d = diffModels(base, after);
    expect(d.layers).toEqual({ added: ['ops'], removed: ['sec'], changed: [] });
    expect(d.planes).toEqual({ added: ['deploy'], removed: [], changed: [] });
  });

  it('reports a layer or a plane both versions have, with the fields that differ', () => {
    const after = model({
      ...base,
      layers: [{ id: 'sec', name: 'Security', tint: '#f00' }],
      planes: [{ id: 'arch', name: 'Structure', layers: ['sec'] }],
    });
    const d = diffModels(base, after);
    expect(d.layers.changed).toEqual([{ id: 'sec', fields: ['tint'] }]);
    expect(d.planes.changed).toEqual([{ id: 'arch', fields: ['layers', 'name'] }]);
    expect(isEmptyDiff(d)).toBe(false);
  });

  describe('relations with positional ids', () => {
    const rel = (n: number, extra: object = {}) => ({
      id: `api->db#${n}`,
      from: 'api',
      to: 'db',
      kind: 'reads',
      ...extra,
    });
    const withRelations = (relations: DiagramModel['relations']) => model({ ...base, relations });

    it('sees one added relation where a new one shifted the ids of the later ones', () => {
      const was = withRelations([rel(0, { label: 'a' }), rel(1, { label: 'b' }), rel(2, { label: 'c' })]);
      const now = withRelations([
        rel(0, { label: 'a' }),
        rel(1, { label: 'new' }),
        rel(2, { label: 'b' }),
        rel(3, { label: 'c' }),
      ]);
      const d = diffModels(was, now);
      expect(d.relations.changed).toEqual([]);
      expect(d.relations.removed).toEqual([]);
      expect(d.relations.added.map((r) => r.label)).toEqual(['new']);
    });

    it('pairs the changed one with its closest match, not with the one that took its id', () => {
      const was = withRelations([rel(0, { label: 'a', description: 'x' }), rel(1, { label: 'b', description: 'y' })]);
      const now = withRelations([
        rel(0, { label: 'new', description: 'n' }),
        rel(1, { label: 'a', description: 'x2' }),
        rel(2, { label: 'b', description: 'y' }),
      ]);
      const d = diffModels(was, now);
      expect(d.relations.changed).toEqual([{ before: 'api->db#0', after: 'api->db#1', fields: ['description'] }]);
      expect(d.relations.added.map((r) => r.label)).toEqual(['new']);
    });

    it('never pairs across layers: the same id on another layer is another relation', () => {
      const was = withRelations([rel(0), rel(1, { layer: 'old', label: '1. step' })]);
      const now = withRelations([rel(0), rel(1, { layer: 'new', label: '1. step' })]);
      const d = diffModels(was, now);
      expect(d.relations.changed).toEqual([]);
      expect(d.relations.added.map((r) => r.layer)).toEqual(['new']);
      expect(d.relations.removed.map((r) => r.layer)).toEqual(['old']);
    });

    it('follows an id the author gave to other ends or another layer', () => {
      const was = withRelations([{ id: 'charge', from: 'api', to: 'db', kind: 'reads' }]);
      const now = withRelations([{ id: 'charge', from: 'old', to: 'db', kind: 'reads', layer: 'sec' }]);
      expect(diffModels(was, now).relations).toEqual({
        added: [],
        removed: [],
        changed: [{ before: 'charge', after: 'charge', fields: ['from', 'layer'] }],
      });
    });
  });
});

describe('diffMarks', () => {
  const after = model({
    ...base,
    nodes: [
      ...base.nodes.filter((n) => n.id !== 'old').map((n) => (n.id === 'db' ? { ...n, name: 'Postgres' } : n)),
      { id: 'cache', name: 'Cache' },
    ],
    relations: [
      { id: 'r-new', from: 'api', to: 'db', kind: 'reads', label: 'SQL' },
      { id: 'api->cache#0', from: 'api', to: 'cache', kind: 'reads' },
    ],
  });
  const d = diffModels(base, after);

  it('marks what went and what changed on the before side', () => {
    expect(diffMarks(d, 'before')).toEqual({
      nodes: { db: 'changed', old: 'removed' },
      relations: { 'api->db#0': 'changed', 'old->db#0': 'removed' },
    });
  });

  it('marks what arrived and what changed on the after side, under the after ids', () => {
    expect(diffMarks(d, 'after')).toEqual({
      nodes: { db: 'changed', cache: 'added' },
      relations: { 'r-new': 'changed', 'api->cache#0': 'added' },
    });
  });
});

describe('combineDiff', () => {
  const after = model({
    ...base,
    nodes: [...base.nodes.filter((n) => n.id !== 'db'), { id: 'cache', name: 'Cache', type: 'database' }],
    containment: [
      { parent: 'sys', child: 'api' },
      { parent: 'sys', child: 'cache' },
    ],
    relations: [{ id: 'api->cache#0', from: 'api', to: 'cache', kind: 'reads' }],
    layers: [],
    planes: [{ id: 'arch', name: 'Architecture' }],
  });
  const combined = combineDiff(base, after, diffModels(base, after));

  it('puts a removed node back where it sat, and its relations with it', () => {
    expect(combined.model.nodes.map((n) => n.id)).toEqual(['sys', 'api', 'old', 'cache', 'db']);
    expect(combined.model.containment).toContainEqual({ parent: 'sys', child: 'db' });
    expect(combined.model.relations.map((r) => r.id)).toEqual(['api->cache#0', 'api->db#0', 'old->db#0']);
    expect(combined.model.layers).toEqual([{ id: 'sec', name: 'Security' }]);
  });

  it('marks all three kinds of change on the one model', () => {
    expect(combined.marks.nodes).toEqual({ cache: 'added', db: 'removed' });
    expect(combined.marks.relations).toEqual({
      'api->cache#0': 'added',
      'api->db#0': 'removed',
      'old->db#0': 'removed',
    });
  });

  it('renames a removed relation whose id the after version gave to another', () => {
    const was = model({
      ...base,
      relations: [{ id: 'api->db#0', from: 'api', to: 'db', kind: 'reads', layer: 'sec' }],
    });
    const now = model({
      ...base,
      relations: [{ id: 'api->db#0', from: 'api', to: 'db', kind: 'reads', layer: 'ops' }],
    });
    const out = combineDiff(was, now, diffModels(was, now));
    expect(out.model.relations.map((r) => r.id)).toEqual(['api->db#0', 'api->db#0~removed']);
    expect(out.marks.relations).toEqual({ 'api->db#0': 'added', 'api->db#0~removed': 'removed' });
  });
});

describe('diffMarksByPlane', () => {
  it('has one entry for a model without planes, holding the unlayered marks', () => {
    const m = model({
      nodes: base.nodes,
      relations: [
        { id: 'r1', from: 'api', to: 'db', kind: 'reads' },
        { id: 'r2', from: 'api', to: 'db', kind: 'reads', layer: 'sec' },
      ],
    });
    const marks = { nodes: { api: 'changed' as const }, relations: { r1: 'added' as const, r2: 'added' as const } };
    expect([...diffMarksByPlane(m, marks)]).toEqual([['', { nodes: ['api'], relations: ['r1'] }]]);
  });

  it('gives a layered relation to the planes that switch its layer on, and a base one to the rest', () => {
    const m = model({
      nodes: base.nodes,
      relations: [
        { id: 'r1', from: 'api', to: 'db', kind: 'reads' },
        { id: 'r2', from: 'api', to: 'db', kind: 'reads', layer: 'sec' },
        { id: 'r3', from: 'api', to: 'db', kind: 'reads', plane: 'flow' },
      ],
      planes: [
        { id: 'all', name: 'All' },
        { id: 'flow', name: 'Flow', containmentOf: 'all', layers: ['sec'], baseRelations: false },
      ],
    });
    const marks = { nodes: {}, relations: { r1: 'added' as const, r2: 'added' as const, r3: 'removed' as const } };
    const by = diffMarksByPlane(m, marks);
    expect(by.get('all')).toEqual({ nodes: [], relations: ['r1'] });
    expect(by.get('flow')).toEqual({ nodes: [], relations: ['r2'] });
  });
});
