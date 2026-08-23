// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { model } from '@diagramming/core';
import { handshakeReady, legendPadding, Viewer, type ViewerData } from './Viewer';

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

// Two planes over one set of nodes, in the shape the composed platform views
// have: a first plane that hides some of the model (the landscape / the PNG) and
// a fuller second one, which also carries its own notation so a switch can be
// observed in the drawn language as well as in the boxes.
const twoPlanes = () => {
  const b = model('planed');
  b.node('a', { name: 'Alpha', type: 'service' });
  b.node('z', { name: 'Zeta', type: 'service' });
  b.plane('landscape', { name: 'Landscape', hides: ['z'] });
  b.plane('full', { name: 'Full platform', notation: 'causal-loop' });
  return b.toJSON();
};

const onePlane = () => {
  const b = model('single');
  b.node('a', { name: 'Alpha', type: 'service' });
  b.plane('only', { name: 'Only one' });
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
  it('keeps a group listed in layout.export.collapsed folded even under expandAll', async () => {
    // The PNG exporter unfolds everything, which makes a view with hundreds of
    // leaves unreadable. `export.collapsed` folds named groups back up for the
    // image only — and folding, unlike a plane's `hides`, re-anchors the hidden
    // children's edges onto the folded box instead of dropping them.
    render(
      <Viewer
        data={{ model: nested(), layout: { version: 1, planes: {}, export: { collapsed: ['box'] } } }}
        expandAll
      />,
    );
    expect(await screen.findByText('Box')).toBeDefined();
    expect(screen.queryByText('Inner')).toBeNull();
  });
  it('applies the light theme tokens so group/node borders resolve', () => {
    document.documentElement.style.removeProperty('--dg-group-stroke');
    render(<Viewer data={{ model: m() }} />);
    // Without applyTheme these --dg-* vars are undefined and every group box
    // renders border-less (border: 1.5px dashed var(--dg-group-stroke) → 0px).
    expect(document.documentElement.style.getPropertyValue('--dg-group-stroke')).not.toBe('');
    expect(document.documentElement.style.getPropertyValue('--dg-node-stroke')).not.toBe('');
  });
  it('forwards the stamped drawings to the canvas, in the interactive page and the export', async () => {
    const drawings = { version: 1 as const, planes: { default: [{ id: 'k1', points: [1, 1, 50, 50] }] } };
    const { container, unmount } = render(<Viewer data={{ model: m(), drawings }} />);
    await waitFor(() => expect(container.querySelector('path.dg-stroke')).not.toBeNull());
    unmount();
    const exported = render(<Viewer data={{ model: m(), drawings }} expandAll />);
    await waitFor(() => expect(exported.container.querySelector('path.dg-stroke')).not.toBeNull());
  });
});

describe('Viewer plane picker', () => {
  const picker = () => screen.queryByRole('group', { name: /plane/i });

  it('offers no picker for a model with one plane or none', async () => {
    const { unmount } = render(<Viewer data={{ model: m() }} />);
    expect(await screen.findByText('Alpha')).toBeDefined();
    expect(picker()).toBeNull();
    unmount();
    render(<Viewer data={{ model: onePlane() }} />);
    expect(await screen.findByText('Alpha')).toBeDefined();
    // One plane is not a choice — a control with a single option is noise.
    expect(picker()).toBeNull();
  });

  it('lists every plane by name and marks the first one current on load', async () => {
    render(<Viewer data={{ model: twoPlanes() }} />);
    expect(await screen.findByText('Alpha')).toBeDefined();
    expect(picker()).not.toBeNull();
    const first = screen.getByRole('button', { name: 'Landscape' });
    expect(screen.getByRole('button', { name: 'Full platform' })).toBeDefined();
    // The page opens on the model's first plane, matching the PNG.
    expect(first.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Full platform' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByText('Zeta')).toBeNull(); // hidden on the landscape
  });

  it('switches the drawn plane, and mirrors the new plane notation', async () => {
    const { container } = render(<Viewer data={{ model: twoPlanes() }} />);
    expect(await screen.findByText('Alpha')).toBeDefined();
    expect(container.querySelector('.dg-canvas.dg-notation-cld')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Full platform' }));

    // the second plane hides nothing, so the landscape-hidden node appears…
    expect(await screen.findByText('Zeta')).toBeDefined();
    // …and the plane's own notation travels with it (same mirroring the first
    // plane already got), which the canvas advertises as a class.
    expect(container.querySelector('.dg-canvas.dg-notation-cld')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Full platform' }).getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Landscape' }));
    await waitFor(() => expect(screen.queryByText('Zeta')).toBeNull());
    expect(container.querySelector('.dg-canvas.dg-notation-cld')).toBeNull();
  });

  it('hides the picker in export mode and keeps drawing the first plane', async () => {
    render(<Viewer data={{ model: twoPlanes() }} expandAll />);
    expect(await screen.findByText('Alpha')).toBeDefined();
    // The PNG is a one-shot screenshot: a control would be baked into the image,
    // and the exported plane stays the first one.
    expect(picker()).toBeNull();
    expect(screen.queryByText('Zeta')).toBeNull();
  });
});

/**
 * A published page is where the layer bug was reported from: both platform-c4
 * planes preset both layers, so a reader who wanted the NATS mesh off had no way
 * to ask — and the compiler unioned the presets back in even when a host did.
 * The toggles live on the legend's LAYERS rows, which the renderer already turns
 * into buttons the moment a host supplies `onToggleLayer`.
 */
const layered = () => {
  const b = model('layered');
  b.layer('nats', { name: 'NATS messaging', tint: '#5c6bc0' });
  b.layer('monitoring', { name: 'Monitoring', tint: '#90a4ae' });
  const a = b.node('a', { name: 'Alpha', type: 'service' });
  const c = b.node('c', { name: 'Gamma', type: 'service' });
  b.node('probe', { name: 'Probe', type: 'service', layer: 'monitoring' });
  b.relate(a, c, { kind: 'nats', label: 'events', layer: 'nats' });
  b.plane('landscape', { name: 'Landscape', layers: ['nats', 'monitoring'] });
  b.plane('bare', { name: 'Bare' }); // presets nothing
  b.legend({ show: ['layers'] });
  return b.toJSON();
};

const layerToggle = (name: RegExp) => screen.getByRole('button', { name });

describe('Viewer layer toggles', () => {
  it('opens with the plane presets on and every preset row pressed', async () => {
    render(<Viewer data={{ model: layered() }} />);
    expect(await screen.findByText('Alpha')).toBeDefined();
    // A node on the monitoring layer is drawn because the plane presets it.
    expect(screen.getByText('Probe')).toBeDefined();
    expect(layerToggle(/NATS messaging/).getAttribute('aria-pressed')).toBe('true');
    expect(layerToggle(/Monitoring/).getAttribute('aria-pressed')).toBe('true');
  });

  it('turning a preset layer off removes what it draws', async () => {
    render(<Viewer data={{ model: layered() }} />);
    expect(await screen.findByText('Probe')).toBeDefined();
    fireEvent.click(layerToggle(/Monitoring/));
    await waitFor(() => expect(screen.queryByText('Probe')).toBeNull());
    expect(layerToggle(/Monitoring/).getAttribute('aria-pressed')).toBe('false');
    // The other preset layer is untouched by the one the reader switched.
    expect(layerToggle(/NATS messaging/).getAttribute('aria-pressed')).toBe('true');
  });

  it('re-seeds from the new plane presets on a plane switch', async () => {
    render(<Viewer data={{ model: layered() }} />);
    expect(await screen.findByText('Probe')).toBeDefined();
    fireEvent.click(layerToggle(/Monitoring/));
    await waitFor(() => expect(screen.queryByText('Probe')).toBeNull());

    // 'bare' presets no layers, so its own seed is empty: the row stays listed
    // (a reader can switch it on there) but comes up unpressed and undrawn.
    fireEvent.click(screen.getByRole('button', { name: 'Bare' }));
    await waitFor(() => expect(layerToggle(/Monitoring/).getAttribute('aria-pressed')).toBe('false'));
    expect(layerToggle(/NATS messaging/).getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(screen.getByRole('button', { name: 'Landscape' }));
    // Back on the landscape the presets are re-seeded, so Probe returns.
    expect(await screen.findByText('Probe')).toBeDefined();
    expect(layerToggle(/Monitoring/).getAttribute('aria-pressed')).toBe('true');
  });

  it('offers no toggles in export mode, and draws the presets anyway', async () => {
    render(<Viewer data={{ model: layered() }} expandAll />);
    expect(await screen.findByText('Alpha')).toBeDefined();
    // The PNG must not bake a control in, and must keep both preset layers.
    expect(screen.queryByRole('button', { name: /NATS messaging/ })).toBeNull();
    expect(screen.getByText('Probe')).toBeDefined();
  });
});

describe('handshakeReady', () => {
  // The exporter screenshots whatever frame the handshake asks for, so a
  // handshake that fires before ELK has laid the graph out sizes the frame from
  // the 1200x800 no-layout fallback and the real (much wider) graph is then
  // fitted into the wrong aspect. Measured on the EngageRocket platform-c4 page:
  // nodes appeared at ~3.2s, the old fixed 500ms handshake fired first, and the
  // 301-node diagram exported into a portrait frame with half of it blank.
  const box = (width: number, height: number) => ({ width, height });

  it('refuses to publish while the layout has produced no nodes', () => {
    expect(handshakeReady(undefined, undefined, 500, 10_000)).toBe(false);
  });
  it('refuses to publish the first measurement on its own', () => {
    // One sample cannot tell a settled layout from one still moving.
    expect(handshakeReady(undefined, box(4000, 2000), 500, 10_000)).toBe(false);
  });
  it('publishes once two consecutive measurements agree', () => {
    expect(handshakeReady(box(4000, 2000), box(4000, 2000), 700, 10_000)).toBe(true);
  });
  it('keeps waiting while consecutive measurements disagree', () => {
    expect(handshakeReady(box(4000, 2000), box(4200, 2000), 700, 10_000)).toBe(false);
  });
  it('gives up at the deadline so an empty or pathological page still exports', () => {
    // snapshot.ts abandons the page after 15s; the handshake must fire first,
    // with the fallback bounds, rather than let the export fail outright.
    expect(handshakeReady(undefined, undefined, 10_000, 10_000)).toBe(true);
    expect(handshakeReady(box(1, 1), box(9, 9), 12_000, 10_000)).toBe(true);
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
  __DG_RESERVE__?: { side: 'top' | 'right' | 'bottom' | 'left'; px: number } | null;
  __DG_FIT__?: (pad?: number) => void;
}
const exportWindow = () => window as unknown as TestExportWindow;

describe('Viewer export bounds', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete exportWindow().__DG_READY__;
    delete exportWindow().__DG_BOUNDS__;
    delete exportWindow().__DG_RESERVE__;
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

  it('publishes the legend reserve beside the bounds, not folded into them', async () => {
    // jsdom gives every element a 0x0 rect, so the legend would measure as
    // nothing; stub a realistic size to prove the reserve is actually applied.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 180, height: 90, top: 0, left: 0, right: 180, bottom: 90, x: 0, y: 0, toJSON: () => ({}),
    } as DOMRect);

    const { unmount } = render(<Viewer data={{ model: legended() }} expandAll />);
    await waitFor(() => expect(exportWindow().__DG_READY__).toBe(true), { timeout: 3000 });
    const withLegend = exportWindow().__DG_BOUNDS__!;
    const reserve = exportWindow().__DG_RESERVE__;
    expect(reserve).not.toBeNull();
    expect(reserve!.px).toBeGreaterThanOrEqual(90);
    expect(reserve!.side).toBe('bottom');

    // The reserve is screen px and the content bounds are flow units: the
    // snapshot scales one and not the other, so mixing them made the capture
    // frame short by reserve*(1-scale). Prove they are kept apart — the bounds
    // must be identical to the same diagram with no `.legend()` call.
    unmount();
    delete exportWindow().__DG_READY__;
    delete exportWindow().__DG_BOUNDS__;
    delete exportWindow().__DG_RESERVE__;
    render(<Viewer data={{ model: legendBase().toJSON() }} expandAll />);
    await waitFor(() => expect(exportWindow().__DG_READY__).toBe(true), { timeout: 3000 });

    expect(exportWindow().__DG_BOUNDS__).toEqual(withLegend);
    expect(exportWindow().__DG_RESERVE__ ?? null).toBeNull();
  });

  it('exposes a fit hook that re-reads the reserve when it is called', async () => {
    // The harness calls __DG_FIT__ after setViewportSize, so the hook must ask
    // the live api for the reserve at that moment rather than replay the value
    // captured during the handshake.
    render(<Viewer data={{ model: legended() }} expandAll />);
    await waitFor(() => expect(exportWindow().__DG_READY__).toBe(true), { timeout: 3000 });
    expect(() => exportWindow().__DG_FIT__!()).not.toThrow();
    expect(() => exportWindow().__DG_FIT__!(32)).not.toThrow();
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
