import { describe, expect, it } from 'vitest';
import { model } from '../builder';
import { buildHierarchy } from './hierarchy';

function make() {
  const m = model('t');
  const shared = m.node('shared', { type: 'db' });
  const a = m.node('a', { type: 'system' });
  const b = m.node('b', { type: 'system' });
  const x = m.node('x', { type: 'service' });
  a.contains(x, shared);
  b.contains(shared);
  return m.toJSON();
}

describe('buildHierarchy', () => {
  it('indexes parents and children in declaration order', () => {
    const h = buildHierarchy(make());
    expect(h.childrenOf.get('a')).toEqual(['x', 'shared']);
    expect(h.childrenOf.get('b')).toEqual(['shared']);
    expect(h.parentsOf.get('shared')).toEqual(['a', 'b']);
    expect(h.parentsOf.get('x')).toEqual(['a']);
  });

  it('lists roots (parentless nodes) in model order', () => {
    const h = buildHierarchy(make());
    expect(h.roots).toEqual(['a', 'b']);
  });

  it('gives every node an entry, even without edges', () => {
    const h = buildHierarchy(make());
    expect(h.childrenOf.get('x')).toEqual([]);
    expect(h.parentsOf.get('a')).toEqual([]);
  });
});

describe('buildHierarchy explicit membership', () => {
  it('keeps a shared box a root on a plane where it is top-level, even when re-nested on another plane', () => {
    const m = model('m');
    m.plane('c4').plane('infra');
    const web = m.node('web', { type: 't' });          // shared
    const instance = m.node('instance', { type: 't', plane: 'infra' });
    instance.contains(web, { plane: 'infra' });         // re-nest on infra only
    const j = m.toJSON();

    const c4 = buildHierarchy(j, 'c4');
    expect(c4.roots).toContain('web');                  // still top-level on c4
    expect(c4.roots).not.toContain('instance');         // infra-only box absent

    const infra = buildHierarchy(j, 'infra');
    expect(infra.roots).toEqual(['instance']);          // web nested under instance
    expect(infra.childrenOf.get('instance')).toEqual(['web']);
  });

  it('hides a shared node on a plane via plane.hides and drops it from the hierarchy', () => {
    const m = model('m');
    m.plane('c4', { hides: ['user'] });
    m.node('user', { type: 't' });
    m.node('web', { type: 't' });
    const j = m.toJSON();
    const c4 = buildHierarchy(j, 'c4');
    expect(c4.roots).toEqual(['web']);                  // user hidden
    expect(c4.parentsOf.has('user')).toBe(false);
  });
});
