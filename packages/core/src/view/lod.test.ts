import { describe, expect, it } from 'vitest';
import { model } from '../builder';
import { buildHierarchy } from './hierarchy';
import { computeLod } from './lod';

function fixture() {
  const m = model('t');
  const a = m.node('a', { type: 'service' });
  const b = m.node('b', { type: 'service' });
  const sys = m.node('sys', { type: 'system' });
  const other = m.node('other', { type: 'system' });
  const root = m.node('root', { type: 'platform' });
  sys.contains(a);
  other.contains(b);
  root.contains(sys, other);
  return buildHierarchy(m.toJSON());
}

describe('computeLod', () => {
  it('rests fully folded without focus or pins', () => {
    expect(computeLod({ hierarchy: fixture() })).toEqual({
      sys: 'collapsed',
      other: 'collapsed',
      root: 'collapsed',
    });
  });

  it('expands exactly the focus chain', () => {
    expect(computeLod({ hierarchy: fixture(), focus: ['root', 'sys'] })).toEqual({
      root: 'expanded',
      sys: 'expanded',
      other: 'collapsed',
    });
  });

  it('pins win over focus in both directions', () => {
    expect(
      computeLod({ hierarchy: fixture(), focus: ['root', 'sys'], pins: { sys: 'collapsed', other: 'expanded' } }),
    ).toEqual({
      root: 'expanded',
      sys: 'collapsed',
      other: 'expanded',
    });
  });

  it('never emits entries for leaves and ignores unknown focus ids', () => {
    const lod = computeLod({ hierarchy: fixture(), focus: ['ghost', 'a'] });
    expect(Object.keys(lod).sort()).toEqual(['other', 'root', 'sys']);
    expect(lod['root']).toBe('collapsed');
  });
});
