import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  emptyDrawings,
  emptyLayout,
  validate,
  type DiagramModel,
  type EditorCommand,
} from '@diagc/core/internal';
import { PLAN_LAYOUT, type LayoutApi } from '@diagc/renderer';
import type { EditorApi } from '../editor/useEditor';
import type { LibraryEntry } from '../library/types';
import type { UseLibrary } from '../library/useLibrary';
import { useNodePlacement, type UseNodePlacementOptions } from './useNodePlacement';

/**
 * Like `useViewOps`, `useNodePlacement` calls no React hook of its own — it is a
 * factory of closures over what it is handed — so it runs without a renderer.
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
    setSelection: noop,
    setRenameId: noop,
    setLeftTab: noop,
    requestLabelEdit: noop,
    setSaveIssues: noop,
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
