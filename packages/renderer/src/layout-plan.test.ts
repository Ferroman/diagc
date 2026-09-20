import { describe, expect, it } from 'vitest';
import { compileView, model, type ViewNode } from '@diagc/core';
import { planLayout } from './layout-plan';

const ids = (groups: readonly (readonly ViewNode[])[]) => groups.map((g) => g.map((n) => n.id));

describe('planLayout', () => {
  it('plans nothing for one connected diagram', () => {
    const m = model('x');
    const [a, b, c] = ['a', 'b', 'c'].map((id) => m.node(id));
    m.relate(a!, b!, { kind: 'sync' });
    m.relate(b!, c!, { kind: 'sync' });
    expect(planLayout(compileView(m.toJSON(), {})).levels.size).toBe(0);
  });

  it('splits the root into its connected components, in model order', () => {
    const m = model('x');
    const [a, b, c, d] = ['a', 'b', 'c', 'd'].map((id) => m.node(id));
    m.relate(b!, d!, { kind: 'sync' });
    void [a, c];
    const root = planLayout(compileView(m.toJSON(), {})).levels.get(null)!;
    expect(root.attached).toEqual([]);
    expect(ids(root.detached)).toEqual([['a'], ['b', 'd'], ['c']]);
  });

  it('connects two root containers through an edge between their descendants', () => {
    const m = model('x');
    const [a, b, lone] = ['a', 'b', 'lone'].map((id) => m.node(id));
    m.node('left').contains(a!);
    m.node('right').contains(b!);
    m.relate(a!, b!, { kind: 'sync' });
    void lone;
    const plan = planLayout(compileView(m.toJSON(), { focus: ['left', 'right'] }));
    expect(ids(plan.levels.get(null)!.detached)).toEqual([['lone'], ['left', 'right']]);
    // each container holds one child: nothing to pack inside either
    expect(plan.levels.has('left')).toBe(false);
  });

  it('frees the whole inside of a container no edge crosses', () => {
    const m = model('x');
    const kids = ['p', 'q', 'r'].map((id) => m.node(id));
    const box = m.node('box');
    box.contains(...kids);
    // an edge ENDING at the container is not a crossing: the box is one endpoint
    m.relate(m.node('ext'), box, { kind: 'sync' });
    const level = planLayout(compileView(m.toJSON(), { focus: ['box'] })).levels.get('box')!;
    expect(level.attached).toEqual([]);
    expect(ids(level.detached)).toEqual([['p'], ['q'], ['r']]);
  });

  it('keeps the children an outside edge reaches in the run, and frees the rest', () => {
    const m = model('x');
    const [a, b, c, d] = ['a', 'b', 'c', 'd'].map((id) => m.node(id));
    const box = m.node('box');
    box.contains(a!, b!, c!, d!);
    m.relate(m.node('ext'), a!, { kind: 'sync' }); // crosses the wall: a is tied to the outside
    m.relate(a!, b!, { kind: 'sync' }); // ...and b to a
    const level = planLayout(compileView(m.toJSON(), { focus: ['box'] })).levels.get('box')!;
    expect(level.attached.map((n) => n.id)).toEqual(['a', 'b']);
    expect(ids(level.detached)).toEqual([['c'], ['d']]);
  });

  it('leaves a lone loose child to elk — one box needs no packing', () => {
    const m = model('x');
    const [a, c] = ['a', 'c'].map((id) => m.node(id));
    m.node('box').contains(a!, c!);
    m.relate(m.node('ext'), a!, { kind: 'sync' });
    expect(planLayout(compileView(m.toJSON(), { focus: ['box'] })).levels.has('box')).toBe(false);
  });

  it('treats a container → own descendant edge as crossing that container', () => {
    const m = model('x');
    const [a, b, c] = ['a', 'b', 'c'].map((id) => m.node(id));
    const box = m.node('box');
    box.contains(a!, b!, c!);
    m.relate(box, a!, { kind: 'sync' });
    const level = planLayout(compileView(m.toJSON(), { focus: ['box'] })).levels.get('box')!;
    expect(level.attached.map((n) => n.id)).toEqual(['a']);
    expect(ids(level.detached)).toEqual([['b'], ['c']]);
  });

  it('never looks inside a folded container', () => {
    const m = model('x');
    m.node('box').contains(m.node('p'), m.node('q'));
    expect(planLayout(compileView(m.toJSON(), {})).levels.size).toBe(0);
  });
});
