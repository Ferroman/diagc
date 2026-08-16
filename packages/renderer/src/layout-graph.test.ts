import { describe, expect, it } from 'vitest';
import { compileView, model } from '@diagramming/core';
import { liftEdges, layoutOptionsFor, usesNestedLayout, buildGraph, COLLAPSED_SIZE } from './layout-graph';

/**
 * Two containers, two leaves each, and one relation of every shape that matters:
 * inside a container, across two containers (twice, so the no-dedupe rule is
 * observable), and from a container to its own child (which must drop).
 */
function crossing() {
  const m = model('x');
  const a = m.node('a', { type: 'service' });
  const b = m.node('b', { type: 'service' });
  const c = m.node('c', { type: 'service' });
  const d = m.node('d', { type: 'service' });
  const left = m.node('left', { type: 'system' });
  const right = m.node('right', { type: 'system' });
  left.contains(a, b);
  right.contains(c, d);
  m.relate(a, b, { kind: 'sync' }); // inside left
  m.relate(a, c, { kind: 'sync' }); // left → right
  m.relate(b, d, { kind: 'sync' }); // left → right again
  m.relate(left, a, { kind: 'sync' }); // container → own child: must drop
  return m.toJSON();
}

const expanded = () => compileView(crossing(), { focus: ['left', 'right'] });
const allLifted = (byOwner: Map<string | null, { id: string }[]>) =>
  [...byOwner.values()].flat();

describe('liftEdges', () => {
  it('keeps a same-parent edge on that parent, endpoints unchanged', () => {
    const own = liftEdges(expanded()).get('left') ?? [];
    expect(own).toHaveLength(1);
    expect(own[0]!.sources).toEqual(['a']);
    expect(own[0]!.targets).toEqual(['b']);
  });

  it('raises cross-container edges to the root, endpoints becoming the containers', () => {
    const root = liftEdges(expanded()).get(null) ?? [];
    expect(root).toHaveLength(2);
    for (const e of root) {
      expect(e.sources).toEqual(['left']);
      expect(e.targets).toEqual(['right']);
    }
  });

  it('does NOT dedupe two relations that raise to the same pair', () => {
    // Deliberate: elk's force treats a repeated edge as extra pull, so two
    // subtrees joined twice sit closer than two joined once. The measured
    // crossing improvement in the design note comes from a non-deduped run.
    const root = liftEdges(expanded()).get(null) ?? [];
    expect(new Set(root.map((e) => e.id)).size).toBe(2);
  });

  it('preserves the original edge id so callers can correlate', () => {
    const view = expanded();
    const original = view.layoutEdges.find((e) => e.from === 'a' && e.to === 'b')!;
    expect((liftEdges(view).get('left') ?? [])[0]!.id).toBe(original.id);
  });

  it('drops an edge from a container to its own descendant (it would self-loop)', () => {
    const view = expanded();
    const containerToChild = view.layoutEdges.find((e) => e.from === 'left' && e.to === 'a')!;
    const lifted = allLifted(liftEdges(view));
    // 4 relations in, 3 lifted out — left → a raises to left → left, which elk
    // rejects and which constrains nothing.
    expect(lifted).toHaveLength(3);
    expect(lifted.map((e) => e.id)).not.toContain(containerToChild.id);
  });

  it('puts every edge on the root when nothing is expanded', () => {
    const byOwner = liftEdges(compileView(crossing(), {}));
    expect([...byOwner.keys()].every((k) => k === null)).toBe(true);
  });
});

describe('usesNestedLayout', () => {
  it('is true only for the edge-aware algorithms that cannot see through containers', () => {
    expect(usesNestedLayout({ algorithm: 'force' })).toBe(true);
    expect(usesNestedLayout({ algorithm: 'stress' })).toBe(true);
    expect(usesNestedLayout({ algorithm: 'mrtree' })).toBe(true);
    expect(usesNestedLayout({ algorithm: 'radial' })).toBe(true);
  });

  it('is false for layered (handles hierarchy itself) and rectpacking (ignores edges)', () => {
    expect(usesNestedLayout()).toBe(false);
    expect(usesNestedLayout({ algorithm: 'layered' })).toBe(false);
    expect(usesNestedLayout({ algorithm: 'rectpacking' })).toBe(false);
  });
});

describe('layoutOptionsFor hierarchy handling', () => {
  it('asks layered to flatten the hierarchy', () => {
    expect(layoutOptionsFor()['elk.hierarchyHandling']).toBe('INCLUDE_CHILDREN');
    expect(layoutOptionsFor({ algorithm: 'rectpacking' })['elk.hierarchyHandling']).toBe('INCLUDE_CHILDREN');
  });

  it('omits it for algorithms that do not implement it', () => {
    expect(layoutOptionsFor({ algorithm: 'force' })['elk.hierarchyHandling']).toBeUndefined();
  });
});

describe('buildGraph', () => {
  it('leaves the flat path alone: all edges at the root, no algorithm on containers', () => {
    const g = buildGraph(expanded(), undefined, undefined);
    // all 4 relations: the flat path only drops true self-edges (from === to)
    expect(g.edges).toHaveLength(4);
    const left = g.children!.find((c) => c.id === 'left')!;
    expect(left.edges).toBeUndefined();
    expect(left.layoutOptions!['elk.algorithm']).toBeUndefined();
    expect(left.layoutOptions!['elk.padding']).toBeDefined();
  });

  it('puts each level\'s edges on its own container for a nested algorithm', () => {
    const g = buildGraph(expanded(), undefined, { algorithm: 'force' });
    const left = g.children!.find((c) => c.id === 'left')!;
    expect(left.edges).toHaveLength(1);
    expect(left.edges![0]!.sources).toEqual(['a']);
    // the two lifted left→right edges; left→a dropped as a would-be self-loop
    expect(g.edges).toHaveLength(2);
  });

  it('stamps the algorithm and spacing onto every container — elk inherits neither', () => {
    const g = buildGraph(expanded(), undefined, { algorithm: 'force', spacing: 24 });
    const left = g.children!.find((c) => c.id === 'left')!;
    expect(left.layoutOptions!['elk.algorithm']).toBe('force');
    expect(left.layoutOptions!['elk.spacing.nodeNode']).toBe('24');
    // padding must survive the merge, or containers lose their header room
    expect(left.layoutOptions!['elk.padding']).toContain('top=36.0');
  });

  it('flat:true forces the pre-lift graph even for a nested algorithm', () => {
    const g = buildGraph(expanded(), undefined, { algorithm: 'radial' }, { flat: true });
    expect(g.edges).toHaveLength(4);
    expect(g.children!.find((c) => c.id === 'left')!.edges).toBeUndefined();
  });

  it('honours size overrides on leaves and the fixed size on collapsed containers', () => {
    const g = buildGraph(expanded(), new Map([['a', { width: 111, height: 22 }]]), undefined);
    const a = g.children!.find((c) => c.id === 'left')!.children!.find((c) => c.id === 'a')!;
    expect(a).toMatchObject({ width: 111, height: 22 });
    const folded = buildGraph(compileView(crossing(), {}), undefined, undefined);
    expect(folded.children!.find((c) => c.id === 'left')).toMatchObject(COLLAPSED_SIZE);
  });
});
