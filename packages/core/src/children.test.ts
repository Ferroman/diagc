// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { childrenOf, compileView, countAnchored, model } from './index';

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
    const counts = countAnchored(json, view);
    expect(counts.get('outer')).toBe(3);
    expect(counts.get('other')).toBe(0);
    expect(counts.has('mid')).toBe(false);
    expect(counts.has('leaf')).toBe(false);
  });

  it('counts only the branches collapsed beneath a partially expanded view', () => {
    const json = nested();
    const view = compileView(json, { pins: { outer: 'expanded' } });
    // outer opens → mid is revealed but stays collapsed, hiding leaf › deep
    const counts = countAnchored(json, view);
    expect(view.lod['outer']).toBe('expanded');
    expect(view.lod['mid']).toBe('collapsed');
    expect(counts.get('outer')).toBe(0);
    expect(counts.get('mid')).toBe(2);
  });

  it('counts zero when the whole subtree is revealed', () => {
    const json = nested();
    const view = compileView(json, { pins: { outer: 'expanded', mid: 'expanded', leaf: 'expanded' } });
    const counts = countAnchored(json, view);
    expect(counts.get('outer')).toBe(0);
    expect(counts.get('mid')).toBe(0);
    expect(counts.get('leaf')).toBe(0);
    expect(counts.get('deep')).toBe(0);
  });

  it('ignores nodes hidden by plane/layer filtering (not just fold)', () => {
    const m = model('layers');
    m.layer('off');
    const top = m.node('top', { type: 'system' });
    const hidden = m.node('hidden', { type: 'service', layer: 'off' });
    top.contains(hidden);
    const json = m.toJSON();
    // layer 'off' is inactive → hidden is filtered from the view entirely, and
    // the folded top hides it like any other unreachable descendant
    const view = compileView(json, { activeLayers: [] });
    const counts = countAnchored(json, view);
    expect(counts.get('top')).toBe(1);
  });
});