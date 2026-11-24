import { describe, expect, it } from 'vitest';
import { model } from '../builder/index';
import { acmeModel } from './acme.fixture';
import { compileView } from './compile';
import { LEAF_SIZE, CONTAINER_PADDING, CONTAINER_HEADER } from './size';

const ids = (nodes: { id: string }[]) => nodes.map((n) => n.id);
const FULL_FOCUS = ['platform', 'communication', 'identity', 'billing', 'shared-postgres'];

describe('compileView on the acme fixture', () => {
  it('full focus: everything expands; shared postgres placed in identity, marked in billing', () => {
    const v = compileView(acmeModel(), { focus: FULL_FOCUS });
    expect(ids(v.roots)).toEqual(['platform', 'k8s-cluster']);
    const platform = v.roots[0]!;
    expect(platform.state).toBe('expanded');
    const identity = platform.children.find((c) => c.id === 'identity')!;
    const billing = platform.children.find((c) => c.id === 'billing')!;
    expect(ids(identity.children)).toEqual(['permission-svc', 'shared-postgres']);
    expect(billing.sharedMembers).toEqual(['shared-postgres']);
    // base edges only, all direct
    expect(v.edges.map((e) => e.id)).toEqual([
      'mail-svc=>permission-svc:',
      'mail-svc=>users-table:',
      'push-svc=>users-table:',
      'invoicing-svc=>invoices-table:',
      'invoicing-svc=>permission-svc:',
    ]);
  });

  it('focus on platform only: systems fold, shared postgres promotes, edges aggregate', () => {
    const v = compileView(acmeModel(), { focus: ['platform'] });
    expect(v.lod).toMatchObject({
      platform: 'expanded',
      communication: 'collapsed',
      identity: 'collapsed',
      billing: 'collapsed',
      'shared-postgres': 'collapsed',
    });
    const platform = v.roots[0]!;
    const pg = platform.children.find((c) => c.id === 'shared-postgres')!;
    expect(pg.promoted).toBe(true);
    expect(v.edges).toEqual([
      expect.objectContaining({
        id: 'communication=>identity:',
        kind: 'sync',
        labels: [{ id: 'legacy', text: 'authz check', t: 0.5, side: 'center' }],
      }),
      expect.objectContaining({ id: 'communication=>shared-postgres:', kind: 'reads', label: '2 relations' }),
      expect.objectContaining({ id: 'billing=>shared-postgres:', kind: 'writes' }),
      expect.objectContaining({ id: 'billing=>identity:', kind: 'async' }),
    ]);
  });

  it('no focus: only top level remains; hosting layer aggregates onto platform', () => {
    const base = compileView(acmeModel(), {});
    expect(ids(base.roots)).toEqual(['platform', 'k8s-cluster']);
    expect(base.roots[0]?.state).toBe('collapsed');
    expect(base.edges).toEqual([]);
    const hosting = compileView(acmeModel(), { activeLayers: ['hosting'] });
    expect(hosting.edges).toEqual([
      expect.objectContaining({
        id: 'platform=>k8s-cluster:hosting',
        kind: 'hosted-on',
        label: '3 relations',
        tint: '#7c3aed',
      }),
    ]);
  });

  it('pins collapse systems under focus; promoted postgres expands and shows tables', () => {
    const v = compileView(acmeModel(), {
      focus: ['platform', 'communication', 'shared-postgres'],
      pins: { identity: 'collapsed', billing: 'collapsed' },
    });
    const platform = v.roots[0]!;
    const pg = platform.children.find((c) => c.id === 'shared-postgres')!;
    expect(pg.promoted).toBe(true);
    expect(pg.state).toBe('expanded');
    expect(ids(pg.children)).toEqual(['users-table', 'invoices-table']);
    expect(v.edges).toEqual([
      expect.objectContaining({ id: 'mail-svc=>identity:', kind: 'sync' }),
      expect.objectContaining({ id: 'mail-svc=>users-table:', kind: 'reads' }),
      expect.objectContaining({ id: 'push-svc=>users-table:', kind: 'reads' }),
      expect.objectContaining({ id: 'billing=>invoices-table:', kind: 'writes' }),
      expect.objectContaining({ id: 'billing=>identity:', kind: 'async' }),
    ]);
  });

  it('pins beat focus in both directions', () => {
    const v = compileView(acmeModel(), {
      focus: ['platform', 'identity'],
      pins: { identity: 'collapsed', communication: 'expanded' },
    });
    expect(v.lod['identity']).toBe('collapsed');
    expect(v.lod['communication']).toBe('expanded');
    expect(v.lod['platform']).toBe('expanded');
  });

  it('exposes the estimator constants from the package index', () => {
    expect(LEAF_SIZE).toEqual({ width: 160, height: 80 });
    expect(CONTAINER_PADDING).toBe(24);
    expect(CONTAINER_HEADER).toBe(32);
  });
});

describe('compileView column layers', () => {
  const m = () => ({
    version: 1 as const,
    id: 'er',
    name: 'er',
    nodes: [
      {
        id: 't',
        name: 't',
        type: 'db-table',
        columns: [
          { name: 'id', pk: true },
          { name: 'flag', layer: 'flags' },
        ],
      },
      { id: 'u', name: 'u', type: 'db-table', columns: [{ name: 'id', pk: true }] },
    ],
    containment: [],
    relations: [],
    layers: [{ id: 'flags', name: 'Flags' }],
    planes: [],
  });

  it('hides a row whose layer is off, and marks only filtered tables', () => {
    const v = compileView(m(), {});
    expect(v.roots.find((r) => r.id === 't')?.columns).toEqual([{ name: 'id', pk: true }]);
    expect(v.roots.find((r) => r.id === 'u')?.columns).toBeUndefined();
  });

  it('draws the row while its layer is active, including via plane presets', () => {
    expect(compileView(m(), { activeLayers: ['flags'] }).roots.find((r) => r.id === 't')?.columns).toBeUndefined();
    const withPreset = { ...m(), planes: [{ id: 'p', name: 'p', layers: ['flags'] }] };
    expect(compileView(withPreset, {}).roots.find((r) => r.id === 't')?.columns).toBeUndefined();
  });
});

describe('compileView: parallel transitions', () => {
  const twoTransitions = (notation: 'state-machine' | 'c4') => {
    const m = model('t');
    m.plane('p', { notation });
    const a = m.node('a', { type: 'service' });
    const b = m.node('b', { type: 'service' });
    m.relate(a, b, { kind: 'transition', label: 'go' });
    m.relate(a, b, { kind: 'transition', label: 'stop' });
    return m.toJSON();
  };

  it('draws each as its own arrow on a state-machine plane', () => {
    const v = compileView(twoTransitions('state-machine'), {});
    expect(v.edges).toHaveLength(2);
    expect(v.layoutEdges).toHaveLength(2);
  });

  it('merges them on any other notation', () => {
    const v = compileView(twoTransitions('c4'), {});
    expect(v.edges).toHaveLength(1);
    expect(v.layoutEdges).toHaveLength(1);
  });
});

describe('compileView: a plan folds dependencies zone to zone', () => {
  /** gw ⊃ { stage, us } and db ⊃ { eu, dbus }, with stage → dbus and us → eu */
  const twoDeps = (plan: boolean) => {
    const m = model('t');
    const p = m.plan();
    const gw = p.zone('gw', { start: '2026-12-01', end: '2026-12-10' });
    const stage = gw.zone('stage', { start: '2026-12-01', end: '2026-12-03' });
    const us = gw.zone('us', { start: '2026-12-08', end: '2026-12-10' });
    const db = p.zone('db', { start: '2026-12-14', end: '2026-12-31' });
    const eu = db.zone('eu', { start: '2026-12-14', end: '2026-12-20' });
    const dbus = db.zone('dbus', { start: '2026-12-21', end: '2026-12-31' });
    m.relate(stage, dbus, { kind: 'depends' });
    m.relate(us, eu, { kind: 'depends' });
    const j = m.toJSON();
    return plan ? j : { ...j, planes: j.planes.map((pl) => ({ ...pl, notation: 'c4' })) };
  };
  const viewport = { plane: 'plan', focus: ['gw'] };

  it('one arrow from the open zone into the folded one, not one per row', () => {
    const v = compileView(twoDeps(true), viewport);
    expect(v.edges.map((e) => e.id)).toEqual(['gw=>db:']);
    expect(v.layoutEdges.map((e) => e.id)).toEqual(['gw=>db:']);
  });

  it('keeps the open rows on any other notation', () => {
    expect(compileView(twoDeps(false), viewport).edges.map((e) => e.id)).toEqual(['stage=>db:', 'us=>db:']);
  });
});
