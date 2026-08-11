import { describe, expect, it } from 'vitest';
import { model } from './builder';

describe('builder: nodes and containment', () => {
  it('builds nodes with free-form types', () => {
    const m = model('acme', { name: 'Acme' });
    m.node('users', { type: 'table', icon: 'postgres' });
    m.node('weird', { type: 'kafka-topic', name: 'Weird Topic' });

    const json = m.toJSON();
    expect(json.version).toBe(1);
    expect(json.id).toBe('acme');
    expect(json.name).toBe('Acme');
    expect(json.nodes).toEqual([
      { id: 'users', name: 'users', type: 'table', icon: 'postgres' },
      { id: 'weird', name: 'Weird Topic', type: 'kafka-topic' },
    ]);
  });

  it('records containment as a DAG, allowing multi-membership', () => {
    const m = model('acme');
    const users = m.node('users', { type: 'table' });
    const mail = m.node('mail-svc', { type: 'service' });
    const comms = m.node('communication', { type: 'system' });
    const iam = m.node('identity', { type: 'system' });

    comms.contains(mail, users);
    iam.contains(users);

    const json = m.toJSON();
    expect(json.containment).toEqual([
      { parent: 'communication', child: 'mail-svc' },
      { parent: 'communication', child: 'users' },
      { parent: 'identity', child: 'users' },
    ]);
  });

  it('deduplicates repeated contains() calls', () => {
    const m = model('acme');
    const a = m.node('a', { type: 't' });
    const b = m.node('b', { type: 't' });
    a.contains(b);
    a.contains(b);
    expect(m.toJSON().containment).toEqual([{ parent: 'a', child: 'b' }]);
  });

  it('passes key and include through node opts', () => {
    const m = model('t');
    m.node('db', { type: 'database', key: 'appuser-db' });
    m.node('perm', { type: 'system', include: 'https://x.example/perm.diagram.json' });
    const json = m.toJSON();
    expect(json.nodes[0]).toMatchObject({ key: 'appuser-db' });
    expect(json.nodes[1]).toMatchObject({ include: 'https://x.example/perm.diagram.json' });
  });

  it('creates a typeless node from bare opts', () => {
    const m = model('t');
    m.node('trust', { name: 'Trust' });
    m.node('backlog'); // opts omitted entirely
    const json = m.toJSON();
    expect(json.nodes[0]).toEqual({ id: 'trust', name: 'Trust' });
    expect('type' in json.nodes[0]!).toBe(false);
    expect(json.nodes[1]).toEqual({ id: 'backlog', name: 'backlog' });
  });
});

describe('builder: relations and layers', () => {
  it('adds relations with free-form kinds and auto ids', () => {
    const m = model('acme');
    const a = m.node('a', { type: 'service' });
    const b = m.node('b', { type: 'table' });
    m.relate(a, b, { kind: 'reads' });
    m.relate(a, b, { kind: 'writes', label: 'nightly sync' });

    expect(m.toJSON().relations).toEqual([
      { id: 'a->b#0', from: 'a', to: 'b', kind: 'reads' },
      { id: 'a->b#1', from: 'a', to: 'b', kind: 'writes', label: 'nightly sync' },
    ]);
  });

  it('supports self-loops', () => {
    const m = model('acme');
    const a = m.node('a', { type: 'service' });
    m.relate(a, a, { kind: 'retries' });
    expect(m.toJSON().relations).toEqual([{ id: 'a->a#0', from: 'a', to: 'a', kind: 'retries' }]);
  });

  it('declares layers and tags relations with them', () => {
    const m = model('acme');
    m.layer('hosting', { name: 'Hosting', tint: '#7c3aed' });
    const a = m.node('a', { type: 'service' });
    const k8s = m.node('k8s', { type: 'infra' });
    m.relate(a, k8s, { kind: 'hosted-on', layer: 'hosting' });

    const json = m.toJSON();
    expect(json.layers).toEqual([{ id: 'hosting', name: 'Hosting', tint: '#7c3aed' }]);
    expect(json.relations[0]).toMatchObject({ kind: 'hosted-on', layer: 'hosting' });
  });

  it('round-trips relation polarity/delay and plane notation', () => {
    const m = model('acme');
    const a = m.node('a', { type: 'service' });
    const b = m.node('b', { type: 'service' });
    m.relate(a, b, { kind: 'sync', polarity: '+', delay: true });
    m.plane('loops', { notation: 'causal-loop' });

    const json = m.toJSON();
    expect(json.relations[0]).toMatchObject({ kind: 'sync', polarity: '+', delay: true });
    expect(json.planes[0]).toMatchObject({ id: 'loops', notation: 'causal-loop' });
  });

  it('serializes node.plane and plane.hides', () => {
    const m = model('b');
    m.plane('infra', { name: 'Infra', hides: ['user'] });
    m.node('user', { type: 't' });
    m.node('aws', { type: 't', plane: 'infra' });
    const j = m.toJSON();
    expect(j.nodes.find((n) => n.id === 'aws')!.plane).toBe('infra');
    expect(j.planes.find((p) => p.id === 'infra')!.hides).toEqual(['user']);
  });
});

describe('m.table / m.fk', () => {
  it('m.table creates a db-table node carrying columns', () => {
    const m = model('d');
    m.table('accounts', { columns: [{ name: 'id', type: 'uuid', pk: true }] });
    const json = m.toJSON();
    const t = json.nodes.find((n) => n.id === 'accounts');
    expect(t?.type).toBe('db-table');
    expect(t?.columns).toEqual([{ name: 'id', type: 'uuid', pk: true }]);
  });

  it('m.fk defaults toColumn to the target PK and sets kind fk', () => {
    const m = model('d');
    const a = m.table('a', { columns: [{ name: 'id', pk: true }, { name: 'b_id', fk: true }] });
    const b = m.table('b', { columns: [{ name: 'id', pk: true }] });
    m.fk(a, 'b_id', b);
    const r = m.toJSON().relations[0];
    expect(r).toMatchObject({ from: 'a', to: 'b', kind: 'fk', fromColumn: 'b_id', toColumn: 'id' });
  });

  it('m.fk throws when the target table has no single PK and no explicit toColumn', () => {
    const m = model('d');
    const a = m.table('a', { columns: [{ name: 'id', pk: true }, { name: 'b_id', fk: true }] });
    const b = m.table('b', { columns: [{ name: 'x' }, { name: 'y' }] });
    expect(() => m.fk(a, 'b_id', b)).toThrow(/primary-key/);
  });
});

describe('legend', () => {
  it('omits legend unless declared', () => {
    const m = model('d');
    m.node('a');
    expect(m.toJSON().legend).toBeUndefined();
  });

  it('round-trips a declared legend', () => {
    const m = model('d');
    m.node('a');
    m.legend({ title: 'Key', position: 'top-left', show: ['kinds'], items: [{ label: 'Team A', color: '#f59e0b' }] });
    expect(m.toJSON().legend).toEqual({
      title: 'Key',
      position: 'top-left',
      show: ['kinds'],
      items: [{ label: 'Team A', color: '#f59e0b' }],
    });
  });

  it('treats a bare legend() as derived-sections-only', () => {
    const m = model('d');
    m.node('a');
    m.legend();
    expect(m.toJSON().legend).toEqual({});
  });
});
