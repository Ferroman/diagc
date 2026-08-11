// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { model } from '@diagramming/core';
import { legendPadding, Viewer, type ViewerData } from './Viewer';

const m = () => {
  const b = model('demo');
  const a = b.node('a', { name: 'Alpha', type: 'service' });
  const bNode = b.node('b', { name: 'Beta', type: 'database' });
  b.relate(a, bNode, { kind: 'sync' });
  return b.toJSON();
};

const nested = () => {
  const b = model('nest');
  const box = b.node('box', { name: 'Box', type: 'system' });
  box.contains(b.node('inner', { name: 'Inner', type: 'service' }));
  return b.toJSON();
};

describe('Viewer', () => {
  it('renders a diagram read-only', async () => {
    render(<Viewer data={{ model: m() }} />);
    expect(await screen.findByText('Alpha')).toBeDefined();
    expect(screen.getByText('Beta')).toBeDefined();
  });
  it('shows a fallback when there is no diagram', () => {
    render(<Viewer data={null} />);
    expect(screen.getByText(/no diagram/i)).toBeDefined();
  });
  it('shows the fallback (does not crash) for a malformed blob with a null model', () => {
    render(<Viewer data={{ model: null } as unknown as ViewerData} />);
    expect(screen.getByText(/no diagram/i)).toBeDefined();
  });
  it('unfolds nested groups when expandAll is set', async () => {
    render(<Viewer data={{ model: nested() }} expandAll />);
    expect(await screen.findByText('Inner')).toBeDefined(); // child visible only when its container is expanded
  });
  it('applies the light theme tokens so group/node borders resolve', () => {
    document.documentElement.style.removeProperty('--dg-group-stroke');
    render(<Viewer data={{ model: m() }} />);
    // Without applyTheme these --dg-* vars are undefined and every group box
    // renders border-less (border: 1.5px dashed var(--dg-group-stroke) → 0px).
    expect(document.documentElement.style.getPropertyValue('--dg-group-stroke')).not.toBe('');
    expect(document.documentElement.style.getPropertyValue('--dg-node-stroke')).not.toBe('');
  });
});

describe('legendPadding', () => {
  it('passes a reserve the frame can absorb straight through', () => {
    expect(legendPadding(120, 1000)).toBe(120);
  });
  it('caps a reserve taller than half the frame', () => {
    // The snapshot clamps the frame to 1400px; a taller legend would ask fitView
    // to pad away more than the viewport and leave the graph nowhere to sit.
    expect(legendPadding(2000, 1400)).toBe(700);
  });
  it('never returns a negative padding for a degenerate frame', () => {
    expect(legendPadding(50, 0)).toBe(0);
  });
});

interface TestExportWindow {
  __DG_READY__?: boolean;
  __DG_BOUNDS__?: { width: number; height: number };
  __DG_FIT__?: () => void;
}
const exportWindow = () => window as unknown as TestExportWindow;

describe('Viewer export bounds', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete exportWindow().__DG_READY__;
    delete exportWindow().__DG_BOUNDS__;
    delete exportWindow().__DG_FIT__;
  });

  // Shared base so the legended/unlegended variants differ in exactly one
  // thing (the `.legend()` declaration) — that isolates the reserve as the
  // only possible source of a bounds difference between them.
  const legendBase = () => {
    const b = model('l');
    b.layer('flow', { name: 'Data flow', tint: '#0ea5e9' });
    const a = b.node('a', { name: 'Alpha' });
    const c = b.node('c', { name: 'Gamma' });
    b.relate(a, c, { kind: 'flow', layer: 'flow' });
    b.plane('only', { name: 'Only', layers: ['flow'] });
    return b;
  };
  const legended = () => {
    const b = legendBase();
    b.legend();
    return b.toJSON();
  };

  it('grows the export bounds by the legend it renders', async () => {
    // jsdom gives every element a 0x0 rect, so the legend would measure as
    // nothing; stub a realistic size to prove the reserve is actually applied.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 180, height: 90, top: 0, left: 0, right: 180, bottom: 90, x: 0, y: 0, toJSON: () => ({}),
    } as DOMRect);

    const { unmount } = render(<Viewer data={{ model: legended() }} expandAll />);
    await waitFor(() => expect(exportWindow().__DG_READY__).toBe(true), { timeout: 3000 });
    const withLegend = exportWindow().__DG_BOUNDS__!;
    expect(withLegend.height).toBeGreaterThanOrEqual(90);

    // jsdom's ResizeObserver shim reports every node at a flat 800x600 (see
    // test-setup.ts), so contentBounds() alone already clears the 90px floor
    // above regardless of the legend — that floor check alone would pass even
    // if the reserve were never wired in. Isolate the reserve's actual effect
    // by diffing against the identical diagram with no `.legend()` call.
    unmount();
    delete exportWindow().__DG_READY__;
    delete exportWindow().__DG_BOUNDS__;
    render(<Viewer data={{ model: legendBase().toJSON() }} expandAll />);
    await waitFor(() => expect(exportWindow().__DG_READY__).toBe(true), { timeout: 3000 });
    const withoutLegend = exportWindow().__DG_BOUNDS__!;

    expect(withLegend.width).toBe(withoutLegend.width);
    expect(withLegend.height - withoutLegend.height).toBeGreaterThanOrEqual(90);
  });

  it('exposes a fit hook that re-reads the reserve when it is called', async () => {
    // The harness calls __DG_FIT__ after setViewportSize, so the hook must ask
    // the live api for the reserve at that moment rather than replay the value
    // captured during the handshake.
    render(<Viewer data={{ model: legended() }} expandAll />);
    await waitFor(() => expect(exportWindow().__DG_READY__).toBe(true), { timeout: 3000 });
    expect(() => exportWindow().__DG_FIT__!()).not.toThrow();
  });

  it('leaves the bounds alone for a diagram with no legend', async () => {
    render(<Viewer data={{ model: m() }} expandAll />);
    await waitFor(() => expect(exportWindow().__DG_READY__).toBe(true), { timeout: 3000 });
    // jsdom has no layout engine, so contentBounds() doesn't come back
    // `undefined` here as it would with no real DOM to measure — React Flow's
    // node bounds are still derived from jsdom's shimmed (fixed-size) node
    // measurement, giving a real, deterministic box. Assert against that
    // measured-and-ceiled box (not the 1200x800 no-real-layout fallback) —
    // the point either way is that nothing was added on top of it.
    expect(exportWindow().__DG_BOUNDS__).toEqual({ width: 1020, height: 600 });
  });
});
