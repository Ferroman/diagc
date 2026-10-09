import { describe, expect, it } from 'vitest';
import { model } from '../builder/index';
import { validate } from '../validate/index';
import { addContainment } from './containment';
import {
  deleteLayer,
  deletePlane,
  mergeLayers,
  setNodePlaneHidden,
  upsertLayer,
  upsertPlane,
} from './layers-and-planes';
import { CommandError } from '../command-error';
import type { DiagramModel } from '../types';

function base(): DiagramModel {
  const m = model('t');
  m.layer('flow', { name: 'Flow', tint: '#0ea5e9' });
  m.plane('arch').plane('infra', { layers: ['flow'] });
  const a = m.node('a', { type: 'service' });
  const b = m.node('b', { type: 'service' });
  const sys = m.node('sys', { type: 'system' });
  sys.contains(a, b);
  m.relate(a, b, { kind: 'sync', label: 'call' });
  m.relate(a, b, { kind: 'flow', layer: 'flow' });
  return m.toJSON();
}

describe('layer and plane mutations', () => {
  it('upsertPlane validates notation against BUILTIN_NOTATIONS', () => {
    expect(() => upsertPlane(base(), { id: 'p', name: 'P', notation: 'bogus' })).toThrowError(CommandError);
    const m = upsertPlane(base(), { id: 'p', name: 'P', notation: 'causal-loop' });
    expect(m.planes.find((p) => p.id === 'p')?.notation).toBe('causal-loop');
  });

  it('deletePlane of the first plane removes untagged containment', () => {
    const m = deletePlane(base(), 'arch');
    expect(m.containment).toEqual([]); // untagged sys>a and sys>b were owned by 'arch'
    expect(validate(m)).toEqual([]);
  });

  it('upsertPlane rejects self-borrow and borrow chains', () => {
    expect(() => upsertPlane(base(), { id: 'p', name: 'P', containmentOf: 'p' })).toThrowError(CommandError);
    const borrower = upsertPlane(base(), { id: 'flow-view', name: 'Flow', containmentOf: 'arch' });
    expect(() => upsertPlane(borrower, { id: 'chain', name: 'C', containmentOf: 'flow-view' })).toThrowError(
      CommandError,
    );
  });

  it('plane upsert/delete with borrow protection', () => {
    let m = upsertPlane(base(), { id: 'flow-view', name: 'Flow', containmentOf: 'arch' });
    expect(m.planes.at(-1)?.id).toBe('flow-view');
    expect(() => deletePlane(m, 'arch')).toThrowError(CommandError); // borrowed
    m = deletePlane(m, 'flow-view');
    m = addContainment(m, { parent: 'sys', child: 'a', plane: 'infra' });
    m = deletePlane(m, 'infra');
    expect(m.containment.every((e) => e.plane !== 'infra')).toBe(true);
    expect(validate(m)).toEqual([]);
    const m2 = upsertLayer(base(), { id: 'flow', name: 'Data flow', tint: '#f00' });
    expect(m2.layers).toEqual([{ id: 'flow', name: 'Data flow', tint: '#f00' }]);
  });
});

describe('deleteLayer (destructive)', () => {
  const delModel = (): DiagramModel => ({
    version: 1,
    id: 'd',
    name: 'd',
    nodes: [
      { id: 'box', name: 'box', layer: 'ai' }, // tagged container -> destroyed
      { id: 'child', name: 'child' }, // untagged child of box -> survives top-level
      { id: 'keep', name: 'keep' }, // untagged -> survives
    ],
    containment: [{ parent: 'box', child: 'child' }],
    relations: [
      { id: 'r-tagged', from: 'keep', to: 'box', kind: 'sync', layer: 'ai' }, // tagged -> gone
      { id: 'r-touch', from: 'box', to: 'keep', kind: 'sync' }, // touches doomed box -> gone
      { id: 'r-safe', from: 'keep', to: 'child', kind: 'sync' }, // survives
    ],
    layers: [
      { id: 'ai', name: 'AI' },
      { id: 'ops', name: 'Ops' },
    ],
    planes: [{ id: 'p', name: 'p', layers: ['ai', 'ops'] }],
  });

  it('destroys tagged nodes and relations, keeping untagged content', () => {
    const m = deleteLayer(delModel(), 'ai');
    expect(m.nodes.map((n) => n.id).sort()).toEqual(['child', 'keep']); // box gone
    expect(m.relations.map((r) => r.id)).toEqual(['r-safe']); // r-tagged + r-touch gone
    expect(validate(m)).toEqual([]); // the model stays valid
  });

  it('strips destroyed nodes from a plane hides list, keeping the model valid', () => {
    const m0: DiagramModel = {
      version: 1,
      id: 'd',
      name: 'd',
      nodes: [{ id: 'x', name: 'x', layer: 'ai' }], // shared (no plane) + tagged to 'ai'
      containment: [],
      relations: [],
      layers: [{ id: 'ai', name: 'AI' }],
      planes: [{ id: 'p', name: 'p', hides: ['x'] }],
    };
    const m = deleteLayer(m0, 'ai');
    expect(m.planes.find((pl) => pl.id === 'p')?.hides ?? []).toEqual([]);
    expect(validate(m)).toEqual([]);
  });

  it('severs the destroyed container, leaving its untagged child top-level (option A)', () => {
    const m = deleteLayer(delModel(), 'ai');
    expect(m.nodes.find((n) => n.id === 'child')).toBeDefined();
    expect(m.containment).toEqual([]); // box>child edge removed, child not deleted
  });

  it('removes the layer and its plane presets, leaving siblings', () => {
    const m = deleteLayer(delModel(), 'ai');
    expect(m.layers.map((l) => l.id)).toEqual(['ops']);
    expect(m.planes.find((p) => p.id === 'p')?.layers).toEqual(['ops']);
  });

  // `toStrictEqual` throughout: `toEqual` would count `layers: undefined` as
  // absent, and absence (no `[]` left in the saved JSON) is the point.
  it('omits a plane layers list that the deletion emptied', () => {
    const m0: DiagramModel = { ...delModel(), planes: [{ id: 'p', name: 'p', layers: ['ai'] }] };
    expect(deleteLayer(m0, 'ai').planes).toStrictEqual([{ id: 'p', name: 'p' }]);
  });

  it('omits a hides or hidesTree list that the deletion emptied', () => {
    const m0: DiagramModel = {
      ...delModel(),
      planes: [
        { id: 'p', name: 'p', hides: ['box'] },
        { id: 'q', name: 'q', hidesTree: ['box'] },
      ],
    };
    expect(deleteLayer(m0, 'ai').planes).toStrictEqual([
      { id: 'p', name: 'p' },
      { id: 'q', name: 'q' },
    ]);
  });

  it('keeps an untouched plane by reference, an authored empty list included', () => {
    const m0: DiagramModel = {
      ...delModel(),
      planes: [
        { id: 'p', name: 'p', layers: ['ai', 'ops'] },
        { id: 'q', name: 'q', layers: ['ops'], hides: ['keep'] },
        { id: 'r', name: 'r', layers: [] },
      ],
    };
    const m = deleteLayer(m0, 'ai');
    expect(m.planes[1]).toBe(m0.planes[1]);
    expect(m.planes[2]).toBe(m0.planes[2]);
  });

  it('leaves the lists it does not touch as written and in place', () => {
    // Only an emptied list goes: an authored `[]` beside it stays, and so does
    // the key order, so the saved file's diff is the deletion and nothing else.
    const m0: DiagramModel = {
      ...delModel(),
      planes: [{ id: 'p', name: 'p', hides: ['box'], layers: [], hidesTree: ['keep'] }],
    };
    const p = deleteLayer(m0, 'ai').planes[0]!;
    expect(p).toStrictEqual({ id: 'p', name: 'p', layers: [], hidesTree: ['keep'] });
    expect(Object.keys(p)).toEqual(['id', 'name', 'layers', 'hidesTree']);
    expect(p.hidesTree).toBe(m0.planes[0]!.hidesTree);
  });

  it('throws on an unknown layer and does not mutate its input', () => {
    expect(() => deleteLayer(delModel(), 'ghost')).toThrowError(CommandError);
    const m0 = delModel();
    const snapshot = JSON.parse(JSON.stringify(m0));
    deleteLayer(m0, 'ai');
    expect(m0).toEqual(snapshot);
  });
});

describe('deleteLayer on column layers', () => {
  const m0 = (): DiagramModel => ({
    version: 1,
    id: 'd',
    name: 'd',
    nodes: [
      { id: 'user', name: 'user', type: 'db-table', columns: [{ name: 'id', pk: true }] },
      {
        id: 'event',
        name: 'event',
        type: 'db-table',
        columns: [
          { name: 'id', pk: true },
          { name: 'flag', layer: 'flags' },
          { name: 'owner_id', fk: true, layer: 'flags' },
        ],
      },
    ],
    containment: [],
    relations: [
      { id: 'fk', from: 'event', to: 'user', kind: 'fk', fromColumn: 'owner_id', toColumn: 'id' },
      { id: 'plain', from: 'event', to: 'user', kind: 'fk' },
    ],
    layers: [{ id: 'flags', name: 'Flags' }],
    planes: [],
  });

  it('drops the tagged rows and the relations anchored to them, keeping the table', () => {
    const m = deleteLayer(m0(), 'flags');
    expect(m.nodes.find((n) => n.id === 'event')?.columns).toEqual([{ name: 'id', pk: true }]);
    expect(m.relations.map((r) => r.id)).toEqual(['plain']);
    expect(validate(m)).toEqual([]);
  });

  it('leaves tables without tagged rows untouched', () => {
    const before = m0();
    const m = deleteLayer(before, 'flags');
    expect(m.nodes.find((n) => n.id === 'user')).toBe(before.nodes[0]);
  });
});

describe('mergeLayers on column layers', () => {
  const m0 = (): DiagramModel => ({
    version: 1,
    id: 'd',
    name: 'd',
    nodes: [{ id: 't', name: 't', type: 'db-table', columns: [{ name: 'id' }, { name: 'flag', layer: 'ops' }] }],
    containment: [],
    relations: [],
    layers: [
      { id: 'flow', name: 'Flow' },
      { id: 'ops', name: 'Ops' },
    ],
    planes: [],
  });

  it('retags rows onto the target', () => {
    const m = mergeLayers(m0(), ['ops'], 'flow');
    expect(m.nodes[0]?.columns).toEqual([{ name: 'id' }, { name: 'flag', layer: 'flow' }]);
    expect(validate(m)).toEqual([]);
  });

  it('untags rows when merging to the base sheet', () => {
    expect(mergeLayers(m0(), ['ops']).nodes[0]?.columns).toEqual([{ name: 'id' }, { name: 'flag' }]);
  });
});

describe('setNodePlaneHidden', () => {
  const base = () => ({
    version: 1 as const,
    id: 'm',
    name: 'm',
    nodes: [{ id: 'a', name: 'a', type: 't' }],
    containment: [],
    relations: [],
    layers: [],
    planes: [{ id: 'p', name: 'p' }],
  });

  it("adds a shared node to a plane's hides", () => {
    const next = setNodePlaneHidden(base(), 'a', 'p', true);
    expect(next.planes[0]!.hides).toEqual(['a']);
  });

  it('removes it and drops an emptied hides array', () => {
    const hidden = setNodePlaneHidden(base(), 'a', 'p', true);
    const shown = setNodePlaneHidden(hidden, 'a', 'p', false);
    expect('hides' in shown.planes[0]!).toBe(false);
  });

  it('is idempotent on repeated hide', () => {
    const once = setNodePlaneHidden(base(), 'a', 'p', true);
    const twice = setNodePlaneHidden(once, 'a', 'p', true);
    expect(twice.planes[0]!.hides).toEqual(['a']);
  });

  it('refuses to hide a node already scoped to a plane', () => {
    const m = { ...base(), nodes: [{ id: 'a', name: 'a', type: 't', plane: 'p' }] };
    expect(setNodePlaneHidden(m, 'a', 'p', true).planes[0]!.hides).toBeUndefined();
  });
});

describe('mergeLayers', () => {
  const base = (): DiagramModel => ({
    version: 1,
    id: 'd',
    name: 'd',
    nodes: [
      { id: 'a', name: 'a', layer: 'ops' }, // source-tagged
      { id: 'b', name: 'b' }, // base sheet
      { id: 'c', name: 'c', layer: 'flow' }, // already the target
    ],
    containment: [],
    relations: [
      { id: 'r1', from: 'a', to: 'b', kind: 'sync', layer: 'ops' },
      { id: 'r2', from: 'a', to: 'b', kind: 'sync' }, // base
    ],
    layers: [
      { id: 'flow', name: 'Flow', tint: '#0ea5e9' },
      { id: 'ops', name: 'Ops', tint: '#f59e0b' },
    ],
    planes: [
      { id: 'arch', name: 'Architecture' },
      { id: 'infra', name: 'Infra', layers: ['flow', 'ops'] },
    ],
  });

  it('folds a source layer into the target, retagging nodes and relations', () => {
    const m = mergeLayers(base(), ['ops'], 'flow');
    expect(m.nodes.find((n) => n.id === 'a')?.layer).toBe('flow');
    expect(m.relations.find((r) => r.id === 'r1')?.layer).toBe('flow');
    // untouched: base sheet and already-target elements
    expect(m.nodes.find((n) => n.id === 'b')?.layer).toBeUndefined();
    expect(m.nodes.find((n) => n.id === 'c')?.layer).toBe('flow');
    expect(m.relations.find((r) => r.id === 'r2')?.layer).toBeUndefined();
  });

  it('removes the source layer and preserves the target identity', () => {
    const m = mergeLayers(base(), ['ops'], 'flow');
    expect(m.layers).toEqual([{ id: 'flow', name: 'Flow', tint: '#0ea5e9' }]);
  });

  it('remaps and dedupes plane layer presets, collapsing had-both to one entry', () => {
    const m = mergeLayers(base(), ['ops'], 'flow');
    expect(m.planes.find((p) => p.id === 'infra')?.layers).toEqual(['flow']);
  });

  it('folds multiple sources into one target in a single call', () => {
    const src: DiagramModel = {
      ...base(),
      layers: [...base().layers, { id: 'net', name: 'Net' }],
      nodes: [...base().nodes, { id: 'd', name: 'd', layer: 'net' }],
    };
    const m = mergeLayers(src, ['ops', 'net'], 'flow');
    expect(m.layers.map((l) => l.id)).toEqual(['flow']);
    expect(m.nodes.find((n) => n.id === 'a')?.layer).toBe('flow');
    expect(m.nodes.find((n) => n.id === 'd')?.layer).toBe('flow');
  });

  it('throws on unknown target, unknown source, and merge into self', () => {
    expect(() => mergeLayers(base(), ['ops'], 'ghost')).toThrowError(CommandError);
    expect(() => mergeLayers(base(), ['ghost'], 'flow')).toThrowError(CommandError);
    expect(() => mergeLayers(base(), ['flow'], 'flow')).toThrowError(CommandError);
  });

  it('returns the model unchanged for an empty source list', () => {
    const m0 = base();
    expect(mergeLayers(m0, [], 'flow')).toBe(m0);
  });

  it('does not mutate its input', () => {
    const m0 = base();
    const snapshot = JSON.parse(JSON.stringify(m0));
    mergeLayers(m0, ['ops'], 'flow');
    expect(m0).toEqual(snapshot);
  });

  it('merges a source to the base sheet (omitted target) by untagging, not deleting', () => {
    const m = mergeLayers(base(), ['ops']);
    // node/relation survive, now untagged (base)
    expect(m.nodes.find((n) => n.id === 'a')?.layer).toBeUndefined();
    expect(m.nodes.some((n) => n.id === 'a')).toBe(true);
    expect(m.relations.find((r) => r.id === 'r1')?.layer).toBeUndefined();
    // source removed; plane preset filtered
    expect(m.layers.map((l) => l.id)).toEqual(['flow']);
    expect(m.planes.find((p) => p.id === 'infra')?.layers).toEqual(['flow']);
  });

  it('merges multiple sources to base, removing them all and clearing presets', () => {
    const m = mergeLayers(base(), ['ops', 'flow']);
    expect(m.layers).toEqual([]);
    expect(m.planes.find((p) => p.id === 'infra')?.layers).toEqual([]);
    expect(m.nodes.every((n) => n.layer === undefined)).toBe(true);
  });
});
