import { describe, expect, it } from 'vitest';
import { model } from '../builder/index';
import { applyCommand, emptyLayout, type EditorCommand, type EditorState } from './index';
import { emptyDrawings } from '../drawings';
import { CommandError } from '../command-error';
import { layoutPlaneKey } from '../planes';
import { TM_FLOW_KIND, TM_PROCESS_TYPE, TM_STORE_TYPE } from '../notations/threat-model/threat-model';
import type { DiagramModel } from '../types';

/** The state a command leaves; most tests need nothing else. */
const apply = (state: EditorState, command: EditorCommand): EditorState => applyCommand(state, command).state;

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

describe('model commands', () => {
  it('add-node with parent adds node and membership', () => {
    const s = apply(state(), {
      type: 'add-node',
      node: { id: 'db', name: 'DB', type: 'database' },
      parent: { id: 'sys' },
    });
    expect(s.model.nodes.at(-1)?.id).toBe('db');
    expect(s.model.containment).toContainEqual({ parent: 'sys', child: 'db' });
  });

  it('add-node with parent.before/after slots the membership beside a sibling (child order = declaration order)', () => {
    const base = apply(state(), { type: 'add-node', node: { id: 'b', name: 'B' }, parent: { id: 'sys' } });
    const kids = (s: typeof base) => s.model.containment.filter((e) => e.parent === 'sys').map((e) => e.child);
    expect(kids(base)).toEqual(['a', 'b']);
    const above = apply(base, {
      type: 'add-node',
      node: { id: 'x', name: 'X' },
      parent: { id: 'sys', before: 'b' },
    });
    expect(kids(above)).toEqual(['a', 'x', 'b']);
    const below = apply(base, {
      type: 'add-node',
      node: { id: 'y', name: 'Y' },
      parent: { id: 'sys', after: 'a' },
    });
    expect(kids(below)).toEqual(['a', 'y', 'b']);
  });

  it('move-child restacks a child among its siblings', () => {
    const base = apply(state(), { type: 'add-node', node: { id: 'b', name: 'B' }, parent: { id: 'sys' } });
    const kids = (s: typeof base) => s.model.containment.filter((e) => e.parent === 'sys').map((e) => e.child);
    const up = apply(base, { type: 'move-child', parent: 'sys', child: 'b', offset: -1 });
    expect(kids(up)).toEqual(['b', 'a']);
    expect(kids(apply(up, { type: 'move-child', parent: 'sys', child: 'b', offset: 1 }))).toEqual(['a', 'b']);
  });

  it('add-node refuses a before/after sibling that is not a child of the parent', () => {
    expect(() =>
      apply(state(), { type: 'add-node', node: { id: 'x', name: 'X' }, parent: { id: 'sys', before: 'nope' } }),
    ).toThrow(/not a child/);
  });

  it('delete-node clears its positions in every plane', () => {
    let s = state();
    s = apply(s, { type: 'set-position', plane: 'arch', nodeId: 'a', x: 1, y: 1 });
    s = apply(s, { type: 'delete-node', id: 'a' });
    expect(s.layout.planes['arch']).toEqual({});
    expect(s.model.nodes.some((n) => n.id === 'a')).toBe(false);
  });

  it('set-size stores a plane-independent size; delete-node drops it', () => {
    const sized = apply(state(), { type: 'set-size', nodeId: 'a', w: 200, h: 150 });
    expect(sized.layout.sizes).toEqual({ a: { w: 200, h: 150 } });
    // resize again overwrites
    const resized = apply(sized, { type: 'set-size', nodeId: 'a', w: 80, h: 60 });
    expect(resized.layout.sizes?.['a']).toEqual({ w: 80, h: 60 });
    // delete-node cleans the size entry up like it cleans positions
    const deleted = apply(resized, { type: 'delete-node', id: 'a' });
    expect(deleted.layout.sizes?.['a']).toBeUndefined();
  });

  it('delete-node cascade drops descendant positions and sizes too', () => {
    let s = state();
    s = apply(s, { type: 'set-position', plane: 'arch', nodeId: 'a', x: 1, y: 1 });
    s = apply(s, { type: 'set-size', nodeId: 'a', w: 10, h: 10 });
    s = apply(s, { type: 'delete-node', id: 'sys', cascade: true });
    expect(s.model.nodes.some((n) => n.id === 'a')).toBe(false);
    expect(s.layout.planes['arch']).toEqual({});
    expect(s.layout.sizes?.['a']).toBeUndefined();
  });

  it('delete-node drops it from the unfolded list, and the list with its last id', () => {
    let s = apply(state(), { type: 'set-unfolded', plane: 'arch', ids: ['sys'] });
    s = apply(s, { type: 'delete-node', id: 'sys', cascade: true });
    expect('unfolded' in s.layout).toBe(false);
  });

  it('delete-plane drops the deleted plane unfolded list', () => {
    const m = model('t');
    m.plane('arch').plane('infra');
    m.node('sys', { type: 'system' }).contains(m.node('a', { type: 'service' }), { plane: 'infra' });
    let s: EditorState = { model: m.toJSON(), layout: emptyLayout(), drawings: emptyDrawings() };
    s = apply(s, { type: 'set-unfolded', plane: 'infra', ids: ['sys'] });
    s = apply(s, { type: 'set-unfolded', plane: 'arch', ids: ['sys'] });
    s = apply(s, { type: 'delete-plane', id: 'infra' });
    expect(s.layout.unfolded).toEqual({ arch: ['sys'] });
  });

  it('delete-plane removes its containment and drops its layout bucket', () => {
    const m = model('t');
    m.plane('arch').plane('infra');
    const a = m.node('a', { type: 'service' });
    const sys = m.node('sys', { type: 'system' });
    sys.contains(a, { plane: 'infra' });
    let s: EditorState = { model: m.toJSON(), layout: emptyLayout(), drawings: emptyDrawings() };
    s = apply(s, { type: 'set-position', plane: 'infra', nodeId: 'a', x: 1, y: 1 });
    expect(s.layout.planes['infra']).toBeDefined();
    s = apply(s, { type: 'delete-plane', id: 'infra' });
    expect(s.layout.planes['infra']).toBeUndefined();
    expect(s.model.containment.some((e) => e.plane === 'infra')).toBe(false);
  });

  it('delete-plane drops the deleted plane manual flag', () => {
    let s = apply(emptyState(), { type: 'set-plane-layout', plane: 'arch', manual: true });
    s = apply(s, { type: 'delete-plane', id: 'arch' });
    expect(s.layout.manual).toBeUndefined();
  });

  it('delete-plane drops the deleted plane layout settings', () => {
    let s = apply(emptyState(), {
      type: 'set-layout-settings',
      plane: 'arch',
      patch: { algorithm: 'stress' },
    });
    s = apply(s, { type: 'delete-plane', id: 'arch' });
    expect(s.layout.settings).toBeUndefined();
  });

  it('group-nodes nests members under the new node', () => {
    const m = model('g');
    m.node('a', { type: 'service' });
    m.node('b', { type: 'service' });
    const out = apply(
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
    const out = apply(
      { model: base, layout, drawings: emptyDrawings() },
      { type: 'group-nodes', node: { id: 'grp', name: 'G' }, memberIds: ['a', 'b'] },
    );
    expect(out.layout.planes[key]).toEqual({ other: { x: 1, y: 1 } }); // a, b (and grp) dropped; unrelated kept
    expect(out.model.containment.filter((c) => c.parent === 'grp')).toHaveLength(2);
  });

  it('applies set-node-plane-hidden', () => {
    const state = {
      model: {
        version: 1 as const,
        id: 'm',
        name: 'm',
        nodes: [{ id: 'a', name: 'a', type: 't' }],
        containment: [],
        relations: [],
        layers: [],
        planes: [{ id: 'p', name: 'p' }],
      },
      layout: { version: 1 as const, planes: {} },
      drawings: emptyDrawings(),
    };
    const next = apply(state, { type: 'set-node-plane-hidden', nodeId: 'a', plane: 'p', hidden: true });
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
    const s1 = apply(s0, { type: 'merge-layers', sources: ['ops'], target: 'flow' });
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
    const s1 = apply(s0, { type: 'delete-layer', id: 'ai' });
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
    const s1 = apply(s0, { type: 'merge-layers', sources: ['ops'] });
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
    const styled = apply(state, { type: 'set-diagram-style', style: 'blueprint' });
    expect(styled.model.style).toBe('blueprint');
    expect(styled.layout).toBe(state.layout); // layout untouched
    const cleared = apply(styled, { type: 'set-diagram-style', style: null });
    expect('style' in cleared.model).toBe(false);
  });

  it('set-diagram-notation pins, replaces and clears the model notation', () => {
    const state: EditorState = {
      model: { version: 1, id: 'm', name: 'M', nodes: [], containment: [], relations: [], layers: [], planes: [] },
      layout: emptyLayout(),
      drawings: emptyDrawings(),
    };
    const on = apply(state, { type: 'set-diagram-notation', notation: 'c4' });
    expect(on.model.notation).toBe('c4');
    expect(on.layout).toBe(state.layout); // layout untouched
    const replaced = apply(on, { type: 'set-diagram-notation', notation: 'causal-loop' });
    expect(replaced.model.notation).toBe('causal-loop');
    const off = apply(replaced, { type: 'set-diagram-notation', notation: null });
    expect('notation' in off.model).toBe(false);
  });

  it('set-diagram-notation rejects an unknown id', () => {
    const state: EditorState = {
      model: { version: 1, id: 'm', name: 'M', nodes: [], containment: [], relations: [], layers: [], planes: [] },
      layout: emptyLayout(),
      drawings: emptyDrawings(),
    };
    expect(() => apply(state, { type: 'set-diagram-notation', notation: 'freeform' })).toThrow(CommandError);
  });

  it('sets and clears the diagram legend', () => {
    const m = model('d');
    m.node('a');
    const start = { model: m.toJSON(), layout: emptyLayout(), drawings: emptyDrawings() };
    const on = apply(start, { type: 'set-diagram-legend', legend: { title: 'Key' } });
    expect(on.model.legend).toEqual({ title: 'Key' });
    const off = apply(on, { type: 'set-diagram-legend', legend: null });
    expect('legend' in off.model).toBe(false);
  });

  it('routes set-table-columns', () => {
    const state: EditorState = {
      model: {
        version: 1,
        id: 'd',
        name: 'd',
        nodes: [{ id: 't', name: 't', type: 'db-table', columns: [] }],
        containment: [],
        relations: [],
        layers: [],
        planes: [],
      },
      layout: emptyLayout(),
      drawings: emptyDrawings(),
    };
    const next = apply(state, { type: 'set-table-columns', id: 't', columns: [{ name: 'id', pk: true }] });
    expect(next.model.nodes[0]?.columns).toEqual([{ name: 'id', pk: true }]);
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
    const onNode = apply(before, {
      type: 'add-threat',
      target: { node: 'a' },
      threat: { id: 't1', category: 'E', title: 'Admin route' },
    });
    expect(onNode.model.nodes[0]?.threats).toEqual([{ id: 't1', category: 'E', title: 'Admin route' }]);
    expect(onNode.layout).toBe(before.layout);

    const onFlow = apply(onNode, {
      type: 'add-threat',
      target: { relation: flowId },
      threat: { id: 't1', category: 'T', title: 'Tampering' },
    });
    expect(onFlow.model.relations[0]?.threats).toEqual([{ id: 't1', category: 'T', title: 'Tampering' }]);
    expect(onFlow.layout).toBe(before.layout);
  });

  it('update-threat patches and null-clears, undo-ably (the input model is untouched)', () => {
    const added = apply(threatState(), {
      type: 'add-threat',
      target: { node: 'a' },
      threat: { id: 't1', category: 'S', title: 'Spoofing', severity: 'high' },
    });
    const next = apply(added, {
      type: 'update-threat',
      target: { node: 'a' },
      id: 't1',
      patch: { status: 'mitigated', severity: null },
    });
    expect(next.model.nodes[0]?.threats).toEqual([{ id: 't1', category: 'S', title: 'Spoofing', status: 'mitigated' }]);
    expect(added.model.nodes[0]?.threats?.[0]?.severity).toBe('high');
    expect(next.layout).toBe(added.layout);
  });

  it('remove-threat drops it, and an unknown id is a CommandError', () => {
    const added = apply(threatState(), {
      type: 'add-threat',
      target: { relation: flowId },
      threat: { id: 't1', category: 'I', title: 'Leak' },
    });
    const next = apply(added, { type: 'remove-threat', target: { relation: flowId }, id: 't1' });
    expect(next.model.relations[0]?.threats).toBeUndefined();
    expect(next.layout).toBe(added.layout);
    expect(() => apply(next, { type: 'remove-threat', target: { relation: flowId }, id: 't1' })).toThrow(CommandError);
  });

  it('reports no relation id for a threat command', () => {
    const r = applyCommand(threatState(), {
      type: 'add-threat',
      target: { node: 'a' },
      threat: { id: 't1', category: 'R', title: 'No audit log' },
    });
    expect(r.relationId).toBeUndefined();
    expect(r.state.model.nodes[0]?.threats).toHaveLength(1);
  });
});

describe('comment commands', () => {
  function commentState(): EditorState {
    const base: DiagramModel = {
      version: 1,
      id: 'd',
      name: 'd',
      layers: [],
      planes: [],
      containment: [],
      nodes: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ],
      relations: [{ id: 'r', from: 'a', to: 'b', kind: 'sync' }],
    };
    return { model: base, layout: emptyLayout(), drawings: emptyDrawings() };
  }

  it('adds, updates (null clears), and removes on a node; the key disappears with the last comment', () => {
    let s = apply(commentState(), {
      type: 'add-comment',
      target: { node: 'a' },
      comment: { id: 'c1', text: 'first', by: 'Ann' },
    });
    expect(s.model.nodes[0]?.comments).toEqual([{ id: 'c1', text: 'first', by: 'Ann' }]);
    s = apply(s, {
      type: 'update-comment',
      target: { node: 'a' },
      id: 'c1',
      patch: { text: 'edited', by: null, at: '2026-09-22' },
    });
    expect(s.model.nodes[0]?.comments).toEqual([{ id: 'c1', text: 'edited', at: '2026-09-22' }]);
    s = apply(s, { type: 'remove-comment', target: { node: 'a' }, id: 'c1' });
    expect('comments' in s.model.nodes[0]!).toBe(false);
  });

  it('works on a relation and leaves every sibling by reference', () => {
    const before = commentState();
    const s = apply(before, {
      type: 'add-comment',
      target: { relation: 'r' },
      comment: { id: 'c1', text: 'x' },
    });
    expect(s.model.relations[0]?.comments).toEqual([{ id: 'c1', text: 'x' }]);
    expect(s.model.nodes).toBe(before.model.nodes);
  });

  it('rejects a duplicate id, an unknown comment, an unknown element, and an invalid date', () => {
    const s = apply(commentState(), {
      type: 'add-comment',
      target: { node: 'a' },
      comment: { id: 'c1', text: 'x' },
    });
    expect(() => apply(s, { type: 'add-comment', target: { node: 'a' }, comment: { id: 'c1', text: 'y' } })).toThrow(
      /Duplicate comment/,
    );
    expect(() => apply(s, { type: 'update-comment', target: { node: 'a' }, id: 'c9', patch: { text: 'z' } })).toThrow(
      /Unknown comment/,
    );
    expect(() => apply(s, { type: 'remove-comment', target: { node: 'zz' }, id: 'c1' })).toThrow(/Unknown node/);
    expect(() =>
      apply(s, {
        type: 'add-comment',
        target: { node: 'a' },
        comment: { id: 'c2', text: 'y', at: '2026-02-30' },
      }),
    ).toThrow(/YYYY-MM-DD/);
    expect(() => apply(s, { type: 'update-comment', target: { node: 'a' }, id: 'c1', patch: { at: 'soon' } })).toThrow(
      /YYYY-MM-DD/,
    );
  });

  it('sets and clears links through set-node-details', () => {
    let s = apply(commentState(), {
      type: 'set-node-details',
      id: 'a',
      details: { links: [{ label: 'Doc', url: 'https://x' }] },
    });
    expect(s.model.nodes[0]?.links).toEqual([{ label: 'Doc', url: 'https://x' }]);
    s = apply(s, { type: 'set-node-details', id: 'a', details: { links: null } });
    expect('links' in s.model.nodes[0]!).toBe(false);
  });

  it('an emptied links list drops the key too — a saved file never holds links: []', () => {
    // The rule mapList keeps for threats/comments, extended to the one list a
    // panel edits wholesale: a UI that removes the last row can send `[]`
    // without leaving an empty array behind in the document.
    let s = apply(commentState(), {
      type: 'set-node-details',
      id: 'a',
      details: { links: [{ label: 'Doc', url: 'https://x' }] },
    });
    s = apply(s, { type: 'set-node-details', id: 'a', details: { links: [] } });
    expect('links' in s.model.nodes[0]!).toBe(false);
  });
});

describe('set-plan-dates', () => {
  const withZone = (): EditorState => {
    const s = state();
    s.model = {
      ...s.model,
      nodes: [
        ...s.model.nodes,
        { id: 'z', name: 'Z', type: 'plan-zone', metadata: { start: '2026-01-05', end: '2026-01-09', note: 'keep' } },
      ],
    };
    return s;
  };
  it('writes the given keys into metadata and leaves the rest alone', () => {
    const s = apply(withZone(), { type: 'set-plan-dates', id: 'z', dates: { end: '2026-01-16' } });
    expect(s.model.nodes.find((n) => n.id === 'z')?.metadata).toEqual({
      start: '2026-01-05',
      end: '2026-01-16',
      note: 'keep',
    });
  });
  it('creates metadata on a node that had none', () => {
    const s0 = state();
    const s = apply(s0, { type: 'set-plan-dates', id: 'a', dates: { at: '2026-02-02' } });
    expect(s.model.nodes.find((n) => n.id === 'a')?.metadata).toEqual({ at: '2026-02-02' });
  });
  it('rejects a value that is not a real date, and an unknown node', () => {
    expect(() => apply(withZone(), { type: 'set-plan-dates', id: 'z', dates: { start: '2026-02-30' } })).toThrow(
      CommandError,
    );
    expect(() => apply(withZone(), { type: 'set-plan-dates', id: 'z', dates: { start: 'next week' } })).toThrow(
      /YYYY-MM-DD/,
    );
    expect(() => apply(withZone(), { type: 'set-plan-dates', id: 'nope', dates: { start: '2026-01-01' } })).toThrow(
      /nope/,
    );
  });
  it('keeps the layout and the untouched nodes by identity', () => {
    const s0 = withZone();
    const s = apply(s0, { type: 'set-plan-dates', id: 'z', dates: { start: '2026-01-06' } });
    expect(s.layout).toBe(s0.layout);
    expect(s.model.nodes[0]).toBe(s0.model.nodes[0]);
  });
});
