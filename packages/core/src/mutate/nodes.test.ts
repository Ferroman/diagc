import { describe, expect, it } from 'vitest';
import { model } from '../builder';
import { validate } from '../validate';
import { addNode, deleteNode, renameNode, setNodeDetails, setNodeRich, setTableColumns, uniqueNodeId } from './nodes';
import { setNodePlaneHidden } from './layers-and-planes';
import { CommandError } from '../command-error';
import type { Column, DiagramModel } from '../types';

function base(): DiagramModel {
  const m = model('t');
  m.layer('flow', { name: 'Flow', tint: '#0ea5e9' });
  m.plane('arch').plane('infra', { layers: ['flow'] });
  const a = m.node('a', { type: 'service' });
  const b = m.node('b', { type: 'service' });
  const sys = m.node('sys', { type: 'system' });
  sys.contains(a, b);
  m.relate(a, b, { kind: 'sync', label: 'call' });
  m.relate(a, b, { kind: 'flow', layer: 'flow' });
  return m.toJSON();
}

describe('node mutations', () => {
  it('never mutates its input', () => {
    const m = base();
    const snapshot = JSON.stringify(m);
    addNode(m, { id: 'x', name: 'x', type: 't' });
    deleteNode(m, 'a');
    expect(JSON.stringify(m)).toBe(snapshot);
  });

  it('generates unique slug ids', () => {
    const m = base();
    expect(uniqueNodeId(m, 'My Service!')).toBe('my-service');
    expect(uniqueNodeId(m, 'a')).toBe('a-2');
  });

  it('adds, renames and details nodes', () => {
    let m = addNode(base(), { id: 'x', name: 'X', type: 'db' });
    expect(m.nodes.at(-1)).toEqual({ id: 'x', name: 'X', type: 'db' });
    m = renameNode(m, 'x', 'X2');
    expect(m.nodes.at(-1)?.name).toBe('X2');
    m = setNodeDetails(m, 'x', { icon: 'postgres', metadata: { language: 'go' } });
    expect(m.nodes.at(-1)).toMatchObject({ icon: 'postgres', metadata: { language: 'go' } });
    m = setNodeDetails(m, 'x', { icon: null });
    expect(m.nodes.at(-1)?.icon).toBeUndefined();
    expect(() => addNode(m, { id: 'a', name: 'dup', type: 't' })).toThrowError(CommandError);
  });

  it('sets and clears link through node details', () => {
    const withLink = setNodeDetails(base(), 'a', { link: '[[Ops Runbook]]' });
    expect(withLink.nodes.find((n) => n.id === 'a')?.link).toBe('[[Ops Runbook]]');
    const cleared = setNodeDetails(withLink, 'a', { link: null });
    expect(cleared.nodes.find((n) => n.id === 'a')?.link).toBeUndefined();
  });

  it('delete-node cascades containment and relations', () => {
    const m = deleteNode(base(), 'a');
    expect(m.nodes.some((n) => n.id === 'a')).toBe(false);
    expect(m.containment.some((e) => e.child === 'a' || e.parent === 'a')).toBe(false);
    expect(m.relations).toEqual([]);
    expect(validate(m)).toEqual([]);
  });

  it('deleteNode prunes the deleted id from plane hides/hidesTree lists', () => {
    const m = base();
    m.planes = m.planes.map((p) => (p.id === 'infra' ? { ...p, hides: ['a', 'b'], hidesTree: ['a'] } : p));
    const next = deleteNode(m, 'a');
    const infra = next.planes.find((p) => p.id === 'infra');
    expect(infra?.hides).toEqual(['b']);
    expect(infra?.hidesTree).toBeUndefined();
  });

  it('assigns and clears a node layer, rejecting unknown layers', () => {
    let m = setNodeDetails(base(), 'a', { layer: 'flow' });
    expect(m.nodes.find((n) => n.id === 'a')?.layer).toBe('flow');
    m = setNodeDetails(m, 'a', { layer: null });
    expect(m.nodes.find((n) => n.id === 'a')?.layer).toBeUndefined();
    expect(() => setNodeDetails(base(), 'a', { layer: 'ghost' })).toThrowError(CommandError);
  });

  it('sets and clears a node image via details', () => {
    const withImage = setNodeDetails(base(), 'a', { image: 'a3f9c2d4e5f6.png' });
    expect(withImage.nodes.find((n) => n.id === 'a')?.image).toBe('a3f9c2d4e5f6.png');
    const cleared = setNodeDetails(withImage, 'a', { image: null });
    expect(cleared.nodes.find((n) => n.id === 'a')?.image).toBeUndefined();
  });

  it('sets and clears a node shape via details', () => {
    const withShape = setNodeDetails(base(), 'a', { shape: '/library/shapes/person.svg' });
    expect(withShape.nodes.find((n) => n.id === 'a')?.shape).toBe('/library/shapes/person.svg');
    const cleared = setNodeDetails(withShape, 'a', { shape: null });
    expect(cleared.nodes.find((n) => n.id === 'a')?.shape).toBeUndefined();
  });

  it('sets and clears a node text color via details', () => {
    const tinted = setNodeDetails(base(), 'a', { textColor: '#ff8800' });
    expect(tinted.nodes.find((n) => n.id === 'a')?.textColor).toBe('#ff8800');
    const cleared = setNodeDetails(tinted, 'a', { textColor: null });
    expect(cleared.nodes.find((n) => n.id === 'a')?.textColor).toBeUndefined();
  });

  it('sets and clears a node type via details', () => {
    const typed = setNodeDetails(base(), 'a', { type: 'database' });
    expect(typed.nodes.find((n) => n.id === 'a')?.type).toBe('database');
    const cleared = setNodeDetails(typed, 'a', { type: null });
    expect(cleared.nodes.find((n) => n.id === 'a')?.type).toBeUndefined();
  });

  it('sets and clears technology through node details', () => {
    const set = setNodeDetails(base(), 'a', { technology: 'Java/Spring' });
    expect(set.nodes.find((n) => n.id === 'a')?.technology).toBe('Java/Spring');
    const cleared = setNodeDetails(set, 'a', { technology: null });
    expect(cleared.nodes.find((n) => n.id === 'a')?.technology).toBeUndefined();
  });
});

describe('deleteNode cascade', () => {
  // frame > lane > act, plus a free-standing bystander related to act — the
  // activity-frame trap from the deferral ledger.
  function frameModel(): DiagramModel {
    const m = model('t');
    m.plane('other');
    const frame = m.node('frame', { type: 'activity-frame' });
    const lane = m.node('lane', { type: 'activity-lane' });
    const act = m.node('act', { type: 'action' });
    const by = m.node('by', { type: 'action' });
    frame.contains(lane);
    lane.contains(act);
    m.relate(act, by, { kind: 'control' });
    return m.toJSON();
  }

  it('destroys the transitive containment subtree with its relations', () => {
    const m = deleteNode(frameModel(), 'frame', true);
    expect(m.nodes.map((n) => n.id)).toEqual(['by']);
    expect(m.containment).toEqual([]);
    expect(m.relations).toEqual([]);
    expect(validate(m)).toEqual([]);
  });

  it('without cascade only severs, keeping the children', () => {
    const m = deleteNode(frameModel(), 'frame');
    expect(m.nodes.map((n) => n.id)).toEqual(['lane', 'act', 'by']);
    expect(m.relations).toHaveLength(1);
  });

  it('prunes every doomed id from plane hides lists', () => {
    const m = frameModel();
    m.planes = m.planes.map((p) => (p.id === 'other' ? { ...p, hides: ['act', 'by'], hidesTree: ['lane'] } : p));
    const next = deleteNode(m, 'frame', true);
    const other = next.planes.find((p) => p.id === 'other');
    expect(other?.hides).toEqual(['by']);
    expect(other?.hidesTree).toBeUndefined();
  });

  it('leaves an untouched list as written and in place', () => {
    const m = frameModel();
    m.planes = m.planes.map((p) => (p.id === 'other' ? { ...p, hidesTree: [], hides: ['act'] } : p));
    const other = deleteNode(m, 'frame', true).planes.find((p) => p.id === 'other');
    expect(other).toStrictEqual({ id: 'other', name: 'other', hidesTree: [] });
    expect(Object.keys(other!)).toEqual(['id', 'name', 'hidesTree']);
  });
});

describe('setNodeDetails plane', () => {
  const m = () => ({
    version: 1 as const,
    id: 'm',
    name: 'm',
    nodes: [{ id: 'a', name: 'a', type: 't' }],
    containment: [],
    relations: [],
    layers: [],
    planes: [{ id: 'p', name: 'p' }],
  });
  it('scopes a node to a plane and clears it back to shared', () => {
    const local = setNodeDetails(m(), 'a', { plane: 'p' });
    expect(local.nodes[0]!.plane).toBe('p');
    const shared = setNodeDetails(local, 'a', { plane: null });
    expect('plane' in shared.nodes[0]!).toBe(false);
  });

  it("scoping a node to a plane clears it from every plane's hides (dropping an emptied key)", () => {
    const hidden = setNodePlaneHidden(m(), 'a', 'p', true);
    expect(hidden.planes[0]!.hides).toEqual(['a']);
    const scoped = setNodeDetails(hidden, 'a', { plane: 'p' });
    expect(scoped.nodes[0]!.plane).toBe('p');
    expect('hides' in scoped.planes[0]!).toBe(false);
  });
});

describe('setNodeRich', () => {
  const base = (): DiagramModel => ({
    version: 1,
    id: 'd',
    name: 'd',
    nodes: [{ id: 'a', name: 'a' }],
    containment: [],
    relations: [],
    layers: [],
    planes: [],
  });
  it('sets rich and syncs name from runs', () => {
    const m = setNodeRich(base(), 'a', [{ text: 'Web ' }, { text: 'Server', bold: true }]);
    const n = m.nodes[0]!;
    expect(n.name).toBe('Web Server');
    expect(n.rich).toEqual([{ text: 'Web ' }, { text: 'Server', bold: true }]);
  });
  it('clears rich when the text collapses to a single unstyled run', () => {
    const seeded = setNodeRich(base(), 'a', [{ text: 'x', bold: true }]);
    const m = setNodeRich(seeded, 'a', [{ text: 'plain' }]);
    expect(m.nodes[0]!.name).toBe('plain');
    expect(m.nodes[0]!.rich).toBeUndefined();
  });
  it('normalizes runs (merges adjacent, drops empties)', () => {
    const m = setNodeRich(base(), 'a', [
      { text: 'a', bold: true },
      { text: '', bold: true },
      { text: 'b', bold: true },
    ]);
    expect(m.nodes[0]!.rich).toEqual([{ text: 'ab', bold: true }]);
  });
});

describe('renameNode clears rich', () => {
  it('drops stale rich runs on a plain rename', () => {
    const seeded = setNodeRich(
      {
        version: 1,
        id: 'd',
        name: 'd',
        nodes: [{ id: 'a', name: 'a' }],
        containment: [],
        relations: [],
        layers: [],
        planes: [],
      },
      'a',
      [{ text: 'x', bold: true }, { text: 'y' }],
    );
    expect(seeded.nodes[0]!.rich).toBeDefined();
    const renamed = renameNode(seeded, 'a', 'New');
    expect(renamed.nodes[0]!.name).toBe('New');
    expect(renamed.nodes[0]!.rich).toBeUndefined();
  });
});

describe('setNodeDetails align/scale', () => {
  const m0 = (): DiagramModel => ({
    version: 1,
    id: 'd',
    name: 'd',
    nodes: [{ id: 'a', name: 'a' }],
    containment: [],
    relations: [],
    layers: [],
    planes: [],
  });
  it('sets and clears textAlign and fontScale', () => {
    let m = setNodeDetails(m0(), 'a', { textAlign: 'center', fontScale: 'lg' });
    expect(m.nodes[0]!.textAlign).toBe('center');
    expect(m.nodes[0]!.fontScale).toBe('lg');
    m = setNodeDetails(m, 'a', { textAlign: null, fontScale: null });
    expect(m.nodes[0]!.textAlign).toBeUndefined();
    expect(m.nodes[0]!.fontScale).toBeUndefined();
  });
});

describe('setTableColumns', () => {
  const base = (): DiagramModel => ({
    version: 1,
    id: 'd',
    name: 'd',
    nodes: [{ id: 't', name: 't', type: 'db-table', columns: [{ name: 'id', pk: true }] }],
    containment: [],
    relations: [],
    layers: [],
    planes: [],
  });
  it('replaces the columns array', () => {
    const cols: Column[] = [
      { name: 'id', pk: true },
      { name: 'email', type: 'text' },
    ];
    expect(setTableColumns(base(), 't', cols).nodes[0]?.columns).toEqual(cols);
  });
  it('accepts duplicate names without throwing (validate catches them)', () => {
    expect(() => setTableColumns(base(), 't', [{ name: 'id' }, { name: 'id' }])).not.toThrow();
  });
  it('throws for an unknown node', () => {
    expect(() => setTableColumns(base(), 'nope', [])).toThrow(CommandError);
  });
  it('throws for a column on an unknown layer', () => {
    expect(() => setTableColumns(base(), 't', [{ name: 'flag', layer: 'ghost' }])).toThrow(CommandError);
  });
});
