// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { model, type DiagramModel, type EditorCommand, type LayoutOverlay } from '@diagc/core/internal';
import type { EditorApi } from '../session/useEditor';
import { useViewNavigation, type UseViewNavigationOptions } from './useViewNavigation';

function twoPlanes(): DiagramModel {
  const m = model('seed');
  m.layer('nats', { name: 'NATS messaging' });
  m.layer('monitoring', { name: 'Monitoring' });
  m.plane('landscape', { name: 'Landscape', layers: ['nats', 'monitoring'], notation: 'causal-loop' });
  m.plane('bare', { name: 'Bare' });
  m.node('a', { type: 'service' });
  return m.toJSON();
}

/** the hook over `m`, with a recording editor, select and onReset */
function mount(m: DiagramModel | undefined, start: Partial<UseViewNavigationOptions> = {}) {
  const dispatched: EditorCommand[] = [];
  const select = vi.fn();
  const onReset = vi.fn();
  const props: UseViewNavigationOptions = {
    model: m,
    layout: undefined,
    editing: false,
    editor: { dispatch: (c: EditorCommand) => void dispatched.push(c) } as EditorApi,
    selected: 'seed',
    select,
    onReset,
    ...start,
  };
  const hook = renderHook((p: UseViewNavigationOptions) => useViewNavigation(p), { initialProps: props });
  return {
    hook,
    props,
    dispatched,
    select,
    onReset,
    get now() {
      return hook.result.current;
    },
    rerender: (patch: Partial<UseViewNavigationOptions>) => hook.rerender({ ...props, ...patch }),
  };
}

describe('useViewNavigation: the once-per-diagram seed', () => {
  // Breaks if a diagram stops opening with its first plane's preset layers on
  // and its saved folds applied (export.collapsed folded, `unfolded` open).
  it('seeds the layers and folds when a diagram arrives', () => {
    const layout: LayoutOverlay = {
      version: 1,
      planes: {},
      export: { collapsed: ['x'] },
      unfolded: { landscape: ['sys'] },
    };
    const t = mount(undefined);
    expect(t.now.activeLayers).toEqual([]);
    t.rerender({ model: twoPlanes(), layout });
    expect(t.now.activeLayers).toEqual(['nats', 'monitoring']);
    expect(t.now.pins).toEqual({ x: 'collapsed', sys: 'expanded' });
  });

  // Breaks if the seed keys on the model rather than the diagram: editing
  // rebuilds the model on every keystroke, and re-seeding would undo the
  // user's own toggles mid-edit.
  it('re-seeds for another diagram, not for a new model of the same one', () => {
    const t = mount(twoPlanes());
    act(() => t.now.toggleLayer('nats'));
    t.rerender({ model: twoPlanes() });
    expect(t.now.activeLayers).toEqual(['monitoring']);
    t.rerender({ model: twoPlanes(), selected: 'other' });
    expect(t.now.activeLayers).toEqual(['nats', 'monitoring']);
  });
});

describe('useViewNavigation: following the saved folds while editing', () => {
  const folds = (ids: string[]): LayoutOverlay => ({ version: 1, planes: {}, unfolded: { landscape: ids } });

  // Breaks if an undo or redo that changes the saved open boxes stops reaching
  // the canvas, or a change the pins already show is applied again.
  it('follows a change to the saved open boxes', () => {
    const t = mount(twoPlanes(), { editing: true, layout: folds([]) });
    t.rerender({ editing: true, layout: folds(['sys']) });
    expect(t.now.pins).toEqual({ sys: 'expanded' });
  });

  // Breaks if the saved list catching up with the user's own toggle (the
  // recorded set-unfolded landing) re-seeds the folds: openingPins knows only
  // the saved open boxes, so a box folded by hand would open again.
  it('keeps the pins when the saved list catches up with a toggle', () => {
    const t = mount(twoPlanes(), { editing: true, layout: folds([]) });
    act(() => t.now.toggleExpand('x', 'collapsed'));
    act(() => t.now.toggleExpand('sys', 'expanded'));
    const pins = t.now.pins;
    t.rerender({ editing: true, layout: folds(['sys']) });
    expect(t.now.pins).toBe(pins);
    expect(t.now.pins).toEqual({ x: 'collapsed', sys: 'expanded' });
  });

  // Breaks if entering edit mode folds away what the viewer had open (the
  // saved list differs from the pins, but nothing changed while editing).
  it('leaves the folds alone on entering edit mode', () => {
    const t = mount(twoPlanes(), { layout: folds([]) });
    act(() => t.now.toggleExpand('db', 'expanded'));
    t.rerender({ editing: true, layout: folds([]) });
    expect(t.now.pins).toEqual({ db: 'expanded' });
  });
});

describe('useViewNavigation: planes', () => {
  // Breaks if a plane switch stops re-seeding the layers from the new plane's
  // presets, dropping the selection and the pen, or opening the plane's folds.
  it('switches plane with its own layers and folds, and a clear selection', () => {
    const layout: LayoutOverlay = { version: 1, planes: {}, unfolded: { landscape: ['sys'], bare: ['other'] } };
    const t = mount(twoPlanes(), { layout });
    act(() => t.now.activateLayer('nats'));
    act(() => t.now.switchPlane('bare'));
    expect(t.now).toMatchObject({ activePlane: 'bare', activeLayers: [], penLayer: null, pins: { other: 'expanded' } });
    expect(t.select).toHaveBeenCalledWith(null);
    expect(t.onReset).not.toHaveBeenCalled();
    act(() => t.now.switchPlane('landscape'));
    expect(t.now.activeLayers).toEqual(['nats', 'monitoring']);
  });

  // Breaks if the base view stops seeding from planes[0] (compileView resolves
  // an absent plane to it), or a reset stops dropping the preview and the
  // selection.
  it('resets to the base view, seeded from the first plane', () => {
    const layout: LayoutOverlay = { version: 1, planes: {}, unfolded: { landscape: ['sys'] } };
    const t = mount(twoPlanes(), { layout });
    act(() => t.now.switchPlane('bare'));
    act(() => t.now.resetView());
    expect(t.now).toMatchObject({ activePlane: undefined, activeLayers: ['nats', 'monitoring'] });
    expect(t.now.pins).toEqual({ sys: 'expanded' });
    expect(t.onReset).toHaveBeenCalledTimes(1);
    expect(t.select).toHaveBeenLastCalledWith(null);
  });

  // Breaks if the derived plane values stop following the plane: the base view
  // takes planes[0]'s notation, and a manual flag is read for the plane on screen.
  it('derives the notation and the frozen flag from the plane on screen', () => {
    const layout: LayoutOverlay = { version: 1, planes: {}, manual: { bare: true } };
    const t = mount(twoPlanes(), { layout });
    expect(t.now).toMatchObject({ notation: 'causal-loop', activePlaneManual: false });
    act(() => t.now.switchPlane('bare'));
    expect(t.now).toMatchObject({ notation: undefined, activePlaneManual: true });
  });
});

describe('useViewNavigation: layers', () => {
  // Breaks if a toggled preset layer is re-imposed: the user owns the switch
  // once seeded. Also if toggling writes into the model's own array.
  it('lets the user turn a seeded layer off, without touching the model', () => {
    const m = twoPlanes();
    const t = mount(m);
    act(() => t.now.toggleLayer('nats'));
    expect(t.now.activeLayers).toEqual(['monitoring']);
    expect(m.planes[0]!.layers).toEqual(['nats', 'monitoring']);
  });

  // Breaks if activating a sheet stops turning it on, hiding the sheet being
  // drawn on keeps the pen there, or a pen on a deleted layer survives.
  it('keeps the pen on a sheet that is on and still exists', () => {
    const t = mount(twoPlanes(), { selected: 'seed' });
    act(() => t.now.toggleLayer('nats'));
    act(() => t.now.activateLayer('nats'));
    expect(t.now).toMatchObject({ penLayer: 'nats', activeLayers: ['monitoring', 'nats'] });
    act(() => t.now.toggleLayer('nats'));
    expect(t.now.penLayer).toBeNull();
    act(() => t.now.activateLayer('monitoring'));
    const without = { ...twoPlanes(), layers: twoPlanes().layers.filter((l) => l.id !== 'monitoring') };
    t.rerender({ model: without });
    expect(t.now.penLayer).toBeNull();
  });

  // Breaks if merging stops recording one merge-layers command, or the pen
  // stays on a merged-away sheet instead of following it to the target.
  it('merges layers and moves the pen to the target', () => {
    const t = mount(twoPlanes());
    act(() => t.now.activateLayer('nats'));
    act(() => t.now.mergeSelectedLayers(['nats'], 'monitoring'));
    expect(t.dispatched).toEqual([{ type: 'merge-layers', sources: ['nats'], target: 'monitoring' }]);
    expect(t.now.activeLayers).toEqual(['monitoring']);
    expect(t.now.penLayer).toBe('monitoring');
  });
});

describe('useViewNavigation: folds', () => {
  // Breaks if the fold chip stops landing in the state the canvas asked for.
  it('lands each fold where the canvas asked', () => {
    const t = mount(twoPlanes());
    act(() => t.now.toggleExpand('sys', 'expanded'));
    act(() => t.now.toggleExpand('db', 'expanded'));
    act(() => t.now.toggleExpand('sys', 'collapsed'));
    expect(t.now.pins).toEqual({ sys: 'collapsed', db: 'expanded' });
  });

  // Breaks if view mode starts writing folds into the document, or edit mode
  // stops recording them (with the plane on screen) for undo and autosave.
  it('records the open boxes as a command only while editing', () => {
    const view = mount(twoPlanes());
    act(() => view.now.toggleExpand('sys', 'expanded'));
    expect(view.dispatched).toEqual([]);

    const edit = mount(twoPlanes(), { editing: true });
    act(() => edit.now.switchPlane('bare'));
    act(() => edit.now.toggleExpand('sys', 'expanded'));
    expect(edit.dispatched).toEqual([{ type: 'set-unfolded', ids: ['sys'], plane: 'bare' }]);
  });
});
