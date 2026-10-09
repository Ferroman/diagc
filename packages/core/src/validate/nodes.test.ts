import { describe, expect, it } from 'vitest';
import { validate } from './index';
import type { DiagramModel, DiagramNode } from '../types';

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

describe('node checks', () => {
  it('flags duplicate node ids', () => {
    const m = emptyModel();
    m.nodes = [
      { id: 'a', name: 'a', type: 't' },
      { id: 'a', name: 'other', type: 't' },
    ];
    expect(validate(m)).toEqual([{ code: 'duplicate-node', message: "Duplicate node id 'a'", ref: 'a' }]);
  });

  it('flags a node claiming the reserved layout-root id', () => {
    const m = emptyModel();
    m.nodes = [{ id: '__root__', name: 'sneaky', type: 't' }];
    expect(validate(m)).toEqual([
      { code: 'reserved-node-id', message: "Node id '__root__' is reserved for the layout root", ref: '__root__' },
    ]);
  });

  it('flags columns tagged with undeclared layers', () => {
    const m = emptyModel();
    m.nodes = [{ id: 't', name: 't', type: 'db-table', columns: [{ name: 'id' }, { name: 'flag', layer: 'nope' }] }];
    expect(validate(m)).toEqual([
      { code: 'unknown-layer', message: "Column 't.flag' references unknown layer 'nope'", ref: 't' },
    ]);
    m.layers = [{ id: 'nope', name: 'Nope' }];
    expect(validate(m)).toEqual([]);
  });

  it('flags nodes tagged with undeclared layers', () => {
    const m = emptyModel();
    m.nodes = [{ id: 'a', name: 'a', type: 't', layer: 'nope' }];
    expect(validate(m)).toEqual([
      { code: 'unknown-layer', message: "Node 'a' references unknown layer 'nope'", ref: 'a' },
    ]);
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

  it('accepts a bundled /library image ref and still rejects a bad one', () => {
    const base = { version: 1 as const, containment: [], relations: [], layers: [], planes: [] };
    const ok = validate({
      ...base,
      id: 'd',
      name: 'd',
      nodes: [{ id: 'n', name: 'n', image: '/library/aws/lambda.svg' }],
    });
    expect(ok.filter((i) => i.code === 'invalid-image')).toHaveLength(0);
    const bad = validate({ ...base, id: 'd', name: 'd', nodes: [{ id: 'n', name: 'n', image: '/etc/passwd' }] });
    expect(bad.some((i) => i.code === 'invalid-image')).toBe(true);
  });

  it('accepts a valid shape ref and rejects a bad one', () => {
    const base = { version: 1 as const, containment: [], relations: [], layers: [], planes: [] };
    const ok = validate({
      ...base,
      id: 'd',
      name: 'd',
      nodes: [
        { id: 'a', name: 'a', shape: '/library/shapes/person.svg' },
        { id: 'b', name: 'b', shape: 'a1b2c3.svg' },
      ],
    });
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
    const bad = validate({
      ...base,
      id: 'd',
      name: 'd',
      nodes: [{ id: 'a', name: 'a', textColor: 123 as unknown as string }],
    });
    expect(bad.some((i) => i.code === 'invalid-style')).toBe(true);
  });

  it('flags a node.plane that references no declared plane', () => {
    const issues = validate(
      raw({
        nodes: [{ id: 'a', name: 'a', type: 't', plane: 'ghost' }],
        planes: [{ id: 'real', name: 'real' }],
      }),
    );
    expect(issues.some((i) => i.code === 'unknown-plane' && i.ref === 'a')).toBe(true);
  });

  it('accepts a node.plane that matches a declared plane', () => {
    const issues = validate(
      raw({
        nodes: [{ id: 'a', name: 'a', type: 't', plane: 'infra' }],
        planes: [{ id: 'infra', name: 'infra' }],
      }),
    );
    expect(issues.some((i) => i.code === 'unknown-plane')).toBe(false);
  });

  it('flags invalid rich runs, align and fontScale', () => {
    const m: DiagramModel = {
      version: 1,
      id: 'd',
      name: 'd',
      nodes: [
        { id: 'a', name: 'a', rich: [{ text: 5 as unknown as string }] },
        { id: 'b', name: 'b', textAlign: 'middle' as unknown as 'left' },
        { id: 'c', name: 'c', fontScale: 'huge' as unknown as 'sm' },
      ],
      containment: [],
      relations: [],
      layers: [],
      planes: [],
    };
    const codes = validate(m).map((i) => i.code);
    expect(codes).toContain('invalid-rich');
    expect(codes).toContain('invalid-align');
    expect(codes).toContain('invalid-font-scale');
  });

  it('accepts a valid rich node', () => {
    const m: DiagramModel = {
      version: 1,
      id: 'd',
      name: 'd',
      nodes: [
        { id: 'a', name: 'ab', rich: [{ text: 'a', bold: true }, { text: 'b' }], textAlign: 'center', fontScale: 'lg' },
      ],
      containment: [],
      relations: [],
      layers: [],
      planes: [],
    };
    expect(validate(m)).toEqual([]);
  });
});

describe('node technology validation', () => {
  const base = () => ({
    version: 1 as const,
    id: 'd',
    name: 'd',
    nodes: [] as any[],
    containment: [],
    relations: [] as any[],
    layers: [],
    planes: [],
  });

  it('rejects a non-string technology', () => {
    const m = base();
    m.nodes.push({ id: 'n1', name: 'N', technology: 42 } as unknown as DiagramNode);
    expect(validate(m)).toContainEqual(expect.objectContaining({ code: 'invalid-style', ref: 'n1' }));
  });
});

describe('the order node issues come in', () => {
  it('reports each node in turn, its faults in a fixed order', () => {
    // every node-level fault at once: the order is what `diagc lint` prints
    const m = raw({
      nodes: [
        {
          id: '__root__',
          name: 'r',
          color: 1,
          textColor: 1,
          technology: 1,
          rich: [{ text: 1 }],
          textAlign: 'middle',
          fontScale: 'huge',
          image: 'a b.png',
          shape: 'a b.svg',
          link: ' ',
          key: 'k',
          include: '',
          includePlane: '',
          includePlanes: 'yes',
          plane: 'nope',
          layer: 'nope',
          columns: [null, { name: 'c' }, { name: 'c', layer: 'nope' }],
        },
        { id: '__root__', name: 'dup', key: 'k', includePlane: 'p', includePlanes: true, columns: 'x' },
        { id: 'b', name: 'b', key: 'Bad Key' },
      ] as unknown as DiagramNode[],
    });
    expect(validate(m).map((i) => [i.code, i.message])).toEqual([
      ['reserved-node-id', "Node id '__root__' is reserved for the layout root"],
      ['invalid-style', "Node '__root__' has invalid color '1'"],
      ['invalid-style', "Node '__root__' has invalid textColor '1'"],
      ['invalid-style', "Node '__root__' has invalid technology '1'"],
      ['invalid-rich', "Node '__root__' has invalid rich text"],
      ['invalid-align', "Node '__root__' has invalid textAlign 'middle'"],
      ['invalid-font-scale', "Node '__root__' has invalid fontScale 'huge'"],
      ['invalid-image', "Node '__root__' has invalid image ref 'a b.png'"],
      ['invalid-shape', "Node '__root__' has invalid shape ref 'a b.svg'"],
      ['invalid-link', "Node '__root__' has invalid link"],
      ['invalid-include', "Node '__root__' has invalid include ''"],
      ['invalid-include', "Node '__root__' has invalid includePlane ''"],
      ['invalid-include', "Node '__root__' has invalid includePlanes 'yes'"],
      ['unknown-plane', "Node '__root__' belongs to unknown plane 'nope'"],
      ['unknown-layer', "Node '__root__' references unknown layer 'nope'"],
      ['duplicate-column', "Node '__root__' has an invalid column"],
      ['duplicate-column', "Node '__root__' has duplicate column 'c'"],
      ['unknown-layer', "Column '__root__.c' references unknown layer 'nope'"],
      ['duplicate-node', "Duplicate node id '__root__'"],
      ['reserved-node-id', "Node id '__root__' is reserved for the layout root"],
      ['duplicate-key', "Nodes '__root__' and '__root__' share key 'k' in one diagram"],
      ['invalid-include', "Node '__root__' has includePlane without include"],
      ['invalid-include', "Node '__root__' has includePlanes without include"],
      ['duplicate-column', "Node '__root__' columns must be a list"],
      ['invalid-key', "Node 'b' has invalid key 'Bad Key'"],
    ]);
  });
});
