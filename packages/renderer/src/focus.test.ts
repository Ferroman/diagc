import { describe, expect, it } from 'vitest';
import { compileView, model, type DiagramModel, type Size } from '@diagramming/core';
import { COLLAPSED_SIZE, type NodeGeometry } from './layout';
import { computeFocusChain, focusForVisible, FOCUS_ENTER_FRACTION, FOCUS_EXIT_FRACTION } from './focus';

function twoPlaneModel(): DiagramModel {
  const m = model('tp');
  m.plane('arch').plane('infra');
  const api = m.node('api', { type: 'service' });
  const sys = m.node('sys', { type: 'system' });
  const plat = m.node('plat', { type: 'platform' });
  const box = m.node('box', { type: 'infra' });
  plat.contains(sys);
  sys.contains(api);
  box.contains(api, { plane: 'infra' });
  return m.toJSON();
}

function makeModel(): DiagramModel {
  const m = model('t');
  const a = m.node('a', { type: 'service' });
  const sys = m.node('sys', { type: 'system' });
  const other = m.node('other', { type: 'system' });
  const root = m.node('root', { type: 'platform' });
  sys.contains(a);
  other.contains(m.node('b', { type: 'service' }));
  root.contains(sys, other);
  return m.toJSON();
}

const extents = new Map<string, Size>([
  ['root', { width: 1000, height: 600 }],
  ['sys', { width: 400, height: 300 }],
  ['other', { width: 400, height: 300 }],
]);
const vmin = 800;

/** everything collapsed: root renders as a single chip at (100, 100) */
function collapsedSetup() {
  const view = compileView(makeModel(), {});
  const geometry = new Map<string, NodeGeometry>([
    ['root', { x: 100, y: 100, ...COLLAPSED_SIZE }],
    ['k8s-ish', { x: 500, y: 100, width: 160, height: 80 }],
  ]);
  return { view, geometry };
}

/** root expanded: chips for sys/other inside it (parent-relative positions) */
function expandedSetup() {
  const view = compileView(makeModel(), { focus: ['root'] });
  const geometry = new Map<string, NodeGeometry>([
    ['root', { x: 100, y: 100, width: 520, height: 240 }],
    ['sys', { x: 20, y: 40, ...COLLAPSED_SIZE }],
    ['other', { x: 260, y: 40, ...COLLAPSED_SIZE }],
  ]);
  return { view, geometry };
}

describe('computeFocusChain', () => {
  it('focuses the container chip under the viewport center once big enough', () => {
    const { view, geometry } = collapsedSetup();
    const chain = computeFocusChain({
      view,
      geometry,
      center: { x: 150, y: 130 }, // over root's chip
      zoom: (FOCUS_ENTER_FRACTION * vmin) / 1000 + 0.01, // root would fill ~45% of viewport
      vmin,
      extents,
      prevFocus: [],
    });
    expect(chain).toEqual(['root']);
  });

  it('does not focus when the center is elsewhere or the extent is too small', () => {
    const { view, geometry } = collapsedSetup();
    const base = { view, geometry, vmin, extents, prevFocus: [] as string[] };
    expect(computeFocusChain({ ...base, center: { x: 600, y: 130 }, zoom: 1 })).toEqual([]);
    expect(
      computeFocusChain({
        ...base,
        center: { x: 150, y: 130 },
        zoom: (FOCUS_ENTER_FRACTION * vmin) / 1000 - 0.05,
      }),
    ).toEqual([]);
  });

  it('descends into the child chip under the center when the parent is expanded', () => {
    const { view, geometry } = expandedSetup();
    const chain = computeFocusChain({
      view,
      geometry,
      center: { x: 150, y: 180 }, // inside root, over sys's chip at absolute (120..320, 140..228)
      zoom: 1,
      vmin,
      extents,
      prevFocus: ['root'],
    });
    expect(chain).toEqual(['root', 'sys']);
  });

  it('keeps focus in the hysteresis band only for previously focused containers', () => {
    const { view, geometry } = collapsedSetup();
    const zoomInBand = ((FOCUS_ENTER_FRACTION + FOCUS_EXIT_FRACTION) / 2) * (vmin / 1000);
    const base = { view, geometry, center: { x: 150, y: 130 }, zoom: zoomInBand, vmin, extents };
    expect(computeFocusChain({ ...base, prevFocus: ['root'] })).toEqual(['root']);
    expect(computeFocusChain({ ...base, prevFocus: [] })).toEqual([]);
    // below the exit fraction even previous focus drops
    const zoomBelowExit = FOCUS_EXIT_FRACTION * (vmin / 1000) - 0.03;
    expect(computeFocusChain({ ...base, zoom: zoomBelowExit, prevFocus: ['root'] })).toEqual([]);
  });

  it('tolerates small pans outside a previously focused container via the margin', () => {
    const { view, geometry } = expandedSetup();
    const base = { view, geometry, zoom: 1, vmin, extents };
    // 40 world units left of root's bounds: kept when previously focused...
    expect(computeFocusChain({ ...base, center: { x: 60, y: 180 }, prevFocus: ['root'] })).toEqual(['root']);
    // ...but not focusable fresh from there
    expect(computeFocusChain({ ...base, center: { x: 60, y: 180 }, prevFocus: [] })).toEqual([]);
  });
});

describe('focusForVisible', () => {
  it('opens the new-plane ancestors of currently visible entities', () => {
    expect(focusForVisible(twoPlaneModel(), 'infra', ['plat', 'sys', 'api'])).toEqual(['box']);
  });

  it('entities missing from the target plane contribute nothing', () => {
    expect(focusForVisible(twoPlaneModel(), 'infra', ['plat', 'sys'])).toEqual([]);
    expect(focusForVisible(twoPlaneModel(), 'arch', ['box'])).toEqual([]);
  });

  it('collects the full ancestor chain', () => {
    expect(focusForVisible(twoPlaneModel(), 'arch', ['api']).sort()).toEqual(['plat', 'sys']);
  });
});
