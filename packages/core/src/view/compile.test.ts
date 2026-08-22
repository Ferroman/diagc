import { describe, expect, it } from 'vitest';
import { acmeModel } from './acme.fixture';
import { compileView } from './compile';
import { LEAF_SIZE, CONTAINER_PADDING, CONTAINER_HEADER } from '../index';

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
