import { describe, expect, it } from 'vitest';
import { diffMarks, diffModels, isEmptyDiff } from './diff';
import type { DiagramModel } from './types';

function model(parts: Partial<DiagramModel>): DiagramModel {
  return { version: 1, id: 'm', name: 'M', nodes: [], containment: [], relations: [], layers: [], planes: [], ...parts };
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
    const after = model({ ...base, relations: [{ id: 'r2', from: 'api', to: 'db', kind: 'writes' }, base.relations[1]!] });
    const d = diffModels(base, after);
    expect(d.relations.added.map((r) => r.id)).toEqual(['r2']);
    expect(d.relations.removed.map((r) => r.id)).toEqual(['api->db#0']);
  });

  it('reports layers and planes by id', () => {
    const after = model({ ...base, layers: [{ id: 'ops', name: 'Ops' }], planes: [...base.planes, { id: 'deploy', name: 'Deploy' }] });
    const d = diffModels(base, after);
    expect(d.layers).toEqual({ added: ['ops'], removed: ['sec'] });
    expect(d.planes).toEqual({ added: ['deploy'], removed: [] });
  });
});

describe('diffMarks', () => {
  const after = model({
    ...base,
    nodes: [...base.nodes.filter((n) => n.id !== 'old').map((n) => (n.id === 'db' ? { ...n, name: 'Postgres' } : n)), { id: 'cache', name: 'Cache' }],
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
