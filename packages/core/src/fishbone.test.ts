import { describe, expect, it } from 'vitest';
import { BUILTIN_NOTATIONS, type DiagramModel, type DiagramNode, type DiagramRelation } from './types';
import {
  FB_CATEGORY_TYPE,
  FB_CAUSE_TYPE,
  FB_EFFECT_TYPE,
  FISHBONE_PRESET_NAMES,
  FISHBONE_PRESETS,
  fishboneParents,
  fishboneTree,
  isFishboneNode,
  presetId,
} from './fishbone';

const node = (id: string, type?: string): DiagramNode => ({ id, name: id, ...(type !== undefined ? { type } : {}) });
const effect = (id: string) => node(id, FB_EFFECT_TYPE);
const category = (id: string) => node(id, FB_CATEGORY_TYPE);
const cause = (id: string) => node(id, FB_CAUSE_TYPE);
const rel = (from: string, to: string, kind = 'cause-of'): DiagramRelation => ({ id: `${from}->${to}`, from, to, kind });
const model = (nodes: DiagramNode[], relations: DiagramRelation[]): DiagramModel => ({
  version: 1, id: 'm', name: 'm', nodes, containment: [], relations, layers: [], planes: [],
});

describe('fishbone vocabulary', () => {
  it('registers the notation id', () => {
    expect(BUILTIN_NOTATIONS).toContain('fishbone');
  });
  it('recognises the three types and nothing else', () => {
    expect(isFishboneNode(effect('e'))).toBe(true);
    expect(isFishboneNode(category('c'))).toBe(true);
    expect(isFishboneNode(cause('x'))).toBe(true);
    expect(isFishboneNode(node('n', 'service'))).toBe(false);
    expect(isFishboneNode(node('n'))).toBe(false);
  });
  it('ships three presets, Software first, with slug ids', () => {
    expect(FISHBONE_PRESET_NAMES).toEqual(['Software', '6M', '4S']);
    expect(FISHBONE_PRESETS.Software).toEqual(['People', 'Process', 'Requirements', 'Code', 'Infrastructure', 'Dependencies']);
    expect(FISHBONE_PRESETS['6M']).toEqual(['Man', 'Machine', 'Method', 'Material', 'Measurement', 'Environment']);
    expect(FISHBONE_PRESETS['4S']).toEqual(['Surroundings', 'Suppliers', 'Systems', 'Skills']);
    expect(presetId('Infrastructure')).toBe('infrastructure');
    expect(presetId('Third parties')).toBe('third-parties');
  });
});

describe('fishboneParents', () => {
  it('picks the first relation in declaration order, any kind', () => {
    const m = model(
      [effect('e'), category('c')],
      [rel('c', 'e', 'flow'), rel('c', 'e', 'cause-of')],
    );
    expect(fishboneParents(m).get('c')).toBe('e');
  });
  it('skips a self-loop', () => {
    const m = model([category('c')], [rel('c', 'c')]);
    expect(fishboneParents(m).has('c')).toBe(false);
  });
  it('ignores a relation whose ends are not both fishbone nodes', () => {
    const m = model([category('c'), node('note')], [rel('c', 'note'), rel('note', 'c')]);
    expect(fishboneParents(m).size).toBe(0);
  });
});

describe('fishboneTree', () => {
  it('reads a full fish in declaration order', () => {
    const m = model(
      [effect('e'), category('c1'), category('c2'), cause('a'), cause('b'), cause('a1'), cause('a2')],
      [rel('c1', 'e'), rel('c2', 'e'), rel('a', 'c1'), rel('b', 'c2'), rel('a1', 'a'), rel('a2', 'a')],
    );
    expect(fishboneTree(m)).toEqual({
      effect: 'e',
      categories: [
        { id: 'c1', causes: [{ id: 'a', subs: ['a1', 'a2'] }] },
        { id: 'c2', causes: [{ id: 'b', subs: [] }] },
      ],
      unattached: [],
    });
  });

  it('orders categories by their relation, not by node order', () => {
    const m = model([effect('e'), category('late'), category('early')], [rel('early', 'e'), rel('late', 'e')]);
    expect(fishboneTree(m).categories.map((c) => c.id)).toEqual(['early', 'late']);
  });

  it('counts any relation kind between fishbone nodes, and takes the first when there are several', () => {
    const m = model(
      [effect('e'), category('c1'), category('c2'), cause('a')],
      [rel('c1', 'e', 'flow'), rel('c2', 'e'), rel('a', 'c2'), rel('a', 'c1')],
    );
    const t = fishboneTree(m);
    expect(t.categories.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(t.categories[1]?.causes).toEqual([{ id: 'a', subs: [] }]);
    expect(t.unattached).toEqual([]);
  });

  it('leaves off the fish whatever cannot reach the effect: no parent, a cycle, a broken chain', () => {
    const m = model(
      [effect('e'), category('c'), cause('loose'), cause('x'), cause('y'), category('orphan'), cause('under-orphan')],
      [rel('c', 'e'), rel('x', 'y'), rel('y', 'x'), rel('under-orphan', 'orphan')],
    );
    expect(fishboneTree(m).unattached).toEqual(['loose', 'x', 'y', 'orphan', 'under-orphan']);
  });

  it('leaves off wrong-shaped hangings and a fourth level, and ignores non-fishbone nodes', () => {
    const m = model(
      [effect('e'), category('c'), cause('a'), cause('a1'), cause('a11'), category('cc'), cause('direct'), node('note'), effect('e2')],
      [rel('c', 'e'), rel('a', 'c'), rel('a1', 'a'), rel('a11', 'a1'), rel('cc', 'c'), rel('direct', 'e'), rel('note', 'e')],
    );
    const t = fishboneTree(m);
    expect(t.effect).toBe('e');
    expect(t.categories).toEqual([{ id: 'c', causes: [{ id: 'a', subs: ['a1'] }] }]);
    expect(t.unattached).toEqual(['a11', 'cc', 'direct', 'e2']);
  });

  it('has no effect and no categories for an empty or headless model', () => {
    expect(fishboneTree(model([], []))).toEqual({ categories: [], unattached: [] });
    expect(fishboneTree(model([category('c')], []))).toEqual({ categories: [], unattached: ['c'] });
  });
});
