// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { allowedParentTypes, childrenOf, compileView, countAnchored, model } from './internal';

describe('childrenOf', () => {
  it('indexes containment edges by parent', () => {
    const m = model('c');
    const p = m.node('p');
    p.contains(m.node('a'), m.node('b'));
    m.node('solo');
    const idx = childrenOf(m.toJSON().containment);
    expect(idx.get('p')).toEqual(['a', 'b']);
    expect(idx.get('a')).toBeUndefined(); // absent parents do not appear
    expect(idx.has('solo')).toBe(false);
  });
});

describe('countAnchored', () => {
  const nested = () => {
    const m = model('nest');
    const outer = m.node('outer', { type: 'system' });
    const mid = m.node('mid', { type: 'system' });
    const leaf = m.node('leaf', { type: 'service' });
    const deep = m.node('deep', { type: 'service' });
    m.node('other', { type: 'service' });
    outer.contains(mid);
    mid.contains(leaf);
    leaf.contains(deep);
    return m.toJSON();
  };

  it('attributes the hidden subtree to the collapsed visible container (default folded)', () => {
    const json = nested();
    const view = compileView(json, {});
    // The diagram rests fully folded: outer renders as one box and the whole
    // mid › leaf › deep subtree hides beneath it. Hidden nodes are invisible in
    // the compiled view, so only visible roots get badges.
    const counts = countAnchored(view);
    expect(counts.get('outer')).toBe(3);
    expect(counts.get('other')).toBe(0);
    expect(counts.has('mid')).toBe(false);
    expect(counts.has('leaf')).toBe(false);
  });

  it('counts only the branches collapsed beneath a partially expanded view', () => {
    const json = nested();
    const view = compileView(json, { pins: { outer: 'expanded' } });
    // outer opens → mid is revealed but stays collapsed, hiding leaf › deep
    const counts = countAnchored(view);
    expect(view.lod['outer']).toBe('expanded');
    expect(view.lod['mid']).toBe('collapsed');
    expect(counts.get('outer')).toBe(0);
    expect(counts.get('mid')).toBe(2);
  });

  it('counts zero when the whole subtree is revealed', () => {
    const json = nested();
    const view = compileView(json, { pins: { outer: 'expanded', mid: 'expanded', leaf: 'expanded' } });
    const counts = countAnchored(view);
    expect(counts.get('outer')).toBe(0);
    expect(counts.get('mid')).toBe(0);
    expect(counts.get('leaf')).toBe(0);
    expect(counts.get('deep')).toBe(0);
  });

  it('counts the plane being viewed, each hidden node once', () => {
    const m = model('planes');
    m.plane('current', { name: 'Current' });
    m.plane('target', { name: 'Target' });
    const env = m.node('env', { type: 'system' });
    const vpc = m.node('vpc', { type: 'system' });
    const a = m.node('a', { type: 'service' });
    const b = m.node('b', { type: 'service' });
    // the same nesting on both planes: two containment edges per child
    for (const plane of ['current', 'target']) {
      env.contains(vpc, { plane });
      vpc.contains(a, { plane });
      vpc.contains(b, { plane });
    }
    const json = m.toJSON();
    const view = compileView(json, { plane: 'current' });
    expect(countAnchored(view).get('env')).toBe(3);
  });

  it('counts a node reached through two hidden parents once', () => {
    const m = model('dag');
    const group = m.node('group', { type: 'system' });
    const x = m.node('x', { type: 'system' });
    const y = m.node('y', { type: 'system' });
    const shared = m.node('shared', { type: 'service' });
    group.contains(x, y);
    x.contains(shared);
    y.contains(shared);
    const json = m.toJSON();
    const view = compileView(json, {});
    expect(countAnchored(view).get('group')).toBe(3);
  });

  it('ignores nodes hidden by plane/layer filtering (not just fold)', () => {
    const m = model('layers');
    m.layer('off');
    const top = m.node('top', { type: 'system' });
    const hidden = m.node('hidden', { type: 'service', layer: 'off' });
    top.contains(hidden);
    const json = m.toJSON();
    // layer 'off' is inactive → hidden is filtered from the view entirely, so
    // unfolding top would not show it, and the badge does not count it
    const view = compileView(json, { activeLayers: [] });
    const counts = countAnchored(view);
    expect(counts.get('top')).toBe(0);
  });
});
describe('allowedParentTypes', () => {
  it('pins activity lanes to frames, regions to lanes, flow elements to either', () => {
    expect([...allowedParentTypes('activity-lane')!]).toEqual(['activity-frame']);
    expect([...allowedParentTypes('activity-region')!]).toEqual(['activity-lane']);
    for (const t of ['activity-action', 'activity-decision', 'activity-note']) {
      expect([...allowedParentTypes(t)!]).toEqual(['activity-lane', 'activity-region']);
    }
  });

  it('leaves frames and every other type unconstrained', () => {
    for (const t of ['activity-frame', 'service', 'branch', undefined]) expect(allowedParentTypes(t)).toBeUndefined();
  });
});
