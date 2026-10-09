import { describe, expect, it } from 'vitest';
import { model } from '../builder';
import { validate } from './index';
import type { DiagramModel } from '../types';

function emptyModel(): DiagramModel {
  return { version: 1, id: 'm', name: 'm', nodes: [], containment: [], relations: [], layers: [], planes: [] };
}

describe('relation checks', () => {
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

  it('validates relation labels: text type, t range, side enum', () => {
    const nodes = [
      { id: 'a', name: 'a', type: 't' },
      { id: 'b', name: 'b', type: 't' },
    ];
    const good = emptyModel();
    good.nodes = nodes;
    good.relations = [
      { id: 'r', from: 'a', to: 'b', kind: 'k', labels: [{ id: 'l1', text: 'hi', t: 0.5, side: 'top' }] },
    ];
    expect(validate(good)).toEqual([]);

    const badText = emptyModel();
    badText.nodes = nodes;
    badText.relations = [
      { id: 'r', from: 'a', to: 'b', kind: 'k', labels: [{ id: 'l1', text: 5 as unknown as string }] },
    ];
    expect(validate(badText).map((i) => i.code)).toContain('invalid-edge-label');

    const badT = emptyModel();
    badT.nodes = nodes;
    badT.relations = [{ id: 'r', from: 'a', to: 'b', kind: 'k', labels: [{ id: 'l1', text: 'x', t: 1.5 }] }];
    expect(validate(badT).map((i) => i.code)).toContain('invalid-edge-label');

    const badSide = emptyModel();
    badSide.nodes = nodes;
    badSide.relations = [
      { id: 'r', from: 'a', to: 'b', kind: 'k', labels: [{ id: 'l1', text: 'x', side: 'left' as never }] },
    ];
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

describe('table columns + fk validation', () => {
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
      {
        id: 'a',
        name: 'a',
        type: 'db-table',
        columns: [
          { name: 'id', pk: true },
          { name: 'b_id', fk: true },
        ],
      },
      { id: 'b', name: 'b', type: 'db-table', columns: [{ name: 'id', pk: true }] },
    ];
    m.relations = [{ id: 'a->b#0', from: 'a', to: 'b', kind: 'fk', fromColumn: 'b_id', toColumn: 'id' }];
    expect(validate(m).filter((i) => i.code === 'duplicate-column' || i.code === 'unknown-column')).toEqual([]);
  });
});
