import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  buildHierarchy,
  emptyDrawings,
  emptyLayout,
  model,
  validate,
  type DiagramModel,
  type EditorCommand,
  type LayoutOverlay,
} from '@diagc/core/internal';
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

const empty = (): DiagramModel => ({
  version: 1,
  id: 'other',
  name: 'other',
  nodes: [],
  containment: [],
  relations: [],
  layers: [],
  planes: [],
});

const layoutWith = (planes: LayoutOverlay['planes'], sizes?: LayoutOverlay['sizes']): LayoutOverlay => ({
  ...emptyLayout(),
  planes,
  ...(sizes !== undefined ? { sizes } : {}),
});

/** apply a paste for real: the batch must go through the command algebra whole */
const applied = (m: DiagramModel, command: EditorCommand, layout = emptyLayout()) =>
  applyCommand({ model: m, layout, drawings: emptyDrawings() }, command).state;

describe('copySelection', () => {
  it('takes the selected node with everything inside it, and only the relations wholly inside', () => {
    const m = system();
    const p = copySelection({ model: m, layout: undefined, plane: undefined }, ['sys'])!;
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

  it("records a nested root's parent, and the saved positions and sizes", () => {
    const m = system();
    const layout = layoutWith({ default: { api: { x: 10, y: 20 } } }, { api: { w: 200, h: 90 } });
    const p = copySelection({ model: m, layout, plane: undefined }, ['api', 'nope'])!;
    expect(p.roots).toEqual([{ id: 'api', parent: 'sys' }]);
    expect(p.positions).toEqual({ api: { x: 10, y: 20 } });
    expect(p.sizes).toEqual({ api: { w: 200, h: 90 } });
  });

  it('falls back to on-screen positions the overlay does not hold', () => {
    const p = copySelection({ model: system(), layout: undefined, plane: undefined }, ['web'], {
      web: { x: 5, y: 6 },
    })!;
    expect(p.positions).toEqual({ web: { x: 5, y: 6 } });
  });

  it('is null when nothing selected names a node', () => {
    expect(copySelection({ model: system(), layout: undefined, plane: undefined }, ['nope'])).toBeNull();
    expect(copySelection({ model: system(), layout: undefined, plane: undefined }, [])).toBeNull();
  });
});

describe('serializeClipboard / parseClipboard', () => {
  it('round-trips, and ignores text that is not ours', () => {
    const p = copySelection({ model: system(), layout: undefined, plane: undefined }, ['web'])!;
    expect(parseClipboard(serializeClipboard(p))).toEqual(p);
    expect(parseClipboard('hello')).toBeNull();
    expect(parseClipboard('{"format":"diagc/clipboard@1"')).toBeNull(); // truncated
    expect(parseClipboard(JSON.stringify({ format: 'other', nodes: [], roots: [] }))).toBeNull();
  });
});

describe('pasteCommand', () => {
  it('duplicates a container in place: fresh ids, inner containment and relations rewired, one valid batch', () => {
    const m = system();
    const p = copySelection({ model: m, layout: undefined, plane: undefined }, ['sys'])!;
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
    const p = copySelection({ model: m, layout: undefined, plane: undefined }, ['api'])!;
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

  it("with nothing selected, pastes under the originals' parent; into another diagram, at top level", () => {
    const m = system();
    const p = copySelection({ model: m, layout: undefined, plane: undefined }, ['api'])!;
    const same = pasteCommand(m, p, ctx())!;
    expect(applied(m, same.command).model.containment).toContainEqual({ parent: 'sys', child: same.roots[0] });
    const other = empty();
    const there = pasteCommand(other, p, ctx())!;
    expect(applied(other, there.command).model.containment).toEqual([]);
  });

  it('pastes into a selected container, or beside a selected leaf, or beside the copy itself', () => {
    const m = system();
    const p = copySelection({ model: m, layout: undefined, plane: undefined }, ['web'])!;
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
    const layout = layoutWith(
      { default: { sys: { x: 100, y: 50 }, api: { x: 8, y: 9 } } },
      { sys: { w: 400, h: 300 } },
    );
    const p = copySelection({ model: m, layout, plane: undefined }, ['sys'])!;
    const first = pasteCommand(m, p, ctx())!;
    const second = pasteCommand(m, p, ctx({ repeat: 1 }))!;
    const pos = (c: EditorCommand, id: string) =>
      (c.type === 'batch' ? c.commands : []).find((x) => x.type === 'set-position' && x.nodeId === id);
    expect(pos(first.command, first.roots[0]!)).toMatchObject({ x: 100 + PASTE_STEP, y: 50 + PASTE_STEP });
    expect(pos(second.command, second.roots[0]!)).toMatchObject({ x: 100 + 2 * PASTE_STEP, y: 50 + 2 * PASTE_STEP });
    const after = applied(m, first.command, layout);
    const apiCopy = after.model.containment.find(
      (e) => e.parent === first.roots[0] && after.model.nodes.find((n) => n.id === e.child)?.type === 'service',
    )!.child;
    expect(after.layout.planes.default?.[apiCopy]).toEqual({ x: 8, y: 9 });
    expect(after.layout.sizes?.[first.roots[0]!]).toEqual({ w: 400, h: 300 });
  });

  it('carries positioned edge labels onto the copied relation', () => {
    const m = system();
    const withLabels: DiagramModel = {
      ...m,
      relations: m.relations.map((r) =>
        r.from === 'api' ? { ...r, labels: [{ id: 'l1', text: 'reads', t: 0.3 }] } : r,
      ),
    };
    const p = copySelection({ model: withLabels, layout: undefined, plane: undefined }, ['sys'])!;
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
      relations: [
        ...m.relations,
        { id: 'api->db#1', from: 'api', to: 'db', kind: 'uses', labels: [{ id: 'l2', text: 'writes', t: 0.5 }] },
      ],
    };
    const p = copySelection({ model: doubled, layout: undefined, plane: undefined }, ['sys'])!;
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
      const p = copySelection({ model: m, layout: undefined, plane: undefined }, ['ship'])!;
      const out = pasteCommand(m, p, ctx({ selected: 'flow' }))!;
      const after = applied(m, out.command).model;
      expect(after.containment).toContainEqual({ parent: 'a', child: out.roots[0] });
      expect(validate(after)).toEqual([]);
    });

    it('a copied lane (with its contents) lands in the frame, even with an action selected', () => {
      const m = flow();
      const p = copySelection({ model: m, layout: undefined, plane: undefined }, ['a'])!;
      const out = pasteCommand(m, p, ctx({ selected: 'ship' }))!;
      const after = applied(m, out.command).model;
      expect(after.containment).toContainEqual({ parent: 'flow', child: out.roots[0] });
      expect(after.containment.filter((e) => e.parent === out.roots[0])).toHaveLength(1);
      expect(validate(after)).toEqual([]);
    });
  });

  it('is null for an empty payload', () => {
    const p = {
      ...copySelection({ model: system(), layout: undefined, plane: undefined }, ['web'])!,
      nodes: [],
      roots: [],
    };
    expect(pasteCommand(system(), p, ctx())).toBeNull();
  });
});

describe('copy and paste on planes', () => {
  // system()'s containment is untagged, so it is on whichever plane is declared first.
  const withPlanes = (planes: DiagramModel['planes']): DiagramModel => ({ ...system(), planes });
  /** `a` is first and borrows: sys ⊃ {api, db} is on `a`, whose own containment no view reads */
  const borrowingFirst = () =>
    withPlanes([
      { id: 'a', name: 'A', containmentOf: 'b' },
      { id: 'b', name: 'B' },
    ]);
  /** `b` is first: sys ⊃ {api, db} is on `b`, and `a` reads it too */
  const borrowingSecond = () =>
    withPlanes([
      { id: 'b', name: 'B' },
      { id: 'a', name: 'A', containmentOf: 'b' },
    ]);
  const parentOfRoot = (m: DiagramModel, out: { command: EditorCommand; roots: string[] }) =>
    applied(m, out.command).model.containment.find((e) => e.child === out.roots[0])?.parent;

  it('copies the hierarchy the canvas draws when the first plane borrows', () => {
    const m = borrowingFirst();
    for (const plane of [undefined, 'a', 'b']) {
      // the canvas: sys holds nothing, api and db are top-level boxes
      expect(buildHierarchy(m, plane).childrenOf.get('sys')).toEqual([]);
      const sys = copySelection({ model: m, layout: undefined, plane }, ['sys'])!;
      expect(sys.nodes.map((n) => n.id)).toEqual(['sys']);
      expect(sys.containment).toEqual([]);
      expect(copySelection({ model: m, layout: undefined, plane }, ['api'])!.roots).toEqual([{ id: 'api' }]);
    }
  });

  it('pastes by the hierarchy the canvas draws when the first plane borrows', () => {
    const m = borrowingFirst();
    const web = copySelection({ model: m, layout: undefined, plane: undefined }, ['web'])!;
    for (const plane of [undefined, 'a', 'b']) {
      const pastePlane = { plane, borrowsContainment: plane === 'a' };
      // beside a top-level leaf → top level; sys has no children, so beside it too
      expect(parentOfRoot(m, pasteCommand(m, web, ctx({ ...pastePlane, selected: 'api' }))!)).toBeUndefined();
      expect(parentOfRoot(m, pasteCommand(m, web, ctx({ ...pastePlane, selected: 'sys' }))!)).toBeUndefined();
    }
  });

  it('reads untagged containment on a first plane that does not borrow, and through a borrow of it', () => {
    const m = borrowingSecond();
    for (const plane of [undefined, 'a', 'b']) {
      expect(buildHierarchy(m, plane).childrenOf.get('sys')).toEqual(['api', 'db']);
      expect(copySelection({ model: m, layout: undefined, plane }, ['sys'])!.nodes.map((n) => n.id)).toEqual([
        'sys',
        'api',
        'db',
      ]);
      expect(copySelection({ model: m, layout: undefined, plane }, ['api'])!.roots).toEqual([
        { id: 'api', parent: 'sys' },
      ]);
      const web = copySelection({ model: m, layout: undefined, plane }, ['web'])!;
      // beside api and into sys both land in sys
      const pastePlane = { plane, borrowsContainment: plane === 'a' };
      expect(parentOfRoot(m, pasteCommand(m, web, ctx({ ...pastePlane, selected: 'api' }))!)).toBe('sys');
      expect(parentOfRoot(m, pasteCommand(m, web, ctx({ ...pastePlane, selected: 'sys' }))!)).toBe('sys');
    }
  });
});

describe("a relation's plane", () => {
  it('pastes a scoped relation scoped to the plane in view, and a shared one shared', () => {
    const base = system();
    const m: DiagramModel = {
      ...base,
      planes: [
        { id: 'current', name: 'Current' },
        { id: 'target', name: 'Target' },
      ],
      nodes: [...base.nodes, { id: 'cache', name: 'Cache', type: 'database' }],
      containment: [...base.containment, { parent: 'sys', child: 'cache' }],
      relations: [
        { ...base.relations[0]!, plane: 'current' },
        { id: 'api->cache#0', from: 'api', to: 'cache', kind: 'uses' },
      ],
    };
    const payload = copySelection({ model: m, layout: undefined, plane: 'current' }, ['sys'])!;
    const after = applied(m, pasteCommand(m, payload, ctx({ plane: 'target' }))!.command).model;
    const pasted = after.relations.slice(m.relations.length);
    expect(pasted.map((r) => [r.kind, r.plane])).toEqual([
      ['uses', 'target'],
      ['uses', undefined],
    ]);
    expect(validate(after)).toEqual([]);
  });

  it('pastes a scoped relation scoped to the first plane on the Default view, which draws that plane', () => {
    const base = system();
    const m: DiagramModel = {
      ...base,
      planes: [
        { id: 'current', name: 'Current' },
        { id: 'target', name: 'Target', containmentOf: 'current' },
      ],
      relations: [{ ...base.relations[0]!, plane: 'current' }],
    };
    const payload = copySelection({ model: m, layout: undefined, plane: undefined }, ['sys'])!;
    const after = applied(m, pasteCommand(m, payload, ctx({ plane: undefined }))!.command).model;
    expect(after.relations.slice(m.relations.length).map((r) => r.plane)).toEqual(['current']);
  });

  it("copies only the relations drawn on the plane in view, not another plane's", () => {
    const base = system();
    const m: DiagramModel = {
      ...base,
      planes: [
        { id: 'current', name: 'Current' },
        { id: 'target', name: 'Target', containmentOf: 'current' },
      ],
      relations: [{ ...base.relations[0]!, plane: 'target' }],
    };
    expect(copySelection({ model: m, layout: undefined, plane: 'current' }, ['sys'])!.relations).toEqual([]);
    expect(copySelection({ model: m, layout: undefined, plane: 'target' }, ['sys'])!.relations).toHaveLength(1);
  });
});

describe('the exact payload and batch', () => {
  /** every field a paste carries: a plane, a pen, sizes, positions, a relation with all its options and labels */
  function rich(): { model: DiagramModel; layout: LayoutOverlay } {
    const base = system();
    return {
      model: {
        ...base,
        relations: [
          {
            id: 'api->db#0',
            from: 'api',
            to: 'db',
            kind: 'uses',
            label: 'reads',
            layer: 'gone',
            description: 'd',
            style: { line: 'dashed' },
            polarity: '+',
            delay: true,
            fromColumn: 'a',
            toColumn: 'b',
            labels: [{ id: 'l1', text: 'x', t: 0.4 }],
          },
          { id: 'db->api#0', from: 'db', to: 'api', kind: 'replies', layer: 'ops' },
        ],
        planes: [{ id: 'p', name: 'P' }],
      },
      layout: layoutWith(
        { p: { sys: { x: 10, y: 20 }, db: { x: 3, y: 4 } } },
        { sys: { w: 300, h: 200 }, db: { w: 50, h: 40 } },
      ),
    };
  }

  // breaks if the copy reorders its fields, nodes, containment, roots, positions or sizes
  it('copies in a fixed order', () => {
    const { model: m, layout } = rich();
    const p = copySelection({ model: m, layout, plane: 'p' }, ['sys'], { api: { x: 1, y: 2 } })!;
    expect(JSON.stringify(p)).toMatchInlineSnapshot(
      `"{"format":"diagc/clipboard@1","nodes":[{"id":"sys","name":"System","type":"system"},{"id":"api","name":"API","type":"service","key":"svc-api","layer":"ops"},{"id":"db","name":"DB","type":"database"}],"containment":[{"parent":"sys","child":"api"},{"parent":"sys","child":"db"}],"roots":[{"id":"sys"}],"relations":[{"id":"api->db#0","from":"api","to":"db","kind":"uses","label":"reads","layer":"gone","description":"d","style":{"line":"dashed"},"polarity":"+","delay":true,"fromColumn":"a","toColumn":"b","labels":[{"id":"l1","text":"x","t":0.4}]},{"id":"db->api#0","from":"db","to":"api","kind":"replies","layer":"ops"}],"positions":{"sys":{"x":10,"y":20},"api":{"x":1,"y":2},"db":{"x":3,"y":4}},"sizes":{"sys":{"w":300,"h":200},"db":{"w":50,"h":40}}}"`,
    );
  });

  // breaks if the paste reorders its commands (nodes, then memberships, then
  // positions and sizes node by node, then relations) or a command's fields,
  // which the saved files carry in the same order
  it('pastes one batch in a fixed order', () => {
    const { model: m, layout } = rich();
    const p = copySelection({ model: m, layout, plane: 'p' }, ['sys'], { api: { x: 1, y: 2 } })!;
    const out = pasteCommand(m, p, ctx({ plane: 'p', penLayer: 'ops', repeat: 1 }))!;
    expect(JSON.stringify(out)).toMatchInlineSnapshot(
      `"{"command":{"type":"batch","commands":[{"type":"add-node","node":{"id":"sys-2","name":"System","type":"system","plane":"p","layer":"ops"}},{"type":"add-node","node":{"id":"api-2","name":"API","type":"service","plane":"p","layer":"ops"}},{"type":"add-node","node":{"id":"db-2","name":"DB","type":"database","plane":"p","layer":"ops"}},{"type":"add-containment","parent":"sys-2","child":"api-2","plane":"p"},{"type":"add-containment","parent":"sys-2","child":"db-2","plane":"p"},{"type":"set-position","nodeId":"sys-2","x":58,"y":68,"plane":"p"},{"type":"set-size","nodeId":"sys-2","w":300,"h":200},{"type":"set-position","nodeId":"api-2","x":1,"y":2,"plane":"p"},{"type":"set-position","nodeId":"db-2","x":3,"y":4,"plane":"p"},{"type":"set-size","nodeId":"db-2","w":50,"h":40},{"type":"add-relation","from":"api-2","to":"db-2","opts":{"kind":"uses","label":"reads","layer":"ops","description":"d","style":{"line":"dashed"},"polarity":"+","delay":true,"fromColumn":"a","toColumn":"b"}},{"type":"update-relation","id":"api-2->db-2#0","patch":{"labels":[{"id":"l1","text":"x","t":0.4}]}},{"type":"add-relation","from":"db-2","to":"api-2","opts":{"kind":"replies","layer":"ops"}}]},"roots":["sys-2"]}"`,
    );
  });
});
