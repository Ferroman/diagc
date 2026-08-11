import { describe, expect, it } from 'vitest';
import { model } from '../builder';
import { buildHierarchy } from './hierarchy';
import { estimateSizes, LEAF_SIZE } from './size';

describe('estimateSizes', () => {
  it('gives leaves the leaf size', () => {
    const m = model('t');
    m.node('a', { type: 'service' });
    const sizes = estimateSizes(buildHierarchy(m.toJSON()));
    expect(sizes.get('a')).toEqual(LEAF_SIZE);
  });

  it('sizes a container from a sqrt grid of its children', () => {
    const m = model('t');
    const a = m.node('a', { type: 'service' });
    const b = m.node('b', { type: 'service' });
    const sys = m.node('sys', { type: 'system' });
    sys.contains(a, b);
    const sizes = estimateSizes(buildHierarchy(m.toJSON()));
    // 2 children: cols=2, rows=1, cell 160x80
    expect(sizes.get('sys')).toEqual({ width: 2 * 160 + 3 * 24, height: 80 + 2 * 24 + 32 });
  });

  it('sizes nested containers recursively and handles shared children once', () => {
    const m = model('t');
    const u = m.node('u', { type: 'table' });
    const v = m.node('v', { type: 'table' });
    const pg = m.node('pg', { type: 'db' });
    pg.contains(u, v);
    const s1 = m.node('s1', { type: 'system' });
    const s2 = m.node('s2', { type: 'system' });
    const leaf = m.node('leaf', { type: 'service' });
    s1.contains(leaf, pg);
    s2.contains(pg); // shared
    const sizes = estimateSizes(buildHierarchy(m.toJSON()));
    expect(sizes.get('pg')).toEqual({ width: 392, height: 160 });
    // s1: children leaf(160x80) + pg(392x160): cols=2 rows=1 cell 392x160
    expect(sizes.get('s1')).toEqual({ width: 2 * 392 + 3 * 24, height: 160 + 2 * 24 + 32 });
    // s2: single child pg: cols=1 rows=1
    expect(sizes.get('s2')).toEqual({ width: 392 + 2 * 24, height: 160 + 2 * 24 + 32 });
  });
});
