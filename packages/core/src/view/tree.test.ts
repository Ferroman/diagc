import { describe, expect, it } from 'vitest';
import { model } from '../builder';
import { buildHierarchy } from './hierarchy';
import { buildViewTree } from './tree';
import type { DiagramModel } from '../types';

/** shared node in two systems under one root platform */
function sharedFixture(): DiagramModel {
  const m = model('t');
  const platform = m.node('platform', { type: 'platform' });
  const A = m.node('A', { type: 'system' });
  const B = m.node('B', { type: 'system' });
  const x = m.node('x', { type: 'service' });
  const y = m.node('y', { type: 'service' });
  const shared = m.node('shared', { type: 'db' });
  const u = m.node('u', { type: 'table' });
  platform.contains(A, B);
  A.contains(x, shared);
  B.contains(y, shared);
  shared.contains(u);
  return m.toJSON();
}
const ids = (nodes: { id: string }[]) => nodes.map((n) => n.id);

describe('buildViewTree', () => {
  it('collapsed container hides children and anchors them to it', () => {
    const j = sharedFixture();
    const h = buildHierarchy(j);
    const t = buildViewTree(j, h, { platform: 'expanded', A: 'collapsed', B: 'expanded', shared: 'collapsed' });
    expect(t.byId.has('x')).toBe(false);
    expect(t.anchorOf.get('x')).toBe('A');
  });

  it('places a shared node in its first expanded parent and marks the others', () => {
    const j = sharedFixture();
    const h = buildHierarchy(j);
    const t = buildViewTree(j, h, { platform: 'expanded', A: 'expanded', B: 'collapsed', shared: 'collapsed' });
    expect(t.hostOf.get('shared')).toBe('A');
    expect(t.byId.get('shared')?.promoted).toBe(false);
    expect(t.byId.get('B')?.sharedMembers).toEqual(['shared']);
  });

  it('promotes a shared node when all its groups are collapsed', () => {
    const j = sharedFixture();
    const h = buildHierarchy(j);
    const t = buildViewTree(j, h, { platform: 'expanded', A: 'collapsed', B: 'collapsed', shared: 'collapsed' });
    const shared = t.byId.get('shared');
    expect(shared?.promoted).toBe(true);
    expect(t.hostOf.get('shared')).toBe('platform');
    expect(shared?.state).toBe('collapsed');
    // hidden leaves anchor to their visible hosts
    expect(t.anchorOf.get('x')).toBe('A');
    expect(t.anchorOf.get('u')).toBe('shared');
    // promoted node appended to platform's children after A and B
    expect(ids(t.byId.get('platform')!.children)).toEqual(['A', 'B', 'shared']);
  });

  it('a promoted expanded container reveals its children', () => {
    const j = sharedFixture();
    const h = buildHierarchy(j);
    const t = buildViewTree(j, h, { platform: 'expanded', A: 'collapsed', B: 'collapsed', shared: 'expanded' });
    expect(t.byId.get('shared')?.promoted).toBe(true);
    expect(ids(t.byId.get('shared')!.children)).toEqual(['u']);
    expect(t.byId.has('u')).toBe(true);
  });

  it('no promotion when everything collapses into a single visible node', () => {
    const j = sharedFixture();
    const h = buildHierarchy(j);
    const t = buildViewTree(j, h, { platform: 'collapsed', A: 'collapsed', B: 'collapsed', shared: 'collapsed' });
    expect(ids(t.roots)).toEqual(['platform']);
    expect(t.byId.has('shared')).toBe(false);
    expect(t.anchorOf.get('shared')).toBe('platform');
    expect(t.anchorOf.get('u')).toBe('platform');
  });

  it('orders a promoted child after resident siblings even when declared first', () => {
    const m = model('t');
    // shared is declared BEFORE the systems that contain it.
    const shared = m.node('shared', { type: 'db' });
    const platform = m.node('platform', { type: 'platform' });
    const A = m.node('A', { type: 'system' });
    const B = m.node('B', { type: 'system' });
    platform.contains(A, B);
    A.contains(shared);
    B.contains(shared);
    const j = m.toJSON();
    const t = buildViewTree(j, buildHierarchy(j), {
      platform: 'expanded',
      A: 'collapsed',
      B: 'collapsed',
    });
    expect(t.byId.get('shared')?.promoted).toBe(true);
    // promoted last despite earliest declaration
    expect(ids(t.byId.get('platform')!.children)).toEqual(['A', 'B', 'shared']);
  });

  it('promoted node lands at top level when its groups are top-level roots', () => {
    const m = model('t');
    const A = m.node('A', { type: 'system' });
    const B = m.node('B', { type: 'system' });
    const shared = m.node('shared', { type: 'db' });
    A.contains(shared);
    B.contains(shared);
    const j = m.toJSON();
    const t = buildViewTree(j, buildHierarchy(j), { A: 'collapsed', B: 'collapsed' });
    expect(t.hostOf.get('shared')).toBeNull();
    expect(ids(t.roots)).toEqual(['A', 'B', 'shared']);
    expect(t.byId.get('shared')?.state).toBe('leaf');
  });
});
