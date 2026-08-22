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

describe('buildHierarchy hidesTree', () => {
  it('hiding a container hides its descendants unless another visible parent keeps them', () => {
    const m = model('m');
    m.plane('c4', { hidesTree: ['db'] });
    const db = m.node('db', { type: 't' });
    const other = m.node('other', { type: 't' });
    const schema = m.node('schema', { type: 't' });
    const table = m.node('table', { type: 't' });
    const kept = m.node('kept', { type: 't' });
    db.contains(schema);
    schema.contains(table, kept);
    other.contains(kept); // second parent, and it stays visible
    const h = buildHierarchy(m.toJSON(), 'c4');

    expect(h.roots).toEqual(['other']); // db hidden, schema/table gone with it
    expect(h.parentsOf.has('schema')).toBe(false); // one level down
    expect(h.parentsOf.has('table')).toBe(false); // two levels down
    expect(h.parentsOf.get('kept')).toEqual(['other']); // still contained, so kept
    expect(h.childrenOf.get('other')).toEqual(['kept']);
  });

  it('plain hides still promotes the contents: the compose include-wrapper idiom', () => {
    const m = model('m');
    m.plane('c4', { hides: ['wrapper'] });
    const wrapper = m.node('wrapper', { type: 't' }); // an include wrapper
    const external = m.node('external', { type: 't' }); // its only parent is the wrapper
    const inner = m.node('inner', { type: 't' });
    wrapper.contains(external);
    external.contains(inner);
    const h = buildHierarchy(m.toJSON(), 'c4');

    expect(h.roots).toEqual(['external']); // promoted, keeping its own nesting
    expect(h.childrenOf.get('external')).toEqual(['inner']);
  });

  it('does not cascade over an inactive layer: a layered box still promotes its children', () => {
    const m = model('m');
    m.layer('ops', { name: 'Ops' });
    m.plane('c4');
    const box = m.node('box', { type: 't', layer: 'ops' });
    const inner = m.node('inner', { type: 't' });
    box.contains(inner);
    const h = buildHierarchy(m.toJSON(), 'c4', new Set<string>());

    expect(h.roots).toEqual(['inner']); // box off, inner floats up (unchanged)
  });
});

describe('buildHierarchy borrowed containment', () => {
  // `containmentOf` borrows the hierarchy. Visibility is a separate choice, so a
  // borrowing plane may declare its own `hides` — and inherits the donor's when
  // it declares none, which is what the docs' worked example relies on.
  function borrowed() {
    const m = model('m');
    m.plane('arch', { hides: ['k8s'], hidesTree: ['store'] });
    m.plane('flow', { containmentOf: 'arch' }); // no hides of its own
    m.plane('all', { containmentOf: 'arch', hides: [], hidesTree: [] }); // hides nothing
    const shop = m.node('shop', { type: 't' });
    const web = m.node('web', { type: 't' });
    m.node('k8s', { type: 't' });
    const store = m.node('store', { type: 't' });
    store.contains(m.node('table', { type: 't' }));
    shop.contains(web); // untagged: belongs to 'arch'
    return m.toJSON();
  }

  it('inherits the donor plane hides when the borrower declares none', () => {
    const h = buildHierarchy(borrowed(), 'flow');
    expect(h.roots).toEqual(['shop']); // k8s hidden, store hidden with its table
    expect(h.childrenOf.get('shop')).toEqual(['web']); // containment borrowed
  });

  it("lets a borrowing plane override the donor's hides with its own", () => {
    const h = buildHierarchy(borrowed(), 'all');
    expect(h.roots).toEqual(['shop', 'k8s', 'store']); // nothing hidden any more
    expect(h.childrenOf.get('store')).toEqual(['table']);
    expect(h.childrenOf.get('shop')).toEqual(['web']); // still the donor's hierarchy
  });
});
