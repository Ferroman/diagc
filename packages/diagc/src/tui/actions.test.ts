import { describe, expect, it } from 'vitest';
import { UNICODE } from '../text/glyphs';
import { buildScene } from '../text/scene';
import { onKey, onMouse, type Step } from './actions';
import type { InputEvent } from './keys';
import { readingOrder } from './nav';
import { openDiagram, sceneInput, type Ctx, type DiagramState } from './state';
import { ctxOf, key, model, pointer, view } from './viewer.fixture';

const opened = (extra: Partial<DiagramState> = {}): DiagramState => ({
  ...openDiagram('m', model, undefined),
  ...extra,
});

/** One event, to `onKey` or `onMouse` as the reducer hands it on. */
const handle = (d: DiagramState, event: InputEvent, ctx: Ctx): Step =>
  event.kind === 'mouse' ? onMouse(d, ctx, event) : onKey(d, ctx, event);

/** Feeds events one by one, rebuilding the scene before each, as the app does. */
async function feed(diagram: DiagramState, events: InputEvent[], at = 0): Promise<Step> {
  let step: Step = { diagram, effects: [] };
  const effects = [];
  for (const event of events) {
    step = handle(step.diagram, event, await ctxOf(step.diagram, at));
    effects.push(...step.effects);
  }
  return { ...step, effects };
}

describe('onKey', () => {
  it('steps through the boxes in reading order with Tab and back with Shift-Tab', async () => {
    const order = readingOrder((await ctxOf(opened())).scene!.layout.boxes);
    expect((await feed(opened(), [key('tab')])).diagram.selected).toBe(order[0]);
    expect((await feed(opened(), [key('tab'), key('tab')])).diagram.selected).toBe(order[1]);
    expect((await feed(opened(), [key('tab'), key('tab'), key('tab', { shift: true })])).diagram.selected).toBe(
      order[0],
    );
  });

  it('moves the selection with the arrows and hjkl', async () => {
    // c points at p, so the flow puts c above p
    expect((await feed(opened({ selected: 'c' }), [key('down')])).diagram.selected).toBe('p');
    expect((await feed(opened({ selected: 'p' }), [key('k')])).diagram.selected).toBe('c');
  });

  it('unfolds and folds the selected container, and only a container', async () => {
    const open = await feed(opened({ selected: 'p' }), [key('enter')]);
    expect([open.diagram.pins, open.effects]).toEqual([{ p: 'expanded' }, [{ kind: 'relayout' }]]);
    expect((await feed(open.diagram, [key('space')])).diagram.pins).toEqual({ p: 'collapsed' });
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
    const back = await feed(inside.diagram, [key('<')]);
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
    expect((await feed(alt.diagram, [key('P')])).diagram).toMatchObject({ plane: 'main', layers: [] });
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
    expect((await feed(first.diagram, [key('n')])).diagram.selected).toBe('a');
    expect((await feed(first.diagram, [key('N')])).diagram.selected).toBe('b');
  });

  it('cancels a search with escape, and edits it with backspace', async () => {
    const edited = await feed(opened(), [key('/'), key('x'), key('backspace'), key('c')]);
    expect(edited.diagram.search).toEqual({ query: 'c', editing: true });
    expect((await feed(edited.diagram, [key('escape')])).diagram.search).toBeUndefined();
  });

  it('says so when nothing matches', async () => {
    const none = await feed(opened(), [key('/'), key('z'), key('enter')]);
    expect(none.diagram.message).toEqual({ text: "nothing matches 'z'", error: true });
  });

  it('opens the help and the details panel, and closes them with escape before leaving', async () => {
    const help = await feed(opened(), [key('?')]);
    expect(help.diagram.help).toBe(true);
    expect((await feed(help.diagram, [key('x')])).diagram.help).toBe(false);
    const panel = await feed(opened(), [key('i')]);
    expect(panel.diagram.panel).toBe(true);
    const closed = await feed(panel.diagram, [key('escape')]);
    expect([closed.toList, closed.diagram.panel]).toEqual([undefined, false]);
    expect((await feed(closed.diagram, [key('escape')])).toList).toBe(true);
  });

  it('quits with q and Ctrl-C, reloads with r', async () => {
    expect((await feed(opened(), [key('q')])).effects).toEqual([{ kind: 'quit' }]);
    expect((await feed(opened(), [key('c', { ctrl: true })])).effects).toEqual([{ kind: 'quit' }]);
    expect((await feed(opened(), [key('r')])).effects).toEqual([{ kind: 'reload' }]);
  });
});

describe('onMouse', () => {
  it('selects with a click and toggles a fold with a double click, but not a slow one', async () => {
    const ctx = await ctxOf(opened());
    const p = ctx.scene!.layout.boxes.get('p')!;
    const at = { x: p.x + 1, y: p.y + 1 + view.top };
    const once = handle(opened(), pointer('press', at), ctx);
    expect(once.diagram.selected).toBe('p');
    const twice = handle(once.diagram, pointer('press', at), { ...ctx, at: 300 });
    expect([twice.diagram.pins, twice.effects]).toEqual([{ p: 'expanded' }, [{ kind: 'relayout' }]]);
    expect(handle(once.diagram, pointer('press', at), { ...ctx, at: 500 }).diagram.pins).toEqual({});
  });

  it('pans with a drag that starts on a box, an open frame included, and keeps the selection', async () => {
    // narrower than the picture, taller than it: only sideways scrolling is possible
    const small = { top: 1, width: 8, height: 40 };
    const start = opened({ pins: { p: 'expanded' } });
    const ctx = { ...(await ctxOf(start)), view: small };
    const p = ctx.scene!.layout.boxes.get('p')!;
    // inside the frame, on its blank first inner row
    const at = { x: p.x + 1, y: p.y + 1 + small.top };
    const pressed = handle(start, pointer('press', at), ctx);
    expect(pressed.diagram.selected).toBe('p');
    const dragged = handle(pressed.diagram, pointer('drag', { x: at.x - 3, y: at.y - 1 }), ctx);
    expect(dragged.diagram.scroll).toEqual({ x: 3, y: 0 });
    expect(dragged.diagram.selected).toBe('p');
  });

  it('scrolls with the wheel and the paging keys, inside the picture', async () => {
    const tall = { ...view, height: 2, width: 5 };
    const ctx = { ...(await ctxOf(opened())), view: tall };
    const wheel = (action: 'wheel-up' | 'wheel-down'): InputEvent => ({
      kind: 'mouse',
      action,
      x: 0,
      y: 0,
      shift: false,
    });
    const down = handle(opened(), wheel('wheel-down'), ctx);
    expect(down.diagram.scroll.y).toBe(3);
    expect(handle(down.diagram, wheel('wheel-up'), ctx).diagram.scroll.y).toBe(0);
    const end = handle(opened(), key('end'), ctx);
    expect(end.diagram.scroll.y).toBe(ctx.scene!.layout.height - tall.height);
    expect(handle(end.diagram, key('home'), ctx).diagram.scroll).toEqual({ x: 0, y: 0 });
  });
});

describe('the overview', () => {
  it('turns off and on with o', async () => {
    const off = await feed(opened(), [key('o')]);
    expect(off.diagram.overview).toBe(false);
    expect((await feed(off.diagram, [key('o')])).diagram.overview).toBe(true);
  });

  it('says why it does not show when it is turned on', async () => {
    const off = opened({ overview: false });
    const ctx = await ctxOf(off);
    const fits = handle(off, key('o'), { ...ctx, view: { top: 1, width: 200, height: 100 } });
    expect(fits.diagram.message).toEqual({ text: 'the whole diagram fits on the screen', error: false });
    const cramped = handle(off, key('o'), { ...ctx, view: { top: 1, width: 4, height: 2 } });
    expect(cramped.diagram.message).toEqual({ text: 'the screen is too small for the overview', error: false });
    const shown = handle(off, key('o'), { ...ctx, overview: { x: 0, y: 1, width: 6, height: 2, scale: 0.1 } });
    expect(shown.diagram.message).toBeUndefined();
  });

  it('scrolls to where it is clicked, and follows a drag that started on it', async () => {
    const small = { top: 1, width: 4, height: 2 };
    const base = await ctxOf(opened());
    const { width, height } = base.scene!.layout;
    // at half size its first cell is the picture's start and its last the picture's end
    const place = { x: 10, y: 3, width: Math.ceil(width / 2), height: Math.ceil(height / 2), scale: 0.5 };
    const ctx = { ...base, view: small, overview: place };
    const last = { x: place.x + place.width - 1, y: place.y + place.height - 1 };
    const pressed = handle(opened(), pointer('press', last), ctx);
    expect(pressed.diagram.scroll).toEqual({ x: width - small.width, y: height - small.height });
    // past its border, as a drag that left it: the nearest cell, the first
    const dragged = handle(pressed.diagram, pointer('drag', { x: 0, y: 0 }), ctx);
    expect(dragged.diagram.scroll).toEqual({ x: 0, y: 0 });
    expect(handle(dragged.diagram, pointer('release', { x: 0, y: 0 }), ctx).diagram.drag).toBeUndefined();
  });

  it('takes a click for itself, not for the box under it, and leaves it to the canvas while off', async () => {
    const base = await ctxOf(opened());
    const p = base.scene!.layout.boxes.get('p')!;
    const at = { x: p.x + 1, y: p.y + 1 + view.top };
    const ctx = { ...base, overview: { x: at.x - 1, y: at.y - 1, width: 6, height: 2, scale: 0.1 } };
    const on = handle(opened(), pointer('press', at), ctx);
    expect(on.diagram.selected).toBeUndefined();
    expect(on.diagram.drag).toMatchObject({ overview: true });
    const off = handle(opened({ overview: false }), pointer('press', at), ctx);
    expect(off.diagram.selected).toBe('p');
    expect(off.diagram.drag?.overview).toBeUndefined();
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
    const off = handle(on, key('L'), await ctxWith(on, { legend: place }));
    expect(off.diagram.legend).toBe(false);
    const back = handle(off.diagram, key('L'), await ctxWith(off.diagram, { legend: place }));
    expect(back.diagram).toMatchObject({ legend: true });
    expect(back.diagram.message).toBeUndefined();
  });

  it('says why it does not show when it is turned on', async () => {
    const off = opened();
    const none = handle(off, key('L'), await ctxOf(off));
    expect(none.diagram.message).toEqual({ text: 'this diagram has no legend', error: false });
    const cramped = handle(off, key('L'), await ctxWith(off));
    expect(cramped.diagram.message).toEqual({ text: 'the screen is too small for the legend', error: false });
  });

  it('takes a click for itself, not for the box under it, and leaves it to the canvas while off', async () => {
    const base = await ctxWith(opened());
    const p = base.scene!.layout.boxes.get('p')!;
    const at = { x: p.x + 1, y: p.y + 1 + view.top };
    const ctx = { ...base, legend: { x: at.x - 1, y: at.y - 1, width: 15, height: 4 } };
    const on = handle(opened({ legend: true }), pointer('press', at), ctx);
    expect(on.diagram.selected).toBeUndefined();
    expect(on.diagram.drag).toBeUndefined();
    expect(handle(opened(), pointer('press', at), ctx).diagram.selected).toBe('p');
  });
});
