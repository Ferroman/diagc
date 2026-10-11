// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { layoutPlaneKey, type DiagramModel, type LayoutOverlay } from '@diagc/core/internal';
import { useReaderView, type ReaderViewOptions } from './useReaderView';

/** two planes over a box and its child, each presetting its own layer */
const planed = (): DiagramModel => ({
  version: 1,
  id: 'planed',
  name: 'planed',
  layers: [
    { id: 'ops', name: 'Ops' },
    { id: 'audit', name: 'Audit' },
  ],
  planes: [
    { id: 'main', name: 'Main', layers: ['ops'] },
    { id: 'alt', name: 'Alt', layers: ['audit'], notation: 'causal-loop' },
  ],
  nodes: [
    { id: 'box', name: 'Box', type: 'system' },
    { id: 'inner', name: 'Inner', type: 'service' },
  ],
  containment: [
    { parent: 'box', child: 'inner' },
    { parent: 'box', child: 'inner', plane: 'alt' },
  ],
  relations: [],
});

/** the box saved open on the second plane only */
const savedOpenOnAlt = (m: DiagramModel): LayoutOverlay => ({
  version: 1,
  planes: {},
  unfolded: { [layoutPlaneKey(m, 'alt')]: ['box'] },
});

const reader = (options: ReaderViewOptions) =>
  renderHook((o: ReaderViewOptions) => useReaderView(o), { initialProps: options });

afterEach(() => {
  vi.useRealTimers();
});

describe('useReaderView — the plane drawn', () => {
  it("opens on the first plane, with that plane's preset layers and saved folds", () => {
    const m = planed();
    const { result } = reader({ model: m, layout: savedOpenOnAlt(m) });
    expect(result.current.plane).toBeUndefined();
    expect(result.current.props?.plane).toBeUndefined();
    expect(result.current.props?.activeLayers).toEqual(['ops']);
    expect(result.current.props?.pins).toEqual({});
  });

  it("opens on the host's plane, with that plane's preset layers and saved folds", () => {
    const m = planed();
    const { result } = reader({ model: m, layout: savedOpenOnAlt(m), opening: { plane: 'alt' } });
    expect(result.current.plane).toBe('alt');
    expect(result.current.props?.plane).toBe('alt');
    expect(result.current.props?.activeLayers).toEqual(['audit']);
    expect(result.current.props?.pins).toEqual({ box: 'expanded' });
  });

  it('opens on the first plane when the host names one the model lacks', () => {
    const { result } = reader({ model: planed(), opening: { plane: 'nope' } });
    expect(result.current.plane).toBeUndefined();
    expect(result.current.props?.activeLayers).toEqual(['ops']);
  });

  it('draws the first plane in export mode, whatever the host names', () => {
    const { result } = reader({ model: planed(), exportMode: true, opening: { plane: 'alt' } });
    expect(result.current.plane).toBeUndefined();
    act(() => result.current.setPlane('alt'));
    expect(result.current.plane).toBeUndefined();
  });

  it("switches planes, re-seeding the layers and folds from the new plane's", () => {
    const m = planed();
    const { result } = reader({ model: m, layout: savedOpenOnAlt(m) });
    act(() => result.current.props?.onToggleLayer?.('audit'));
    expect(result.current.props?.activeLayers).toEqual(['ops', 'audit']);
    act(() => result.current.setPlane('alt'));
    expect(result.current.plane).toBe('alt');
    expect(result.current.props?.activeLayers).toEqual(['audit']);
    expect(result.current.props?.pins).toEqual({ box: 'expanded' });
    act(() => result.current.setPlane('main'));
    expect(result.current.plane).toBe('main');
    expect(result.current.props?.activeLayers).toEqual(['ops']);
    expect(result.current.props?.pins).toEqual({});
  });

  it("follows the drawn plane's notation, else the model's", () => {
    const m = { ...planed(), notation: 'threat-model' };
    const { result } = reader({ model: m });
    expect(result.current.notation).toBe('threat-model');
    expect(result.current.props?.notation).toBe('threat-model');
    act(() => result.current.setPlane('alt'));
    expect(result.current.notation).toBe('causal-loop');
  });
});

describe('useReaderView — what the reader opens with and changes', () => {
  it("takes the host's own opening layers, folds and drill path", () => {
    const { result } = reader({
      model: planed(),
      opening: { layers: [], pins: { box: 'collapsed' }, root: 'box' },
    });
    expect(result.current.props?.activeLayers).toEqual([]);
    expect(result.current.props?.pins).toEqual({ box: 'collapsed' });
    expect(result.current.props?.enteredPath).toEqual(['box']);
  });

  it('opens at the top when the host names no node to drill into', () => {
    const { result } = reader({ model: planed() });
    expect(result.current.props?.enteredPath).toEqual([]);
  });

  it('folds, switches layers and drills for the session', () => {
    const { result } = reader({ model: planed() });
    act(() => result.current.props?.onToggleExpand?.('box', 'expanded'));
    expect(result.current.props?.pins).toEqual({ box: 'expanded' });
    act(() => result.current.props?.onToggleExpand?.('box', 'collapsed'));
    expect(result.current.props?.pins).toEqual({ box: 'collapsed' });
    act(() => result.current.props?.onToggleLayer?.('ops'));
    expect(result.current.props?.activeLayers).toEqual([]);
    act(() => result.current.props?.onEnteredPathChange?.(['box']));
    expect(result.current.props?.enteredPath).toEqual(['box']);
  });

  it('offers no layer switch, and no today line, in export mode', () => {
    const { result } = reader({ model: planed(), exportMode: true });
    expect(result.current.props).not.toHaveProperty('activeLayers');
    expect(result.current.props).not.toHaveProperty('onToggleLayer');
    expect(result.current.props?.today).toBeNull();
  });

  it("draws today's date on an interactive view", () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 0, 20));
    const { result } = reader({ model: planed() });
    expect(result.current.props?.today).toBe('2026-01-20');
  });

  it("draws the model's style when the renderer knows it, else the clean one", () => {
    expect(reader({ model: { ...planed(), style: 'sketch' } }).result.current.props?.styleId).toBe('sketch');
    expect(reader({ model: { ...planed(), style: 'crayon' } }).result.current.props?.styleId).toBe('clean');
    expect(reader({ model: planed() }).result.current.props?.styleId).toBe('clean');
  });

  it('hands the layout to the canvas, and leaves it out when there is none', () => {
    const m = planed();
    const layout = savedOpenOnAlt(m);
    expect(reader({ model: m, layout }).result.current.props?.layout).toBe(layout);
    expect(reader({ model: m }).result.current.props).not.toHaveProperty('layout');
  });
});

describe('useReaderView — a model that arrives later', () => {
  it('has nothing to draw until the model arrives', () => {
    const { result } = reader({ model: undefined });
    expect(result.current.props).toBeUndefined();
    expect(result.current.plane).toBeUndefined();
    expect(() => result.current.setPlane('alt')).not.toThrow();
  });

  it('seeds the folds and layers in the render the model arrives in', () => {
    const m = planed();
    const committed: (string[] | undefined)[] = [];
    const { rerender } = renderHook(
      (o: ReaderViewOptions) => {
        const view = useReaderView(o);
        useEffect(() => {
          committed.push(view.props?.activeLayers);
        });
        return view;
      },
      { initialProps: { model: undefined, layout: savedOpenOnAlt(m), opening: { plane: 'alt' } } as ReaderViewOptions },
    );
    rerender({ model: m, layout: savedOpenOnAlt(m), opening: { plane: 'alt' } });
    // the first committed render with the model already has its seed
    expect(committed).toEqual([undefined, ['audit']]);
  });

  it('seeds once: a later model keeps what the reader has', () => {
    const m = planed();
    const { result, rerender } = reader({ model: m });
    act(() => result.current.props?.onToggleLayer?.('ops'));
    rerender({ model: { ...m } });
    expect(result.current.props?.activeLayers).toEqual([]);
  });
});
