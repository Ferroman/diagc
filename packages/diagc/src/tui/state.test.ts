import { describe, expect, it } from 'vitest';
import { readingOrder } from './nav';
import { openDiagram, reduce, sceneInput, settle, type DiagramState, type TuiState } from './state';
import { ctxOf, key, model, pointer, view } from './viewer.fixture';

function opened(extra: Partial<DiagramState> = {}): TuiState {
  return {
    screen: 'diagram',
    names: ['m', 'n'],
    index: 0,
    diagram: { ...openDiagram('m', model, undefined), ...extra },
  };
}

describe('openDiagram', () => {
  it('opens on the first plane, its layers and the saved folds, nothing selected', () => {
    expect(openDiagram('m', model, undefined)).toEqual({
      name: 'm',
      layers: [],
      pins: {},
      path: [],
      scroll: { x: 0, y: 0 },
      panel: false,
      help: false,
      overview: true,
      legend: false,
    });
  });

  it('opens with the legend on where the diagram declares one', () => {
    expect(openDiagram('m', { ...model, legend: {} }, undefined).legend).toBe(true);
  });
});

describe('reduce on a diagram', () => {
  // what each key and click does is actions.test.ts's; this is the handing on
  it('hands a key and a click to the open diagram, dropping the last message first', async () => {
    const said = opened({ message: { text: 'no layer 2', error: true } });
    const ctx = await ctxOf(said.diagram!);
    const tabbed = reduce(said, key('tab'), ctx);
    expect(tabbed.state.diagram!.selected).toBe(readingOrder(ctx.scene!.layout.boxes)[0]);
    expect(tabbed.state.diagram!.message).toBeUndefined();
    const p = ctx.scene!.layout.boxes.get('p')!;
    const clicked = reduce(said, pointer('press', { x: p.x + 1, y: p.y + 1 + view.top }), ctx);
    expect(clicked.state.diagram!.selected).toBe('p');
    expect(clicked.state.diagram!.message).toBeUndefined();
  });

  it('passes on what the diagram asks for, and goes back to the list when it says to', async () => {
    const ctx = await ctxOf(opened().diagram!);
    expect(reduce(opened(), key('q'), ctx).effects).toEqual([{ kind: 'quit' }]);
    const left = reduce(opened(), key('escape'), ctx);
    expect([left.state.screen, left.effects]).toEqual(['list', []]);
    expect(reduce(opened({ panel: true }), key('escape'), ctx).state.screen).toBe('diagram');
  });
});

describe('the style', () => {
  it('keeps the style a diagram switches to as the reader’s, for the diagrams after it', async () => {
    const ctx = await ctxOf(opened().diagram!);
    expect(reduce(opened(), key('s'), ctx).state.style).toBe('dos');
    expect(reduce({ ...opened(), style: 'dos' }, key('s'), { ...ctx, style: 'dos' }).state.style).toBe('clean');
    // any other key leaves the pick as it was
    expect(reduce({ ...opened(), style: 'dos' }, key('tab'), ctx).state.style).toBe('dos');
  });

  it('switches on the list too, where nothing is laid out', () => {
    const list: TuiState = { screen: 'list', names: ['a'], index: 0 };
    expect(reduce(list, key('s'), { view, at: 0 })).toEqual({ state: { ...list, style: 'dos' }, effects: [] });
    expect(reduce({ ...list, style: 'dos' }, key('s'), { view, at: 0 }).state.style).toBe('clean');
  });

  it('lays a diagram out in the style it is drawn in', () => {
    const d = openDiagram('m', model, undefined);
    expect(sceneInput(d, model, undefined, 'dos').style).toBe('dos');
    expect(sceneInput(d, model, undefined)).not.toHaveProperty('style');
  });
});

describe('reduce on the list', () => {
  const list: TuiState = { screen: 'list', names: ['a', 'b', 'c'], index: 0 };
  it('moves through the names and opens one', () => {
    const moved = reduce(list, key('j'), { view, at: 0 });
    expect(moved.state.index).toBe(1);
    expect(reduce(moved.state, key('enter'), { view, at: 0 }).effects).toEqual([{ kind: 'open', name: 'b' }]);
    expect(reduce(list, key('up'), { view, at: 0 }).state.index).toBe(0);
    expect(reduce({ ...list, index: 2 }, key('down'), { view, at: 0 }).state.index).toBe(2);
  });

  it('quits with q', () => {
    expect(reduce(list, key('q'), { view, at: 0 }).effects).toEqual([{ kind: 'quit' }]);
  });
});

describe('settle', () => {
  it('drops a selection the new picture does not draw, and keeps the scroll inside it', async () => {
    const diagram = { ...openDiagram('m', model, undefined), selected: 'a', scroll: { x: 999, y: 999 } };
    const scene = (await ctxOf(diagram)).scene!;
    const settled = settle(diagram, scene, view);
    expect(settled.selected).toBeUndefined();
    expect(settled.scroll.x).toBeLessThanOrEqual(Math.max(0, scene.layout.width - view.width));
  });

  it('scrolls to a selection that asked to be followed', async () => {
    const diagram = {
      ...openDiagram('m', model, undefined),
      pins: { p: 'expanded' as const },
      selected: 'b',
      follow: true,
    };
    const scene = (await ctxOf(diagram)).scene!;
    const small = { top: 1, width: 4, height: 2 };
    const settled = settle(diagram, scene, small);
    const b = scene.layout.boxes.get('b')!;
    expect(settled.scroll.y).toBeGreaterThanOrEqual(Math.max(0, b.y - 2));
    expect(settled.follow).toBeUndefined();
  });
});
