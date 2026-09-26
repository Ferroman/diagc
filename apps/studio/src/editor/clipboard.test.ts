import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  emptyDrawings,
  emptyLayout,
  model,
  validate,
  type DiagramModel,
  type EditorCommand,
  type LayoutOverlay,
} from '@diagc/core';
import {
  CLIPBOARD_FORMAT,
  PASTE_STEP,
  copySelection,
  parseClipboard,
  pasteCommand,
  serializeClipboard,
  type PasteContext,
} from './clipboard';

const ctx = (over: Partial<PasteContext> = {}): PasteContext => ({
  plane: undefined,
  borrowsContainment: false,
  penLayer: null,
  selected: undefined,
  repeat: 0,
  ...over,
});

/** sys ⊃ {api, db}, api → db (labelled), plus a loose `web` → api; api on a layer */
function system(): DiagramModel {
  return {
    version: 1,
    id: 'sys',
    name: 'sys',
    nodes: [
      { id: 'sys', name: 'System', type: 'system' },
      { id: 'api', name: 'API', type: 'service', key: 'svc-api', layer: 'ops' },
      { id: 'db', name: 'DB', type: 'database' },
      { id: 'web', name: 'Web' },
    ],
    containment: [
      { parent: 'sys', child: 'api' },
      { parent: 'sys', child: 'db' },
    ],
    relations: [
      { id: 'api->db#0', from: 'api', to: 'db', kind: 'uses', label: 'reads' },
      { id: 'web->api#0', from: 'web', to: 'api', kind: 'calls' },
    ],
    layers: [{ id: 'ops', name: 'Ops' }],
    planes: [],
  };
}

const empty = (): DiagramModel => ({ version: 1, id: 'other', name: 'other', nodes: [], containment: [], relations: [], layers: [], planes: [] });

const layoutWith = (planes: LayoutOverlay['planes'], sizes?: LayoutOverlay['sizes']): LayoutOverlay => ({
  ...emptyLayout(),
  planes,
  ...(sizes !== undefined ? { sizes } : {}),
});

/** apply a paste for real: the batch must go through the command algebra whole */
const applied = (m: DiagramModel, command: EditorCommand, layout = emptyLayout()) =>
  applyCommand({ model: m, layout, drawings: emptyDrawings() }, command);

describe('copySelection', () => {
  it('takes the selected node with everything inside it, and only the relations wholly inside', () => {
    const m = system();
    const p = copySelection(m, undefined, undefined, ['sys'])!;
    expect(p.format).toBe(CLIPBOARD_FORMAT);
    expect(p.nodes.map((n) => n.id).sort()).toEqual(['api', 'db', 'sys']);
    expect(p.roots).toEqual([{ id: 'sys' }]);
    expect(p.containment).toEqual([
      { parent: 'sys', child: 'api' },
      { parent: 'sys', child: 'db' },
    ]);
    // web → api has an end outside the copy
    expect(p.relations.map((r) => [r.from, r.to])).toEqual([['api', 'db']]);
  });

  it('records a nested root\'s parent, and the saved positions and sizes', () => {
    const m = system();
    const layout = layoutWith({ default: { api: { x: 10, y: 20 } } }, { api: { w: 200, h: 90 } });
    const p = copySelection(m, layout, undefined, ['api', 'nope'])!;
    expect(p.roots).toEqual([{ id: 'api', parent: 'sys' }]);
    expect(p.positions).toEqual({ api: { x: 10, y: 20 } });
    expect(p.sizes).toEqual({ api: { w: 200, h: 90 } });
  });

  it('falls back to on-screen positions the overlay does not hold', () => {
    const p = copySelection(system(), undefined, undefined, ['web'], { web: { x: 5, y: 6 } })!;
    expect(p.positions).toEqual({ web: { x: 5, y: 6 } });
  });

  it('is null when nothing selected names a node', () => {
    expect(copySelection(system(), undefined, undefined, ['nope'])).toBeNull();
    expect(copySelection(system(), undefined, undefined, [])).toBeNull();
  });
});

describe('serializeClipboard / parseClipboard', () => {
  it('round-trips, and ignores text that is not ours', () => {
    const p = copySelection(system(), undefined, undefined, ['web'])!;
    expect(parseClipboard(serializeClipboard(p))).toEqual(p);
    expect(parseClipboard('hello')).toBeNull();
    expect(parseClipboard('{"format":"diagc/clipboard@1"')).toBeNull(); // truncated
    expect(parseClipboard(JSON.stringify({ format: 'other', nodes: [], roots: [] }))).toBeNull();
  });
});

describe('pasteCommand', () => {
  it('duplicates a container in place: fresh ids, inner containment and relations rewired, one valid batch', () => {
    const m = system();
    const p = copySelection(m, undefined, undefined, ['sys'])!;
    const out = pasteCommand(m, p, ctx())!;
    expect(out.command.type).toBe('batch');
    const after = applied(m, out.command);
    expect(validate(after.model)).toEqual([]);
    const [root] = out.roots;
    expect(root).not.toBe('sys');
    const kids = after.model.containment.filter((e) => e.parent === root).map((e) => e.child);
    expect(kids).toHaveLength(2);
    expect(kids.every((k) => !['api', 'db'].includes(k))).toBe(true);
    // the copied relation joins the COPIES, label kept; the original is untouched
    const rel = after.model.relations.find((r) => kids.includes(r.from) && kids.includes(r.to));
    expect(rel).toMatchObject({ kind: 'uses', label: 'reads' });
    expect(after.model.relations).toHaveLength(3);
  });

  it('drops the cross-diagram key, keeps a layer that exists and swaps one that does not for the pen', () => {
    const m = system();
    const p = copySelection(m, undefined, undefined, ['api'])!;
    const here = pasteCommand(m, p, ctx())!;
    const node = applied(m, here.command).model.nodes.find((n) => n.id === here.roots[0])!;
    expect(node.key).toBeUndefined();
    expect(node.layer).toBe('ops');
    // pasted into a diagram without that layer
    const other: DiagramModel = { ...empty(), layers: [{ id: 'pen', name: 'Pen' }] };
    const there = pasteCommand(other, p, ctx({ penLayer: 'pen' }))!;
    const moved = applied(other, there.command).model;
    expect(moved.nodes.find((n) => n.id === there.roots[0])!.layer).toBe('pen');
    expect(validate(moved)).toEqual([]);
  });

  it('with nothing selected, pastes under the originals\' parent; into another diagram, at top level', () => {
    const m = system();
    const p = copySelection(m, undefined, undefined, ['api'])!;
    const same = pasteCommand(m, p, ctx())!;
    expect(applied(m, same.command).model.containment).toContainEqual({ parent: 'sys', child: same.roots[0] });
    const other = empty();
    const there = pasteCommand(other, p, ctx())!;
    expect(applied(other, there.command).model.containment).toEqual([]);
  });

  it('pastes into a selected container, or beside a selected leaf, or beside the copy itself', () => {
    const m = system();
    const p = copySelection(m, undefined, undefined, ['web'])!;
    const into = pasteCommand(m, p, ctx({ selected: 'sys' }))!;
    expect(applied(m, into.command).model.containment).toContainEqual({ parent: 'sys', child: into.roots[0] });
    const beside = pasteCommand(m, p, ctx({ selected: 'db' }))!;
    expect(applied(m, beside.command).model.containment).toContainEqual({ parent: 'sys', child: beside.roots[0] });
    // `web` is still selected after the copy: a paste must not nest into it
    const over = pasteCommand(m, p, ctx({ selected: 'web' }))!;
    expect(applied(m, over.command).model.containment.some((e) => e.child === over.roots[0])).toBe(false);
  });

  it('steps each repeat further from the original, and keeps nested positions as they were', () => {
    const m = system();
    const layout = layoutWith({ default: { sys: { x: 100, y: 50 }, api: { x: 8, y: 9 } } }, { sys: { w: 400, h: 300 } });
    const p = copySelection(m, layout, undefined, ['sys'])!;
    const first = pasteCommand(m, p, ctx())!;
    const second = pasteCommand(m, p, ctx({ repeat: 1 }))!;
    const pos = (c: EditorCommand, id: string) =>
      (c.type === 'batch' ? c.commands : []).find((x) => x.type === 'set-position' && x.nodeId === id);
    expect(pos(first.command, first.roots[0]!)).toMatchObject({ x: 100 + PASTE_STEP, y: 50 + PASTE_STEP });
    expect(pos(second.command, second.roots[0]!)).toMatchObject({ x: 100 + 2 * PASTE_STEP, y: 50 + 2 * PASTE_STEP });
    const after = applied(m, first.command, layout);
    const apiCopy = after.model.containment.find((e) => e.parent === first.roots[0] && after.model.nodes.find((n) => n.id === e.child)?.type === 'service')!.child;
    expect(after.layout.planes.default?.[apiCopy]).toEqual({ x: 8, y: 9 });
    expect(after.layout.sizes?.[first.roots[0]!]).toEqual({ w: 400, h: 300 });
  });

  it('carries positioned edge labels onto the copied relation', () => {
    const m = system();
    const withLabels: DiagramModel = {
      ...m,
      relations: m.relations.map((r) => (r.from === 'api' ? { ...r, labels: [{ id: 'l1', text: 'reads', t: 0.3 }] } : r)),
    };
    const p = copySelection(withLabels, undefined, undefined, ['sys'])!;
    const out = pasteCommand(withLabels, p, ctx())!;
    const after = applied(withLabels, out.command).model;
    const copies = after.relations.filter((r) => r.kind === 'uses');
    expect(copies).toHaveLength(2);
    expect(copies[1]!.labels).toEqual([{ id: 'l1', text: 'reads', t: 0.3 }]);
  });

  it('two copies of a pair in one paste get distinct relation ids', () => {
    const m = system();
    const doubled: DiagramModel = {
      ...m,
      relations: [...m.relations, { id: 'api->db#1', from: 'api', to: 'db', kind: 'uses', labels: [{ id: 'l2', text: 'writes', t: 0.5 }] }],
    };
    const p = copySelection(doubled, undefined, undefined, ['sys'])!;
    const after = applied(doubled, pasteCommand(doubled, p, ctx())!.command).model;
    expect(after.relations.filter((r) => r.kind === 'uses')).toHaveLength(4);
    expect(after.relations.at(-1)!.labels).toEqual([{ id: 'l2', text: 'writes', t: 0.5 }]);
  });

  describe('activity diagrams', () => {
    function flow(): DiagramModel {
      const m = model('act');
      const f = m.activity('flow');
      const a = f.lane('a', { name: 'A' });
      f.lane('b', { name: 'B' });
      a.action('ship', 'Ship');
      return m.toJSON();
    }

    it('a copied action pasted onto the frame lands in a lane, never in the frame', () => {
      const m = flow();
      const p = copySelection(m, undefined, undefined, ['ship'])!;
      const out = pasteCommand(m, p, ctx({ selected: 'flow' }))!;
      const after = applied(m, out.command).model;
      expect(after.containment).toContainEqual({ parent: 'a', child: out.roots[0] });
      expect(validate(after)).toEqual([]);
    });

    it('a copied lane (with its contents) lands in the frame, even with an action selected', () => {
      const m = flow();
      const p = copySelection(m, undefined, undefined, ['a'])!;
      const out = pasteCommand(m, p, ctx({ selected: 'ship' }))!;
      const after = applied(m, out.command).model;
      expect(after.containment).toContainEqual({ parent: 'flow', child: out.roots[0] });
      expect(after.containment.filter((e) => e.parent === out.roots[0])).toHaveLength(1);
      expect(validate(after)).toEqual([]);
    });
  });

  it('is null for an empty payload', () => {
    const p = { ...copySelection(system(), undefined, undefined, ['web'])!, nodes: [], roots: [] };
    expect(pasteCommand(system(), p, ctx())).toBeNull();
  });
});
