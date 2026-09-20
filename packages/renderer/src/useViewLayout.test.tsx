// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { compileView, model, type DiagramModel, type LayoutOverlay, type Size } from '@diagramming/core';
import * as layoutModule from './layout';
import type { NodeGeometry } from './layout';
import { notationProfile, type NotationProfile } from './notations';
import { createTypeRegistry } from './registry';
import { useViewLayout, type ViewLayoutInput } from './useViewLayout';

/** flat: an image node and a plain service, one edge between them */
function fixture(): DiagramModel {
  const m = model('lay');
  const img = m.node('img');
  const box = m.node('box', { type: 'service' });
  m.relate(img, box, { kind: 'sync' });
  const json = m.toJSON();
  json.nodes = json.nodes.map((n) => (n.id === 'img' ? { ...n, image: 'pic.png' } : n));
  return json;
}

const GEOMETRY = new Map<string, NodeGeometry>([
  ['img', { x: 0, y: 0, width: 10, height: 10 }],
  ['box', { x: 50, y: 0, width: 10, height: 10 }],
]);

/** notation-owned arrangement: synchronous, deterministic, no elk involved */
function notationLayoutProfile(spy?: (hints: ReadonlyMap<string, Size> | undefined) => void): NotationProfile {
  return {
    id: 'default',
    layout: (_view, _m, _plane, sizeHints) => {
      spy?.(sizeHints);
      return { geometry: GEOMETRY, routes: new Map(), labelSpots: new Map(), algorithm: 'notation' };
    },
  };
}

function inputFor(m: DiagramModel, over: Partial<ViewLayoutInput> = {}): ViewLayoutInput {
  return {
    model: m,
    plane: undefined,
    layout: undefined,
    compiled: compileView(m, {}),
    profile: notationLayoutProfile(),
    typeRegistry: createTypeRegistry(),
    metaKeys: [],
    hiddenCounts: new Map(),
    editing: false,
    ignoreSavedPositions: undefined,
    viewPositions: {},
    ...over,
  };
}

describe('useViewLayout', () => {
  it('runs the notation-owned arrangement and hands it size hints (image default size)', async () => {
    const spy = vi.fn();
    const m = fixture();
    const { result } = renderHook((p: ViewLayoutInput) => useViewLayout(p), {
      initialProps: inputFor(m, { profile: notationLayoutProfile(spy) }),
    });
    await waitFor(() => expect(result.current.geometry).not.toBeNull());
    expect(result.current.geometry).toBe(GEOMETRY);
    expect(result.current.geometryRef.current).toBe(GEOMETRY);
    const hints = spy.mock.calls[0]?.[0] as ReadonlyMap<string, { width: number; height: number }>;
    expect(hints.get('img')).toEqual({ width: 160, height: 120, reserveBottom: 20 }); // DEFAULT_IMAGE_NODE_SIZE
    expect(hints.get('box')).toBeUndefined(); // single-line plain leaf keeps the default
  });

  it('an explicit overlay resize wins over the image default in the hints', async () => {
    const spy = vi.fn();
    const m = fixture();
    const layout: LayoutOverlay = { version: 1, planes: {}, sizes: { img: { w: 300, h: 200 } } };
    const { result } = renderHook((p: ViewLayoutInput) => useViewLayout(p), {
      initialProps: inputFor(m, { profile: notationLayoutProfile(spy), layout }),
    });
    await waitFor(() => expect(result.current.geometry).not.toBeNull());
    const hints = spy.mock.calls[0]?.[0] as ReadonlyMap<string, { width: number; height: number }>;
    expect(hints.get('img')).toEqual({ width: 300, height: 200, reserveBottom: 20 });
  });

  it('reserves an image node\'s caption width so long names cannot collide', async () => {
    const spy = vi.fn();
    const m = fixture();
    m.nodes = m.nodes.map((n) => (n.id === 'img' ? { ...n, name: 'Amazon Elastic Kubernetes Service' } : n));
    const layout: LayoutOverlay = { version: 1, planes: {}, sizes: { img: { w: 64, h: 64 } } };
    const { result } = renderHook((p: ViewLayoutInput) => useViewLayout(p), {
      initialProps: inputFor(m, { profile: notationLayoutProfile(spy), layout }),
    });
    await waitFor(() => expect(result.current.geometry).not.toBeNull());
    const hints = spy.mock.calls[0]?.[0] as ReadonlyMap<string, { width: number; height: number }>;
    // 33 chars at ~7px + padding; the icon body keeps its 64px height and
    // letterboxes horizontally (object-fit: contain), so only width grows. The
    // caption's HEIGHT rides along as a layout-only reserve: the strip below the
    // box stays free, the box itself is still drawn 64 tall.
    expect(hints.get('img')).toEqual({ width: 239, height: 64, reserveBottom: 20 });
  });

  it('sizes ordinary boxes from their content and folded containers as folded boxes', async () => {
    const m = model('boxes');
    m.node('long', { name: 'avoid direct/sync  communication' });
    m.node('sys', { type: 'system', name: 'Shop' }).contains(m.node('inner', { type: 'service' }));
    const json = m.toJSON();
    const folded = compileView(json, {});
    const spy = vi.spyOn(layoutModule, 'layoutView');
    const { result } = renderHook((p: ViewLayoutInput) => useViewLayout(p), {
      initialProps: inputFor(json, { profile: { id: 'default' }, compiled: folded, hiddenCounts: new Map([['sys', 1]]) }),
    });
    await waitFor(() => expect(result.current.geometry).not.toBeNull());
    const sizes = spy.mock.calls[0]![1]!;
    // wider than the 160px every leaf used to be given, and as short as the DOM box
    expect(sizes.get('long')!.width).toBeGreaterThan(200);
    expect(sizes.get('long')!.height).toBe(34);
    // folded: a titled box with its count badge, not the old fixed 200x88
    expect(sizes.get('sys')!.height).toBe(50);
    expect(sizes.has('inner')).toBe(false);
    spy.mockRestore();
  });

  it('substitutes saved overlay positions for viewers, unless the viewer set them aside', async () => {
    const m = fixture();
    const layout: LayoutOverlay = { version: 1, planes: { default: { box: { x: 400, y: 50 } } } };
    const { result, rerender } = renderHook((p: ViewLayoutInput) => useViewLayout(p), {
      initialProps: inputFor(m, { layout }),
    });
    await waitFor(() => expect(result.current.placedGeometry).not.toBeNull());
    expect(result.current.placedGeometry?.get('box')).toMatchObject({ x: 400, y: 50 });
    rerender(inputFor(m, { layout, ignoreSavedPositions: true }));
    expect(result.current.placedGeometry?.get('box')).toMatchObject({ x: 50, y: 0 }); // elk placement kept
  });

  it('a view-mode drag outranks the saved position; editing reads only the document', async () => {
    const m = fixture();
    const layout: LayoutOverlay = { version: 1, planes: { default: { box: { x: 400, y: 50 } } } };
    const viewPositions = { box: { x: 999, y: 9 } };
    const { result, rerender } = renderHook((p: ViewLayoutInput) => useViewLayout(p), {
      initialProps: inputFor(m, { layout, viewPositions }),
    });
    await waitFor(() => expect(result.current.placedGeometry).not.toBeNull());
    expect(result.current.placedGeometry?.get('box')).toMatchObject({ x: 999, y: 9 });
    rerender(inputFor(m, { layout, viewPositions, editing: true }));
    expect(result.current.placedGeometry?.get('box')).toMatchObject({ x: 400, y: 50 });
  });

  it('a node the notation FIXED stays where it was laid: no saved position or view drag moves it', async () => {
    const m = fixture();
    const profile: NotationProfile = {
      id: 'default',
      layout: () => ({ geometry: GEOMETRY, routes: new Map(), labelSpots: new Map(), algorithm: 'notation', fixed: new Set(['box']) }),
    };
    // both nodes carry a stale pin (a fish dragged before nodes were fixed)
    const layout: LayoutOverlay = { version: 1, planes: { default: { box: { x: 400, y: 50 }, img: { x: 70, y: 7 } } } };
    const viewPositions = { box: { x: 999, y: 9 } };
    const { result, rerender } = renderHook((p: ViewLayoutInput) => useViewLayout(p), {
      initialProps: inputFor(m, { profile, layout, viewPositions }),
    });
    await waitFor(() => expect(result.current.placedGeometry).not.toBeNull());
    expect(result.current.fixed.has('box')).toBe(true);
    expect(result.current.placedGeometry?.get('box')).toMatchObject({ x: 50, y: 0 });
    expect(result.current.placedGeometry?.get('img')).toMatchObject({ x: 70, y: 7 }); // not fixed: its pin still counts
    rerender(inputFor(m, { profile, layout, viewPositions, editing: true }));
    expect(result.current.placedGeometry?.get('box')).toMatchObject({ x: 50, y: 0 });
  });

  it('fixes nothing when the layout names nothing (elk, git-graph)', async () => {
    const { result } = renderHook((p: ViewLayoutInput) => useViewLayout(p), { initialProps: inputFor(fixture()) });
    await waitFor(() => expect(result.current.placedGeometry).not.toBeNull());
    expect(result.current.fixed.size).toBe(0);
  });

  it('layered planes route with soft corners, orthogonal planes with tight ones; bowed notations float', () => {
    const m = fixture();
    const routingOf = (over: Partial<ViewLayoutInput>) =>
      renderHook((p: ViewLayoutInput) => useViewLayout(p), { initialProps: inputFor(m, over) }).result.current.routing;
    expect(routingOf({ profile: notationProfile() })).toEqual({ corner: 28 });
    const orthogonal: LayoutOverlay = { version: 1, planes: {}, settings: { default: { edgeRouting: 'orthogonal' } } };
    expect(routingOf({ profile: notationProfile(), layout: orthogonal })).toEqual({ corner: 8 });
    // a causal-loop arc IS the notation — elk's right angles would replace it
    expect(routingOf({ profile: notationProfile('causal-loop') })).toBeUndefined();
    // nothing but layered routes unless asked to
    const force: LayoutOverlay = { version: 1, planes: {}, settings: { default: { algorithm: 'force' } } };
    expect(routingOf({ profile: notationProfile(), layout: force })).toBeUndefined();
    // a notation's own layout: its routes are the drawing
    expect(routingOf({})).toEqual({ corner: 8 });
  });

  it('records where the LAYOUT put each node, in absolute coordinates, whatever was saved on top', async () => {
    const m = model('abs');
    m.node('sys', { type: 'system' }).contains(m.node('kid', { type: 'service' }));
    const json = m.toJSON();
    const geometry = new Map<string, NodeGeometry>([
      ['sys', { x: 100, y: 50, width: 300, height: 200 }],
      ['kid', { x: 16, y: 36, width: 142, height: 50 }],
    ]);
    const profile: NotationProfile = {
      id: 'default',
      layout: () => ({ geometry, routes: new Map(), labelSpots: new Map(), algorithm: 'notation' }),
    };
    const layout: LayoutOverlay = { version: 1, planes: { default: { sys: { x: 900, y: 900 } } } };
    const { result } = renderHook((p: ViewLayoutInput) => useViewLayout(p), {
      initialProps: inputFor(json, { profile, layout, compiled: compileView(json, { pins: { sys: 'expanded' } }) }),
    });
    await waitFor(() => expect(result.current.placedGeometry).not.toBeNull());
    expect(result.current.placedGeometry?.get('sys')).toMatchObject({ x: 900, y: 900 }); // drawn where it was saved
    expect(result.current.laidAt.get('sys')).toEqual({ x: 100, y: 50 }); // routed against where it was LAID
    expect(result.current.laidAt.get('kid')).toEqual({ x: 116, y: 86 });
  });

  it('runs a partitioned notation through layered whatever algorithm the sidecar names, and reports the flow direction', async () => {
    const m = model('so');
    m.secondOrder().decision('d').then('a').then('b');
    const json = m.toJSON();
    const force: LayoutOverlay = { version: 1, planes: {}, settings: { default: { algorithm: 'force' } } };
    const { result } = renderHook((p: ViewLayoutInput) => useViewLayout(p), {
      initialProps: inputFor(json, { profile: notationProfile('second-order'), layout: force }),
    });
    await waitFor(() => expect(result.current.placedGeometry).not.toBeNull());
    const g = result.current.placedGeometry!;
    expect(g.get('d')!.y).toBeLessThan(g.get('a')!.y);
    expect(g.get('a')!.y).toBeLessThan(g.get('b')!.y);
    expect(result.current.routing).toEqual({ corner: 28 }); // layered's soft routes, not force's floating edges
    expect(result.current.flowDirection).toBe('DOWN');
  });
});
