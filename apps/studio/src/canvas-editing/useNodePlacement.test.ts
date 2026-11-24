import { describe, expect, it, vi } from 'vitest';
import {
  applyCommand,
  emptyDrawings,
  emptyLayout,
  validate,
  type DiagramModel,
  type EditorCommand,
} from '@diagc/core/internal';
import { PLAN_LAYOUT, type LayoutApi } from '@diagc/renderer';
import type { EditorApi } from '../session/useEditor';
import type { LibraryEntry } from '../library/types';
import type { UseLibrary } from '../library/useLibrary';
import { useNodePlacement, type UseNodePlacementOptions } from './useNodePlacement';

// The image import's two round trips, answered here: the upload names the asset
// after the file (and refuses one called bad.png), the size is fixed.
vi.mock('./images', () => ({
  uploadAsset: async (file: File) => {
    if (file.name === 'bad.png') throw new Error('too big');
    return `asset-${file.name}`;
  },
  readImageSize: async () => ({ w: 120, h: 80 }),
}));

/**
 * `useNodePlacement` calls no React hook of its own — it is a factory of
 * closures over what it is handed — so it runs without a renderer.
 * These cover the activity-diagram placement rules and the dates a plan zone or
 * event arrives with; the commands dispatched are the observable.
 */
const activity = (): DiagramModel => ({
  version: 1,
  id: 'd',
  name: 'd',
  nodes: [
    { id: 'f', name: 'F', type: 'activity-frame' },
    { id: 'l1', name: 'L1', type: 'activity-lane' },
    { id: 'l2', name: 'L2', type: 'activity-lane' },
    { id: 'act', name: 'Act', type: 'activity-action' },
    { id: 'box', name: 'Box' },
  ],
  containment: [
    { parent: 'f', child: 'l1' },
    { parent: 'f', child: 'l2' },
    { parent: 'l1', child: 'act' },
  ],
  relations: [],
  layers: [],
  planes: [],
});

const entries: LibraryEntry[] = [
  { id: 'activity-frame', category: 'activity', name: 'Frame', keywords: [], template: { type: 'activity-frame' } },
  {
    id: 'activity-start',
    category: 'activity',
    name: 'Start',
    keywords: [],
    template: { type: 'activity-start', width: 24, height: 24 },
  },
  { id: 'activity-action', category: 'activity', name: 'Action', keywords: [], template: { type: 'activity-action' } },
  { id: 'plan-zone', category: 'plan', name: 'Zone', keywords: [], template: { type: 'plan-zone' } },
  { id: 'plan-event', category: 'plan', name: 'Event', keywords: [], template: { type: 'plan-event' } },
];

// frame at (100,100): l1 banded at y 100–220, l2 at 220–340
const bounds: Record<string, { x: number; y: number; width: number; height: number }> = {
  f: { x: 100, y: 100, width: 348, height: 240 },
  l1: { x: 128, y: 100, width: 320, height: 120 },
  l2: { x: 128, y: 220, width: 320, height: 120 },
};

/** the active plane and its notation; omitted, the default plane with no notation */
type PlaneContext = Partial<Pick<UseNodePlacementOptions, 'activePlane' | 'notation'>>;

function harness(m: DiagramModel, selection: string | null = null, plane: PlaneContext = {}) {
  const dispatched: EditorCommand[] = [];
  const session = { state: { model: m } } as unknown as NonNullable<EditorApi['session']>;
  const editor = {
    session,
    peek: () => session,
    dispatch: (c: EditorCommand) => dispatched.push(c),
  } as unknown as EditorApi;
  const layoutApi = { nodeBounds: (id: string) => bounds[id] } as unknown as LayoutApi;
  const noop = () => {};
  // Safe despite the name: useNodePlacement calls no React hook of its own.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const placement = useNodePlacement({
    editor,
    layoutApiRef: { current: layoutApi },
    selectNode: noop,
    selectNodeForRename: noop,
    selectTab: noop,
    requestLabelEdit: noop,
    reportIssues: noop,
    activePlane: undefined,
    activePlaneBorrowsContainment: false,
    activePlaneManual: false,
    penLayer: null,
    selection: selection === null ? null : { kind: 'node', id: selection },
    drillRoot: undefined,
    model: m,
    lib: { library: { categories: [], entries } } as unknown as UseLibrary,
    today: '2026-01-01',
    ...plane,
  });
  return { placement, dispatched };
}

/** flatten batches so assertions read one command list */
const flat = (cs: EditorCommand[]): EditorCommand[] => cs.flatMap((c) => (c.type === 'batch' ? flat(c.commands) : [c]));
const addsOf = (cs: EditorCommand[]) => flat(cs).filter((c) => c.type === 'add-node');
const positionsOf = (cs: EditorCommand[]) => flat(cs).filter((c) => c.type === 'set-position');

describe('useNodePlacement — activity diagrams', () => {
  it('a frame placed from the library arrives with its first lane, in one undo step', () => {
    const { placement, dispatched } = harness({ ...activity(), nodes: [], containment: [] });
    placement.dropLibraryEntry('activity-frame', { x: 0, y: 0 });
    const batch = dispatched.find((c) => c.type === 'batch');
    expect(batch).toBeDefined();
    const [frame, lane] = addsOf([batch!]) as Extract<EditorCommand, { type: 'add-node' }>[];
    expect(frame!.node.type).toBe('activity-frame');
    expect(lane!.node).toMatchObject({ name: 'Lane 1', type: 'activity-lane' });
    expect(lane!.parent).toEqual({ id: frame!.node.id });
  });

  it('a drop on the frame lands in the lane under the pointer, at the drop point', () => {
    const { placement, dispatched } = harness(activity());
    placement.dropLibraryEntry('activity-start', { x: 300, y: 280 }, 'f');
    expect(addsOf(dispatched)[0]!.parent).toEqual({ id: 'l2' });
    // centered on the pointer, lane-relative: 300-128-12, 280-220-12
    expect(positionsOf(dispatched)).toEqual([{ type: 'set-position', nodeId: expect.any(String), x: 160, y: 48 }]);
  });

  it('a drop on an action lands beside it in its lane, not inside it', () => {
    const { placement, dispatched } = harness(activity());
    placement.dropLibraryEntry('activity-action', { x: 300, y: 150 }, 'act');
    expect(addsOf(dispatched)[0]!.parent).toEqual({ id: 'l1' });
    expect(positionsOf(dispatched)).toHaveLength(1);
  });

  it('click-to-place with the frame selected nests in the first lane, elk-placed', () => {
    const { placement, dispatched } = harness(activity(), 'f');
    placement.placeFromLibrary(entries[1]!);
    expect(addsOf(dispatched)[0]!.parent).toEqual({ id: 'l1' });
    expect(positionsOf(dispatched)).toEqual([]);
  });

  it('a drop on an ordinary container still nests there without a position', () => {
    const { placement, dispatched } = harness(activity());
    placement.dropLibraryEntry('activity-action', { x: 10, y: 10 }, 'box');
    expect(addsOf(dispatched)[0]!.parent).toEqual({ id: 'box' });
    expect(positionsOf(dispatched)).toEqual([]);
  });
});

// No plane declares the plan notation. `design` (Jan 5 – Jan 30) is a dated
// zone a drop can land on; it also gives the default plane a plan origin
// (Jan 1), which a drop point could be misread against.
const offPlan = (): DiagramModel => ({
  version: 1,
  id: 'd',
  name: 'd',
  nodes: [
    { id: 'design', name: 'Design', type: 'plan-zone', metadata: { start: '2026-01-05', end: '2026-01-30' } },
    { id: 'api', name: 'API', type: 'service' },
  ],
  containment: [],
  relations: [],
  layers: [],
  planes: [],
});

/** the model the dispatched commands leave behind */
function applied(m: DiagramModel, cs: EditorCommand[]): DiagramModel {
  let state = { model: m, layout: emptyLayout(), drawings: emptyDrawings() };
  for (const c of cs) state = applyCommand(state, c).state;
  return state.model;
}

const metadataOf = (cs: EditorCommand[]) =>
  (addsOf(cs)[0] as Extract<EditorCommand, { type: 'add-node' }>).node.metadata;

// Sixty days past the Jan 1 origin on a plan plane's time axis: March 2.
const SIXTY_DAYS = { x: 60 * PLAN_LAYOUT.DAY, y: 0 };

describe('useNodePlacement — plan zones and events off a plan plane', () => {
  it('core checks their dates on any plane, so an undated one blocks the save', () => {
    const undated = offPlan();
    undated.nodes.push({ id: 'z', name: 'Z', type: 'plan-zone' }, { id: 'e', name: 'E', type: 'plan-event' });
    expect(validate(undated).map((i) => `${i.code} ${i.message}`)).toEqual([
      "plan-missing 'z' (plan-zone) has no 'start' date",
      "plan-missing 'z' (plan-zone) has no 'end' date",
      "plan-missing 'e' (plan-event) has no 'at' date",
    ]);
  });

  it('click-to-place seeds a Zone or an Event from today, and the result validates', () => {
    for (const [id, dates] of [
      ['plan-zone', { start: '2026-01-01', end: '2026-01-14' }],
      ['plan-event', { at: '2026-01-01' }],
    ] as const) {
      const { placement, dispatched } = harness(offPlan());
      placement.placeFromLibrary(entries.find((e) => e.id === id)!);
      expect(metadataOf(dispatched)).toEqual(dates);
      expect(validate(applied(offPlan(), dispatched))).toEqual([]);
    }
  });

  it('a drop seeds inside the zone it lands on, else from today, never from the drop point', () => {
    const onZone = harness(offPlan());
    onZone.placement.dropLibraryEntry('plan-zone', SIXTY_DAYS, 'design');
    expect(metadataOf(onZone.dispatched)).toEqual({ start: '2026-01-05', end: '2026-01-18' });
    expect(validate(applied(offPlan(), onZone.dispatched))).toEqual([]);

    const bare = harness(offPlan());
    bare.placement.dropLibraryEntry('plan-event', SIXTY_DAYS);
    expect(metadataOf(bare.dispatched)).toEqual({ at: '2026-01-01' });
    expect(validate(applied(offPlan(), bare.dispatched))).toEqual([]);
  });

  it('on a plan plane a drop lands on the day under the pointer', () => {
    const plan: DiagramModel = { ...offPlan(), planes: [{ id: 'plan', name: 'Plan', notation: 'plan' }] };
    const { placement, dispatched } = harness(plan, null, { activePlane: 'plan', notation: 'plan' });
    placement.dropLibraryEntry('plan-event', SIXTY_DAYS);
    expect(metadataOf(dispatched)).toEqual({ at: '2026-03-02' });
  });

  it('any other entry arrives without dates', () => {
    const { placement, dispatched } = harness(offPlan());
    placement.dropLibraryEntry('activity-action', SIXTY_DAYS);
    expect(metadataOf(dispatched)).toBeUndefined();
  });
});

describe('useNodePlacement — every flow, command by command', () => {
  /** the editor applies what is dispatched, so a flow that reads the model again sees its own adds */
  function live(m: DiagramModel, over: Partial<UseNodePlacementOptions> = {}) {
    const dispatched: EditorCommand[] = [];
    let state = { model: m, layout: emptyLayout(), drawings: emptyDrawings() };
    const session = () => ({ state }) as unknown as NonNullable<EditorApi['session']>;
    const editor = {
      get session() {
        return session();
      },
      peek: session,
      dispatch: (c: EditorCommand) => {
        dispatched.push(c);
        state = applyCommand(state, c).state;
      },
    } as unknown as EditorApi;
    const calls: string[] = [];
    const record = (name: string) => (arg: unknown) => void calls.push(`${name} ${JSON.stringify(arg)}`);
    const layoutApi = {
      nodeBounds: () => undefined,
      viewportCenter: () => ({ x: 500, y: 300 }),
    } as unknown as LayoutApi;
    // eslint-disable-next-line react-hooks/rules-of-hooks -- calls no React hook of its own
    const placement = useNodePlacement({
      editor,
      layoutApiRef: { current: layoutApi },
      selectNode: record('selectNode'),
      selectNodeForRename: record('selectNodeForRename'),
      selectTab: record('selectTab'),
      requestLabelEdit: record('requestLabelEdit'),
      reportIssues: record('reportIssues'),
      activePlane: 'p',
      activePlaneBorrowsContainment: false,
      activePlaneManual: false,
      penLayer: 'ink',
      selection: null,
      drillRoot: undefined,
      model: m,
      lib: { library: { categories: [], entries } } as unknown as UseLibrary,
      today: '2026-01-01',
      ...over,
    });
    return { placement, dispatched, calls };
  }
  const plain = (): DiagramModel => ({
    version: 1,
    id: 'd',
    name: 'd',
    nodes: [
      { id: 'box', name: 'Box' },
      { id: 'table', name: 'T', type: 'db-table', columns: [{ name: 'pk', pk: true }] },
    ],
    containment: [],
    relations: [],
    layers: [{ id: 'ink', name: 'Ink' }],
    planes: [{ id: 'p', name: 'P' }],
  });
  const card: LibraryEntry = {
    id: 'svc',
    category: 'c',
    name: 'Service',
    keywords: [],
    template: { type: 'service', color: '#123456', width: 100, height: 60, columns: [{ name: 'id' }] },
  };

  // breaks if an image is no longer added, sized and placed per file (the
  // second one reading the model the first left), or the failures stop
  // arriving as one banner
  it('imports images one by one, and reports what failed once', async () => {
    const { placement, dispatched, calls } = live(plain());
    const file = (name: string) => new File(['x'], name, { type: 'image/png' });
    await placement.addImages([file('a.png'), file('bad.png'), file('a.png')], { x: 200, y: 100 });
    expect(JSON.stringify(dispatched)).toMatchInlineSnapshot(
      `"[{"type":"add-node","node":{"id":"image","name":"a","type":"image","image":"asset-a.png","plane":"p","layer":"ink"}},{"type":"set-size","nodeId":"image","w":120,"h":80},{"type":"set-position","nodeId":"image","x":140,"y":60,"plane":"p"},{"type":"add-node","node":{"id":"image-2","name":"a","type":"image","image":"asset-a.png","plane":"p","layer":"ink"}},{"type":"set-size","nodeId":"image-2","w":120,"h":80},{"type":"set-position","nodeId":"image-2","x":140,"y":60,"plane":"p"}]"`,
    );
    expect(calls).toMatchInlineSnapshot(`
      [
        "selectNode "image"",
        "selectNode "image-2"",
        "reportIssues [{"message":"too big"}]",
      ]
    `);
  });

  // breaks if a card placed by a drop changes its node, its size, its spot,
  // or stops opening its name on the canvas
  it('places a card at the drop point, sized, and names it in place', () => {
    const { placement, dispatched, calls } = live(plain());
    placement.placeFromLibrary(card, { position: { x: 400, y: 300 } });
    expect(JSON.stringify(dispatched)).toMatchInlineSnapshot(
      `"[{"type":"add-node","node":{"id":"node","name":"Service","type":"service","color":"#123456","columns":[{"name":"id"}],"plane":"p","layer":"ink"}},{"type":"set-size","nodeId":"node","w":100,"h":60},{"type":"set-position","nodeId":"node","x":350,"y":270,"plane":"p"}]"`,
    );
    expect(calls).toMatchInlineSnapshot(`
      [
        "selectNode "node"",
        "requestLabelEdit "node"",
      ]
    `);
  });

  // breaks if a restyle stops stamping a card's columns on a column-less node,
  // or starts overwriting a table's own
  it('restyles the selection, stamping columns only onto a node with none', () => {
    const box = live(plain(), { selection: { kind: 'node', id: 'box' } });
    box.placement.applyFromLibrary(card);
    expect(JSON.stringify(box.dispatched)).toMatchInlineSnapshot(
      `"[{"type":"set-node-details","id":"box","details":{"type":"service","color":"#123456","image":null,"shape":null}},{"type":"set-size","nodeId":"box","w":100,"h":60},{"type":"set-table-columns","id":"box","columns":[{"name":"id"}]}]"`,
    );
    const table = live(plain(), { selection: { kind: 'node', id: 'table' } });
    table.placement.applyFromLibrary(card);
    expect(table.dispatched.map((c) => c.type)).toEqual(['set-node-details', 'set-size']);
  });

  // breaks if Add node stops centering a root node on a manual plane, or stops
  // handing its name to Properties
  it('adds a node at the viewport centre on a manual plane, and opens its name in Properties', () => {
    const { placement, dispatched, calls } = live(plain(), { activePlaneManual: true });
    placement.addNode();
    expect(JSON.stringify(dispatched)).toMatchInlineSnapshot(
      `"[{"type":"add-node","node":{"id":"node","name":"node","plane":"p","layer":"ink"}},{"type":"set-position","nodeId":"node","x":420,"y":260,"plane":"p"}]"`,
    );
    expect(calls).toMatchInlineSnapshot(`
      [
        "selectTab "properties"",
        "selectNodeForRename "node"",
      ]
    `);
  });

  // breaks if a double-click create stops landing on its point or answering its id
  it('creates a node centred on a double-click, and answers its id', () => {
    const { placement, dispatched, calls } = live(plain());
    expect(placement.createAt({ x: 50, y: 60 })).toBe('node');
    expect(JSON.stringify(dispatched)).toMatchInlineSnapshot(
      `"[{"type":"add-node","node":{"id":"node","name":"node","plane":"p","layer":"ink"}},{"type":"set-position","nodeId":"node","x":-30,"y":20,"plane":"p"}]"`,
    );
    expect(calls).toMatchInlineSnapshot(`
      [
        "selectNode "node"",
      ]
    `);
  });
});
