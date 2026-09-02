// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { compileView, model, type DiagramModel, type LayoutOverlay, type Size } from '@diagramming/core';
import { EMPTY_ID_SET } from './loop-highlight';
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
      return { geometry: GEOMETRY, routes: new Map(), algorithm: 'notation' };
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
    expect(hints.get('img')).toEqual({ width: 160, height: 120 }); // DEFAULT_IMAGE_NODE_SIZE
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
    expect(hints.get('img')).toEqual({ width: 300, height: 200 });
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

  it('orthogonal routing from the plane settings expands pinned ids to whole subtrees', () => {
    const m = model('pin');
    const sys = m.node('sys', { type: 'system' });
    const kid = m.node('kid', { type: 'service' });
    m.node('free', { type: 'service' });
    sys.contains(kid);
    const json = m.toJSON();
    const layout: LayoutOverlay = {
      version: 1,
      planes: { default: { sys: { x: 5, y: 5 } } },
      settings: { default: { edgeRouting: 'orthogonal' } },
    };
    const { result } = renderHook((p: ViewLayoutInput) => useViewLayout(p), {
      initialProps: inputFor(json, {
        profile: notationProfile(), // no notation layout: orthogonal comes from the settings
        layout,
        compiled: compileView(json, { pins: { sys: 'expanded' } }),
      }),
    });
    expect(result.current.orthogonal).toBe(true);
    expect(result.current.layoutSettings).toEqual({ edgeRouting: 'orthogonal' });
    expect(result.current.pinnedIds).toEqual(new Set(['sys', 'kid'])); // pinning the container pins its interior
  });

  it('no orthogonal routing means no pinned-id tracking at all', () => {
    const m = fixture();
    const { result } = renderHook((p: ViewLayoutInput) => useViewLayout(p), {
      initialProps: inputFor(m, { profile: notationProfile() }),
    });
    expect(result.current.orthogonal).toBe(false);
    expect(result.current.pinnedIds).toBeUndefined();
  });

  it('planes without activity frames share the empty band-displacement set', async () => {
    const m = fixture();
    const { result } = renderHook((p: ViewLayoutInput) => useViewLayout(p), { initialProps: inputFor(m) });
    await waitFor(() => expect(result.current.arrangedGeometry).not.toBeNull());
    expect(result.current.bandDisplacedIds).toBe(EMPTY_ID_SET);
  });
});
