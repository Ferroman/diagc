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

  it('node opts carry technology into the model', () => {
    const m = model('t');
    m.node('svc', { type: 'c4-container', technology: 'Go' });
    expect(m.toJSON().nodes.find((n) => n.id === 'svc')?.technology).toBe('Go');
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

describe('typeColors', () => {
  it('travels on the model when declared', () => {
    const m = model('m');
    m.node('a', { type: 'c4-person' });
    m.typeColors({ 'c4-person': '#c62828', '*': '#1565c0' });
    expect(m.toJSON().typeColors).toEqual({ 'c4-person': '#c62828', '*': '#1565c0' });
  });

  it('is absent when never declared', () => {
    const m = model('m');
    m.node('a', {});
    expect(m.toJSON().typeColors).toBeUndefined();
  });

  it('merges successive calls, last wins per key', () => {
    const m = model('m');
    m.node('a', {});
    m.typeColors({ '*': '#111111', 'c4-person': '#222222' });
    m.typeColors({ 'c4-person': '#333333' });
    expect(m.toJSON().typeColors).toEqual({ '*': '#111111', 'c4-person': '#333333' });
  });
});

describe('notation', () => {
  it('m.notation sets the model-level notation', () => {
    const m = model('m');
    m.node('a');
    m.notation('c4');
    expect(m.toJSON().notation).toBe('c4');
  });

  it('is absent when never declared', () => {
    const m = model('m');
    m.node('a');
    expect(m.toJSON().notation).toBeUndefined();
  });
});

describe('layerRules', () => {
  it('travels on the model, appending across calls', () => {
    const m = model('m');
    m.layer('http', {});
    m.layer('sql', {});
    m.node('a', {});
    m.layerRules([{ color: '#ef6c00', layer: 'http' }]);
    m.layerRules([{ kind: 'sql', layer: 'sql' }]);
    expect(m.toJSON().layerRules).toEqual([
      { color: '#ef6c00', layer: 'http' },
      { kind: 'sql', layer: 'sql' },
    ]);
  });

  it('is absent when never declared', () => {
    const m = model('m');
    m.node('a', {});
    expect(m.toJSON().layerRules).toBeUndefined();
  });

  it('rejects a rule naming an undeclared layer', () => {
    const m = model('m');
    m.node('a', {});
    m.layerRules([{ kind: 'sql', layer: 'nope' }]);
    expect(() => m.toJSON()).toThrow(/unknown layer 'nope'/);
  });
});

describe('builder: git graph DSL', () => {
  it('declares the git plane first and emits lanes, commits and links', () => {
    const m = model('g');
    const g = m.gitGraph();
    const master = g.branch('master', { name: 'Master', color: '#7ba7d9' });
    const nightly = g.branch('nightly');
    const v10 = master.commit('1.0');
    const n1 = nightly.commit({ from: v10 });
    const n2 = nightly.commit();
    const v20 = master.merge(n2, { tag: '2.0', gap: 2 });
    const json = m.toJSON();
    expect(json.planes).toEqual([{ id: 'git-graph', name: 'Git graph', notation: 'git-graph' }]);
    expect(json.nodes).toEqual([
      { id: 'master', name: 'Master', type: 'branch', color: '#7ba7d9' },
      { id: 'nightly', name: 'nightly', type: 'branch' },
      { id: 'master-1', name: '1.0', type: 'commit' },
      { id: 'nightly-1', name: '', type: 'commit' },
      { id: 'nightly-2', name: '', type: 'commit' },
      { id: 'master-2', name: '2.0', type: 'commit', metadata: { gap: 2 } },
    ]);
    expect(json.containment).toEqual([
      { parent: 'master', child: 'master-1' },
      { parent: 'nightly', child: 'nightly-1' },
      { parent: 'nightly', child: 'nightly-2' },
      { parent: 'master', child: 'master-2' },
    ]);
    expect(json.relations).toEqual([
      { id: 'master-1->nightly-1#0', from: 'master-1', to: 'nightly-1', kind: 'branch' },
      { id: 'nightly-1->nightly-2#0', from: 'nightly-1', to: 'nightly-2', kind: 'commit' },
      { id: 'nightly-2->master-2#0', from: 'nightly-2', to: 'master-2', kind: 'merge' },
      { id: 'master-1->master-2#0', from: 'master-1', to: 'master-2', kind: 'commit' },
    ]);
    expect(n1.id).toBe('nightly-1');
    expect(v20.branch).toBe(master);
  });

  it('a commit may name its id and colour, and is an ordinary NodeRef', () => {
    const m = model('g');
    const g = m.gitGraph();
    const master = g.branch('master');
    const v1 = master.commit({ id: 'v1', tag: '1.0', color: '#fff' });
    const note = m.node('note', { type: 'comment' });
    m.relate(v1, note, { kind: 'sync' });
    const json = m.toJSON();
    expect(json.nodes[1]).toEqual({ id: 'v1', name: '1.0', type: 'commit', color: '#fff' });
    expect(json.relations).toEqual([{ id: 'v1->note#0', from: 'v1', to: 'note', kind: 'sync' }]);
  });

  it('gitGraph options name the plane', () => {
    const m = model('g');
    m.gitGraph({ plane: 'history', name: 'History' });
    expect(m.toJSON().planes).toEqual([{ id: 'history', name: 'History', notation: 'git-graph' }]);
  });

  it('refuses a git plane that would not be the default plane, and a second git plane', () => {
    const m = model('g');
    m.plane('arch');
    expect(() => m.gitGraph()).toThrow('gitGraph() must come before plane()');
    const m2 = model('g2');
    m2.gitGraph();
    expect(() => m2.gitGraph()).toThrow('gitGraph() already declared');
  });

  it('refuses from on the same lane and merging a lane into itself', () => {
    const m = model('g');
    const g = m.gitGraph();
    const master = g.branch('master');
    const v1 = master.commit('1.0');
    expect(() => master.commit({ from: v1 })).toThrow('use commit() to continue a lane');
    expect(() => master.merge(v1)).toThrow('cannot merge a lane into itself');
  });
});

describe('activity', () => {
  it('activity() creates the frame; lane() nests a lane under it', () => {
    const m = model('d');
    const act = m.activity('flow', { name: 'Actors' });
    act.lane('orders', { name: 'Orders', color: '#f6d55c' });
    const j = m.toJSON();
    expect(j.nodes).toEqual([
      { id: 'flow', name: 'Actors', type: 'activity-frame' },
      { id: 'orders', name: 'Orders', type: 'activity-lane', color: '#f6d55c' },
    ]);
    expect(j.containment).toEqual([{ parent: 'flow', child: 'orders' }]);
  });

  it('element helpers create typed leaves inside the lane', () => {
    const m = model('d');
    const lane = m.activity('flow').lane('orders');
    lane.action('receive', 'Receive order', { color: '#eee' });
    lane.object('invoice', 'Invoice');
    lane.send('cancel', 'Order cancel request');
    lane.receive('sig', 'Cancel');
    lane.note('n1', 'a note');
    const j = m.toJSON();
    const types = new Map(j.nodes.map((n) => [n.id, n.type]));
    expect(types.get('receive')).toBe('activity-action');
    expect(types.get('invoice')).toBe('activity-object');
    expect(types.get('cancel')).toBe('activity-send');
    expect(types.get('sig')).toBe('activity-receive');
    expect(types.get('n1')).toBe('activity-note');
    expect(j.nodes.find((n) => n.id === 'receive')?.color).toBe('#eee');
    expect(j.containment.filter((e) => e.parent === 'orders')).toHaveLength(5);
  });

  it('auto-ids count per scope and kind: start, start-2; empty names', () => {
    const m = model('d');
    const lane = m.activity('flow').lane('l');
    const s1 = lane.start();
    const s2 = lane.start();
    const d = lane.decision();
    const b = lane.bar();
    const e = lane.end();
    const j = m.toJSON();
    expect([s1.id, s2.id, d.id, b.id, e.id]).toEqual(['l-start', 'l-start-2', 'l-decision', 'l-bar', 'l-end']);
    expect(j.nodes.find((n) => n.id === 'l-start')?.name).toBe('');
    const types = new Map(j.nodes.map((n) => [n.id, n.type]));
    expect(types.get('l-start')).toBe('activity-start');
    expect(types.get('l-decision')).toBe('activity-decision');
    expect(types.get('l-bar')).toBe('activity-bar');
    expect(types.get('l-end')).toBe('activity-end');
  });

  it('region() nests in the lane and hosts the same element helpers', () => {
    const m = model('d');
    const lane = m.activity('flow').lane('l');
    const region = lane.region(undefined, 'cancelable');
    region.action('a', 'Fill order');
    const j = m.toJSON();
    expect(j.nodes.find((n) => n.id === 'l-region')?.type).toBe('activity-region');
    expect(j.containment).toContainEqual({ parent: 'l', child: 'l-region' });
    expect(j.containment).toContainEqual({ parent: 'l-region', child: 'a' });
  });

  it('flow helpers emit the activity kinds with optional labels', () => {
    const m = model('d');
    const act = m.activity('flow');
    const lane = act.lane('l');
    const a = lane.action('a', 'A');
    const b = lane.action('b', 'B');
    act.flow(a, b, '[ok]').objectFlow(a, b).interrupt(a, b).noteLink(lane.note('n', 'x'), b);
    const kinds = m.toJSON().relations.map((r) => [r.kind, r.label]);
    expect(kinds).toEqual([
      ['control', '[ok]'],
      ['object-flow', undefined],
      ['interrupt', undefined],
      ['note-link', undefined],
    ]);
  });
});
