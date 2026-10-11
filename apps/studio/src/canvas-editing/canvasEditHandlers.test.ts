import { describe, expect, it, vi } from 'vitest';
import {
  emptyDrawings,
  NEW_THREAT_TITLE,
  type DiagramModel,
  type EditorCommand,
  type LayoutOverlay,
} from '@diagc/core/internal';
import { dispatch as reduce, startSession, type EditorSession } from '../session/reducer';
import type { EditorApi } from '../session/useEditor';
import { studioNotation } from '../notations';
import { getHost, setHost } from '../host';
import {
  connectAndDeleteHandlers,
  groupSelection,
  nodeGestureHandlers,
  noteHandlers,
  notesToggle,
  planeLayoutHandlers,
  quickAddHandlers,
  relationEndHandlers,
  strokeHandlers,
  type EditContext,
} from './canvasEditHandlers';

const model = (rest: Partial<DiagramModel> = {}): DiagramModel => ({
  version: 1,
  id: 'm',
  name: 'm',
  nodes: [
    { id: 'a', name: 'a' },
    { id: 'b', name: 'b' },
  ],
  containment: [],
  relations: [],
  layers: [],
  planes: [],
  ...rest,
});

/**
 * An editor over the real reducer. `session` is the render's snapshot, frozen at
 * setup the way a render's is; `peek()` follows every dispatch.
 */
function setup(m: DiagramModel, over: Partial<EditContext> = {}, layout: LayoutOverlay = { version: 1, planes: {} }) {
  let live: EditorSession = startSession('m', { model: m, layout, drawings: emptyDrawings() });
  const commands: EditorCommand[] = [];
  const editor = {
    session: live,
    peek: () => live,
    dispatch: (c: EditorCommand) => {
      commands.push(c);
      live = reduce(live, c);
    },
  } as unknown as EditorApi;
  const ctx: EditContext = {
    editor,
    editing: true,
    model: m,
    layout,
    activePlane: undefined,
    planeOpt: {},
    activePlaneBorrowsContainment: false,
    activePlaneManual: false,
    penLayer: null,
    notation: undefined,
    profile: studioNotation(undefined),
    layoutApiRef: { current: null },
    select: vi.fn(),
    selectNode: vi.fn(),
    requestLabelEdit: vi.fn(),
    requestThreatEdit: vi.fn(),
    groupSel: [],
    ...over,
  };
  return { ctx, commands, live: () => live.state };
}

describe('noteHandlers', () => {
  const store = model({ nodes: [{ id: 's', name: 'Store', type: 'tm-store' }] });

  it("adds the element's next threat with its first STRIDE letter, opens its note, and asks for its title", () => {
    // Breaks if onAddThreat reads the render's session (the second add would
    // repeat t1), takes a fixed category, or stops opening the note in the same step.
    const { ctx, commands, live } = setup(store, { planeOpt: { plane: 'p' } });
    const { onAddThreat } = noteHandlers(ctx);
    onAddThreat({ node: 's' });
    onAddThreat({ node: 's' });
    expect(live().model.nodes[0]?.threats?.map((t) => [t.id, t.category, t.title])).toEqual([
      ['t1', 'T', NEW_THREAT_TITLE],
      ['t2', 'T', NEW_THREAT_TITLE],
    ]);
    expect(commands[0]).toMatchObject({
      type: 'batch',
      commands: [{ type: 'add-threat' }, { plane: 'p', open: true }],
    });
    expect(ctx.requestThreatEdit).toHaveBeenLastCalledWith({ node: 's' }, 't2');
  });

  it('adds nothing on a note whose element is gone', () => {
    // Breaks if a stale note adds a threat to nothing.
    const { ctx, commands } = setup(store);
    noteHandlers(ctx).onAddThreat({ node: 'gone' });
    expect(commands).toEqual([]);
    expect(ctx.requestThreatEdit).not.toHaveBeenCalled();
  });

  it('an emptied title removes a threat nobody named, and cancels on one that has a name', () => {
    // Breaks if `''` reaches the model as a title, or removes a named threat.
    const named = model({
      nodes: [
        {
          id: 's',
          name: 'Store',
          threats: [
            { id: 't1', category: 'T', title: NEW_THREAT_TITLE },
            { id: 't2', category: 'T', title: 'Tampered' },
          ],
        },
      ],
    });
    const { ctx, commands, live } = setup(named);
    const { onRetitleThreat } = noteHandlers(ctx);
    onRetitleThreat({ node: 's' }, 't2', '');
    onRetitleThreat({ node: 's' }, 't2', 'Tampered');
    expect(commands).toEqual([]);
    onRetitleThreat({ node: 's' }, 't1', '');
    onRetitleThreat({ node: 's' }, 't2', 'Altered');
    expect(live().model.nodes[0]?.threats?.map((t) => t.title)).toEqual(['Altered']);
  });

  it("clears a threat's text with null, and writes nothing for an unchanged value", () => {
    // Breaks if an emptied field writes `''`, or an unchanged one pushes an undo step.
    const t = { id: 't1', category: 'T' as const, title: 'x', mitigation: 'Encrypt' };
    const { ctx, commands } = setup(model({ nodes: [{ id: 's', name: 'Store', threats: [t] }] }));
    const { onEditThreatText } = noteHandlers(ctx);
    onEditThreatText({ node: 's' }, 't1', 'mitigation', 'Encrypt');
    onEditThreatText({ node: 's' }, 't1', 'description', '');
    expect(commands).toEqual([]);
    onEditThreatText({ node: 's' }, 't1', 'mitigation', '');
    expect(commands).toEqual([{ type: 'update-threat', target: { node: 's' }, id: 't1', patch: { mitigation: null } }]);
  });

  it("files a moved or toggled note under the plane on screen; a status is the threat's own", () => {
    // Breaks if the note commands lose the plane, or a status change gains one.
    const { ctx, commands } = setup(store, { planeOpt: { plane: 'p' } });
    const { onNoteMoved, onToggleNote, onSetThreatStatus } = noteHandlers(ctx);
    onNoteMoved({ node: 's' }, { dx: 1, dy: 2 });
    onToggleNote({ node: 's' }, true);
    onSetThreatStatus({ node: 's' }, 't1', 'mitigated');
    expect(commands).toEqual([
      { type: 'set-note-offset', target: { node: 's' }, offset: { dx: 1, dy: 2 }, plane: 'p' },
      { type: 'set-note-open', target: { node: 's' }, open: true, plane: 'p' },
      { type: 'update-threat', target: { node: 's' }, id: 't1', patch: { status: 'mitigated' } },
    ]);
  });
});

describe('notesToggle', () => {
  it('is offered where the notation offers threats or one exists, armed only once one does', () => {
    // Breaks if the chip is offered on the notation alone, or armed on an empty register.
    expect(notesToggle(setup(model(), { notation: 'threat-model' }).ctx)).toMatchObject({
      offered: true,
      anyThreats: false,
    });
    expect(notesToggle(setup(model(), { notation: 'c4' }).ctx)).toMatchObject({ offered: false, anyThreats: false });
    const threatened = model({ nodes: [{ id: 'a', name: 'a', threats: [{ id: 't1', category: 'S', title: 'x' }] }] });
    expect(notesToggle(setup(threatened, { notation: 'c4' }).ctx)).toMatchObject({
      offered: true,
      anyThreats: true,
      allOpen: false,
    });
  });

  it('opens every note while one is closed, on the plane on screen', () => {
    // Breaks if the press stops doing what the picture lacks.
    const threatened = model({ nodes: [{ id: 'a', name: 'a', threats: [{ id: 't1', category: 'S', title: 'x' }] }] });
    const { ctx, commands } = setup(threatened, { planeOpt: { plane: 'p' } });
    notesToggle(ctx).toggleAll();
    expect(commands).toEqual([{ type: 'set-notes-open', open: true, plane: 'p' }]);
  });
});

describe('relationEndHandlers', () => {
  const legacy = model({ relations: [{ id: 'r', from: 'a', to: 'b', kind: 'sync', label: 'old' }] });

  it("upgrades a legacy label to labels on the first add, and edits and moves by the label's id", () => {
    // Breaks if a label edit drops the legacy label, or loses the relation's other labels.
    const { ctx, live } = setup(legacy);
    relationEndHandlers(ctx).onAddEdgeLabel('r', 'new', 0.25, 'top');
    const labels = live().model.relations[0]?.labels ?? [];
    expect(labels.map((l) => l.text)).toEqual(['old', 'new']);
    const next = setup(live().model);
    relationEndHandlers(next.ctx).onEditEdgeLabel('r', labels[1]!.id, 'renamed');
    relationEndHandlers(next.ctx).onMoveEdgeLabel('r', labels[0]!.id, 0.75, 'bottom');
    expect(next.commands).toHaveLength(2);
    expect(next.live().model.relations[0]?.labels?.map((l) => l.text)).toEqual(['old', 'new']);
  });

  it('does nothing for a relation that is gone or before the diagram is there', () => {
    // Breaks if a stale label gesture dispatches.
    const { ctx, commands } = setup(legacy);
    relationEndHandlers(ctx).onAddEdgeLabel('gone', 'x', 0.5, 'top');
    relationEndHandlers({ ...ctx, model: undefined }).onEditEdgeLabel('r', 'l1', 'x');
    expect(commands).toEqual([]);
  });

  it("fixes a side by merging into the render's style of the relation", () => {
    // Breaks if a fixed side replaces the relation's other style overrides.
    const styled = model({ relations: [{ id: 'r', from: 'a', to: 'b', kind: 'sync', style: { color: 'red' } }] });
    const { ctx, commands } = setup(styled);
    relationEndHandlers(ctx).onSetEdgeSide('r', 'to', 'top');
    relationEndHandlers(ctx).onReconnect('r', 'b', 'a', { end: 'from', side: null });
    expect(commands).toEqual([
      { type: 'update-relation', id: 'r', patch: { style: { color: 'red', toSide: 'top' } } },
      { type: 'update-relation', id: 'r', patch: { from: 'b', to: 'a', style: { color: 'red' } } },
    ]);
  });
});

describe('nodeGestureHandlers', () => {
  it('saves a move and a resize under the plane on screen where the notation reads neither', () => {
    // Breaks if the generic arms lose the plane, or a resize stops saving the
    // position a top or left handle moves.
    const { ctx, commands } = setup(model(), { activePlane: 'p', planeOpt: { plane: 'p' } });
    const { onNodesMoved, onResize } = nodeGestureHandlers(ctx);
    onNodesMoved({ a: { x: 1, y: 2 } }, { a: { dx: 1, dy: 2 } });
    onResize('a', 100, 50, { x: 3, y: 4 });
    expect(commands).toEqual([
      { type: 'set-positions', positions: { a: { x: 1, y: 2 } }, plane: 'p' },
      { type: 'set-size', nodeId: 'a', w: 100, h: 50 },
      { type: 'set-position', nodeId: 'a', x: 3, y: 4, plane: 'p' },
    ]);
  });

  it('asks the notation first, which consumes a move it has no answer for', () => {
    // Breaks if a gesture the notation consumed falls through to the generic arm.
    const nodesMoved = vi.fn(() => undefined);
    const { ctx, commands } = setup(model(), { profile: { gestures: { nodesMoved } } });
    nodeGestureHandlers(ctx).onNodesMoved({ a: { x: 1, y: 2 } }, { a: { dx: 1, dy: 2 } });
    expect(nodesMoved).toHaveBeenCalledWith(
      expect.objectContaining({ plane: undefined, deltas: { a: { dx: 1, dy: 2 } } }),
    );
    expect(commands).toEqual([]);
  });

  it('a lane moved no slots, a drop with no drop rule and a role before the diagram is there do nothing', () => {
    // Breaks if a no-op gesture pushes an undo step.
    const { ctx, commands } = setup(model());
    nodeGestureHandlers(ctx).onMoveLane('f', 'l', 0);
    nodeGestureHandlers(ctx).onDropInto('a', 'b', { x: 0, y: 0 });
    nodeGestureHandlers({ ...ctx, model: undefined }).onSetRole('a', 'b', 'owns');
    expect(commands).toEqual([]);
  });
});

describe('connectAndDeleteHandlers', () => {
  it('draws the notation’s kind on the sheet being drawn on', () => {
    // Breaks if a connect stops asking the notation, or drops the pen's layer.
    const tm = model({
      nodes: [
        { id: 'web', name: 'Web', type: 'tm-process' },
        { id: 'db', name: 'DB', type: 'tm-store' },
      ],
      layers: [{ id: 'ink', name: 'ink' }],
    });
    const { ctx, commands } = setup(tm, { notation: 'threat-model', penLayer: 'ink' });
    connectAndDeleteHandlers(ctx).onConnect('web', 'db');
    expect(commands).toEqual([
      { type: 'add-relation', from: 'web', to: 'db', opts: { kind: 'data-flow', layer: 'ink' } },
    ]);
  });

  it('deletes against the synchronous session and drops the selection; nothing left to delete is no command', () => {
    // Breaks if a delete reads the render's session, or clears a selection it did not delete.
    const { ctx, commands } = setup(model());
    const { onDeleteSelection } = connectAndDeleteHandlers(ctx);
    onDeleteSelection({ nodeIds: ['a'], relationIds: [] });
    onDeleteSelection({ nodeIds: ['a'], relationIds: [] });
    expect(commands).toEqual([{ type: 'delete-node', id: 'a' }]);
    expect(ctx.select).toHaveBeenCalledTimes(1);
    expect(ctx.select).toHaveBeenCalledWith(null);
  });
});

describe('strokeHandlers', () => {
  it("numbers strokes in the plane's own bucket, and erases on the plane on screen", () => {
    // Breaks if a stroke id is taken from the render's drawings, or from another plane's bucket.
    const planes = [
      { id: 'p1', name: 'p1' },
      { id: 'p2', name: 'p2' },
    ];
    const { ctx, commands, live } = setup(model({ planes }), { activePlane: 'p2', planeOpt: { plane: 'p2' } });
    const { onAddStroke, onDeleteStroke } = strokeHandlers(ctx);
    onAddStroke({ points: [0, 0, 1, 1], width: 3 });
    onAddStroke({ points: [0, 0, 2, 2], width: 3 });
    onDeleteStroke('k1');
    expect(live().drawings.planes['p2']?.map((s) => s.id)).toEqual(['k2']);
    expect(commands.map((c) => ('plane' in c ? c.plane : undefined))).toEqual(['p2', 'p2', 'p2']);
  });
});

describe('quickAddHandlers', () => {
  it('adds a connected sibling, selects it and opens its name; outside edit mode it does nothing', () => {
    // Breaks if quick add stops answering whether it acted (Tab's focus move
    // depends on it), or stops opening what it added.
    const { ctx, commands } = setup(model());
    const { label, run } = quickAddHandlers(ctx);
    expect(label('a')).toBeTypeOf('string');
    expect(run('a')).toBe(true);
    expect(commands).toHaveLength(1);
    expect(ctx.select).toHaveBeenCalledWith({ kind: 'node', id: expect.any(String) });
    expect(ctx.requestLabelEdit).toHaveBeenCalledTimes(1);
    expect(quickAddHandlers({ ...ctx, editing: false }).run('a')).toBe(false);
    expect(quickAddHandlers({ ...ctx, model: undefined }).label('a')).toBeUndefined();
  });
});

describe('planeLayoutHandlers', () => {
  it('freezes the on-screen positions before setting the manual flag, and thaws with the flag alone', () => {
    // Breaks if auto-layout off lets the boxes jump, or on throws the saved positions away.
    const snapshot = { a: { x: 5, y: 6 } };
    const layoutApiRef = { current: { snapshotPositions: () => snapshot } as never };
    const auto = setup(model(), { layoutApiRef, planeOpt: { plane: 'p' } });
    planeLayoutHandlers(auto.ctx).toggleAutoLayout();
    expect(auto.commands).toEqual([
      { type: 'set-positions', positions: snapshot, plane: 'p' },
      { type: 'set-plane-layout', manual: true, plane: 'p' },
    ]);
    const manual = setup(model(), { activePlaneManual: true });
    planeLayoutHandlers(manual.ctx).toggleAutoLayout();
    planeLayoutHandlers(manual.ctx).setLayoutSettings({ direction: 'RIGHT' });
    expect(manual.commands).toEqual([
      { type: 'set-plane-layout', manual: false },
      { type: 'set-layout-settings', patch: { direction: 'RIGHT' } },
    ]);
  });
});

describe('groupSelection', () => {
  it('wraps two or more nodes in a named group on the plane on screen, and selects it', async () => {
    // Breaks if a group is made from one node, ignores a cancelled prompt, or
    // lands on a borrowing plane's own id.
    const host = getHost();
    setHost({ ...host, promptText: async () => ' Loop ' });
    try {
      const one = setup(model(), { groupSel: ['a'] });
      await groupSelection(one.ctx)();
      expect(one.commands).toEqual([]);
      const scoped = setup(model(), { groupSel: ['a', 'b'], activePlane: 'p' });
      await groupSelection(scoped.ctx)();
      expect(scoped.commands).toEqual([
        { type: 'group-nodes', node: { id: 'loop', name: 'Loop', plane: 'p' }, memberIds: ['a', 'b'], plane: 'p' },
      ]);
      expect(scoped.ctx.selectNode).toHaveBeenCalledWith('loop');
      const borrowing = setup(model(), { groupSel: ['a', 'b'], activePlane: 'p', activePlaneBorrowsContainment: true });
      await groupSelection(borrowing.ctx)();
      expect(borrowing.commands).toEqual([
        { type: 'group-nodes', node: { id: 'loop', name: 'Loop' }, memberIds: ['a', 'b'] },
      ]);
      setHost({ ...host, promptText: async () => null });
      const cancelled = setup(model(), { groupSel: ['a', 'b'] });
      await groupSelection(cancelled.ctx)();
      expect(cancelled.commands).toEqual([]);
    } finally {
      setHost(host);
    }
  });
});
