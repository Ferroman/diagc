import { describe, expect, it } from 'vitest';
import { model, type DiagramModel, type EditorCommand } from '@diagc/core';
import { QUICK_ADD_GAP, quickAdd, quickAddLabel, quickAddPlaced, type QuickAddContext } from './quickAdd';

const ctx = (over: Partial<QuickAddContext> = {}): QuickAddContext => ({
  notation: undefined,
  plane: undefined,
  borrowsContainment: false,
  penLayer: null,
  ...over,
});

const batchOf = (c: EditorCommand): EditorCommand[] => (c.type === 'batch' ? c.commands : [c]);

function fish(): DiagramModel {
  const m = model('fish');
  const effect = m.fishbone('outage', 'Outage');
  const code = effect.category('code', 'Code');
  const cause = code.cause('migration', 'Untested migration');
  cause.cause('sub', 'No staging data');
  m.node('note', { name: 'a remark', type: 'comment' });
  return m.toJSON();
}

function plain(): DiagramModel {
  const m = model('plain');
  const sys = m.node('sys', { name: 'sys', type: 'system' });
  const a = m.node('a', { name: 'a', type: 'service', color: '#123456' });
  sys.contains(a);
  m.node('b', { name: 'b', type: 'service' });
  return m.toJSON();
}

/** master: master-1 → master-2; nightly: nightly-1 (from master-1); dev: empty;
 * a stray commit on no lane and a comment */
function git(): DiagramModel {
  const m = model('g');
  const g = m.gitGraph();
  const master = g.branch('master', { name: 'Master' });
  const nightly = g.branch('nightly', { name: 'Nightly' });
  g.branch('dev', { name: 'Dev' });
  const v10 = master.commit('1.0');
  master.commit('2.0');
  nightly.commit({ from: v10 });
  m.node('note', { name: 'a remark', type: 'comment' });
  const j = m.toJSON();
  j.nodes.push({ id: 'stray', name: '', type: 'commit' });
  return j;
}

describe('quickAddLabel / quickAdd — one predicate', () => {
  it('fishbone: effect → category, category and cause → cause, sub-cause → nothing, other types → nothing', () => {
    const m = fish();
    const c = ctx({ notation: 'fishbone' });
    expect(quickAddLabel(m, 'outage', c)).toBe('Add a category');
    expect(quickAddLabel(m, 'code', c)).toBe('Add a cause');
    expect(quickAddLabel(m, 'migration', c)).toBe('Add a cause');
    expect(quickAddLabel(m, 'sub', c)).toBeUndefined();
    expect(quickAddLabel(m, 'note', c)).toBeUndefined();
    expect(quickAdd(m, 'sub', c)).toBeUndefined();
    const out = quickAdd(m, 'code', c);
    expect(out?.beside).toBe(false);
    const cmds = batchOf(out!.command);
    expect(cmds[0]).toMatchObject({ type: 'add-node', node: { id: out!.id, name: '', type: 'fb-cause' } });
    expect(cmds[1]).toMatchObject({ type: 'add-relation', from: out!.id, to: 'code', opts: { kind: 'cause-of' } });
  });

  it('second-order: a decision or consequence gets a neutral "then what"; anything else nothing', () => {
    const m = model('so');
    const d = m.secondOrder().decision('d', 'Ship it');
    d.then('c1', 'Users churn', { valence: '-' });
    m.node('note', { name: 'x', type: 'comment' });
    const j = m.toJSON();
    const c = ctx({ notation: 'second-order' });
    expect(quickAddLabel(j, 'd', c)).toBe('And then what?');
    expect(quickAddLabel(j, 'c1', c)).toBe('And then what?');
    expect(quickAddLabel(j, 'note', c)).toBeUndefined();
    const out = quickAdd(j, 'c1', c)!;
    expect(out.beside).toBe(false);
    expect(batchOf(out.command)[1]).toMatchObject({ type: 'add-relation', from: 'c1', to: out.id, opts: { kind: 'leads-to' } });
  });

  it('threat model: an element gets a flow to a new process; a boundary gets a process inside; a stray node the generic rule', () => {
    const m = model('tm');
    const t = m.threatModel();
    const dmz = t.boundary('dmz', 'DMZ');
    const web = t.process('web', 'Web app');
    dmz.contains(web);
    t.store('db', 'Orders DB');
    m.node('note', { name: 'x', type: 'comment' });
    const j = m.toJSON();
    const c = ctx({ notation: 'threat-model' });
    expect(quickAddLabel(j, 'web', c)).toBe('Add a flow to a new process');
    expect(quickAddLabel(j, 'db', c)).toBe('Add a flow to a new process');
    expect(quickAddLabel(j, 'dmz', c)).toBe('Add a process inside');
    expect(quickAddLabel(j, 'note', c)).toBe('Add a connected node');

    const flow = quickAdd(j, 'web', c)!;
    expect(flow.beside).toBe(true);
    const fc = batchOf(flow.command);
    // the sibling lands in the source's container (web sits in dmz)
    expect(fc[0]).toMatchObject({ type: 'add-node', node: { id: flow.id, name: '', type: 'tm-process' }, parent: { id: 'dmz' } });
    expect(fc[1]).toMatchObject({ type: 'add-relation', from: 'web', to: flow.id, opts: { kind: 'data-flow' } });

    const inside = quickAdd(j, 'dmz', c)!;
    expect(inside.beside).toBe(false);
    const ic = batchOf(inside.command);
    expect(ic).toHaveLength(1);
    expect(ic[0]).toMatchObject({ type: 'add-node', node: { name: '', type: 'tm-process' }, parent: { id: 'dmz' } });
  });

  it('no notation: a connected sibling of the same type and colour, in the same container, kind sync', () => {
    const j = plain();
    const out = quickAdd(j, 'a', ctx())!;
    expect(out.label).toBe('Add a connected node');
    expect(out.beside).toBe(true);
    const cmds = batchOf(out.command);
    expect(cmds[0]).toMatchObject({ type: 'add-node', node: { id: out.id, name: '', type: 'service', color: '#123456' }, parent: { id: 'sys' } });
    expect(cmds[1]).toMatchObject({ type: 'add-relation', from: 'a', to: out.id, opts: { kind: 'sync' } });
    // a top-level source: no parent on the add
    const top = quickAdd(j, 'b', ctx())!;
    expect(batchOf(top.command)[0]).not.toHaveProperty('parent');
    expect(batchOf(top.command)[0]).toMatchObject({ type: 'add-node', node: { type: 'service' } });
  });

  it('a sibling copies every look channel the source carries, not just its colour', () => {
    // A row of stencils must stay a row of stencils: a Lambda whose `+` yielded
    // a default grey box would be the tell that a channel was missed.
    const m = model('look');
    m.node('lambda', {
      name: 'Ingest',
      type: 'service',
      color: '#f90',
      textColor: '#204',
      shape: '/library/shapes/person.svg',
      image: '/library/aws/lambda.svg',
      icon: 'box',
    });
    const j = m.toJSON();
    const out = quickAdd(j, 'lambda', ctx())!;
    expect(batchOf(out.command)[0]).toMatchObject({
      type: 'add-node',
      node: {
        id: out.id,
        name: '',
        type: 'service',
        color: '#f90',
        textColor: '#204',
        shape: '/library/shapes/person.svg',
        image: '/library/aws/lambda.svg',
        icon: 'box',
      },
    });
    // a flow's far end is a process by decree — it does not inherit the look
    const tm = model('tm2');
    const t = tm.threatModel();
    t.process('web', 'Web app');
    const flow = quickAdd(tm.toJSON(), 'web', ctx({ notation: 'threat-model' }))!;
    expect((batchOf(flow.command)[0] as { node: { color?: string } }).node.color).toBeUndefined();
  });

  it('Tab offers nothing where the renderer hangs no `+`: activity chrome, and a causal-loop group', () => {
    const m = model('chrome');
    // the shape validate() insists on: frame › lane › region
    const frame = m.node('frame', { name: 'Checkout', type: 'activity-frame' });
    const lane = m.node('lane', { name: 'Ops', type: 'activity-lane' });
    const region = m.node('region', { name: 'Retry', type: 'activity-region' });
    frame.contains(lane);
    lane.contains(region);
    const grp = m.node('grp', { name: 'Demand' });
    const inner = m.node('inner', { name: 'Backlog' });
    grp.contains(inner);
    const j = m.toJSON();
    for (const id of ['frame', 'lane', 'region']) {
      expect(quickAddLabel(j, id, ctx())).toBeUndefined();
      expect(quickAdd(j, id, ctx())).toBeUndefined();
    }
    const cld = ctx({ notation: 'causal-loop' });
    expect(quickAddLabel(j, 'grp', cld)).toBeUndefined();
    expect(quickAdd(j, 'grp', cld)).toBeUndefined();
    // a leaf variable is still an ordinary node with a sibling to offer
    expect(quickAddLabel(j, 'inner', cld)).toBe('Add a connected node');
  });

  it('git-graph: a lane or its tip commit appends a commit the panel way; a mid-lane, stray or foreign node gets nothing', () => {
    const j = git();
    const c = ctx({ notation: 'git-graph', plane: 'git-graph' });
    // the tip: linked from itself, contained in its lane, laid out by the notation
    expect(quickAddLabel(j, 'master-2', c)).toBe('Add a commit');
    const tip = quickAdd(j, 'master-2', c)!;
    expect(tip).toMatchObject({ id: 'master-3', beside: false });
    expect(batchOf(tip.command)).toEqual([
      { type: 'add-node', node: { id: 'master-3', name: '', type: 'commit' }, parent: { id: 'master', plane: 'git-graph' } },
      { type: 'add-relation', from: 'master-2', to: 'master-3', opts: { kind: 'commit' } },
    ]);
    // a lane: appended at its tip; an empty lane gets its first, unlinked commit
    expect(quickAddLabel(j, 'nightly', c)).toBe('Add a commit');
    expect(batchOf(quickAdd(j, 'nightly', c)!.command)).toMatchObject([{ node: { id: 'nightly-2' } }, { from: 'nightly-1', to: 'nightly-2' }]);
    expect(batchOf(quickAdd(j, 'dev', c)!.command)).toEqual([
      { type: 'add-node', node: { id: 'dev-1', name: '', type: 'commit' }, parent: { id: 'dev', plane: 'git-graph' } },
    ]);
    // one predicate: the label is absent exactly where the command is
    for (const id of ['master-1', 'stray', 'note']) {
      expect(quickAddLabel(j, id, c), id).toBeUndefined();
      expect(quickAdd(j, id, c), id).toBeUndefined();
    }
    // the base view resolves to the same (default) plane
    expect(batchOf(quickAdd(j, 'master-2', ctx({ notation: 'git-graph' }))!.command)[0]).toMatchObject({ parent: { id: 'master', plane: 'git-graph' } });
  });

  it('unknown source: nothing', () => {
    const j = plain();
    expect(quickAddLabel(j, 'nope', ctx())).toBeUndefined();
    expect(quickAdd(j, 'nope', ctx())).toBeUndefined();
  });

  it('plane and pen scoping follow createNodeAt/placeTags: the node is tagged, the relation carries the pen layer', () => {
    const m = model('scoped');
    m.layer('review', { name: 'Review' });
    m.plane('p', { name: 'P' });
    m.node('a', { name: 'a', type: 'service' });
    const j = m.toJSON();
    const out = quickAdd(j, 'a', ctx({ plane: 'p', penLayer: 'review' }))!;
    const cmds = batchOf(out.command);
    expect(cmds[0]).toMatchObject({ type: 'add-node', node: { plane: 'p', layer: 'review' } });
    expect(cmds[1]).toMatchObject({ type: 'add-relation', opts: { kind: 'sync', layer: 'review' } });
    // a borrowing plane yields a shared node (no plane tag)
    const shared = quickAdd(j, 'a', ctx({ plane: 'p', borrowsContainment: true }))!;
    expect((batchOf(shared.command)[0] as { node: { plane?: string } }).node.plane).toBeUndefined();
  });
});

describe('quickAddPlaced', () => {
  const out = () => quickAdd(plain(), 'b', ctx())!;

  it('appends a set-position to the right of a pinned source, in the same batch', () => {
    const cmd = quickAddPlaced(out(), { pinned: true, source: { x: 100, y: 50 }, width: 160, plane: 'p' });
    const cmds = batchOf(cmd);
    expect(cmds).toHaveLength(3);
    expect(cmds[2]).toEqual({ type: 'set-position', nodeId: out().id, x: 100 + 160 + QUICK_ADD_GAP, y: 50, plane: 'p' });
  });

  it('omits the plane when there is none, and does nothing for an unpinned or unrendered source or a notation recipe', () => {
    const o = out();
    const cmds = batchOf(quickAddPlaced(o, { pinned: true, source: { x: 0, y: 0 }, width: 10, plane: undefined }));
    expect(cmds[2]).toEqual({ type: 'set-position', nodeId: o.id, x: 10 + QUICK_ADD_GAP, y: 0 });
    expect(quickAddPlaced(o, { pinned: false, source: { x: 0, y: 0 }, width: 10, plane: undefined })).toBe(o.command);
    expect(quickAddPlaced(o, { pinned: true, source: undefined, width: 10, plane: undefined })).toBe(o.command);
    const bone = quickAdd(fish(), 'code', ctx({ notation: 'fishbone' }))!;
    expect(quickAddPlaced(bone, { pinned: true, source: { x: 0, y: 0 }, width: 10, plane: undefined })).toBe(bone.command);
  });

  it('appends a set-size from the source, whether or not a position is needed — and never on a notation recipe', () => {
    const o = out();
    // unpinned: elk still owns the arrangement, but a resized source must breed
    // a same-sized sibling, so the size rides alone
    const alone = batchOf(quickAddPlaced(o, { pinned: false, source: undefined, width: 64, size: { w: 64, h: 64 }, plane: undefined }));
    expect(alone).toHaveLength(3);
    expect(alone[2]).toEqual({ type: 'set-size', nodeId: o.id, w: 64, h: 64 });
    // pinned: position first, then size — both in the one undo step
    const both = batchOf(quickAddPlaced(o, { pinned: true, source: { x: 0, y: 0 }, width: 64, size: { w: 64, h: 64 }, plane: undefined }));
    expect(both).toHaveLength(4);
    expect(both[2]).toMatchObject({ type: 'set-position' });
    expect(both[3]).toEqual({ type: 'set-size', nodeId: o.id, w: 64, h: 64 });
    // a bone is laid out by the notation: it takes neither
    const bone = quickAdd(fish(), 'code', ctx({ notation: 'fishbone' }))!;
    expect(quickAddPlaced(bone, { pinned: true, source: { x: 0, y: 0 }, width: 64, size: { w: 64, h: 64 }, plane: undefined })).toBe(
      bone.command,
    );
  });
});
