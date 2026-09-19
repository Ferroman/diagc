import { describe, expect, it } from 'vitest';
import { model } from './builder';
import { DiagramValidationError, validate } from './validate';
import type { DiagramModel, DiagramNode, DiagramRelation, ContainmentEdge } from './types';

function emptyModel(): DiagramModel {
  return { version: 1, id: 'm', name: 'm', nodes: [], containment: [], relations: [], layers: [], planes: [] };
}

describe('validate', () => {
  it('flags duplicate node ids', () => {
    const m = emptyModel();
    m.nodes = [
      { id: 'a', name: 'a', type: 't' },
      { id: 'a', name: 'other', type: 't' },
    ];
    expect(validate(m)).toEqual([
      { code: 'duplicate-node', message: "Duplicate node id 'a'", ref: 'a' },
    ]);
  });

  it('flags a node claiming the reserved layout-root id', () => {
    const m = emptyModel();
    m.nodes = [{ id: '__root__', name: 'sneaky', type: 't' }];
    expect(validate(m)).toEqual([
      { code: 'reserved-node-id', message: "Node id '__root__' is reserved for the layout root", ref: '__root__' },
    ]);
  });

  it('flags duplicate layer ids', () => {
    const m = emptyModel();
    m.layers = [
      { id: 'l', name: 'l' },
      { id: 'l', name: 'l2' },
    ];
    expect(validate(m)).toEqual([
      { code: 'duplicate-layer', message: "Duplicate layer id 'l'", ref: 'l' },
    ]);
  });

  it('flags duplicate relation ids', () => {
    const m = emptyModel();
    m.nodes = [
      { id: 'a', name: 'a', type: 't' },
      { id: 'b', name: 'b', type: 't' },
    ];
    m.relations = [
      { id: 'a->b#0', from: 'a', to: 'b', kind: 'k' },
      { id: 'a->b#0', from: 'a', to: 'b', kind: 'k2' },
    ];
    expect(validate(m)).toEqual([
      { code: 'duplicate-relation', message: "Duplicate relation id 'a->b#0'", ref: 'a->b#0' },
    ]);
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

  it('flags dangling relation endpoints and containment refs', () => {
    const m = emptyModel();
    m.nodes = [{ id: 'a', name: 'a', type: 't' }];
    m.relations = [{ id: 'r', from: 'a', to: 'ghost', kind: 'k' }];
    m.containment = [{ parent: 'phantom', child: 'a' }];
    expect(validate(m)).toEqual([
      { code: 'dangling-endpoint', message: "Containment references unknown node 'phantom'", ref: 'phantom' },
      { code: 'dangling-endpoint', message: "Relation 'r' references unknown node 'ghost'", ref: 'r' },
    ]);
  });

  it('flags relations tagged with undeclared layers', () => {
    const m = emptyModel();
    m.nodes = [
      { id: 'a', name: 'a', type: 't' },
      { id: 'b', name: 'b', type: 't' },
    ];
    m.relations = [{ id: 'r', from: 'a', to: 'b', kind: 'k', layer: 'nope' }];
    expect(validate(m)).toEqual([
      { code: 'unknown-layer', message: "Relation 'r' references unknown layer 'nope'", ref: 'r' },
    ]);
  });

  it('flags nodes tagged with undeclared layers', () => {
    const m = emptyModel();
    m.nodes = [{ id: 'a', name: 'a', type: 't', layer: 'nope' }];
    expect(validate(m)).toEqual([
      { code: 'unknown-layer', message: "Node 'a' references unknown layer 'nope'", ref: 'a' },
    ]);
  });

  it('accepts a valid multi-membership model', () => {
    const m = model('acme');
    const shared = m.node('db', { type: 'database' });
    m.node('sys-a', { type: 'system' }).contains(shared);
    m.node('sys-b', { type: 'system' }).contains(shared);
    expect(validate(m.toJSON())).toEqual([]);
  });

  it('toJSON throws DiagramValidationError listing every issue', () => {
    const m = model('acme');
    const a = m.node('a', { type: 't' });
    const b = m.node('b', { type: 't' });
    a.contains(b);
    b.contains(a);
    m.relate(a, b, { kind: 'k', layer: 'missing' });

    expect(() => m.toJSON()).toThrowError(DiagramValidationError);
    try {
      m.toJSON();
    } catch (e) {
      const err = e as DiagramValidationError;
      expect(err.issues.map((i) => i.code).sort()).toEqual(['containment-cycle', 'unknown-layer']);
      expect(err.message).toContain('Containment cycle');
      expect(err.message).toContain("unknown layer 'missing'");
    }
  });

  it('flags invalid relation style values, accepts valid ones', () => {
    const good = model('ok');
    const a = good.node('a', { type: 'svc' });
    const b = good.node('b', { type: 'svc' });
    good.relate(a, b, {
      kind: 'sync',
      style: { shape: 'step', color: '#ff8800', width: 2.5, line: 'dotted', end: 'diamond', animated: true },
    });
    expect(validate(good.toJSON())).toEqual([]);

    const bad = validate({
      version: 1,
      id: 'x',
      name: 'x',
      nodes: [
        { id: 'a', name: 'a', type: 't' },
        { id: 'b', name: 'b', type: 't' },
      ],
      containment: [],
      relations: [
        {
          id: 'r',
          from: 'a',
          to: 'b',
          kind: 'sync',
          style: { shape: 'zigzag', width: -1, end: 'bar' } as never,
        },
      ],
      layers: [],
      planes: [],
    });
    expect(bad.map((i) => i.code)).toEqual(['invalid-style', 'invalid-style', 'invalid-style']);
  });

  it('accepts a well-formed image ref and rejects malformed ones', () => {
    const good = emptyModel();
    good.nodes = [{ id: 'pic', name: 'pic', type: 'image', image: 'a3f9c2d4e5f6.png' }];
    expect(validate(good)).toEqual([]);
    for (const bad of ['../escape.png', 'no-extension', 'UPPER.PNG', 'a b.png', 'x.bmp']) {
      const m = emptyModel();
      m.nodes = [{ id: 'pic', name: 'pic', type: 'image', image: bad }];
      expect(validate(m).map((i) => i.code)).toContain('invalid-image');
    }
  });

  it('validates node keys: slug shape, uniqueness within one diagram', () => {
    const good = emptyModel();
    good.nodes = [{ id: 'db', name: 'db', type: 'database', key: 'appuser-db' }];
    expect(validate(good)).toEqual([]);
    for (const bad of ['Upper', 'has space', '-lead', '']) {
      const m = emptyModel();
      m.nodes = [{ id: 'db', name: 'db', type: 'database', key: bad }];
      expect(validate(m).map((i) => i.code)).toContain('invalid-key');
    }
    const dup = emptyModel();
    dup.nodes = [
      { id: 'a', name: 'a', type: 't', key: 'appuser-db' },
      { id: 'b', name: 'b', type: 't', key: 'appuser-db' },
    ];
    expect(validate(dup).map((i) => i.code)).toContain('duplicate-key');
  });

  it('validates include as a non-empty string', () => {
    const m = emptyModel();
    m.nodes = [{ id: 'perm', name: 'perm', type: 'system', include: '' }];
    expect(validate(m).map((i) => i.code)).toContain('invalid-include');
    const ok = emptyModel();
    ok.nodes = [{ id: 'perm', name: 'perm', type: 'system', include: './perm.diagram.json' }];
    expect(validate(ok)).toEqual([]);
  });

  it('flags includePlane and includePlanes problems', () => {
    const m = emptyModel();
    m.nodes = [
      { id: 'a', name: 'a', includePlane: 'x' },
      { id: 'b', name: 'b', includePlanes: true },
      { id: 'c', name: 'c', include: './x.json', includePlane: '' },
      { id: 'd', name: 'd', include: './x.json', includePlane: 'p', includePlanes: true },
    ];
    const issues = validate(m);
    expect(issues.filter((i) => i.code === 'invalid-include').map((i) => i.ref)).toEqual(['a', 'b', 'c']);
  });

  it('accepts a node with no type (typeless casual node)', () => {
    const m = emptyModel();
    m.nodes = [{ id: 'trust', name: 'Trust' }];
    expect(validate(m)).toEqual([]);
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

  it('validates relation polarity and delay', () => {
    const nodes = [
      { id: 'a', name: 'a', type: 't' },
      { id: 'b', name: 'b', type: 't' },
    ];
    const good = emptyModel();
    good.nodes = nodes;
    good.relations = [{ id: 'r', from: 'a', to: 'b', kind: 'k', polarity: '+', delay: true }];
    expect(validate(good)).toEqual([]);

    const badPolarity = emptyModel();
    badPolarity.nodes = nodes;
    badPolarity.relations = [{ id: 'r', from: 'a', to: 'b', kind: 'k', polarity: 'x' as never }];
    expect(validate(badPolarity).map((i) => i.code)).toContain('invalid-polarity');

    const badDelay = emptyModel();
    badDelay.nodes = nodes;
    badDelay.relations = [{ id: 'r', from: 'a', to: 'b', kind: 'k', delay: 'yes' as never }];
    expect(validate(badDelay).map((i) => i.code)).toContain('invalid-delay');
  });

  it('accepts a bundled /library image ref and still rejects a bad one', () => {
    const base = { version: 1 as const, containment: [], relations: [], layers: [], planes: [] };
    const ok = validate({ ...base, id: 'd', name: 'd', nodes: [{ id: 'n', name: 'n', image: '/library/aws/lambda.svg' }] });
    expect(ok.filter((i) => i.code === 'invalid-image')).toHaveLength(0);
    const bad = validate({ ...base, id: 'd', name: 'd', nodes: [{ id: 'n', name: 'n', image: '/etc/passwd' }] });
    expect(bad.some((i) => i.code === 'invalid-image')).toBe(true);
  });

  it('accepts a valid shape ref and rejects a bad one', () => {
    const base = { version: 1 as const, containment: [], relations: [], layers: [], planes: [] };
    const ok = validate({ ...base, id: 'd', name: 'd', nodes: [
      { id: 'a', name: 'a', shape: '/library/shapes/person.svg' },
      { id: 'b', name: 'b', shape: 'a1b2c3.svg' },
    ] });
    expect(ok.filter((i) => i.code === 'invalid-shape')).toHaveLength(0);
    const bad = validate({ ...base, id: 'd', name: 'd', nodes: [{ id: 'a', name: 'a', shape: '../secret' }] });
    expect(bad.some((i) => i.code === 'invalid-shape')).toBe(true);
  });

  it('rejects a blank link and accepts URLs and wikilinks', () => {
    const base = { version: 1 as const, containment: [], relations: [], layers: [], planes: [] };
    const bad = validate({ ...base, id: 'd', name: 'd', nodes: [{ id: 'a', name: 'A', link: '  ' }] });
    expect(bad.some((i) => i.code === 'invalid-link')).toBe(true);
    const ok = validate({
      ...base,
      id: 'd',
      name: 'd',
      nodes: [
        { id: 'a', name: 'A', link: '[[Ops Runbook]]' },
        { id: 'b', name: 'B', link: 'https://x.test' },
      ],
    });
    expect(ok.filter((i) => i.code === 'invalid-link')).toHaveLength(0);
  });

  it('accepts a string textColor and flags a non-string one', () => {
    const base = { version: 1 as const, containment: [], relations: [], layers: [], planes: [] };
    const ok = validate({ ...base, id: 'd', name: 'd', nodes: [{ id: 'a', name: 'a', textColor: '#ff8800' }] });
    expect(ok.filter((i) => i.code === 'invalid-style')).toHaveLength(0);
    const bad = validate({ ...base, id: 'd', name: 'd', nodes: [{ id: 'a', name: 'a', textColor: 123 as unknown as string }] });
    expect(bad.some((i) => i.code === 'invalid-style')).toBe(true);
  });

  it('validates relation labels: text type, t range, side enum', () => {
    const nodes = [
      { id: 'a', name: 'a', type: 't' },
      { id: 'b', name: 'b', type: 't' },
    ];
    const good = emptyModel();
    good.nodes = nodes;
    good.relations = [{ id: 'r', from: 'a', to: 'b', kind: 'k', labels: [{ id: 'l1', text: 'hi', t: 0.5, side: 'top' }] }];
    expect(validate(good)).toEqual([]);

    const badText = emptyModel();
    badText.nodes = nodes;
    badText.relations = [{ id: 'r', from: 'a', to: 'b', kind: 'k', labels: [{ id: 'l1', text: 5 as unknown as string }] }];
    expect(validate(badText).map((i) => i.code)).toContain('invalid-edge-label');

    const badT = emptyModel();
    badT.nodes = nodes;
    badT.relations = [{ id: 'r', from: 'a', to: 'b', kind: 'k', labels: [{ id: 'l1', text: 'x', t: 1.5 }] }];
    expect(validate(badT).map((i) => i.code)).toContain('invalid-edge-label');

    const badSide = emptyModel();
    badSide.nodes = nodes;
    badSide.relations = [{ id: 'r', from: 'a', to: 'b', kind: 'k', labels: [{ id: 'l1', text: 'x', side: 'left' as never }] }];
    expect(validate(badSide).map((i) => i.code)).toContain('invalid-edge-label');
  });

  it('validates relation style curvature', () => {
    const nodes = [
      { id: 'a', name: 'a', type: 't' },
      { id: 'b', name: 'b', type: 't' },
    ];
    const good = emptyModel();
    good.nodes = nodes;
    good.relations = [{ id: 'r', from: 'a', to: 'b', kind: 'k', style: { curvature: 0.6 } }];
    expect(validate(good)).toEqual([]);

    const bad = emptyModel();
    bad.nodes = nodes;
    bad.relations = [{ id: 'r', from: 'a', to: 'b', kind: 'k', style: { curvature: 0 } }];
    expect(validate(bad).map((i) => i.code)).toContain('invalid-style');
  });
});

const raw = (over: Partial<DiagramModel>): DiagramModel => ({
  version: 1, id: 'x', name: 'x',
  nodes: [], containment: [], relations: [], layers: [], planes: [],
  ...over,
});

describe('per-plane membership validation', () => {
  it('flags a node.plane that references no declared plane', () => {
    const issues = validate(raw({
      nodes: [{ id: 'a', name: 'a', type: 't', plane: 'ghost' }],
      planes: [{ id: 'real', name: 'real' }],
    }));
    expect(issues.some((i) => i.code === 'unknown-plane' && i.ref === 'a')).toBe(true);
  });

  it('accepts a node.plane that matches a declared plane', () => {
    const issues = validate(raw({
      nodes: [{ id: 'a', name: 'a', type: 't', plane: 'infra' }],
      planes: [{ id: 'infra', name: 'infra' }],
    }));
    expect(issues.some((i) => i.code === 'unknown-plane')).toBe(false);
  });

  it('flags plane.hides referencing an unknown node', () => {
    const issues = validate(raw({
      nodes: [{ id: 'a', name: 'a', type: 't' }],
      planes: [{ id: 'p', name: 'p', hides: ['nope'] }],
    }));
    expect(issues.some((i) => i.code === 'unknown-hidden-node' && i.ref === 'p')).toBe(true);
  });

  it('checks plane.hidesTree the same way as plane.hides', () => {
    const issues = validate(raw({
      nodes: [{ id: 'a', name: 'a', type: 't' }],
      planes: [{ id: 'p', name: 'p', hidesTree: ['nope'] }],
    }));
    expect(issues.some((i) => i.code === 'unknown-hidden-node' && i.ref === 'p')).toBe(true);
    expect(validate(raw({
      nodes: [{ id: 'a', name: 'a', type: 't' }],
      planes: [{ id: 'p', name: 'p', hidesTree: ['a'] }],
    }))).toEqual([]);
  });

  it('flags hiding a node that is already scoped to a plane (redundant)', () => {
    const issues = validate(raw({
      nodes: [{ id: 'a', name: 'a', type: 't', plane: 'p' }],
      planes: [{ id: 'p', name: 'p', hides: ['a'] }],
    }));
    expect(issues.some((i) => i.code === 'redundant-hide' && i.ref === 'p')).toBe(true);
  });

  it('accepts hiding a shared node', () => {
    const issues = validate(raw({
      nodes: [{ id: 'a', name: 'a', type: 't' }],
      planes: [{ id: 'p', name: 'p', hides: ['a'] }],
    }));
    expect(issues).toEqual([]);
  });

  it('flags invalid rich runs, align and fontScale', () => {
    const m: DiagramModel = {
      version: 1, id: 'd', name: 'd',
      nodes: [
        { id: 'a', name: 'a', rich: [{ text: 5 as unknown as string }] },
        { id: 'b', name: 'b', textAlign: 'middle' as unknown as 'left' },
        { id: 'c', name: 'c', fontScale: 'huge' as unknown as 'sm' },
      ],
      containment: [], relations: [], layers: [], planes: [],
    };
    const codes = validate(m).map((i) => i.code);
    expect(codes).toContain('invalid-rich');
    expect(codes).toContain('invalid-align');
    expect(codes).toContain('invalid-font-scale');
  });
  it('accepts a valid rich node', () => {
    const m: DiagramModel = {
      version: 1, id: 'd', name: 'd',
      nodes: [{ id: 'a', name: 'ab', rich: [{ text: 'a', bold: true }, { text: 'b' }], textAlign: 'center', fontScale: 'lg' }],
      containment: [], relations: [], layers: [], planes: [],
    };
    expect(validate(m)).toEqual([]);
  });
});

describe('model style', () => {
  const base: DiagramModel = {
    version: 1, id: 'm', name: 'M', nodes: [], containment: [], relations: [], layers: [], planes: [],
  };
  it('accepts absent, known, and unknown style ids (unknown must not block saves)', () => {
    expect(validate(base)).toEqual([]);
    expect(validate({ ...base, style: 'sketch' })).toEqual([]);
    expect(validate({ ...base, style: 'some-future-preset' })).toEqual([]);
  });
  it('rejects an empty style string', () => {
    const issues = validate({ ...base, style: '' });
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe('invalid-style');
  });

  it('accepts a model-level notation from BUILTIN_NOTATIONS', () => {
    expect(validate({ ...base, notation: 'c4' })).toEqual([]);
  });

  it('rejects an unknown model-level notation', () => {
    const issues = validate({ ...base, notation: 'uml-4ever' } as DiagramModel);
    expect(issues).toEqual([
      { code: 'unknown-notation', message: "Diagram has unknown notation 'uml-4ever'", ref: 'm' },
    ]);
  });
});

describe('node technology validation', () => {
  const base = () => ({
    version: 1 as const, id: 'd', name: 'd',
    nodes: [] as any[], containment: [], relations: [] as any[], layers: [], planes: [],
  });

  it('rejects a non-string technology', () => {
    const m = base();
    m.nodes.push({ id: 'n1', name: 'N', technology: 42 } as unknown as DiagramNode);
    expect(validate(m)).toContainEqual(expect.objectContaining({ code: 'invalid-style', ref: 'n1' }));
  });
});

describe('table columns + fk validation', () => {
  const base = () => ({
    version: 1 as const, id: 'd', name: 'd',
    nodes: [] as any[], containment: [], relations: [] as any[], layers: [], planes: [],
  });

  it('flags duplicate column names within a table', () => {
    const m = base();
    m.nodes = [{ id: 't', name: 't', type: 'db-table', columns: [{ name: 'id' }, { name: 'id' }] }];
    expect(validate(m).some((i) => i.code === 'duplicate-column')).toBe(true);
  });

  it('flags a relation fromColumn that the source table lacks', () => {
    const m = base();
    m.nodes = [
      { id: 'a', name: 'a', type: 'db-table', columns: [{ name: 'id', pk: true }] },
      { id: 'b', name: 'b', type: 'db-table', columns: [{ name: 'id', pk: true }] },
    ];
    m.relations = [{ id: 'a->b#0', from: 'a', to: 'b', kind: 'fk', fromColumn: 'nope', toColumn: 'id' }];
    expect(validate(m).some((i) => i.code === 'unknown-column')).toBe(true);
  });

  it('accepts a valid fk', () => {
    const m = base();
    m.nodes = [
      { id: 'a', name: 'a', type: 'db-table', columns: [{ name: 'id', pk: true }, { name: 'b_id', fk: true }] },
      { id: 'b', name: 'b', type: 'db-table', columns: [{ name: 'id', pk: true }] },
    ];
    m.relations = [{ id: 'a->b#0', from: 'a', to: 'b', kind: 'fk', fromColumn: 'b_id', toColumn: 'id' }];
    expect(validate(m).filter((i) => i.code === 'duplicate-column' || i.code === 'unknown-column')).toEqual([]);
  });
});

describe('legend validation', () => {
  const base = () => {
    const m = model('d');
    m.node('a');
    return m.toJSON();
  };

  it('accepts a well-formed legend', () => {
    const json = { ...base(), legend: { title: 'Key', position: 'top-left' as const, show: ['kinds' as const], items: [{ label: 'Team A', color: '#f59e0b' }] } };
    expect(validate(json)).toEqual([]);
  });

  it('accepts an empty legend', () => {
    expect(validate({ ...base(), legend: {} })).toEqual([]);
  });

  it('rejects an unknown section', () => {
    const issues = validate({ ...base(), legend: { show: ['colours'] } } as unknown as DiagramModel);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: 'invalid-legend' });
    expect(issues[0]!.message).toContain('colours');
  });

  it('rejects an unknown position', () => {
    const issues = validate({ ...base(), legend: { position: 'middle' } } as unknown as DiagramModel);
    expect(issues[0]).toMatchObject({ code: 'invalid-legend' });
  });

  it('rejects an empty title', () => {
    expect(validate({ ...base(), legend: { title: '' } })[0]).toMatchObject({ code: 'invalid-legend' });
  });

  it('rejects items that are not a list', () => {
    expect(validate({ ...base(), legend: { items: {} } } as unknown as DiagramModel)[0]).toMatchObject({ code: 'invalid-legend' });
  });

  it('rejects an item without a label', () => {
    const issues = validate({ ...base(), legend: { items: [{ color: '#fff' }] } } as unknown as DiagramModel);
    expect(issues[0]).toMatchObject({ code: 'invalid-legend' });
  });

  it('rejects a non-string item colour', () => {
    const issues = validate({ ...base(), legend: { items: [{ label: 'x', color: 1 }] } } as unknown as DiagramModel);
    expect(issues[0]).toMatchObject({ code: 'invalid-legend' });
  });

  it('accepts unknown registry ids on an item', () => {
    // registry ids are free-form everywhere else in the model; they fall back silently
    const json = { ...base(), legend: { items: [{ label: 'gRPC', kind: 'grpc' }, { label: 'Thing', type: 'whatever' }] } };
    expect(validate(json)).toEqual([]);
  });
});

describe('validate: git graph', () => {
  /** master: m1 → m2; nightly: n1 (from m1) → n2 (merges t1); team: t1 (from n1) */
  function gitModel(): DiagramModel {
    const commit = (id: string): DiagramModel['nodes'][number] => ({ id, name: '', type: 'commit' });
    return {
      ...emptyModel(),
      nodes: [
        { id: 'master', name: 'Master', type: 'branch' },
        { id: 'nightly', name: 'Nightly', type: 'branch' },
        { id: 'team', name: 'Team', type: 'branch' },
        commit('m1'), commit('m2'), commit('n1'), commit('n2'), commit('t1'),
      ],
      containment: [
        { parent: 'master', child: 'm1' }, { parent: 'master', child: 'm2' },
        { parent: 'nightly', child: 'n1' }, { parent: 'nightly', child: 'n2' },
        { parent: 'team', child: 't1' },
      ],
      relations: [
        { id: 'a', from: 'm1', to: 'm2', kind: 'commit' },
        { id: 'b', from: 'm1', to: 'n1', kind: 'branch' },
        { id: 'c', from: 'n1', to: 'n2', kind: 'commit' },
        { id: 'd', from: 'n1', to: 't1', kind: 'branch' },
        { id: 'e', from: 't1', to: 'n2', kind: 'merge' },
      ],
      planes: [{ id: 'git', name: 'Git', notation: 'git-graph' }],
    };
  }

  it('accepts a well-formed graph', () => {
    expect(validate(gitModel())).toEqual([]);
  });

  it('ignores the git rules on a model with no git-graph plane', () => {
    const m = gitModel();
    m.planes = [{ id: 'git', name: 'Git' }];
    m.relations.push({ id: 'x', from: 'master', to: 'm1', kind: 'merge' });
    expect(validate(m)).toEqual([]);
  });

  it('git-link-endpoints: git links must join two commit nodes', () => {
    const m = gitModel();
    m.relations.push({ id: 'x', from: 'master', to: 'm1', kind: 'merge' });
    expect(validate(m)).toEqual([
      { code: 'git-link-endpoints', message: "Relation 'x' (merge) must join two commit nodes", ref: 'x' },
    ]);
  });

  it('git-commit-lane: commit links stay in a lane, branch/merge links cross lanes', () => {
    const m = gitModel();
    m.relations.push({ id: 'x', from: 'm2', to: 'n2', kind: 'commit' }, { id: 'y', from: 'm1', to: 'm2', kind: 'merge' });
    expect(validate(m)).toEqual([
      { code: 'git-commit-lane', message: "Relation 'x' (commit) must stay within one lane", ref: 'x' },
      { code: 'git-commit-lane', message: "Relation 'y' (merge) must join commits of different lanes", ref: 'y' },
    ]);
  });

  it('git-parents: at most one incoming commit link and one incoming branch link', () => {
    const m = gitModel();
    m.nodes.push({ id: 'n0', name: '', type: 'commit' });
    m.containment.push({ parent: 'nightly', child: 'n0' });
    m.relations.push({ id: 'x', from: 'n0', to: 'n2', kind: 'commit' });
    expect(validate(m)).toEqual([
      { code: 'git-parents', message: "Commit 'n2' has more than one incoming commit link", ref: 'n2' },
    ]);
  });

  it('git-cycle: the git links must not form a cycle', () => {
    const m = gitModel();
    m.relations.push({ id: 'x', from: 'n2', to: 'n1', kind: 'merge' });
    expect(validate(m)).toEqual([
      { code: 'git-commit-lane', message: "Relation 'x' (merge) must join commits of different lanes", ref: 'x' },
      { code: 'git-cycle', message: "Git links form a cycle (cut at relation 'x')", ref: 'x' },
    ]);
  });

  it('git-cycle: a cycle formed ENTIRELY of cross-lane links reports only the cycle, not git-commit-lane', () => {
    const m = gitModel();
    // the fixture already branches master -> nightly (m1->n1); merge nightly
    // back into master (n1->m1) closes the loop without ever repeating a lane,
    // so no relation here is a same-lane branch/merge or a cross-lane commit.
    m.relations.push({ id: 'x', from: 'n1', to: 'm1', kind: 'merge' });
    expect(validate(m)).toEqual([{ code: 'git-cycle', message: "Git links form a cycle (cut at relation 'x')", ref: 'x' }]);
  });

  it('git-commit-outside-lane: a commit must sit in a branch on the git plane', () => {
    const m = gitModel();
    m.nodes.push({ id: 'loose', name: '', type: 'commit' });
    expect(validate(m)).toEqual([
      { code: 'git-commit-outside-lane', message: "Commit 'loose' is not contained by a branch on plane 'git'", ref: 'loose' },
    ]);
  });

  it('git-gap: a commit gap is a non-negative integer or a digit string', () => {
    const m = gitModel();
    m.nodes[3] = { ...m.nodes[3]!, metadata: { gap: '2' } };
    m.nodes[4] = { ...m.nodes[4]!, metadata: { gap: -1 } };
    expect(validate(m)).toEqual([
      { code: 'git-gap', message: "Commit 'm2' has invalid gap '-1'", ref: 'm2' },
    ]);
  });

  it('fires from a model-level git-graph notation with no planes at all', () => {
    const m = gitModel();
    m.planes = [];
    m.notation = 'git-graph';
    m.nodes.push({ id: 'loose', name: '', type: 'commit' });
    expect(validate(m)).toEqual([
      { code: 'git-commit-outside-lane', message: "Commit 'loose' is not contained by a branch", ref: 'loose' },
    ]);
  });

  it('validates a plane with no notation of its own when the model falls back to git-graph', () => {
    const m = gitModel();
    m.planes = [{ id: 'git', name: 'Git' }]; // no plane-level notation; model.notation applies
    m.notation = 'git-graph';
    m.relations.push({ id: 'x', from: 'master', to: 'm1', kind: 'merge' });
    expect(validate(m)).toEqual([
      { code: 'git-link-endpoints', message: "Relation 'x' (merge) must join two commit nodes", ref: 'x' },
    ]);
  });
});

describe('validateActivity', () => {
  const base = (nodes: DiagramNode[], containment: ContainmentEdge[]): DiagramModel => ({
    version: 1, id: 'd', name: 'd', nodes, containment, relations: [], layers: [], planes: [],
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

describe('second-order conventions', () => {
  const so = (nodes: DiagramNode[], relations: DiagramRelation[] = [], containment: DiagramModel['containment'] = []): DiagramModel => ({
    version: 1, id: 'so', name: 'so', notation: 'second-order', nodes, containment, relations, layers: [], planes: [],
  });
  const n = (id: string, type: string): DiagramNode => ({ id, name: id, type });
  const r = (from: string, to: string): DiagramRelation => ({ id: `${from}->${to}`, from, to, kind: 'leads-to' });
  const codes = (m: DiagramModel) => validate(m).map((i) => i.code);

  it('accepts a decision with a chain of consequences', () => {
    const m = so([n('d', 'so-decision'), n('a', 'so-consequence-positive'), n('b', 'so-consequence-negative')], [r('d', 'a'), r('a', 'b')]);
    expect(validate(m)).toEqual([]);
  });
  it('wants at least one decision', () => {
    expect(codes(so([n('a', 'so-consequence-neutral')]))).toContain('so-no-decision');
  });
  it('is valid empty — every second-order diagram starts there', () => {
    expect(validate(so([]))).toEqual([]);
  });
  it('does not want a decision until there is a second-order node to judge', () => {
    expect(codes(so([n('note', 'comment')]))).not.toContain('so-no-decision');
  });
  it('sends a loop to the causal-loop notation', () => {
    const issues = validate(so([n('d', 'so-decision'), n('a', 'so-consequence-neutral'), n('b', 'so-consequence-neutral')], [r('d', 'a'), r('a', 'b'), r('b', 'a')]));
    const cycle = issues.find((i) => i.code === 'so-cycle')!;
    expect(cycle.message).toContain('causal-loop');
    expect(cycle.ref).toBe('a');
  });
  it('flags each consequence no decision leads to', () => {
    const issues = validate(so([n('d', 'so-decision'), n('lost', 'so-consequence-neutral')]));
    expect(issues.filter((i) => i.code === 'so-unreachable').map((i) => i.ref)).toEqual(['lost']);
  });
  it('keeps the notation flat', () => {
    const m = so([n('g', 'system'), n('d', 'so-decision')], [], [{ parent: 'g', child: 'd' }]);
    expect(validate(m).find((i) => i.code === 'so-contained')?.ref).toBe('d');
  });
  it('says nothing when the notation is not active', () => {
    const m = { ...so([n('a', 'so-consequence-neutral')]) };
    delete (m as { notation?: string }).notation;
    expect(codes(m).filter((c) => c.startsWith('so-'))).toEqual([]);
  });
  it('reads a plane-level notation too', () => {
    const m: DiagramModel = { ...so([n('a', 'so-consequence-neutral')]), planes: [{ id: 'p', name: 'P', notation: 'second-order' }] };
    delete (m as { notation?: string }).notation;
    expect(codes(m)).toContain('so-no-decision');
  });
});

describe('fishbone conventions', () => {
  const fb = (nodes: DiagramNode[], relations: DiagramRelation[], containment: ContainmentEdge[] = []): DiagramModel => ({
    version: 1, id: 'm', name: 'm', notation: 'fishbone', nodes, containment, relations, layers: [], planes: [],
  });
  const n = (id: string, type?: string): DiagramNode => ({ id, name: id, ...(type !== undefined ? { type } : {}) });
  const r = (from: string, to: string, kind = 'cause-of'): DiagramRelation => ({ id: `${from}->${to}`, from, to, kind });
  const codes = (m: DiagramModel) => validate(m).filter((i) => i.code.startsWith('fb-')).map((i) => [i.code, i.ref]);

  it('accepts an empty fishbone diagram and a well-formed fish', () => {
    expect(codes(fb([], []))).toEqual([]);
    expect(codes(fb([n('note')], []))).toEqual([]);
    const m = fb(
      [n('e', 'fb-effect'), n('c', 'fb-category'), n('a', 'fb-cause'), n('a1', 'fb-cause')],
      [r('c', 'e'), r('a', 'c'), r('a1', 'a')],
    );
    expect(codes(m)).toEqual([]);
  });

  it('wants exactly one effect once there are fishbone nodes', () => {
    expect(codes(fb([n('c', 'fb-category')], []))).toEqual([
      ['fb-no-effect', 'm'],
      ['fb-unattached', 'c'],
    ]);
    expect(codes(fb([n('e', 'fb-effect'), n('e2', 'fb-effect')], []))).toEqual([['fb-many-effects', 'e2']]);
  });

  it('names the wrong parent, the fourth level, and what never reaches the effect — one issue per node', () => {
    const m = fb(
      [
        n('e', 'fb-effect'), n('c', 'fb-category'), n('a', 'fb-cause'), n('a1', 'fb-cause'), n('a11', 'fb-cause'),
        n('cc', 'fb-category'), n('direct', 'fb-cause'), n('under-cc', 'fb-cause'), n('x', 'fb-cause'), n('y', 'fb-cause'),
      ],
      [r('c', 'e'), r('a', 'c'), r('a1', 'a'), r('a11', 'a1'), r('cc', 'c'), r('direct', 'e'), r('under-cc', 'cc'), r('x', 'y'), r('y', 'x'), r('e', 'x')],
    );
    expect(codes(m)).toEqual([
      ['fb-misplaced', 'e'],
      ['fb-too-deep', 'a11'],
      ['fb-misplaced', 'cc'],
      ['fb-misplaced', 'direct'],
      ['fb-unattached', 'under-cc'],
      ['fb-unattached', 'x'],
      ['fb-unattached', 'y'],
    ]);
  });

  it('rejects a fishbone node inside a container', () => {
    const m = fb([n('e', 'fb-effect'), n('c', 'fb-category'), n('g')], [r('c', 'e')], [{ parent: 'g', child: 'c' }]);
    expect(codes(m)).toEqual([['fb-contained', 'c']]);
  });

  it('only runs where the fishbone notation is active', () => {
    const m = { ...fb([n('c', 'fb-category')], []), notation: undefined };
    expect(codes(m)).toEqual([]);
  });
});

describe('threats', () => {
  const withThreats = (threats: unknown, where: 'node' | 'relation' = 'node'): DiagramModel => ({
    ...emptyModel(),
    nodes: [
      { id: 'a', name: 'A', ...(where === 'node' ? { threats } : {}) } as DiagramNode,
      { id: 'b', name: 'B' },
    ],
    relations: [{ id: 'r', from: 'a', to: 'b', kind: 'x', ...(where === 'relation' ? { threats } : {}) } as DiagramRelation],
  });
  it('accepts a well-formed list on a node and on a relation', () => {
    const ok = [{ id: 't1', category: 'S', title: 'Spoofed', severity: 'high', status: 'open' }];
    expect(validate(withThreats(ok))).toEqual([]);
    expect(validate(withThreats(ok, 'relation'))).toEqual([]);
  });
  it('reports a threats field that is not a list of threat objects, and looks no further', () => {
    expect(validate(withThreats(5)).map((i) => [i.code, i.ref])).toEqual([['invalid-threats', 'a']]);
    expect(validate(withThreats(['t1'], 'relation')).map((i) => [i.code, i.ref])).toEqual([['invalid-threats', 'r']]);
  });
  it('reports each malformed field with the element as ref', () => {
    const issues = validate(withThreats([
      { id: '', category: 'S', title: 'x' },
      { id: 't1', category: 'Q', title: 'x' },
      { id: 't1', category: 'S', title: '' },
      { id: 't2', category: 'S', title: 'x', status: 'fixed' },
      { id: 't3', category: 'S', title: 'x', severity: 'urgent' },
    ], 'relation'));
    expect(issues.map((i) => [i.code, i.ref])).toEqual([
      ['threat-id', 'r'],
      ['threat-category', 'r'],
      ['threat-id', 'r'],
      ['threat-title', 'r'],
      ['threat-status', 'r'],
      ['threat-severity', 'r'],
    ]);
  });
});

describe('threat-model notation', () => {
  it('forbids a data flow on a boundary, only where the notation is active', () => {
    const m: DiagramModel = {
      ...emptyModel(),
      notation: 'threat-model',
      nodes: [{ id: 'web', name: 'W', type: 'tm-process' }, { id: 'dmz', name: 'D', type: 'tm-boundary' }],
      relations: [{ id: 'r', from: 'web', to: 'dmz', kind: 'data-flow' }],
    };
    expect(validate(m).map((i) => [i.code, i.ref])).toEqual([['tm-flow-boundary', 'r']]);
    expect(validate({ ...m, notation: undefined })).toEqual([]);
    expect(validate({ ...m, relations: [{ ...m.relations[0]!, kind: 'reads' }] })).toEqual([]);
  });
  it('accepts an empty threat-model diagram', () => {
    expect(validate({ ...emptyModel(), notation: 'threat-model' })).toEqual([]);
  });
});
