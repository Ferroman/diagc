import { describe, expect, it } from 'vitest';
import { model } from './builder';
import {
  applyCommand,
  applyCommandWithResult,
  emptyLayout,
  layoutPlaneKey,
  openingPins,
  withEdgeLabelPlacements,
  type EditorState,
} from './commands';
import { emptyDrawings } from './drawings';
import { CommandError } from './mutate';
import { TM_FLOW_KIND, TM_PROCESS_TYPE, TM_STORE_TYPE } from './threat-model';
import type { DiagramModel, LayoutOverlay } from './types';

function state(): EditorState {
  const m = model('t');
  m.plane('arch').plane('flow', { containmentOf: 'arch' });
  const a = m.node('a', { type: 'service' });
  const sys = m.node('sys', { type: 'system' });
  sys.contains(a);
  return { model: m.toJSON(), layout: emptyLayout(), drawings: emptyDrawings() };
}

// Declares two real planes, 'default' and 'arch', so `layoutPlaneKey` resolves
// each to its own id (rather than 'default' falling back from a no-planes-declared
// model) and per-plane scoping is genuinely exercised.
function emptyState(): EditorState {
  const m = model('t');
  m.plane('default').plane('arch');
  return { model: m.toJSON(), layout: emptyLayout(), drawings: emptyDrawings() };
}

describe('applyCommand', () => {
  it('add-node with parent adds node and membership', () => {
    const s = applyCommand(state(), {
      type: 'add-node',
      node: { id: 'db', name: 'DB', type: 'database' },
      parent: { id: 'sys' },
    });
    expect(s.model.nodes.at(-1)?.id).toBe('db');
    expect(s.model.containment).toContainEqual({ parent: 'sys', child: 'db' });
  });

  it('add-node with parent.before/after slots the membership beside a sibling (child order = declaration order)', () => {
    const base = applyCommand(state(), { type: 'add-node', node: { id: 'b', name: 'B' }, parent: { id: 'sys' } });
    const kids = (s: typeof base) => s.model.containment.filter((e) => e.parent === 'sys').map((e) => e.child);
    expect(kids(base)).toEqual(['a', 'b']);
    const above = applyCommand(base, { type: 'add-node', node: { id: 'x', name: 'X' }, parent: { id: 'sys', before: 'b' } });
    expect(kids(above)).toEqual(['a', 'x', 'b']);
    const below = applyCommand(base, { type: 'add-node', node: { id: 'y', name: 'Y' }, parent: { id: 'sys', after: 'a' } });
    expect(kids(below)).toEqual(['a', 'y', 'b']);
  });

  it('add-node refuses a before/after sibling that is not a child of the parent', () => {
    expect(() =>
      applyCommand(state(), { type: 'add-node', node: { id: 'x', name: 'X' }, parent: { id: 'sys', before: 'nope' } }),
    ).toThrow(/not a child/);
  });

  it('preserves identity of the untouched half of the state', () => {
    const before = state();
    const afterModel = applyCommand(before, { type: 'rename-node', id: 'a', name: 'A!' });
    expect(afterModel.layout).toBe(before.layout);
    const afterLayout = applyCommand(before, { type: 'set-position', nodeId: 'a', x: 10, y: 20 });
    expect(afterLayout.model).toBe(before.model);
  });

  it('positions key by resolved containment plane (borrowed planes share)', () => {
    const before = state();
    expect(layoutPlaneKey(before.model, 'flow')).toBe('arch');
    const s = applyCommand(before, { type: 'set-position', plane: 'flow', nodeId: 'a', x: 5, y: 6 });
    expect(s.layout.planes['arch']).toEqual({ a: { x: 5, y: 6 } });
    const cleared = applyCommand(s, { type: 'clear-position', plane: 'arch', nodeId: 'a' });
    expect(cleared.layout.planes['arch']).toEqual({});
  });

  it('layoutPlaneKey falls back to default for plane-less models', () => {
    const m = model('p');
    m.node('x', { type: 't' });
    expect(layoutPlaneKey(m.toJSON())).toBe('default');
  });

  it('delete-node clears its positions in every plane', () => {
    let s = state();
    s = applyCommand(s, { type: 'set-position', plane: 'arch', nodeId: 'a', x: 1, y: 1 });
    s = applyCommand(s, { type: 'delete-node', id: 'a' });
    expect(s.layout.planes['arch']).toEqual({});
    expect(s.model.nodes.some((n) => n.id === 'a')).toBe(false);
  });

  it('set-size stores a plane-independent size; delete-node drops it', () => {
    const sized = applyCommand(state(), { type: 'set-size', nodeId: 'a', w: 200, h: 150 });
    expect(sized.layout.sizes).toEqual({ a: { w: 200, h: 150 } });
    // resize again overwrites
    const resized = applyCommand(sized, { type: 'set-size', nodeId: 'a', w: 80, h: 60 });
    expect(resized.layout.sizes?.['a']).toEqual({ w: 80, h: 60 });
    // delete-node cleans the size entry up like it cleans positions
    const deleted = applyCommand(resized, { type: 'delete-node', id: 'a' });
    expect(deleted.layout.sizes?.['a']).toBeUndefined();
  });

  it('delete-node cascade drops descendant positions and sizes too', () => {
    let s = state();
    s = applyCommand(s, { type: 'set-position', plane: 'arch', nodeId: 'a', x: 1, y: 1 });
    s = applyCommand(s, { type: 'set-size', nodeId: 'a', w: 10, h: 10 });
    s = applyCommand(s, { type: 'delete-node', id: 'sys', cascade: true });
    expect(s.model.nodes.some((n) => n.id === 'a')).toBe(false);
    expect(s.layout.planes['arch']).toEqual({});
    expect(s.layout.sizes?.['a']).toBeUndefined();
  });

  it('set-unfolded replaces the plane list (sorted, unique); an emptied list and map are dropped', () => {
    let s = applyCommand(state(), { type: 'set-unfolded', plane: 'arch', ids: ['sys', 'a', 'sys'] });
    expect(s.layout.unfolded).toEqual({ arch: ['a', 'sys'] });
    // a replace, not a merge: what is not named no longer opens unfolded
    s = applyCommand(s, { type: 'set-unfolded', plane: 'arch', ids: ['other'] });
    expect(s.layout.unfolded).toEqual({ arch: ['other'] });
    s = applyCommand(s, { type: 'set-unfolded', plane: 'arch', ids: [] });
    expect('unfolded' in s.layout).toBe(false);
  });

  it('openingPins reads a plane\'s unfolded list as expanded pins, by resolved plane key', () => {
    const s = applyCommand(state(), { type: 'set-unfolded', plane: 'arch', ids: ['sys'] });
    expect(openingPins(s.layout, s.model, 'arch')).toEqual({ sys: 'expanded' });
    expect(openingPins(s.layout, s.model, 'flow')).toEqual({ sys: 'expanded' }); // borrows arch's structure
    expect(openingPins(undefined, s.model, 'arch')).toEqual({});
  });

  it('delete-node drops it from the unfolded list, and the list with its last id', () => {
    let s = applyCommand(state(), { type: 'set-unfolded', plane: 'arch', ids: ['sys'] });
    s = applyCommand(s, { type: 'delete-node', id: 'sys', cascade: true });
    expect('unfolded' in s.layout).toBe(false);
  });

  it('delete-plane drops the deleted plane unfolded list', () => {
    const m = model('t');
    m.plane('arch').plane('infra');
    m.node('sys', { type: 'system' }).contains(m.node('a', { type: 'service' }), { plane: 'infra' });
    let s: EditorState = { model: m.toJSON(), layout: emptyLayout(), drawings: emptyDrawings() };
    s = applyCommand(s, { type: 'set-unfolded', plane: 'infra', ids: ['sys'] });
    s = applyCommand(s, { type: 'set-unfolded', plane: 'arch', ids: ['sys'] });
    s = applyCommand(s, { type: 'delete-plane', id: 'infra' });
    expect(s.layout.unfolded).toEqual({ arch: ['sys'] });
  });

  it('delete-plane removes its containment and drops its layout bucket', () => {
    const m = model('t');
    m.plane('arch').plane('infra');
    const a = m.node('a', { type: 'service' });
    const sys = m.node('sys', { type: 'system' });
    sys.contains(a, { plane: 'infra' });
    let s: EditorState = { model: m.toJSON(), layout: emptyLayout(), drawings: emptyDrawings() };
    s = applyCommand(s, { type: 'set-position', plane: 'infra', nodeId: 'a', x: 1, y: 1 });
    expect(s.layout.planes['infra']).toBeDefined();
    s = applyCommand(s, { type: 'delete-plane', id: 'infra' });
    expect(s.layout.planes['infra']).toBeUndefined();
    expect(s.model.containment.some((e) => e.plane === 'infra')).toBe(false);
  });

  it('clear-positions empties one plane', () => {
    let s = state();
    s = applyCommand(s, { type: 'set-position', nodeId: 'a', x: 1, y: 1 });
    s = applyCommand(s, { type: 'set-position', nodeId: 'sys', x: 2, y: 2 });
    s = applyCommand(s, { type: 'clear-positions' });
    expect(s.layout.planes[layoutPlaneKey(s.model)]).toEqual({});
  });

  it('set-positions bulk-merges pins into the resolved plane bucket', () => {
    let s = applyCommand(emptyState(), { type: 'set-position', nodeId: 'a', x: 1, y: 2 });
    s = applyCommand(s, { type: 'set-positions', positions: { b: { x: 3, y: 4 }, c: { x: 5, y: 6 } } });
    expect(s.layout.planes['default']).toEqual({ a: { x: 1, y: 2 }, b: { x: 3, y: 4 }, c: { x: 5, y: 6 } });
  });

  it('set-plane-layout toggles the per-plane manual flag on and off', () => {
    let s = applyCommand(emptyState(), { type: 'set-plane-layout', manual: true });
    expect(s.layout.manual).toEqual({ default: true });
    s = applyCommand(s, { type: 'set-plane-layout', manual: false });
    expect(s.layout.manual).toBeUndefined();
  });

  it('set-plane-layout scopes the flag to the named plane', () => {
    const s = applyCommand(emptyState(), { type: 'set-plane-layout', plane: 'arch', manual: true });
    expect(s.layout.manual).toEqual({ arch: true });
  });

  it('delete-plane drops the deleted plane manual flag', () => {
    let s = applyCommand(emptyState(), { type: 'set-plane-layout', plane: 'arch', manual: true });
    s = applyCommand(s, { type: 'delete-plane', id: 'arch' });
    expect(s.layout.manual).toBeUndefined();
  });

  it('set-layout-settings merges patches into the per-plane bucket', () => {
    let s = applyCommand(emptyState(), { type: 'set-layout-settings', patch: { algorithm: 'radial' } });
    expect(s.layout.settings).toEqual({ default: { algorithm: 'radial' } });
    // a second patch merges rather than replaces
    s = applyCommand(s, { type: 'set-layout-settings', patch: { direction: 'DOWN' } });
    expect(s.layout.settings).toEqual({ default: { algorithm: 'radial', direction: 'DOWN' } });
  });

  it('set-layout-settings clears a field set to undefined and drops emptied maps', () => {
    let s = applyCommand(emptyState(), { type: 'set-layout-settings', patch: { algorithm: 'force', spacing: 50 } });
    s = applyCommand(s, { type: 'set-layout-settings', patch: { spacing: undefined } });
    expect(s.layout.settings).toEqual({ default: { algorithm: 'force' } });
    // clearing the last field drops the whole settings map (mirrors manual)
    s = applyCommand(s, { type: 'set-layout-settings', patch: { algorithm: undefined } });
    expect(s.layout.settings).toBeUndefined();
  });

  it('set-layout-settings scopes to the named plane', () => {
    const s = applyCommand(emptyState(), {
      type: 'set-layout-settings',
      plane: 'arch',
      patch: { edgeRouting: 'orthogonal' },
    });
    expect(s.layout.settings).toEqual({ arch: { edgeRouting: 'orthogonal' } });
  });

  it('delete-plane drops the deleted plane layout settings', () => {
    let s = applyCommand(emptyState(), {
      type: 'set-layout-settings',
      plane: 'arch',
      patch: { algorithm: 'stress' },
    });
    s = applyCommand(s, { type: 'delete-plane', id: 'arch' });
    expect(s.layout.settings).toBeUndefined();
  });

  it('undo round-trip: applying then restoring the snapshot is exact', () => {
    const before = state();
    const after = applyCommand(before, { type: 'delete-node', id: 'a' });
    expect(after).not.toEqual(before);
    // the editor undoes by restoring the snapshot — identity must be intact
    expect(JSON.parse(JSON.stringify(before))).toEqual(state());
  });

  it('commands survive serialization', () => {
    const cmd = { type: 'add-relation', from: 'sys', to: 'a', opts: { kind: 'sync' } } as const;
    const s = applyCommand(state(), JSON.parse(JSON.stringify(cmd)));
    expect(s.model.relations.at(-1)).toMatchObject({ from: 'sys', to: 'a', kind: 'sync' });
  });

  it('applyCommandWithResult surfaces the new relation id', () => {
    const { state: s, relationId } = applyCommandWithResult(state(), {
      type: 'add-relation',
      from: 'sys',
      to: 'a',
      opts: { kind: 'sync' },
    });
    expect(relationId).toBe('sys->a#0');
    expect(s.model.relations.some((r) => r.id === relationId)).toBe(true);
    // non-relation commands carry no id
    expect(applyCommandWithResult(state(), { type: 'rename-node', id: 'a', name: 'A!' }).relationId).toBeUndefined();
  });

  it('throws CommandError on unknown command types and bad targets', () => {
    expect(() => applyCommand(state(), { type: 'rename-node', id: 'ghost', name: 'x' })).toThrowError(CommandError);
    expect(() =>
      applyCommand(state(), { type: 'nope' } as unknown as Parameters<typeof applyCommand>[1]),
    ).toThrowError(CommandError);
  });

  it('group-nodes nests members under the new node', () => {
    const m = model('g');
    m.node('a', { type: 'service' });
    m.node('b', { type: 'service' });
    const out = applyCommand(
      { model: m.toJSON(), layout: emptyLayout(), drawings: emptyDrawings() },
      { type: 'group-nodes', node: { id: 'grp', name: 'G' }, memberIds: ['a', 'b'] },
    ).model;
    expect(out.nodes.some((n) => n.id === 'grp')).toBe(true);
    expect(out.containment.filter((c) => c.parent === 'grp')).toHaveLength(2);
  });

  it('group-nodes clears the members and group positions so they re-layout', () => {
    const m = model('g');
    m.node('a', { type: 'service' });
    m.node('b', { type: 'service' });
    const base = m.toJSON();
    const key = layoutPlaneKey(base, undefined);
    const layout = {
      version: 1 as const,
      planes: { [key]: { a: { x: 500, y: 500 }, b: { x: 510, y: 505 }, other: { x: 1, y: 1 } } },
    };
    const out = applyCommand(
      { model: base, layout, drawings: emptyDrawings() },
      { type: 'group-nodes', node: { id: 'grp', name: 'G' }, memberIds: ['a', 'b'] },
    );
    expect(out.layout.planes[key]).toEqual({ other: { x: 1, y: 1 } }); // a, b (and grp) dropped; unrelated kept
    expect(out.model.containment.filter((c) => c.parent === 'grp')).toHaveLength(2);
  });

  it('applies set-node-plane-hidden', () => {
    const state = {
      model: {
        version: 1 as const, id: 'm', name: 'm',
        nodes: [{ id: 'a', name: 'a', type: 't' }],
        containment: [], relations: [], layers: [], planes: [{ id: 'p', name: 'p' }],
      },
      layout: { version: 1 as const, planes: {} },
      drawings: emptyDrawings(),
    };
    const next = applyCommand(state, { type: 'set-node-plane-hidden', nodeId: 'a', plane: 'p', hidden: true });
    expect(next.model.planes[0]!.hides).toEqual(['a']);
  });

  it('merge-layers folds sources into the target and leaves layout untouched', () => {
    const s0: EditorState = {
      model: {
        version: 1,
        id: 'd',
        name: 'd',
        nodes: [{ id: 'a', name: 'a', layer: 'ops' }],
        containment: [],
        relations: [],
        layers: [
          { id: 'flow', name: 'Flow' },
          { id: 'ops', name: 'Ops' },
        ],
        planes: [{ id: 'infra', name: 'Infra', layers: ['ops'] }],
      },
      layout: emptyLayout(),
      drawings: emptyDrawings(),
    };
    const s1 = applyCommand(s0, { type: 'merge-layers', sources: ['ops'], target: 'flow' });
    expect(s1.model.layers.map((l) => l.id)).toEqual(['flow']);
    expect(s1.model.nodes[0]?.layer).toBe('flow');
    expect(s1.model.planes[0]?.layers).toEqual(['flow']);
    expect(s1.layout).toBe(s0.layout); // layers carry no positions
  });

  it('delete-layer destroys tagged nodes and cleans their layout', () => {
    const s0: EditorState = {
      model: {
        version: 1,
        id: 'd',
        name: 'd',
        nodes: [
          { id: 'a', name: 'a', layer: 'ai' },
          { id: 'b', name: 'b' },
        ],
        containment: [],
        relations: [],
        layers: [{ id: 'ai', name: 'AI' }],
        planes: [{ id: 'p', name: 'p' }],
      },
      layout: { version: 1, planes: { p: { a: { x: 1, y: 2 }, b: { x: 3, y: 4 } } }, sizes: { a: { w: 5, h: 6 } } },
      drawings: emptyDrawings(),
    };
    const s1 = applyCommand(s0, { type: 'delete-layer', id: 'ai' });
    expect(s1.model.nodes.map((n) => n.id)).toEqual(['b']); // a destroyed
    expect(s1.layout.planes.p).toEqual({ b: { x: 3, y: 4 } }); // a's position cleaned
    expect(s1.layout.sizes).toEqual({}); // a's size cleaned
  });

  it('merge-layers with an omitted target untags to base and leaves layout untouched', () => {
    const s0: EditorState = {
      model: {
        version: 1,
        id: 'd',
        name: 'd',
        nodes: [{ id: 'a', name: 'a', layer: 'ops' }],
        containment: [],
        relations: [],
        layers: [{ id: 'ops', name: 'Ops' }],
        planes: [{ id: 'p', name: 'p', layers: ['ops'] }],
      },
      layout: emptyLayout(),
      drawings: emptyDrawings(),
    };
    const s1 = applyCommand(s0, { type: 'merge-layers', sources: ['ops'] });
    expect(s1.model.layers).toEqual([]);
    expect(s1.model.nodes[0]?.layer).toBeUndefined(); // untagged, not deleted
    expect(s1.model.planes[0]?.layers).toEqual([]);
    expect(s1.layout).toBe(s0.layout);
  });

  it('set-diagram-style pins and clears the model style', () => {
    const state: EditorState = {
      model: { version: 1, id: 'm', name: 'M', nodes: [], containment: [], relations: [], layers: [], planes: [] },
      layout: emptyLayout(),
      drawings: emptyDrawings(),
    };
    const pinned = applyCommand(state, { type: 'set-diagram-style', style: 'blueprint' });
    expect(pinned.model.style).toBe('blueprint');
    expect(pinned.layout).toBe(state.layout); // layout untouched
    const cleared = applyCommand(pinned, { type: 'set-diagram-style', style: null });
    expect('style' in cleared.model).toBe(false);
  });

  it('set-diagram-notation pins, replaces and clears the model notation', () => {
    const state: EditorState = {
      model: { version: 1, id: 'm', name: 'M', nodes: [], containment: [], relations: [], layers: [], planes: [] },
      layout: emptyLayout(),
      drawings: emptyDrawings(),
    };
    const on = applyCommand(state, { type: 'set-diagram-notation', notation: 'c4' });
    expect(on.model.notation).toBe('c4');
    expect(on.layout).toBe(state.layout); // layout untouched
    const replaced = applyCommand(on, { type: 'set-diagram-notation', notation: 'causal-loop' });
    expect(replaced.model.notation).toBe('causal-loop');
    const off = applyCommand(replaced, { type: 'set-diagram-notation', notation: null });
    expect('notation' in off.model).toBe(false);
  });

  it('set-diagram-notation rejects an unknown id', () => {
    const state: EditorState = {
      model: { version: 1, id: 'm', name: 'M', nodes: [], containment: [], relations: [], layers: [], planes: [] },
      layout: emptyLayout(),
      drawings: emptyDrawings(),
    };
    expect(() => applyCommand(state, { type: 'set-diagram-notation', notation: 'freeform' })).toThrow(CommandError);
  });

  it('sets and clears the diagram legend', () => {
    const m = model('d');
    m.node('a');
    const start = { model: m.toJSON(), layout: emptyLayout(), drawings: emptyDrawings() };
    const on = applyCommand(start, { type: 'set-diagram-legend', legend: { title: 'Key' } });
    expect(on.model.legend).toEqual({ title: 'Key' });
    const off = applyCommand(on, { type: 'set-diagram-legend', legend: null });
    expect('legend' in off.model).toBe(false);
  });

  it('routes set-table-columns', () => {
    const state: EditorState = { model: { version: 1, id: 'd', name: 'd',
      nodes: [{ id: 't', name: 't', type: 'db-table', columns: [] }],
      containment: [], relations: [], layers: [], planes: [] }, layout: emptyLayout(), drawings: emptyDrawings() };
    const next = applyCommand(state, { type: 'set-table-columns', id: 't', columns: [{ name: 'id', pk: true }] });
    expect(next.model.nodes[0]?.columns).toEqual([{ name: 'id', pk: true }]);
  });
});

describe('stroke commands', () => {
  const stroke = { id: 'k1', points: [0, 0, 10, 10] };

  it('add-stroke lands in the resolved plane bucket and leaves model/layout by reference', () => {
    const before = emptyState();
    const after = applyCommand(before, { type: 'add-stroke', plane: 'arch', stroke });
    expect(after.drawings.planes['arch']).toEqual([stroke]);
    expect(after.model).toBe(before.model);
    expect(after.layout).toBe(before.layout);
  });

  it('add-stroke without a plane uses the layout plane key', () => {
    const s = applyCommand(state(), { type: 'add-stroke', stroke });
    expect(s.drawings.planes[layoutPlaneKey(s.model)]).toEqual([stroke]);
  });

  it('delete-stroke removes it; unknown ids and duplicates are CommandErrors', () => {
    const s = applyCommand(emptyState(), { type: 'add-stroke', plane: 'arch', stroke });
    expect(() => applyCommand(s, { type: 'add-stroke', plane: 'arch', stroke })).toThrow(CommandError);
    const gone = applyCommand(s, { type: 'delete-stroke', plane: 'arch', id: 'k1' });
    expect(gone.drawings.planes['arch']).toBeUndefined();
    expect(() => applyCommand(gone, { type: 'delete-stroke', plane: 'arch', id: 'k1' })).toThrow(CommandError);
  });

  it('delete-plane prunes the plane bucket', () => {
    let s = applyCommand(emptyState(), { type: 'add-stroke', plane: 'arch', stroke });
    s = applyCommand(s, { type: 'add-stroke', plane: 'default', stroke });
    s = applyCommand(s, { type: 'delete-plane', id: 'arch' });
    expect(s.drawings.planes).toEqual({ default: [stroke] });
  });

  it('every non-stroke command passes drawings through by reference', () => {
    const before = applyCommand(state(), { type: 'add-stroke', stroke });
    const renamed = applyCommand(before, { type: 'rename-node', id: 'a', name: 'A!' });
    expect(renamed.drawings).toBe(before.drawings);
    const moved = applyCommand(before, { type: 'set-position', nodeId: 'a', x: 1, y: 2 });
    expect(moved.drawings).toBe(before.drawings);
    const { state: related } = applyCommandWithResult(before, {
      type: 'add-relation',
      from: 'a',
      to: 'a',
      opts: { kind: 'sync' },
    });
    expect(related.drawings).toBe(before.drawings);
  });
});

describe('batch', () => {
  it('applies its members in order and surfaces the last relation id', () => {
    const { state: s, relationId } = applyCommandWithResult(state(), {
      type: 'batch',
      commands: [
        { type: 'add-node', node: { id: 'db', name: 'DB', type: 'database' }, parent: { id: 'sys' } },
        { type: 'add-relation', from: 'a', to: 'db', opts: { kind: 'sync' } },
        { type: 'batch', commands: [{ type: 'rename-node', id: 'db', name: 'Orders DB' }] },
      ],
    });
    expect(s.model.nodes.at(-1)?.name).toBe('Orders DB');
    expect(s.model.containment).toContainEqual({ parent: 'sys', child: 'db' });
    expect(s.model.relations).toHaveLength(1);
    expect(relationId).toBe(s.model.relations[0]?.id);
  });

  it('is atomic: a failing member throws and the input state is what the caller still holds', () => {
    const before = state();
    expect(() =>
      applyCommand(before, {
        type: 'batch',
        commands: [
          { type: 'add-node', node: { id: 'db', name: 'DB', type: 'database' } },
          { type: 'add-node', node: { id: 'a', name: 'dup', type: 'service' } },
        ],
      }),
    ).toThrow(CommandError);
    expect(before.model.nodes.some((n) => n.id === 'db')).toBe(false);
  });

  it('an empty batch returns the same state object', () => {
    const before = state();
    expect(applyCommand(before, { type: 'batch', commands: [] })).toBe(before);
  });
});

describe('viewer label placements (LayoutOverlay.edgeLabels)', () => {
  function labelled(): EditorState {
    const m = model('l');
    const a = m.node('a', { type: 'service' });
    const b = m.node('b', { type: 'service' });
    m.relate(a, b, { kind: 'sync', label: 'calls' });
    m.relate(b, a, { kind: 'sync', label: 'replies' });
    const json = m.toJSON();
    const [calls, replies] = json.relations;
    const layout = withEdgeLabelPlacements(emptyLayout(), 'default', {
      [calls!.id]: { legacy: { t: 0.2, side: 'top' } },
      [replies!.id]: { legacy: { t: 0.8 } },
    });
    return { model: json, layout, drawings: emptyDrawings() };
  }

  it('merges into the plane bucket without touching other relations', () => {
    const s = labelled();
    const id = s.model.relations[0]!.id;
    const next = withEdgeLabelPlacements(s.layout, 'default', { [id]: { legacy: { t: 0.4 } } });
    expect(next.edgeLabels?.['default']?.[id]).toEqual({ legacy: { t: 0.4 } });
    expect(Object.keys(next.edgeLabels?.['default'] ?? {})).toHaveLength(2);
    expect(withEdgeLabelPlacements(s.layout, 'default', {})).toBe(s.layout);
  });

  it('deleting a relation drops its placements; the last one drops the field', () => {
    let s = labelled();
    const [calls, replies] = s.model.relations;
    s = applyCommand(s, { type: 'delete-relation', id: calls!.id });
    expect(Object.keys(s.layout.edgeLabels?.['default'] ?? {})).toEqual([replies!.id]);
    s = applyCommand(s, { type: 'delete-relation', id: replies!.id });
    expect('edgeLabels' in s.layout).toBe(false);
  });

  it('positioning a label in the MODEL drops the viewer override for it, and only for it', () => {
    let s = labelled();
    const [calls, replies] = s.model.relations;
    s = applyCommand(s, {
      type: 'update-relation',
      id: calls!.id,
      patch: { labels: [{ id: 'legacy', text: 'calls', t: 0.7, side: 'bottom' }] },
    });
    expect(s.layout.edgeLabels?.['default']?.[calls!.id]).toBeUndefined();
    expect(s.layout.edgeLabels?.['default']?.[replies!.id]).toEqual({ legacy: { t: 0.8 } });
  });

  it('an edit that leaves the label where it was keeps the override', () => {
    let s = labelled();
    const calls = s.model.relations[0]!;
    s = applyCommand(s, { type: 'update-relation', id: calls.id, patch: { description: 'unrelated' } });
    expect(s.layout.edgeLabels?.['default']?.[calls.id]).toEqual({ legacy: { t: 0.2, side: 'top' } });
  });
});

describe('threat commands', () => {
  function threatState(): EditorState {
    const m = model('t');
    const a = m.node('a', { type: TM_PROCESS_TYPE });
    const b = m.node('b', { type: TM_STORE_TYPE });
    m.relate(a, b, { kind: TM_FLOW_KIND });
    return { model: m.toJSON(), layout: emptyLayout(), drawings: emptyDrawings() };
  }
  /** the builder's synthesized id for the single a->b flow */
  const flowId = 'a->b#0';

  it('add-threat puts a finding on a node and on a flow, leaving the layout untouched', () => {
    const before = threatState();
    const onNode = applyCommand(before, {
      type: 'add-threat',
      target: { node: 'a' },
      threat: { id: 't1', category: 'E', title: 'Admin route' },
    });
    expect(onNode.model.nodes[0]?.threats).toEqual([{ id: 't1', category: 'E', title: 'Admin route' }]);
    expect(onNode.layout).toBe(before.layout);

    const onFlow = applyCommand(onNode, {
      type: 'add-threat',
      target: { relation: flowId },
      threat: { id: 't1', category: 'T', title: 'Tampering' },
    });
    expect(onFlow.model.relations[0]?.threats).toEqual([{ id: 't1', category: 'T', title: 'Tampering' }]);
    expect(onFlow.layout).toBe(before.layout);
  });

  it('update-threat patches and null-clears, undo-ably (the input model is untouched)', () => {
    const added = applyCommand(threatState(), {
      type: 'add-threat',
      target: { node: 'a' },
      threat: { id: 't1', category: 'S', title: 'Spoofing', severity: 'high' },
    });
    const next = applyCommand(added, {
      type: 'update-threat',
      target: { node: 'a' },
      id: 't1',
      patch: { status: 'mitigated', severity: null },
    });
    expect(next.model.nodes[0]?.threats).toEqual([
      { id: 't1', category: 'S', title: 'Spoofing', status: 'mitigated' },
    ]);
    expect(added.model.nodes[0]?.threats?.[0]?.severity).toBe('high');
    expect(next.layout).toBe(added.layout);
  });

  it('remove-threat drops it, and an unknown id is a CommandError', () => {
    const added = applyCommand(threatState(), {
      type: 'add-threat',
      target: { relation: flowId },
      threat: { id: 't1', category: 'I', title: 'Leak' },
    });
    const next = applyCommand(added, { type: 'remove-threat', target: { relation: flowId }, id: 't1' });
    expect(next.model.relations[0]?.threats).toBeUndefined();
    expect(next.layout).toBe(added.layout);
    expect(() =>
      applyCommand(next, { type: 'remove-threat', target: { relation: flowId }, id: 't1' }),
    ).toThrow(CommandError);
  });

  it('carries the three through applyCommandWithResult with no relation id', () => {
    const r = applyCommandWithResult(threatState(), {
      type: 'add-threat',
      target: { node: 'a' },
      threat: { id: 't1', category: 'R', title: 'No audit log' },
    });
    expect(r.relationId).toBeUndefined();
    expect(r.state.model.nodes[0]?.threats).toHaveLength(1);
  });
});

describe('threat notes (layout-only)', () => {
  /** the builder's synthesized id for the single a->b flow */
  const flowId = 'a->b#0';

  /** node `a` and flow `a->b#0`, each carrying one threat: the two elements a
   * note can hang off. Plane-less, so every key resolves to `default`. */
  function noteState(): EditorState {
    const m = model('t');
    const a = m.node('a', { type: TM_PROCESS_TYPE });
    const b = m.node('b', { type: TM_STORE_TYPE });
    m.relate(a, b, { kind: TM_FLOW_KIND });
    let s: EditorState = { model: m.toJSON(), layout: emptyLayout(), drawings: emptyDrawings() };
    s = applyCommand(s, { type: 'add-threat', target: { node: 'a' }, threat: { id: 't1', category: 'E', title: 'Admin route' } });
    s = applyCommand(s, { type: 'add-threat', target: { relation: flowId }, threat: { id: 't1', category: 'T', title: 'MITM' } });
    return s;
  }

  it('set-note-offset writes and clears the plane bucket', () => {
    const before = noteState();
    const key = layoutPlaneKey(before.model);
    const s1 = applyCommand(before, { type: 'set-note-offset', target: { node: 'a' }, offset: { dx: 10, dy: -5 } });
    expect(s1.layout.notes).toEqual({ [key]: { 'node:a': { dx: 10, dy: -5 } } });
    expect(s1.model).toBe(before.model); // model untouched — this is a picture, not a finding
    const s2 = applyCommand(s1, { type: 'set-note-offset', target: { node: 'a' }, offset: null });
    expect(s2.layout.notes).toBeUndefined(); // emptied bucket and map are omitted
  });

  it('set-note-offset scopes to the named plane and keeps the two namespaces apart', () => {
    let s = applyCommand(noteState(), { type: 'set-note-offset', target: { node: 'a' }, offset: { dx: 1, dy: 2 } });
    s = applyCommand(s, { type: 'set-note-offset', target: { relation: flowId }, offset: { dx: 3, dy: 4 } });
    expect(s.layout.notes?.['default']).toEqual({ 'node:a': { dx: 1, dy: 2 }, [`relation:${flowId}`]: { dx: 3, dy: 4 } });
  });

  it('set-note-open writes open: true, and clearing it prunes an offset-less entry', () => {
    const before = noteState();
    const key = layoutPlaneKey(before.model);
    const s1 = applyCommand(before, { type: 'set-note-open', target: { node: 'a' }, open: true });
    expect(s1.layout.notes).toEqual({ [key]: { 'node:a': { dx: 0, dy: 0, open: true } } });
    expect(s1.model).toBe(before.model);
    // closing a bubble that was never dragged leaves no trace in the file
    expect(applyCommand(s1, { type: 'set-note-open', target: { node: 'a' }, open: false }).layout.notes).toBeUndefined();
  });

  it('set-note-open keeps a dragged offset either way, and set-note-offset keeps open', () => {
    const key = layoutPlaneKey(noteState().model);
    let s = applyCommand(noteState(), { type: 'set-note-offset', target: { node: 'a' }, offset: { dx: 10, dy: 5 } });
    s = applyCommand(s, { type: 'set-note-open', target: { node: 'a' }, open: true });
    expect(s.layout.notes?.[key]?.['node:a']).toEqual({ dx: 10, dy: 5, open: true });
    s = applyCommand(s, { type: 'set-note-open', target: { node: 'a' }, open: false });
    expect(s.layout.notes?.[key]?.['node:a']).toEqual({ dx: 10, dy: 5 }); // closed: reopens where it was left
    s = applyCommand(s, { type: 'set-note-open', target: { node: 'a' }, open: true });
    // `null` = back to the automatic spot; the bubble stays open
    s = applyCommand(s, { type: 'set-note-offset', target: { node: 'a' }, offset: null });
    expect(s.layout.notes?.[key]?.['node:a']).toEqual({ dx: 0, dy: 0, open: true });
  });

  it('set-notes-open opens every threat-bearing element and closes them all again', () => {
    const before = noteState();
    const key = layoutPlaneKey(before.model);
    const s1 = applyCommand(before, { type: 'set-notes-open', open: true });
    expect(s1.layout.notes).toEqual({
      [key]: { 'node:a': { dx: 0, dy: 0, open: true }, [`relation:${flowId}`]: { dx: 0, dy: 0, open: true } },
    });
    // `b` has no threats, so it gets no entry
    expect(s1.layout.notes?.[key]?.['node:b']).toBeUndefined();
    const dragged = applyCommand(s1, { type: 'set-note-offset', target: { node: 'a' }, offset: { dx: 3, dy: 3 } });
    const s2 = applyCommand(dragged, { type: 'set-notes-open', open: false });
    // close-all keeps offsets and drops the rest
    expect(s2.layout.notes).toEqual({ [key]: { 'node:a': { dx: 3, dy: 3 } } });
  });

  it('set-notes-open scopes to the named plane', () => {
    const m = model('t');
    m.plane('p');
    const a = m.node('a', { type: TM_PROCESS_TYPE });
    m.node('sys', { type: 'system' }).contains(a, { plane: 'p' });
    const base: EditorState = { model: m.toJSON(), layout: emptyLayout(), drawings: emptyDrawings() };
    const withThreat = applyCommand(base, { type: 'add-threat', target: { node: 'a' }, threat: { id: 't1', category: 'E', title: 'Admin route' } });
    const s = applyCommand(withThreat, { type: 'set-notes-open', plane: 'p', open: true });
    expect(s.layout.notes).toEqual({ p: { 'node:a': { dx: 0, dy: 0, open: true } } });
  });

  it('prunes a note offset when its element loses its last threat or is deleted', () => {
    const before = noteState();
    const key = layoutPlaneKey(before.model);
    const s1 = applyCommand(before, { type: 'set-note-offset', target: { node: 'a' }, offset: { dx: 1, dy: 1 } });
    const s2 = applyCommand(s1, { type: 'set-note-offset', target: { relation: flowId }, offset: { dx: 2, dy: 2 } });

    const gone = applyCommand(s2, { type: 'remove-threat', target: { node: 'a' }, id: 't1' });
    expect(Object.keys(gone.layout.notes?.[key] ?? {})).toEqual([`relation:${flowId}`]);

    const del = applyCommand(s2, { type: 'delete-relation', id: flowId });
    expect(Object.keys(del.layout.notes?.[key] ?? {})).toEqual(['node:a']);

    const deleted = applyCommand(s2, { type: 'delete-node', id: 'a' });
    expect(deleted.layout.notes?.[key]?.['node:a']).toBeUndefined();

    // an untouched overlay keeps its identity (no needless re-render / re-save)
    const same = applyCommand(s2, { type: 'rename-node', id: 'a', name: 'A2' });
    expect(same.layout).toBe(s2.layout);
  });

  it('drops the notes map entirely when its last entry dies', () => {
    let s = applyCommand(noteState(), { type: 'set-note-offset', target: { node: 'a' }, offset: { dx: 1, dy: 1 } });
    s = applyCommand(s, { type: 'remove-threat', target: { node: 'a' }, id: 't1' });
    expect(s.layout.notes).toBeUndefined();
  });

  it('delete-plane drops the plane’s notes', () => {
    const m = model('t');
    m.plane('p');
    const a = m.node('a', { type: TM_PROCESS_TYPE });
    m.node('sys', { type: 'system' }).contains(a, { plane: 'p' });
    const base: EditorState = { model: m.toJSON(), layout: emptyLayout(), drawings: emptyDrawings() };
    const withThreat = applyCommand(base, {
      type: 'add-threat',
      target: { node: 'a' },
      threat: { id: 't1', category: 'E', title: 'Admin route' },
    });
    const s1 = applyCommand(withThreat, { type: 'set-note-offset', target: { node: 'a' }, plane: 'p', offset: { dx: 1, dy: 1 } });
    // both halves of the entry — the dragged offset and the open flag — so the
    // prune is proved against a full bucket, not just an offset
    const s2 = applyCommand(s1, { type: 'set-note-open', target: { node: 'a' }, plane: 'p', open: true });
    expect(s2.layout.notes).toEqual({ p: { 'node:a': { dx: 1, dy: 1, open: true } } });
    const s3 = applyCommand(s2, { type: 'delete-plane', id: 'p' });
    expect(s3.layout.notes).toBeUndefined();
  });
});

describe('note hygiene counts comments and links as bubble content', () => {
  /** the three reasons a bubble exists, one per node: a comment, a threat and a
   * link. Every one of them has a saved placement, so a prune that only knew
   * about threats would be caught here twice over. */
  function mixedState(): EditorState {
    const base: DiagramModel = {
      version: 1, id: 'd', name: 'd', layers: [], planes: [], containment: [],
      nodes: [
        { id: 'a', name: 'A', comments: [{ id: 'c1', text: 'Remark on A' }] },
        { id: 'b', name: 'B', threats: [{ id: 't1', category: 'S', title: 'Spoofed session' }] },
        { id: 'c', name: 'C', links: [{ label: 'Ticket', url: 'https://x/1' }] },
      ],
      relations: [{ id: 'r', from: 'a', to: 'b', kind: 'sync', comments: [{ id: 'c1', text: 'Remark on r' }] }],
    };
    const layout: LayoutOverlay = {
      ...emptyLayout(),
      notes: {
        [layoutPlaneKey(base)]: {
          'node:a': { dx: 40, dy: -20, open: true },
          'node:b': { dx: 1, dy: 2 },
          'node:c': { dx: 3, dy: 4, open: true },
          'relation:r': { dx: 5, dy: 6, open: true },
        },
      },
    };
    return { model: base, layout, drawings: emptyDrawings() };
  }

  it('keeps a comment-only and a link-only placement through an edit and a rename', () => {
    const s = mixedState();
    const key = layoutPlaneKey(s.model);
    const edited = applyCommand(s, { type: 'update-comment', target: { node: 'a' }, id: 'c1', patch: { text: 'Edited' } });
    expect(edited.layout.notes?.[key]?.['node:a']).toEqual({ dx: 40, dy: -20, open: true });
    expect(edited.layout.notes?.[key]?.['relation:r']).toEqual({ dx: 5, dy: 6, open: true });
    // nothing died, so the overlay keeps its identity — the same contract the
    // threat-only case above pins
    const renamed = applyCommand(s, { type: 'rename-node', id: 'a', name: 'A2' });
    expect(renamed.layout).toBe(s.layout);
    const detailed = applyCommand(s, { type: 'set-node-details', id: 'c', details: { color: '#123456' } });
    expect(detailed.layout.notes?.[key]?.['node:c']).toEqual({ dx: 3, dy: 4, open: true });
  });

  it('prunes a bubble once its last comment or link goes', () => {
    const s = mixedState();
    const key = layoutPlaneKey(s.model);
    const noComment = applyCommand(s, { type: 'remove-comment', target: { node: 'a' }, id: 'c1' });
    expect(noComment.layout.notes?.[key]?.['node:a']).toBeUndefined();
    expect(noComment.layout.notes?.[key]?.['node:b']).toEqual({ dx: 1, dy: 2 });
    const noLink = applyCommand(s, { type: 'set-node-details', id: 'c', details: { links: null } });
    expect(noLink.layout.notes?.[key]?.['node:c']).toBeUndefined();
  });
});

describe('comment commands', () => {
  function commentState(): EditorState {
    const base: DiagramModel = {
      version: 1, id: 'd', name: 'd', layers: [], planes: [], containment: [],
      nodes: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
      relations: [{ id: 'r', from: 'a', to: 'b', kind: 'sync' }],
    };
    return { model: base, layout: emptyLayout(), drawings: emptyDrawings() };
  }

  it('adds, updates (null clears), and removes on a node; the key disappears with the last comment', () => {
    let s = applyCommand(commentState(), {
      type: 'add-comment',
      target: { node: 'a' },
      comment: { id: 'c1', text: 'first', by: 'Ann' },
    });
    expect(s.model.nodes[0]?.comments).toEqual([{ id: 'c1', text: 'first', by: 'Ann' }]);
    s = applyCommand(s, {
      type: 'update-comment',
      target: { node: 'a' },
      id: 'c1',
      patch: { text: 'edited', by: null, at: '2026-09-22' },
    });
    expect(s.model.nodes[0]?.comments).toEqual([{ id: 'c1', text: 'edited', at: '2026-09-22' }]);
    s = applyCommand(s, { type: 'remove-comment', target: { node: 'a' }, id: 'c1' });
    expect('comments' in s.model.nodes[0]!).toBe(false);
  });

  it('works on a relation and leaves every sibling by reference', () => {
    const before = commentState();
    const s = applyCommand(before, {
      type: 'add-comment',
      target: { relation: 'r' },
      comment: { id: 'c1', text: 'x' },
    });
    expect(s.model.relations[0]?.comments).toEqual([{ id: 'c1', text: 'x' }]);
    expect(s.model.nodes).toBe(before.model.nodes);
  });

  it('rejects a duplicate id, an unknown comment, an unknown element, and an invalid date', () => {
    const s = applyCommand(commentState(), {
      type: 'add-comment',
      target: { node: 'a' },
      comment: { id: 'c1', text: 'x' },
    });
    expect(() =>
      applyCommand(s, { type: 'add-comment', target: { node: 'a' }, comment: { id: 'c1', text: 'y' } }),
    ).toThrow(/Duplicate comment/);
    expect(() =>
      applyCommand(s, { type: 'update-comment', target: { node: 'a' }, id: 'c9', patch: { text: 'z' } }),
    ).toThrow(/Unknown comment/);
    expect(() =>
      applyCommand(s, { type: 'remove-comment', target: { node: 'zz' }, id: 'c1' }),
    ).toThrow(/Unknown node/);
    expect(() =>
      applyCommand(s, { type: 'add-comment', target: { node: 'a' }, comment: { id: 'c2', text: 'y', at: '2026-02-30' } }),
    ).toThrow(/YYYY-MM-DD/);
    expect(() =>
      applyCommand(s, { type: 'update-comment', target: { node: 'a' }, id: 'c1', patch: { at: 'soon' } }),
    ).toThrow(/YYYY-MM-DD/);
  });

  it('sets and clears links through set-node-details', () => {
    let s = applyCommand(commentState(), {
      type: 'set-node-details',
      id: 'a',
      details: { links: [{ label: 'Doc', url: 'https://x' }] },
    });
    expect(s.model.nodes[0]?.links).toEqual([{ label: 'Doc', url: 'https://x' }]);
    s = applyCommand(s, { type: 'set-node-details', id: 'a', details: { links: null } });
    expect('links' in s.model.nodes[0]!).toBe(false);
  });

  it('an emptied links list drops the key too — a saved file never holds links: []', () => {
    // The rule mapList keeps for threats/comments, extended to the one list a
    // panel edits wholesale: a UI that removes the last row can send `[]`
    // without leaving an empty array behind in the document.
    let s = applyCommand(commentState(), {
      type: 'set-node-details',
      id: 'a',
      details: { links: [{ label: 'Doc', url: 'https://x' }] },
    });
    s = applyCommand(s, { type: 'set-node-details', id: 'a', details: { links: [] } });
    expect('links' in s.model.nodes[0]!).toBe(false);
  });
});

describe('set-plan-dates', () => {
  const withZone = (): EditorState => {
    const s = state();
    s.model = { ...s.model, nodes: [...s.model.nodes, { id: 'z', name: 'Z', type: 'plan-zone', metadata: { start: '2026-01-05', end: '2026-01-09', note: 'keep' } }] };
    return s;
  };
  it('writes the given keys into metadata and leaves the rest alone', () => {
    const s = applyCommand(withZone(), { type: 'set-plan-dates', id: 'z', dates: { end: '2026-01-16' } });
    expect(s.model.nodes.find((n) => n.id === 'z')?.metadata).toEqual({ start: '2026-01-05', end: '2026-01-16', note: 'keep' });
  });
  it('creates metadata on a node that had none', () => {
    const s0 = state();
    const s = applyCommand(s0, { type: 'set-plan-dates', id: 'a', dates: { at: '2026-02-02' } });
    expect(s.model.nodes.find((n) => n.id === 'a')?.metadata).toEqual({ at: '2026-02-02' });
  });
  it('rejects a value that is not a real date, and an unknown node', () => {
    expect(() => applyCommand(withZone(), { type: 'set-plan-dates', id: 'z', dates: { start: '2026-02-30' } })).toThrow(CommandError);
    expect(() => applyCommand(withZone(), { type: 'set-plan-dates', id: 'z', dates: { start: 'next week' } })).toThrow(/YYYY-MM-DD/);
    expect(() => applyCommand(withZone(), { type: 'set-plan-dates', id: 'nope', dates: { start: '2026-01-01' } })).toThrow(/nope/);
  });
  it('keeps the layout and the untouched nodes by identity', () => {
    const s0 = withZone();
    const s = applyCommand(s0, { type: 'set-plan-dates', id: 'z', dates: { start: '2026-01-06' } });
    expect(s.layout).toBe(s0.layout);
    expect(s.model.nodes[0]).toBe(s0.model.nodes[0]);
  });
});
