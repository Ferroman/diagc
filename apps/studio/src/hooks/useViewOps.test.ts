import { describe, expect, it } from 'vitest';
import { model, type DiagramModel } from '@diagramming/core';
import { useViewOps, type UseViewOpsOptions, type ViewOps } from './useViewOps';

/**
 * `useViewOps` calls no React hook of its own — it is a factory of closures over
 * the setters it is handed — so it can be exercised directly, without a renderer.
 * That matters here: the studio's own DOM-dependent suites cannot run on this
 * Node (missing localStorage), and the rule under test is state bookkeeping.
 */
function harness(m: DiagramModel, start: { plane?: string; activeLayers?: string[] } = {}) {
  const state = {
    plane: start.plane,
    activeLayers: start.activeLayers ?? [],
    activeLayer: null as string | null,
    pins: {} as Record<string, 'expanded' | 'collapsed'>,
  };
  const cell = <T,>(get: () => T, set: (v: T) => void) => (next: T | ((cur: T) => T)) =>
    set(typeof next === 'function' ? (next as (cur: T) => T)(get()) : next);
  const opts = {
    editor: { dispatch: () => {} },
    model: m,
    selection: null,
    groupSel: [],
    editing: false,
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
    setLeftTab: () => {},
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
  return { ops, state };
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
