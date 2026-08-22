import { describe, expect, it } from 'vitest';
import { model } from '../builder';
import { compileView } from './compile';
import { EXTERNAL_STUB_PREFIX } from './scope';
import type { DiagramModel } from '../types';

// Isolated drill view: entering a node scopes the whole view to that node's
// interior — its children become the top level, the node itself and everything
// outside its subtree disappear, and boundary-crossing relations retarget to an
// external stub standing in for the off-frame node.
//
//   service ─contains→ order-ctrl, pay-gw       db(Postgres) ─contains→ orders, payments
//   order-ctrl → orders (reads), order-ctrl → payments (writes), pay-gw → payments (reads)
function m(): DiagramModel {
  const b = model('drill');
  const service = b.node('service', { type: 'system' });
  const db = b.node('db', { name: 'Postgres', type: 'database' });
  const oc = b.node('order-ctrl', { type: 'service' });
  const pg = b.node('pay-gw', { type: 'service' });
  const ot = b.node('orders', { type: 'table' });
  const pt = b.node('payments', { type: 'table' });
  service.contains(oc, pg);
  db.contains(ot, pt);
  b.relate(oc, ot, { kind: 'reads' });
  b.relate(oc, pt, { kind: 'writes' });
  b.relate(pg, pt, { kind: 'reads' });
  return b.toJSON();
}

describe('compileView drill root (isolated view + external stubs)', () => {
  it('shows only the entered node’s children at the top level; siblings/ancestors vanish', () => {
    const v = compileView(m(), { root: 'service' });
    const realRoots = v.roots.filter((r) => r.external === undefined).map((r) => r.id);
    expect(realRoots).toEqual(['order-ctrl', 'pay-gw']); // no service box, no db, no tables
    expect(v.roots.every((r) => r.state === 'leaf')).toBe(true);
  });

  it('retargets boundary-crossing edges to one external stub named after the off-frame node', () => {
    const v = compileView(m(), { root: 'service' });
    const stub = v.roots.find((r) => r.external !== undefined)!;
    expect(stub).toBeDefined();
    expect(stub.external).toBe('db'); // the real off-frame node
    expect(stub.node.name).toBe('Postgres'); // labeled by that node's name
    // both inside classes connect to the single db stub
    const toStub = v.edges.filter((e) => e.to === stub.id);
    expect(toStub.map((e) => e.from).sort()).toEqual(['order-ctrl', 'pay-gw']);
    // order-ctrl's two relations (reads+writes) aggregate into one counted edge
    expect(v.edges.find((e) => e.from === 'order-ctrl' && e.to === stub.id)?.label).toBe('2 relations');
    expect(v.externals?.get(stub.id)).toBe('db');
  });

  it('drilling into the database mirrors it: tables at top level, service as the stub', () => {
    const v = compileView(m(), { root: 'db' });
    const realRoots = v.roots.filter((r) => r.external === undefined).map((r) => r.id);
    expect(realRoots).toEqual(['orders', 'payments']);
    const stub = v.roots.find((r) => r.external === 'service')!;
    expect(stub).toBeDefined();
    // orders gets 1 (reads), payments gets 2 (writes from oc + reads from pg) — all via service
    expect(v.edges.filter((e) => e.to === 'orders' || e.to === 'payments').every((e) => e.from === stub.id)).toBe(true);
  });

  it('leaves the bird’s-eye (no root) view unchanged — no stubs, top-level nodes present', () => {
    const v = compileView(m(), {});
    expect(v.roots.map((r) => r.id).sort()).toEqual(['db', 'service']);
    expect(v.externals).toBeUndefined();
  });

  // platform ─contains→ analytics(jupyter), dashboard-api, postgres(appuser-db)
  // dashboard-api → jupyter, jupyter → appuser-db
  function nested(): DiagramModel {
    const b = model('nested-drill');
    const platform = b.node('platform', { type: 'system' });
    const analytics = b.node('analytics', { type: 'system' });
    const jupyter = b.node('jupyter', { type: 'service' });
    const dash = b.node('dashboard-api', { type: 'service' });
    const pg = b.node('postgres', { name: 'Postgres', type: 'system' });
    const appuser = b.node('appuser-db', { type: 'database' });
    platform.contains(analytics, dash, pg);
    analytics.contains(jupyter);
    pg.contains(appuser);
    b.relate(dash, jupyter, { kind: 'sync' });
    b.relate(jupyter, appuser, { kind: 'reads' });
    return b.toJSON();
  }

  it('represents an off-frame endpoint by its outermost ancestor OUTSIDE the drill root’s ancestor chain, not by a shared ancestor', () => {
    const v = compileView(nested(), { root: 'analytics' });
    const externals = v.roots.filter((r) => r.external !== undefined).map((r) => r.external).sort();
    // dashboard-api is a sibling → stands for itself; appuser-db rolls up to its
    // container Postgres; NEITHER may collapse into the shared ancestor `platform`
    expect(externals).toEqual(['dashboard-api', 'postgres']);
  });

  it('stub nodes inherit the represented node’s visual identity (type, color, shape, icon)', () => {
    const b = model('ghost-visuals');
    const platform = b.node('platform', { type: 'system' });
    const analytics = b.node('analytics', { type: 'system' });
    const jupyter = b.node('jupyter', { type: 'service' });
    const person = b.node('emp', {
      name: 'Employee',
      type: 'person',
      color: '#42a5f5',
      shape: '/library/shapes/person.svg',
      icon: 'user',
    });
    platform.contains(analytics);
    analytics.contains(jupyter);
    b.relate(person, jupyter, { kind: 'sync' });
    const v = compileView(b.toJSON(), { root: 'analytics' });
    const stub = v.roots.find((r) => r.external === 'emp')!;
    expect(stub).toBeDefined();
    expect(stub.node.name).toBe('Employee');
    expect(stub.node.type).toBe('person');
    expect(stub.node.color).toBe('#42a5f5');
    expect(stub.node.shape).toBe('/library/shapes/person.svg');
    expect(stub.node.icon).toBe('user');
  });

  it('skips relations whose off-frame endpoint is the drill root’s ancestor (frame relations)', () => {
    const b = model('frame-rel');
    const platform = b.node('platform', { type: 'system' });
    const analytics = b.node('analytics', { type: 'system' });
    const jupyter = b.node('jupyter', { type: 'service' });
    platform.contains(analytics);
    analytics.contains(jupyter);
    b.relate(platform, jupyter, { kind: 'sync' });
    const v = compileView(b.toJSON(), { root: 'analytics' });
    expect(v.roots.filter((r) => r.external !== undefined)).toEqual([]);
    expect(v.edges).toEqual([]);
  });

  it('uses a printable stub prefix so scope.ts stays a text (non-binary) source file', () => {
    // A NUL or other control byte in the prefix makes git and grep treat the whole
    // file as binary — no readable diffs, skipped by search. Keep every char printable.
    expect(EXTERNAL_STUB_PREFIX.length).toBeGreaterThan(0);
    for (const ch of EXTERNAL_STUB_PREFIX) {
      expect(ch.codePointAt(0)!).toBeGreaterThanOrEqual(0x20);
    }
  });
});
