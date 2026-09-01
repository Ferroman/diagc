import { describe, expect, it } from 'vitest';
import { model } from './builder';
import { relationLabels } from './labels';
import { validate } from './validate';
import {
  addContainment,
  addNode,
  addRelation,
  CommandError,
  deleteLayer,
  deleteNode,
  deletePlane,
  groupNodes,
  mergeLayers,
  removeContainment,
  renameNode,
  setDiagramLegend,
  setDiagramNotation,
  setDiagramStyle,
  setNodeDetails,
  setNodePlaneHidden,
  setNodeRich,
  uniqueNodeId,
  updateRelation,
  upsertLayer,
  upsertPlane,
  deleteRelation,
  setTableColumns,
} from './mutate';
import type { Column, DiagramModel } from './types';

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

describe('mutate', () => {
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

  it('delete-node cascades containment and relations', () => {
    const m = deleteNode(base(), 'a');
    expect(m.nodes.some((n) => n.id === 'a')).toBe(false);
    expect(m.containment.some((e) => e.child === 'a' || e.parent === 'a')).toBe(false);
    expect(m.relations).toEqual([]);
    expect(validate(m)).toEqual([]);
  });

  it('containment add/remove respects planes and rejects cycles', () => {
    let m = addContainment(base(), 'sys', 'a', 'infra'); // same pair, other plane: ok
    expect(m.containment.filter((e) => e.parent === 'sys' && e.child === 'a')).toHaveLength(2);
    m = addContainment(m, 'sys', 'a'); // dedupe in default plane
    expect(m.containment.filter((e) => e.parent === 'sys' && e.child === 'a' && e.plane === undefined)).toHaveLength(1);
    expect(() => addContainment(m, 'a', 'sys')).toThrowError(CommandError); // arch cycle
    const m2 = addContainment(base(), 'a', 'sys', 'infra'); // opposite direction in another plane: legal
    expect(validate(m2)).toEqual([]);
    const m3 = removeContainment(base(), 'sys', 'a');
    expect(m3.containment.some((e) => e.child === 'a' && e.plane === undefined)).toBe(false);
  });

  it('groupNodes adds the parent node and nests each member', () => {
    const grouped = groupNodes(base(), { id: 'grp', name: 'Dev work time' }, ['a', 'b']);
    expect(grouped.nodes.find((n) => n.id === 'grp')).toMatchObject({ id: 'grp', name: 'Dev work time' });
    expect(grouped.containment).toEqual(
      expect.arrayContaining([
        { parent: 'grp', child: 'a' },
        { parent: 'grp', child: 'b' },
      ]),
    );
  });

  it('groupNodes plane-tags the containment edges when a plane is given', () => {
    const grouped = groupNodes(base(), { id: 'grp', name: 'G', plane: 'infra' }, ['a'], 'infra');
    expect(grouped.containment).toEqual(
      expect.arrayContaining([{ parent: 'grp', child: 'a', plane: 'infra' }]),
    );
  });

  it('groupNodes rejects an unknown member (and does not half-apply)', () => {
    expect(() => groupNodes(base(), { id: 'grp', name: 'G' }, ['a', 'nope'])).toThrow(CommandError);
  });

  it('groupNodes rejects a duplicate parent id', () => {
    expect(() => groupNodes(base(), { id: 'a', name: 'G' }, ['b'])).toThrow(CommandError);
  });

  it('relations follow the builder id convention and patch with null-clears', () => {
    const { model: m, id } = addRelation(base(), 'a', 'b', { kind: 'reads' });
    expect(id).toBe('a->b#2'); // two a->b relations already exist
    const m2 = updateRelation(m, id, { label: 'hot', kind: 'writes' });
    expect(m2.relations.at(-1)).toMatchObject({ kind: 'writes', label: 'hot' });
    const m3 = updateRelation(m2, id, { label: null });
    expect(m3.relations.at(-1)?.label).toBeUndefined();
    const m4 = updateRelation(m3, id, { style: { shape: 'straight', end: 'dot' } });
    expect(m4.relations.at(-1)?.style).toEqual({ shape: 'straight', end: 'dot' });
    const m5 = updateRelation(m4, id, { style: null });
    expect(m5.relations.at(-1)?.style).toBeUndefined();
    expect(deleteRelation(m5, id).relations).toHaveLength(2);
    expect(() => deleteRelation(m5, 'nope')).toThrowError(CommandError);
  });

  it('updateRelation sets and null-clears labels', () => {
    const labels = [{ id: 'l1', text: 'x', t: 0.2, side: 'bottom' as const }];
    const { model: m, id } = addRelation(base(), 'a', 'b', { kind: 'reads' });
    const withLabels = updateRelation(m, id, { labels });
    expect(withLabels.relations.find((r) => r.id === id)?.labels).toEqual(labels);
    const cleared = updateRelation(withLabels, id, { labels: null });
    expect(cleared.relations.find((r) => r.id === id)?.labels).toBeUndefined();
  });

  it('updateRelation clears the legacy label whenever a patch touches labels', () => {
    const { model: m, id } = addRelation(base(), 'a', 'b', { kind: 'reads', label: 'events' });

    // Removing the last label must truly remove it, not leave a legacy `label`
    // for relationLabels() to resurrect on the next render.
    const removed = updateRelation(m, id, { labels: null });
    const removedRel = removed.relations.find((r) => r.id === id)!;
    expect(relationLabels(removedRel)).toEqual([]);
    expect(removedRel.label).toBeUndefined();

    // Setting new labels must drop the now-redundant legacy `label` too.
    const newLabels = [{ id: 'l1', text: 'foo', t: 0.5, side: 'center' as const }];
    const relabeled = updateRelation(m, id, { labels: newLabels });
    const relabeledRel = relabeled.relations.find((r) => r.id === id)!;
    expect(relabeledRel.label).toBeUndefined();
    expect(relabeledRel.labels).toEqual(newLabels);

    // A patch that never touches labels must leave the legacy `label` alone.
    const untouched = updateRelation(m, id, { kind: 'writes' });
    const untouchedRel = untouched.relations.find((r) => r.id === id)!;
    expect(untouchedRel.label).toBe('events');
  });

  it('creates a relation pre-pinned to the gesture sides via opts.style', () => {
    const { model: m, id } = addRelation(base(), 'a', 'b', {
      kind: 'reads',
      style: { fromSide: 'right', toSide: 'top' },
    });
    expect(m.relations.find((r) => r.id === id)?.style).toEqual({ fromSide: 'right', toSide: 'top' });
    expect(validate(m)).toEqual([]);
  });

  it('patches polarity and delay on a relation, clearing with null', () => {
    const { model: m, id } = addRelation(base(), 'a', 'b', { kind: 'reads' });
    const withPolarity = updateRelation(m, id, { polarity: '-' });
    expect(withPolarity.relations.find((r) => r.id === id)?.polarity).toBe('-');
    const clearedPolarity = updateRelation(withPolarity, id, { polarity: null });
    expect(clearedPolarity.relations.find((r) => r.id === id)?.polarity).toBeUndefined();

    const withDelay = updateRelation(m, id, { delay: true });
    expect(withDelay.relations.find((r) => r.id === id)?.delay).toBe(true);
    const clearedDelay = updateRelation(withDelay, id, { delay: null });
    expect(clearedDelay.relations.find((r) => r.id === id)?.delay).toBeUndefined();
  });

  it('upsertPlane validates notation against BUILTIN_NOTATIONS', () => {
    expect(() => upsertPlane(base(), { id: 'p', name: 'P', notation: 'bogus' })).toThrowError(CommandError);
    const m = upsertPlane(base(), { id: 'p', name: 'P', notation: 'causal-loop' });
    expect(m.planes.find((p) => p.id === 'p')?.notation).toBe('causal-loop');
  });

  it('moves relation endpoints (reconnect) and rejects unknown nodes', () => {
    const m = updateRelation(base(), 'a->b#0', { to: 'sys' });
    expect(m.relations.find((r) => r.id === 'a->b#0')).toMatchObject({ from: 'a', to: 'sys' });
    expect(() => updateRelation(base(), 'a->b#0', { to: 'ghost' })).toThrowError(CommandError);
  });

  it('reuses a freed suffix after a middle delete instead of colliding', () => {
    // base() has a->b#0 and a->b#1; drop #0 and re-add
    const afterDelete = deleteRelation(base(), 'a->b#0');
    const { model: m, id } = addRelation(afterDelete, 'a', 'b', { kind: 'reads' });
    expect(id).toBe('a->b#0'); // the freed slot, not a collision with the surviving #1
    const ids = m.relations.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length); // every relation id is unique
    // updateRelation resolves the new relation only, never the survivor
    const updated = updateRelation(m, id, { label: 'hot' });
    expect(updated.relations.filter((r) => r.label === 'hot')).toHaveLength(1);
  });

  it('assigns and clears a node layer, rejecting unknown layers', () => {
    let m = setNodeDetails(base(), 'a', { layer: 'flow' });
    expect(m.nodes.find((n) => n.id === 'a')?.layer).toBe('flow');
    m = setNodeDetails(m, 'a', { layer: null });
    expect(m.nodes.find((n) => n.id === 'a')?.layer).toBeUndefined();
    expect(() => setNodeDetails(base(), 'a', { layer: 'ghost' })).toThrowError(CommandError);
  });

  it('canonicalizes plane args in containment helpers', () => {
    // explicit first-plane id dedupes against the untagged edge
    const dedup = addContainment(base(), 'sys', 'a', 'arch');
    expect(dedup.containment.filter((e) => e.parent === 'sys' && e.child === 'a')).toHaveLength(1);
    expect(dedup.containment.find((e) => e.parent === 'sys' && e.child === 'a')?.plane).toBeUndefined();

    // a borrowed plane (containmentOf the first plane) lands on the base plane
    const borrowed = upsertPlane(base(), { id: 'flow-view', name: 'Flow', containmentOf: 'arch' });
    const onBorrow = addContainment(borrowed, 'a', 'b', 'flow-view');
    expect(onBorrow.containment.find((e) => e.parent === 'a' && e.child === 'b')?.plane).toBeUndefined();

    // removeContainment with the first-plane id removes the untagged edge
    const removed = removeContainment(base(), 'sys', 'a', 'arch');
    expect(removed.containment.some((e) => e.parent === 'sys' && e.child === 'a')).toBe(false);
  });

  it('deletePlane of the first plane removes untagged containment', () => {
    const m = deletePlane(base(), 'arch');
    expect(m.containment).toEqual([]); // untagged sys>a and sys>b were owned by 'arch'
    expect(validate(m)).toEqual([]);
  });

  it('upsertPlane rejects self-borrow and borrow chains', () => {
    expect(() => upsertPlane(base(), { id: 'p', name: 'P', containmentOf: 'p' })).toThrowError(CommandError);
    const borrower = upsertPlane(base(), { id: 'flow-view', name: 'Flow', containmentOf: 'arch' });
    expect(() =>
      upsertPlane(borrower, { id: 'chain', name: 'C', containmentOf: 'flow-view' }),
    ).toThrowError(CommandError);
  });

  it('plane upsert/delete with borrow protection', () => {
    let m = upsertPlane(base(), { id: 'flow-view', name: 'Flow', containmentOf: 'arch' });
    expect(m.planes.at(-1)?.id).toBe('flow-view');
    expect(() => deletePlane(m, 'arch')).toThrowError(CommandError); // borrowed
    m = deletePlane(m, 'flow-view');
    m = addContainment(m, 'sys', 'a', 'infra');
    m = deletePlane(m, 'infra');
    expect(m.containment.every((e) => e.plane !== 'infra')).toBe(true);
    expect(validate(m)).toEqual([]);
    const m2 = upsertLayer(base(), { id: 'flow', name: 'Data flow', tint: '#f00' });
    expect(m2.layers).toEqual([{ id: 'flow', name: 'Data flow', tint: '#f00' }]);
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

describe('deleteLayer (destructive)', () => {
  const delModel = (): DiagramModel => ({
    version: 1,
    id: 'd',
    name: 'd',
    nodes: [
      { id: 'box', name: 'box', layer: 'ai' }, // tagged container -> destroyed
      { id: 'child', name: 'child' }, // untagged child of box -> survives top-level
      { id: 'keep', name: 'keep' }, // untagged -> survives
    ],
    containment: [{ parent: 'box', child: 'child' }],
    relations: [
      { id: 'r-tagged', from: 'keep', to: 'box', kind: 'sync', layer: 'ai' }, // tagged -> gone
      { id: 'r-touch', from: 'box', to: 'keep', kind: 'sync' }, // touches doomed box -> gone
      { id: 'r-safe', from: 'keep', to: 'child', kind: 'sync' }, // survives
    ],
    layers: [
      { id: 'ai', name: 'AI' },
      { id: 'ops', name: 'Ops' },
    ],
    planes: [{ id: 'p', name: 'p', layers: ['ai', 'ops'] }],
  });

  it('destroys tagged nodes and relations, keeping untagged content', () => {
    const m = deleteLayer(delModel(), 'ai');
    expect(m.nodes.map((n) => n.id).sort()).toEqual(['child', 'keep']); // box gone
    expect(m.relations.map((r) => r.id)).toEqual(['r-safe']); // r-tagged + r-touch gone
    expect(validate(m)).toEqual([]); // the model stays valid
  });

  it('strips destroyed nodes from a plane hides list, keeping the model valid', () => {
    const m0: DiagramModel = {
      version: 1,
      id: 'd',
      name: 'd',
      nodes: [{ id: 'x', name: 'x', layer: 'ai' }], // shared (no plane) + tagged to 'ai'
      containment: [],
      relations: [],
      layers: [{ id: 'ai', name: 'AI' }],
      planes: [{ id: 'p', name: 'p', hides: ['x'] }],
    };
    const m = deleteLayer(m0, 'ai');
    expect(m.planes.find((pl) => pl.id === 'p')?.hides ?? []).toEqual([]);
    expect(validate(m)).toEqual([]);
  });

  it('severs the destroyed container, leaving its untagged child top-level (option A)', () => {
    const m = deleteLayer(delModel(), 'ai');
    expect(m.nodes.find((n) => n.id === 'child')).toBeDefined();
    expect(m.containment).toEqual([]); // box>child edge removed, child not deleted
  });

  it('removes the layer and its plane presets, leaving siblings', () => {
    const m = deleteLayer(delModel(), 'ai');
    expect(m.layers.map((l) => l.id)).toEqual(['ops']);
    expect(m.planes.find((p) => p.id === 'p')?.layers).toEqual(['ops']);
  });

  it('throws on an unknown layer and does not mutate its input', () => {
    expect(() => deleteLayer(delModel(), 'ghost')).toThrowError(CommandError);
    const m0 = delModel();
    const snapshot = JSON.parse(JSON.stringify(m0));
    deleteLayer(m0, 'ai');
    expect(m0).toEqual(snapshot);
  });
});

describe('setNodePlaneHidden', () => {
  const base = () => ({
    version: 1 as const, id: 'm', name: 'm',
    nodes: [{ id: 'a', name: 'a', type: 't' }],
    containment: [], relations: [], layers: [],
    planes: [{ id: 'p', name: 'p' }],
  });

  it('adds a shared node to a plane\'s hides', () => {
    const next = setNodePlaneHidden(base(), 'a', 'p', true);
    expect(next.planes[0]!.hides).toEqual(['a']);
  });

  it('removes it and drops an emptied hides array', () => {
    const hidden = setNodePlaneHidden(base(), 'a', 'p', true);
    const shown = setNodePlaneHidden(hidden, 'a', 'p', false);
    expect('hides' in shown.planes[0]!).toBe(false);
  });

  it('is idempotent on repeated hide', () => {
    const once = setNodePlaneHidden(base(), 'a', 'p', true);
    const twice = setNodePlaneHidden(once, 'a', 'p', true);
    expect(twice.planes[0]!.hides).toEqual(['a']);
  });

  it('refuses to hide a node already scoped to a plane', () => {
    const m = { ...base(), nodes: [{ id: 'a', name: 'a', type: 't', plane: 'p' }] };
    expect(setNodePlaneHidden(m, 'a', 'p', true).planes[0]!.hides).toBeUndefined();
  });
});

describe('setNodeDetails plane', () => {
  const m = () => ({
    version: 1 as const, id: 'm', name: 'm',
    nodes: [{ id: 'a', name: 'a', type: 't' }],
    containment: [], relations: [], layers: [], planes: [{ id: 'p', name: 'p' }],
  });
  it('scopes a node to a plane and clears it back to shared', () => {
    const local = setNodeDetails(m(), 'a', { plane: 'p' });
    expect(local.nodes[0]!.plane).toBe('p');
    const shared = setNodeDetails(local, 'a', { plane: null });
    expect('plane' in shared.nodes[0]!).toBe(false);
  });

  it('scoping a node to a plane clears it from every plane\'s hides (dropping an emptied key)', () => {
    const hidden = setNodePlaneHidden(m(), 'a', 'p', true);
    expect(hidden.planes[0]!.hides).toEqual(['a']);
    const scoped = setNodeDetails(hidden, 'a', { plane: 'p' });
    expect(scoped.nodes[0]!.plane).toBe('p');
    expect('hides' in scoped.planes[0]!).toBe(false);
  });
});

describe('setNodeRich', () => {
  const base = (): DiagramModel => ({
    version: 1, id: 'd', name: 'd', nodes: [{ id: 'a', name: 'a' }],
    containment: [], relations: [], layers: [], planes: [],
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
    const m = setNodeRich(base(), 'a', [{ text: 'a', bold: true }, { text: '', bold: true }, { text: 'b', bold: true }]);
    expect(m.nodes[0]!.rich).toEqual([{ text: 'ab', bold: true }]);
  });
});

describe('renameNode clears rich', () => {
  it('drops stale rich runs on a plain rename', () => {
    const seeded = setNodeRich(
      { version: 1, id: 'd', name: 'd', nodes: [{ id: 'a', name: 'a' }], containment: [], relations: [], layers: [], planes: [] },
      'a', [{ text: 'x', bold: true }, { text: 'y' }],
    );
    expect(seeded.nodes[0]!.rich).toBeDefined();
    const renamed = renameNode(seeded, 'a', 'New');
    expect(renamed.nodes[0]!.name).toBe('New');
    expect(renamed.nodes[0]!.rich).toBeUndefined();
  });
});

describe('setNodeDetails align/scale', () => {
  const m0 = (): DiagramModel => ({ version: 1, id: 'd', name: 'd', nodes: [{ id: 'a', name: 'a' }], containment: [], relations: [], layers: [], planes: [] });
  it('sets and clears textAlign and fontScale', () => {
    let m = setNodeDetails(m0(), 'a', { textAlign: 'center', fontScale: 'lg' });
    expect(m.nodes[0]!.textAlign).toBe('center');
    expect(m.nodes[0]!.fontScale).toBe('lg');
    m = setNodeDetails(m, 'a', { textAlign: null, fontScale: null });
    expect(m.nodes[0]!.textAlign).toBeUndefined();
    expect(m.nodes[0]!.fontScale).toBeUndefined();
  });
});

describe('mergeLayers', () => {
  const base = (): DiagramModel => ({
    version: 1,
    id: 'd',
    name: 'd',
    nodes: [
      { id: 'a', name: 'a', layer: 'ops' }, // source-tagged
      { id: 'b', name: 'b' }, // base sheet
      { id: 'c', name: 'c', layer: 'flow' }, // already the target
    ],
    containment: [],
    relations: [
      { id: 'r1', from: 'a', to: 'b', kind: 'sync', layer: 'ops' },
      { id: 'r2', from: 'a', to: 'b', kind: 'sync' }, // base
    ],
    layers: [
      { id: 'flow', name: 'Flow', tint: '#0ea5e9' },
      { id: 'ops', name: 'Ops', tint: '#f59e0b' },
    ],
    planes: [
      { id: 'arch', name: 'Architecture' },
      { id: 'infra', name: 'Infra', layers: ['flow', 'ops'] },
    ],
  });

  it('folds a source layer into the target, retagging nodes and relations', () => {
    const m = mergeLayers(base(), ['ops'], 'flow');
    expect(m.nodes.find((n) => n.id === 'a')?.layer).toBe('flow');
    expect(m.relations.find((r) => r.id === 'r1')?.layer).toBe('flow');
    // untouched: base sheet and already-target elements
    expect(m.nodes.find((n) => n.id === 'b')?.layer).toBeUndefined();
    expect(m.nodes.find((n) => n.id === 'c')?.layer).toBe('flow');
    expect(m.relations.find((r) => r.id === 'r2')?.layer).toBeUndefined();
  });

  it('removes the source layer and preserves the target identity', () => {
    const m = mergeLayers(base(), ['ops'], 'flow');
    expect(m.layers).toEqual([{ id: 'flow', name: 'Flow', tint: '#0ea5e9' }]);
  });

  it('remaps and dedupes plane layer presets, collapsing had-both to one entry', () => {
    const m = mergeLayers(base(), ['ops'], 'flow');
    expect(m.planes.find((p) => p.id === 'infra')?.layers).toEqual(['flow']);
  });

  it('folds multiple sources into one target in a single call', () => {
    const src: DiagramModel = {
      ...base(),
      layers: [...base().layers, { id: 'net', name: 'Net' }],
      nodes: [...base().nodes, { id: 'd', name: 'd', layer: 'net' }],
    };
    const m = mergeLayers(src, ['ops', 'net'], 'flow');
    expect(m.layers.map((l) => l.id)).toEqual(['flow']);
    expect(m.nodes.find((n) => n.id === 'a')?.layer).toBe('flow');
    expect(m.nodes.find((n) => n.id === 'd')?.layer).toBe('flow');
  });

  it('throws on unknown target, unknown source, and merge into self', () => {
    expect(() => mergeLayers(base(), ['ops'], 'ghost')).toThrowError(CommandError);
    expect(() => mergeLayers(base(), ['ghost'], 'flow')).toThrowError(CommandError);
    expect(() => mergeLayers(base(), ['flow'], 'flow')).toThrowError(CommandError);
  });

  it('returns the model unchanged for an empty source list', () => {
    const m0 = base();
    expect(mergeLayers(m0, [], 'flow')).toBe(m0);
  });

  it('does not mutate its input', () => {
    const m0 = base();
    const snapshot = JSON.parse(JSON.stringify(m0));
    mergeLayers(m0, ['ops'], 'flow');
    expect(m0).toEqual(snapshot);
  });

  it('merges a source to the base sheet (omitted target) by untagging, not deleting', () => {
    const m = mergeLayers(base(), ['ops']);
    // node/relation survive, now untagged (base)
    expect(m.nodes.find((n) => n.id === 'a')?.layer).toBeUndefined();
    expect(m.nodes.some((n) => n.id === 'a')).toBe(true);
    expect(m.relations.find((r) => r.id === 'r1')?.layer).toBeUndefined();
    // source removed; plane preset filtered
    expect(m.layers.map((l) => l.id)).toEqual(['flow']);
    expect(m.planes.find((p) => p.id === 'infra')?.layers).toEqual(['flow']);
  });

  it('merges multiple sources to base, removing them all and clearing presets', () => {
    const m = mergeLayers(base(), ['ops', 'flow']);
    expect(m.layers).toEqual([]);
    expect(m.planes.find((p) => p.id === 'infra')?.layers).toEqual([]);
    expect(m.nodes.every((n) => n.layer === undefined)).toBe(true);
  });
});

describe('setDiagramStyle', () => {
  const base: DiagramModel = {
    version: 1, id: 'm', name: 'M', nodes: [], containment: [], relations: [], layers: [], planes: [],
  };
  it('pins a style id on the model', () => {
    expect(setDiagramStyle(base, 'hand-drawn').style).toBe('hand-drawn');
  });
  it('clearing with null removes the field entirely', () => {
    const cleared = setDiagramStyle(setDiagramStyle(base, 'sketch'), null);
    expect('style' in cleared).toBe(false);
  });
  it('does not mutate the input model', () => {
    setDiagramStyle(base, 'sketch');
    expect(base.style).toBeUndefined();
  });
});

describe('setDiagramNotation', () => {
  const base: DiagramModel = {
    version: 1, id: 'm', name: 'M', nodes: [], containment: [], relations: [], layers: [], planes: [],
  };
  it('pins a notation id on the model', () => {
    expect(setDiagramNotation(base, 'c4').notation).toBe('c4');
  });
  it('clearing with null removes the field entirely', () => {
    const cleared = setDiagramNotation(setDiagramNotation(base, 'c4'), null);
    expect('notation' in cleared).toBe(false);
  });
  it('does not mutate the input model', () => {
    setDiagramNotation(base, 'c4');
    expect(base.notation).toBeUndefined();
  });
  it('rejects an unknown notation id', () => {
    expect(() => setDiagramNotation(base, 'freeform')).toThrow(CommandError);
  });
});

describe('setTableColumns', () => {
  const base = (): DiagramModel => ({
    version: 1, id: 'd', name: 'd',
    nodes: [{ id: 't', name: 't', type: 'db-table', columns: [{ name: 'id', pk: true }] }],
    containment: [], relations: [], layers: [], planes: [],
  });
  it('replaces the columns array', () => {
    const cols: Column[] = [{ name: 'id', pk: true }, { name: 'email', type: 'text' }];
    expect(setTableColumns(base(), 't', cols).nodes[0]?.columns).toEqual(cols);
  });
  it('accepts duplicate names without throwing (validate catches them)', () => {
    expect(() => setTableColumns(base(), 't', [{ name: 'id' }, { name: 'id' }])).not.toThrow();
  });
  it('throws for an unknown node', () => {
    expect(() => setTableColumns(base(), 'nope', [])).toThrow(CommandError);
  });
});

describe('relation fk columns', () => {
  const m = (): DiagramModel => ({
    version: 1, id: 'd', name: 'd',
    nodes: [{ id: 'a', name: 'a' }, { id: 'b', name: 'b' }],
    containment: [], relations: [], layers: [], planes: [],
  });
  it('addRelation carries fromColumn/toColumn', () => {
    const r = addRelation(m(), 'a', 'b', { kind: 'fk', fromColumn: 'b_id', toColumn: 'id' }).model.relations[0];
    expect(r).toMatchObject({ fromColumn: 'b_id', toColumn: 'id' });
  });
  it('updateRelation sets then clears fromColumn', () => {
    const { model, id } = addRelation(m(), 'a', 'b', { kind: 'fk' });
    const set = updateRelation(model, id, { fromColumn: 'b_id' });
    expect(set.relations[0]?.fromColumn).toBe('b_id');
    const cleared = updateRelation(set, id, { fromColumn: null });
    expect(cleared.relations[0]?.fromColumn).toBeUndefined();
  });
});

describe('setDiagramLegend', () => {
  const base = () => {
    const m = model('d');
    m.node('a');
    return m.toJSON();
  };

  it('adds a legend', () => {
    expect(setDiagramLegend(base(), {}).legend).toEqual({});
  });

  it('removes the field entirely when cleared', () => {
    const withLegend = setDiagramLegend(base(), { title: 'Key' });
    const cleared = setDiagramLegend(withLegend, null);
    expect('legend' in cleared).toBe(false);
  });
});
