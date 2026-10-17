import { describe, expect, it } from 'vitest';
import type { DiagramModel } from '@diagc/core/internal';
import { UNICODE } from '../text/glyphs';
import { buildScene } from '../text/scene';
import type { UserInput } from './keys';
import { readingOrder } from './nav';
import { openDiagram, reduce, sceneInput, settle, type Ctx, type DiagramState, type TuiState } from './state';

// p ⊃ a, b; c beside it. The second plane turns layer l1 on by default.
const model: DiagramModel = {
  version: 1,
  id: 'm',
  name: 'm',
  nodes: [
    { id: 'p', name: 'Platform' },
    { id: 'a', name: 'Api' },
    { id: 'b', name: 'Banking' },
    { id: 'c', name: 'Customer' },
  ],
  containment: [
    { parent: 'p', child: 'a' },
    { parent: 'p', child: 'b' },
  ],
  relations: [
    { id: 'r1', from: 'c', to: 'a', kind: 'sync' },
    { id: 'r2', from: 'c', to: 'b', kind: 'sync', layer: 'l1' },
  ],
  layers: [{ id: 'l1', name: 'Payments' }],
  planes: [
    { id: 'main', name: 'Main' },
    { id: 'alt', name: 'Alt', layers: ['l1'] },
  ],
};

const view = { top: 1, width: 40, height: 12 };
const key = (name: string, extra: { shift?: boolean; ctrl?: boolean } = {}): UserInput => ({
  kind: 'key',
  name,
  ...extra,
});
const press = (x: number, y: number): UserInput => ({ kind: 'mouse', action: 'press', x, y, shift: false });
const pointer = (action: 'press' | 'drag' | 'release', at: { x: number; y: number }): UserInput => ({
  kind: 'mouse',
  action,
  ...at,
  shift: false,
});

async function ctxOf(diagram: DiagramState, at = 0, m: DiagramModel = model): Promise<Ctx> {
  const scene = await buildScene(sceneInput(diagram, m, undefined), UNICODE);
  return { model: m, scene, view, at };
}

function opened(extra: Partial<DiagramState> = {}): TuiState {
  return {
    screen: 'diagram',
    names: ['m', 'n'],
    index: 0,
    diagram: { ...openDiagram('m', model, undefined), ...extra },
  };
}

/** Feeds events one by one, rebuilding the scene before each, as the app does. */
async function feed(state: TuiState, events: UserInput[], at = 0, m: DiagramModel = model) {
  let current = state;
  const effects = [];
  for (const event of events) {
    const out = reduce(
      current,
      event,
      current.diagram !== undefined ? await ctxOf(current.diagram, at, m) : { view, at },
    );
    current = out.state;
    effects.push(...out.effects);
  }
  return { state: current, diagram: current.diagram!, effects };
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
  it('steps through the boxes in reading order with Tab and back with Shift-Tab', async () => {
    const order = readingOrder((await ctxOf(opened().diagram!)).scene!.layout.boxes);
    expect((await feed(opened(), [key('tab')])).diagram.selected).toBe(order[0]);
    expect((await feed(opened(), [key('tab'), key('tab')])).diagram.selected).toBe(order[1]);
    expect((await feed(opened(), [key('tab'), key('tab'), key('tab', { shift: true })])).diagram.selected).toBe(
      order[0],
    );
  });

  it('moves the selection with the arrows and hjkl', async () => {
    // c points at p, so the flow puts c above p
    const down = await feed(opened({ selected: 'c' }), [key('down')]);
    expect(down.diagram.selected).toBe('p');
    expect((await feed(opened({ selected: 'p' }), [key('k')])).diagram.selected).toBe('c');
  });

  it('moves about a fishbone’s fish as about boxes: Tab reaches every node, the arrows go to the nearest', async () => {
    const fish: DiagramModel = {
      ...model,
      notation: 'fishbone',
      nodes: [
        { id: 'e', name: 'Outage', type: 'fb-effect' },
        { id: 'people', name: 'People', type: 'fb-category' },
        { id: 'process', name: 'Process', type: 'fb-category' },
        { id: 'on-call', name: 'On-call engineer new to checkout', type: 'fb-cause' },
        { id: 'no-freeze', name: 'No change freeze', type: 'fb-cause' },
      ],
      containment: [],
      relations: [
        { id: 'r1', from: 'people', to: 'e', kind: 'cause-of' },
        { id: 'r2', from: 'process', to: 'e', kind: 'cause-of' },
        { id: 'r3', from: 'on-call', to: 'people', kind: 'cause-of' },
        { id: 'r4', from: 'no-freeze', to: 'process', kind: 'cause-of' },
      ],
      layers: [],
      planes: [],
    };
    const start: TuiState = { ...opened(), diagram: openDiagram('m', fish, undefined) };
    const seen = new Set<string>();
    let state = start;
    for (let i = 0; i < 5; i++) {
      state = (await feed(state, [key('tab')], 0, fish)).state;
      seen.add(state.diagram!.selected!);
    }
    expect([...seen].sort()).toEqual(fish.nodes.map((n) => n.id).sort());
    // a bone's causes are to the left of its label, and the head to the right of all
    const from = async (selected: string, name: string): Promise<string | undefined> =>
      (await feed({ ...start, diagram: { ...start.diagram!, selected } }, [key(name)], 0, fish)).diagram.selected;
    expect(await from('people', 'left')).toBe('on-call');
    expect(await from('process', 'right')).toBe('e');
  });

  it('unfolds and folds the selected container, and only a container', async () => {
    const open = await feed(opened({ selected: 'p' }), [key('enter')]);
    expect([open.diagram.pins, open.effects]).toEqual([{ p: 'expanded' }, [{ kind: 'relayout' }]]);
    const shut = await feed(open.state, [key('space')]);
    expect(shut.diagram.pins).toEqual({ p: 'collapsed' });
    const leaf = await feed(opened({ selected: 'c' }), [key('enter')]);
    expect([leaf.diagram.pins, leaf.effects]).toEqual([{}, []]);
  });

  it('unfolds every container with e and folds them all with c', async () => {
    expect((await feed(opened(), [key('e')])).diagram.pins).toEqual({ p: 'expanded' });
    expect((await feed(opened({ pins: { p: 'expanded' } }), [key('c')])).diagram.pins).toEqual({ p: 'collapsed' });
  });

  it('drills into the selected container and back out to it', async () => {
    const inside = await feed(opened({ selected: 'p' }), [key('>')]);
    expect([inside.diagram.path, inside.effects]).toEqual([['p'], [{ kind: 'relayout' }]]);
    const back = await feed(inside.state, [key('<')]);
    expect([back.diagram.path, back.diagram.selected]).toEqual([[], 'p']);
  });

  it('keeps the panel, the overview and the legend as they were across a plane switch', async () => {
    const shown = { panel: true, overview: false, legend: true };
    expect((await feed(opened(shown), [key('p')])).diagram).toMatchObject({ plane: 'alt', ...shown });
  });

  it('switches planes, each opening with its own layers and folds', async () => {
    const alt = await feed(opened({ pins: { p: 'expanded' }, selected: 'a' }), [key('p')]);
    expect(alt.diagram).toMatchObject({ plane: 'alt', layers: ['l1'], pins: {}, path: [] });
    expect(alt.diagram.selected).toBeUndefined();
    expect(alt.effects).toEqual([{ kind: 'relayout' }]);
    expect((await feed(alt.state, [key('P')])).diagram).toMatchObject({ plane: 'main', layers: [] });
  });

  it('toggles the n-th layer with its digit, and says when there is none', async () => {
    expect((await feed(opened(), [key('1')])).diagram.layers).toEqual(['l1']);
    expect((await feed(opened(), [key('1'), key('1')])).diagram.layers).toEqual([]);
    const none = await feed(opened(), [key('2')]);
    expect([none.diagram.layers, none.diagram.message?.error]).toEqual([[], true]);
  });

  it('finds a box by name, unfolding what hides it', async () => {
    const found = await feed(opened(), [key('/'), key('b'), key('a'), key('enter')]);
    expect(found.diagram).toMatchObject({ selected: 'b', pins: { p: 'expanded' } });
    expect(found.diagram.search).toEqual({ query: 'ba', editing: false });
    expect(found.effects).toEqual([{ kind: 'relayout' }]);
  });

  it('steps through the matches with n and N', async () => {
    // 'a' is in Platform, Api and Banking, in that order, and not in Customer
    const first = await feed(opened({ pins: { p: 'expanded' } }), [key('/'), key('a'), key('enter')]);
    expect(first.diagram.selected).toBe('p');
    expect((await feed(first.state, [key('n')])).diagram.selected).toBe('a');
    expect((await feed(first.state, [key('N')])).diagram.selected).toBe('b');
  });

  it('cancels a search with escape, and edits it with backspace', async () => {
    const edited = await feed(opened(), [key('/'), key('x'), key('backspace'), key('c')]);
    expect(edited.diagram.search).toEqual({ query: 'c', editing: true });
    expect((await feed(edited.state, [key('escape')])).diagram.search).toBeUndefined();
  });

  it('says so when nothing matches', async () => {
    const none = await feed(opened(), [key('/'), key('z'), key('enter')]);
    expect(none.diagram.message).toEqual({ text: "nothing matches 'z'", error: true });
  });

  it('opens the help and the details panel, and closes them with escape before leaving', async () => {
    const help = await feed(opened(), [key('?')]);
    expect(help.diagram.help).toBe(true);
    expect((await feed(help.state, [key('x')])).diagram.help).toBe(false);
    const panel = await feed(opened(), [key('i')]);
    expect(panel.diagram.panel).toBe(true);
    const closed = await feed(panel.state, [key('escape')]);
    expect([closed.state.screen, closed.diagram.panel]).toEqual(['diagram', false]);
    expect((await feed(closed.state, [key('escape')])).state.screen).toBe('list');
  });

  it('quits with q and Ctrl-C, reloads with r', async () => {
    expect((await feed(opened(), [key('q')])).effects).toEqual([{ kind: 'quit' }]);
    expect((await feed(opened(), [key('c', { ctrl: true })])).effects).toEqual([{ kind: 'quit' }]);
    expect((await feed(opened(), [key('r')])).effects).toEqual([{ kind: 'reload' }]);
  });

  it('selects with a click and toggles a fold with a double click, but not a slow one', async () => {
    const ctx = await ctxOf(opened().diagram!);
    const p = ctx.scene!.layout.boxes.get('p')!;
    const [x, y] = [p.x + 1, p.y + 1 + view.top];
    const once = reduce(opened(), press(x, y), ctx);
    expect(once.state.diagram!.selected).toBe('p');
    const twice = reduce(once.state, press(x, y), { ...ctx, at: 300 });
    expect([twice.state.diagram!.pins, twice.effects]).toEqual([{ p: 'expanded' }, [{ kind: 'relayout' }]]);
    const slow = reduce(once.state, press(x, y), { ...ctx, at: 500 });
    expect(slow.state.diagram!.pins).toEqual({});
  });

  it('pans with a drag that starts on a box, an open frame included, and keeps the selection', async () => {
    // narrower than the picture, taller than it: only sideways scrolling is possible
    const small = { top: 1, width: 8, height: 40 };
    const start = opened({ pins: { p: 'expanded' } });
    const ctx = { ...(await ctxOf(start.diagram!)), view: small };
    const p = ctx.scene!.layout.boxes.get('p')!;
    // inside the frame, on its blank first inner row
    const at = { x: p.x + 1, y: p.y + 1 + small.top };
    const pressed = reduce(start, { kind: 'mouse', action: 'press', ...at, shift: false }, ctx);
    expect(pressed.state.diagram!.selected).toBe('p');
    const dragged = reduce(
      pressed.state,
      { kind: 'mouse', action: 'drag', x: at.x - 3, y: at.y - 1, shift: false },
      ctx,
    );
    expect(dragged.state.diagram!.scroll).toEqual({ x: 3, y: 0 });
    expect(dragged.state.diagram!.selected).toBe('p');
  });

  it('scrolls with the wheel and the paging keys, inside the picture', async () => {
    const tall = { ...view, height: 2, width: 5 };
    const ctx = { ...(await ctxOf(opened().diagram!)), view: tall };
    const down = reduce(opened(), { kind: 'mouse', action: 'wheel-down', x: 0, y: 0, shift: false }, ctx);
    expect(down.state.diagram!.scroll.y).toBe(3);
    const up = reduce(down.state, { kind: 'mouse', action: 'wheel-up', x: 0, y: 0, shift: false }, ctx);
    expect(up.state.diagram!.scroll.y).toBe(0);
    const end = reduce(opened(), key('end'), ctx);
    const { height } = ctx.scene!.layout;
    expect(end.state.diagram!.scroll.y).toBe(height - tall.height);
    expect(reduce(end.state, key('home'), ctx).state.diagram!.scroll).toEqual({ x: 0, y: 0 });
  });
});

describe('the overview', () => {
  it('turns off and on with o', async () => {
    const off = await feed(opened(), [key('o')]);
    expect(off.diagram.overview).toBe(false);
    expect((await feed(off.state, [key('o')])).diagram.overview).toBe(true);
  });

  it('says why it does not show when it is turned on', async () => {
    const off = opened({ overview: false });
    const ctx = await ctxOf(off.diagram!);
    const fits = reduce(off, key('o'), { ...ctx, view: { top: 1, width: 200, height: 100 } });
    expect(fits.state.diagram!.message).toEqual({ text: 'the whole diagram fits on the screen', error: false });
    const cramped = reduce(off, key('o'), { ...ctx, view: { top: 1, width: 4, height: 2 } });
    expect(cramped.state.diagram!.message).toEqual({ text: 'the screen is too small for the overview', error: false });
    const shown = reduce(off, key('o'), { ...ctx, overview: { x: 0, y: 1, width: 6, height: 2, scale: 0.1 } });
    expect(shown.state.diagram!.message).toBeUndefined();
  });

  it('scrolls to where it is clicked, and follows a drag that started on it', async () => {
    const small = { top: 1, width: 4, height: 2 };
    const base = await ctxOf(opened().diagram!);
    const { width, height } = base.scene!.layout;
    // at half size its first cell is the picture's start and its last the picture's end
    const place = { x: 10, y: 3, width: Math.ceil(width / 2), height: Math.ceil(height / 2), scale: 0.5 };
    const ctx = { ...base, view: small, overview: place };
    const last = { x: place.x + place.width - 1, y: place.y + place.height - 1 };
    const pressed = reduce(opened(), pointer('press', last), ctx);
    expect(pressed.state.diagram!.scroll).toEqual({ x: width - small.width, y: height - small.height });
    // past its border, as a drag that left it: the nearest cell, the first
    const dragged = reduce(pressed.state, pointer('drag', { x: 0, y: 0 }), ctx);
    expect(dragged.state.diagram!.scroll).toEqual({ x: 0, y: 0 });
    expect(reduce(dragged.state, pointer('release', { x: 0, y: 0 }), ctx).state.diagram!.drag).toBeUndefined();
  });

  it('takes a click for itself, not for the box under it, and leaves it to the canvas while off', async () => {
    const base = await ctxOf(opened().diagram!);
    const p = base.scene!.layout.boxes.get('p')!;
    const at = { x: p.x + 1, y: p.y + 1 + view.top };
    const ctx = { ...base, overview: { x: at.x - 1, y: at.y - 1, width: 6, height: 2, scale: 0.1 } };
    const on = reduce(opened(), pointer('press', at), ctx);
    expect(on.state.diagram!.selected).toBeUndefined();
    expect(on.state.diagram!.drag).toMatchObject({ overview: true });
    const off = reduce(opened({ overview: false }), pointer('press', at), ctx);
    expect(off.state.diagram!.selected).toBe('p');
    expect(off.state.diagram!.drag?.overview).toBeUndefined();
  });
});

describe('the legend', () => {
  const keyed = { ...model, legend: {} };
  const ctxWith = async (diagram: DiagramState, extra: Partial<Ctx> = {}): Promise<Ctx> => ({
    ...(await ctxOf(diagram)),
    model: keyed,
    scene: await buildScene(sceneInput(diagram, keyed, undefined), UNICODE),
    ...extra,
  });
  const place = { x: 20, y: 5, width: 15, height: 4 };

  it('turns off and on with L', async () => {
    const on = opened({ legend: true });
    const off = reduce(on, key('L'), await ctxWith(on.diagram!, { legend: place }));
    expect(off.state.diagram!.legend).toBe(false);
    const back = reduce(off.state, key('L'), await ctxWith(off.state.diagram!, { legend: place }));
    expect(back.state.diagram).toMatchObject({ legend: true });
    expect(back.state.diagram!.message).toBeUndefined();
  });

  it('says why it does not show when it is turned on', async () => {
    const off = opened();
    const none = reduce(off, key('L'), await ctxOf(off.diagram!));
    expect(none.state.diagram!.message).toEqual({ text: 'this diagram has no legend', error: false });
    const cramped = reduce(off, key('L'), await ctxWith(off.diagram!));
    expect(cramped.state.diagram!.message).toEqual({ text: 'the screen is too small for the legend', error: false });
  });

  it('takes a click for itself, not for the box under it, and leaves it to the canvas while off', async () => {
    const base = await ctxWith(opened().diagram!);
    const p = base.scene!.layout.boxes.get('p')!;
    const at = { x: p.x + 1, y: p.y + 1 + view.top };
    const ctx = { ...base, legend: { x: at.x - 1, y: at.y - 1, width: 15, height: 4 } };
    const on = reduce(opened({ legend: true }), pointer('press', at), ctx);
    expect(on.state.diagram!.selected).toBeUndefined();
    expect(on.state.diagram!.drag).toBeUndefined();
    expect(reduce(opened(), pointer('press', at), ctx).state.diagram!.selected).toBe('p');
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
