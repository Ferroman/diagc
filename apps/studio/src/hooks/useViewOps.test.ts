import { describe, expect, it } from 'vitest';
import { model, type DiagramModel, type EditorCommand, type LayoutOverlay } from '@diagc/core';
import { useViewOps, type UseViewOpsOptions, type ViewOps } from './useViewOps';

/**
 * `useViewOps` calls no React hook of its own — it is a factory of closures over
 * the setters it is handed — so it can be exercised directly, without a renderer.
 * That matters here: the studio's own DOM-dependent suites cannot run on this
 * Node (missing localStorage), and the rule under test is state bookkeeping.
 */
function harness(
  m: DiagramModel,
  start: { plane?: string; activeLayers?: string[]; layout?: LayoutOverlay; editing?: boolean } = {},
) {
  const dispatched: EditorCommand[] = [];
  const state = {
    plane: start.plane,
    activeLayers: start.activeLayers ?? [],
    activeLayer: null as string | null,
    pins: {} as Record<string, 'expanded' | 'collapsed'>,
  };
  const cell = <T,>(get: () => T, set: (v: T) => void) => (next: T | ((cur: T) => T)) =>
    set(typeof next === 'function' ? (next as (cur: T) => T)(get()) : next);
  // The dock tab the user is on. `UseViewOpsOptions` no longer declares a
  // `setLeftTab` — this recording one is handed over anyway (the object is cast),
  // as the tripwire for the "a canvas selection never moves the dock" policy:
  // putting a setLeftTab call back into `select` would move this cell and fail
  // the test below.
  let leftTab = 'library';
  const opts = {
    editor: { dispatch: (c: EditorCommand) => dispatched.push(c) },
    model: m,
    layout: start.layout,
    get pins() {
      return state.pins;
    },
    selection: null,
    groupSel: [],
    editing: start.editing ?? false,
    notation: undefined,
    activePlane: state.plane,
    activePlaneBorrowsContainment: false,
    planes: m.planes,
    get activeLayer() {
      return state.activeLayer;
    },
    get activeLayers() {
      return state.activeLayers;
    },
    setSelection: () => {},
    setRenameId: () => {},
    setLeftTab: (t: string) => {
      leftTab = t;
    },
    setLeverageFocus: () => {},
    setCompareId: () => {},
    setLayoutPreview: () => {},
    setPlane: cell(
      () => state.plane,
      (v) => {
        state.plane = v;
      },
    ),
    setPins: cell(
      () => state.pins,
      (v) => {
        state.pins = v;
      },
    ),
    setActiveLayers: cell(
      () => state.activeLayers,
      (v) => {
        state.activeLayers = v;
      },
    ),
    setActiveLayer: cell(
      () => state.activeLayer,
      (v) => {
        state.activeLayer = v;
      },
    ),
  } as unknown as UseViewOpsOptions;
  // Safe despite the name: useViewOps calls no React hook of its own (see the
  // note above), so there is no hook order for a plain function to violate.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const ops: ViewOps = useViewOps(opts);
  return {
    ops,
    state,
    dispatched,
    get leftTab() {
      return leftTab;
    },
  };
}

function twoPlanes(): DiagramModel {
  const m = model('seed');
  m.layer('nats', { name: 'NATS messaging' });
  m.layer('monitoring', { name: 'Monitoring' });
  m.plane('landscape', { name: 'Landscape', layers: ['nats', 'monitoring'] });
  m.plane('bare', { name: 'Bare' });
  m.node('a', { type: 'service' });
  return m.toJSON();
}

describe('useViewOps layer seeding', () => {
  it("switching to a plane seeds the switch from that plane's presets", () => {
    const { ops, state } = harness(twoPlanes());
    ops.switchPlane('landscape');
    expect(state.activeLayers).toEqual(['nats', 'monitoring']);
    ops.switchPlane('bare');
    expect(state.activeLayers).toEqual([]);
  });

  it('a seeded preset layer can then be turned OFF and stays off', () => {
    // The whole point of seeding: the user owns the state afterwards. Before the
    // fix compileView re-unioned the plane's presets underneath this, so the
    // NATS arrows never left the canvas however the chip was set.
    const { ops, state } = harness(twoPlanes());
    ops.switchPlane('landscape');
    ops.toggleLayer('nats');
    expect(state.activeLayers).toEqual(['monitoring']);
    ops.toggleLayer('monitoring');
    expect(state.activeLayers).toEqual([]);
  });

  it("seeded state is a copy: toggling never mutates the model's own layers array", () => {
    const m = twoPlanes();
    const { ops } = harness(m);
    ops.switchPlane('landscape');
    ops.toggleLayer('nats');
    expect(m.planes[0]!.layers).toEqual(['nats', 'monitoring']);
  });

  it('resetting the view seeds from the default plane, which is the first one', () => {
    // The studio's "Default" chip clears `plane`, and compileView resolves an
    // absent plane to planes[0] — so the switch must seed from planes[0] too, or
    // the chips describe a different view from the one on the canvas.
    const { ops, state } = harness(twoPlanes(), { plane: 'bare' });
    ops.resetView();
    expect(state.plane).toBeUndefined();
    expect(state.activeLayers).toEqual(['nats', 'monitoring']);
  });
});

describe('useViewOps selection and the inspector tab', () => {
  it('a canvas selection keeps the tab the user chose (the Library stays open while adding)', () => {
    // Selecting used to flip the dock to Properties, so every node placed from
    // the Library cost a trip back to the palette. Only the toolbar add and
    // re-entering edit mode choose the tab now.
    const h = harness(twoPlanes(), { editing: true });
    h.ops.select({ kind: 'node', id: 'a' });
    expect(h.leftTab).toBe('library');
    h.ops.select({ kind: 'edge', id: 'x' });
    expect(h.leftTab).toBe('library');
  });
});

describe('useViewOps folds', () => {
  const layout: LayoutOverlay = { version: 1, planes: {}, unfolded: { landscape: ['sys'], bare: ['other'] } };

  it('a plane opens the way it was saved, and the default view the way planes[0] was', () => {
    const { ops, state } = harness(twoPlanes(), { layout });
    ops.switchPlane('bare');
    expect(state.pins).toEqual({ other: 'expanded' });
    ops.resetView(); // plane undefined resolves to planes[0] — 'landscape'
    expect(state.pins).toEqual({ sys: 'expanded' });
  });

  it('the fold chip lands in the state the canvas asked for', () => {
    const { ops, state } = harness(twoPlanes());
    ops.toggleExpand('sys', 'expanded');
    ops.toggleExpand('db', 'expanded');
    ops.toggleExpand('sys', 'collapsed');
    expect(state.pins).toEqual({ sys: 'collapsed', db: 'expanded' });
  });

  it('view mode only changes the screen; edit mode records what is open as a command', () => {
    const view = harness(twoPlanes());
    view.ops.toggleExpand('sys', 'expanded');
    expect(view.dispatched).toEqual([]);

    const edit = harness(twoPlanes(), { editing: true, plane: 'bare' });
    edit.ops.toggleExpand('sys', 'expanded');
    expect(edit.dispatched).toEqual([{ type: 'set-unfolded', ids: ['sys'], plane: 'bare' }]);
  });
});
