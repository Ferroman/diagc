import { describe, expect, it } from 'vitest';
import { model, NodeRef } from '../../builder/index';

describe('threatModel', () => {
  it('declares the notation model-wide, or on a named plane', () => {
    const a = model('a');
    a.threatModel();
    expect(a.toJSON().notation).toBe('threat-model');
    const b = model('b');
    b.threatModel({ plane: 'threats' });
    expect(b.toJSON().planes).toEqual([{ id: 'threats', name: 'Threat model', notation: 'threat-model' }]);
    expect(() => b.threatModel()).toThrow(/already declared/);
  });

  it('builds the four element types, flows with labels, and threats with synthesized ids', () => {
    const m = model('shop');
    const tm = m.threatModel();
    const user = tm.entity('user', 'Customer');
    const web = tm.process('web', 'Web app', { technology: 'Next.js' });
    const db = tm.store('db', 'Orders DB');
    tm.boundary('dmz', 'DMZ').contains(web);
    const login = tm
      .flow(user, web, 'HTTPS: credentials')
      .threat({ category: 'S', title: 'Credential stuffing', severity: 'high' });
    tm.flow(web, db, { description: 'SQL' });
    web
      .threat({ category: 'E', title: 'Admin route', status: 'mitigated', mitigation: 'RBAC' })
      .threat({ id: 'custom', category: 'D', title: 'Flood' });
    const json = m.toJSON();
    expect(json.nodes.map((n) => [n.id, n.type])).toEqual([
      ['user', 'tm-entity'],
      ['web', 'tm-process'],
      ['db', 'tm-store'],
      ['dmz', 'tm-boundary'],
    ]);
    expect(json.nodes[1]!.technology).toBe('Next.js');
    expect(json.containment).toEqual([{ parent: 'dmz', child: 'web' }]);
    expect(login.id).toBe('user->web#0');
    expect(json.relations).toEqual([
      {
        id: 'user->web#0',
        from: 'user',
        to: 'web',
        kind: 'data-flow',
        label: 'HTTPS: credentials',
        threats: [{ id: 't1', category: 'S', title: 'Credential stuffing', severity: 'high' }],
      },
      { id: 'web->db#0', from: 'web', to: 'db', kind: 'data-flow', description: 'SQL' },
    ]);
    expect(json.nodes[1]!.threats).toEqual([
      { id: 't1', category: 'E', title: 'Admin route', status: 'mitigated', mitigation: 'RBAC' },
      { id: 'custom', category: 'D', title: 'Flood' },
    ]);
  });

  it('accepts threats as node and relation opts, and threat() on any node ref', () => {
    const m = model('any');
    const a = m.node('a', { threats: [{ id: 'x', category: 'I', title: 'Leak' }] });
    const b = m.node('b');
    m.relate(a, b, { kind: 'reads', threats: [{ id: 'y', category: 'T', title: 'Tamper' }] });
    b.threat({ category: 'R', title: 'No audit log' });
    const json = m.toJSON();
    expect(json.nodes[0]!.threats?.[0]?.id).toBe('x');
    expect(json.nodes[1]!.threats).toEqual([{ id: 't1', category: 'R', title: 'No audit log' }]);
    expect(json.relations[0]!.threats?.[0]?.id).toBe('y');
  });

  it('rejects a duplicate id on the same element, and a ref to an undeclared one', () => {
    const m = model('dup');
    const a = m.node('a');
    a.threat({ id: 'x', category: 'S', title: 'One' });
    expect(() => a.threat({ id: 'x', category: 'S', title: 'Again' })).toThrow(/x/);
    expect(() => new NodeRef('zz', m).threat({ category: 'S', title: 'Nowhere' })).toThrow(/zz/);
  });
});
