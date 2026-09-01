import { describe, expect, it } from 'vitest';
import { model } from './builder';
import { applyCommand, applyCommandWithResult, emptyLayout, layoutPlaneKey, type EditorState } from './commands';
import { emptyDrawings } from './drawings';
import { CommandError } from './mutate';

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
    const off = applyCommand(on, { type: 'set-diagram-notation', notation: null });
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
