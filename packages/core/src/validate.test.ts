import { describe, expect, it } from 'vitest';
import { model } from './builder';
import { DiagramValidationError, validate } from './validate';
import type { DiagramModel } from './types';

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
