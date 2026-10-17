import type { CellPoint } from '../text/canvas';
import type { TextStyle } from '../text/dos';
import type { Pins } from '../text/folds';
import { neverFolds } from '../text/vocabulary';
import type { Key, Mouse } from './keys';
import { onLegend } from './legend';
import { clampScroll, follow, hitTest, nearest, readingOrder, type Direction } from './nav';
import { onOverview, overviewJump } from './overview';
import { openDiagram, type Ctx, type DiagramState, type Effect } from './state';

// What each key and click does to an open diagram. Each action takes the state and
// returns the next one with the effects it needs; `onKey` and `onMouse` route events
// to them through tables, so adding a key is one entry.

export interface Step {
  diagram: DiagramState;
  effects: Effect[];
  /** back to the list of diagrams */
  toList?: boolean;
  /** the style the reader switched to, for this diagram and every one after it */
  style?: TextStyle;
}

/** The style `s` switches to from `style`: DOS from the terminal's own, and back. */
export const otherStyle = (style: TextStyle | undefined): TextStyle => (style === 'dos' ? 'clean' : 'dos');

/** A second press on the same cell within this many ms is a double click. */
const DOUBLE_CLICK_MS = 400;
/** Rows a wheel notch scrolls; a sideways notch scrolls twice as many columns. */
const WHEEL_ROWS = 3;

const stay = (diagram: DiagramState): Step => ({ diagram, effects: [] });
const relayout = (diagram: DiagramState): Step => ({ diagram, effects: [{ kind: 'relayout' }] });
const say = (diagram: DiagramState, text: string): Step => stay({ ...diagram, message: { text, error: true } });

const nameOf = (ctx: Ctx, id: string): string => ctx.model?.nodes.find((n) => n.id === id)?.name ?? id;
const isContainer = (ctx: Ctx, id: string): boolean => (ctx.scene?.hierarchy.childrenOf.get(id)?.length ?? 0) > 0;

/** The scroll moved by (dx, dy), kept on the picture. */
function scrolled(d: DiagramState, ctx: Ctx, by: CellPoint): DiagramState {
  const at = { x: d.scroll.x + by.x, y: d.scroll.y + by.y };
  return { ...d, scroll: ctx.scene === undefined ? at : clampScroll(at, ctx.scene.layout, ctx.view) };
}

/** `id` selected, and scrolled to when it is drawn. */
function select(d: DiagramState, ctx: Ctx, id: string): DiagramState {
  const box = ctx.scene?.layout.boxes.get(id);
  if (box === undefined || ctx.scene === undefined) return { ...d, selected: id };
  return { ...d, selected: id, scroll: clampScroll(follow(d.scroll, box, ctx.view), ctx.scene.layout, ctx.view) };
}

function move(d: DiagramState, ctx: Ctx, dir: Direction): Step {
  const boxes = ctx.scene?.layout.boxes;
  if (boxes === undefined || boxes.size === 0) return stay(d);
  const to =
    d.selected !== undefined && boxes.has(d.selected) ? nearest(boxes, d.selected, dir) : readingOrder(boxes)[0];
  return stay(to === undefined ? d : select(d, ctx, to));
}

function tab(d: DiagramState, ctx: Ctx, back: boolean): Step {
  const order = ctx.scene === undefined ? [] : readingOrder(ctx.scene.layout.boxes);
  if (order.length === 0) return stay(d);
  const at = d.selected === undefined ? -1 : order.indexOf(d.selected);
  const next = at < 0 ? (back ? order.length - 1 : 0) : (at + (back ? -1 : 1) + order.length) % order.length;
  return stay(select(d, ctx, order[next]!));
}

/** Why the container `id` cannot be folded, unfolded or drilled into, if it cannot. */
function fixedOpen(ctx: Ctx, id: string): string | undefined {
  const node = ctx.model?.nodes.find((n) => n.id === id);
  if (node === undefined || !neverFolds(node, ctx.scene?.notation)) return undefined;
  return `${node.name} is always open`;
}

function toggleFold(d: DiagramState, ctx: Ctx, id = d.selected): Step {
  if (id === undefined || !isContainer(ctx, id)) return stay(d);
  const fixed = fixedOpen(ctx, id);
  if (fixed !== undefined) return say(d, fixed);
  const open = ctx.scene?.nodes.get(id)?.state === 'expanded';
  return relayout({ ...d, pins: { ...d.pins, [id]: open ? 'collapsed' : 'expanded' } });
}

function foldAll(d: DiagramState, ctx: Ctx, state: 'expanded' | 'collapsed'): Step {
  const pins: Pins = {};
  for (const [id, kids] of ctx.scene?.hierarchy.childrenOf ?? []) if (kids.length > 0) pins[id] = state;
  return relayout({ ...d, pins });
}

function drillIn(d: DiagramState, ctx: Ctx): Step {
  const id = d.selected;
  if (id === undefined) return stay(d);
  if (!isContainer(ctx, id)) return say(d, `${nameOf(ctx, id)} holds nothing to go into`);
  const fixed = fixedOpen(ctx, id);
  if (fixed !== undefined) return say(d, fixed);
  const { selected: _left, ...rest } = d;
  return relayout({ ...rest, path: [...d.path, id], scroll: { x: 0, y: 0 } });
}

function drillOut(d: DiagramState): Step {
  const left = d.path.at(-1);
  if (left === undefined) return stay(d);
  return relayout({ ...d, path: d.path.slice(0, -1), selected: left, follow: true });
}

function switchPlane(d: DiagramState, ctx: Ctx, step: 1 | -1): Step {
  const planes = ctx.model?.planes ?? [];
  if (ctx.model === undefined || planes.length < 2) return say(d, 'this diagram has one plane');
  const at = Math.max(
    0,
    planes.findIndex((p) => p.id === (d.plane ?? planes[0]!.id)),
  );
  const plane = planes[(at + step + planes.length) % planes.length]!;
  // what the reader has open or shut stays as it was; the view is the new plane's
  const { panel, overview, legend } = d;
  return relayout({ ...openDiagram(d.name, ctx.model, ctx.overlay, plane.id), panel, overview, legend });
}

function toggleLayer(d: DiagramState, ctx: Ctx, n: number): Step {
  const layer = ctx.model?.layers[n - 1];
  if (layer === undefined) return say(d, `no layer ${n}`);
  const on = d.layers.includes(layer.id);
  return relayout({ ...d, layers: on ? d.layers.filter((l) => l !== layer.id) : [...d.layers, layer.id] });
}

/** The nodes on the plane whose names hold the search, in the model's order. */
function matches(d: DiagramState, ctx: Ctx): string[] {
  const query = d.search?.query.toLowerCase() ?? '';
  const onPlane = ctx.scene?.hierarchy.childrenOf;
  if (query === '' || onPlane === undefined || ctx.model === undefined) return [];
  return ctx.model.nodes.filter((n) => onPlane.has(n.id) && n.name.toLowerCase().includes(query)).map((n) => n.id);
}

/** `id` selected, unfolding the containers it is folded inside (and leaving a drill
 * that does not hold it), so a search can reach what the picture hides. */
function reveal(d: DiagramState, ctx: Ctx, id: string): Step {
  if (ctx.scene?.layout.boxes.has(id) === true) return stay(select(d, ctx, id));
  const pins: Pins = { ...d.pins };
  const ancestors: string[] = [];
  const seen = new Set<string>();
  for (let at = ctx.scene?.hierarchy.parentsOf.get(id)?.[0]; at !== undefined && !seen.has(at);) {
    seen.add(at);
    ancestors.push(at);
    pins[at] = 'expanded';
    at = ctx.scene?.hierarchy.parentsOf.get(at)?.[0];
  }
  const root = d.path.at(-1);
  const path = root === undefined || ancestors.includes(root) ? d.path : [];
  return relayout({ ...d, pins, path, selected: id, follow: true });
}

function nextMatch(d: DiagramState, ctx: Ctx, step: 1 | -1): Step {
  const found = matches(d, ctx);
  if (found.length === 0) return d.search === undefined ? stay(d) : say(d, `nothing matches '${d.search.query}'`);
  const at = d.selected === undefined ? -1 : found.indexOf(d.selected);
  const next = at < 0 ? (step === 1 ? 0 : found.length - 1) : (at + step + found.length) % found.length;
  return reveal(d, ctx, found[next]!);
}

/** A key while the search line is being typed into. */
function editSearch(d: DiagramState, ctx: Ctx, key: Key): Step {
  const query = d.search?.query ?? '';
  if (key.name === 'escape') {
    const { search: _gone, ...rest } = d;
    return stay(rest);
  }
  if (key.name === 'enter') {
    // the first match, wherever the selection is
    const { selected: _from, ...rest } = d;
    const committed = { ...rest, search: { query, editing: false } };
    return query === '' ? stay(committed) : nextMatch(committed, ctx, 1);
  }
  if (key.name === 'backspace')
    return stay({ ...d, search: { query: [...query].slice(0, -1).join(''), editing: true } });
  const ch = key.name === 'space' ? ' ' : [...key.name].length === 1 && key.ctrl !== true ? key.name : '';
  return stay({ ...d, search: { query: query + ch, editing: true } });
}

/** Escape closes the innermost thing open: the search, the help, the panel; with
 * nothing open it goes back to the list. */
function escape(d: DiagramState): Step {
  if (d.search !== undefined) {
    const { search: _gone, ...rest } = d;
    return stay(rest);
  }
  if (d.help) return stay({ ...d, help: false });
  if (d.panel) return stay({ ...d, panel: false });
  return { diagram: d, effects: [], toList: true };
}

/** The overview on or off; turned on where it cannot show, it says why, or the key
 * would seem to do nothing. */
function toggleOverview(d: DiagramState, ctx: Ctx): Step {
  if (d.overview || ctx.overview !== undefined || ctx.scene === undefined) return stay({ ...d, overview: !d.overview });
  const { layout } = ctx.scene;
  const fits = layout.width <= ctx.view.width && layout.height <= ctx.view.height;
  const text = fits ? 'the whole diagram fits on the screen' : 'the screen is too small for the overview';
  return stay({ ...d, overview: true, message: { text, error: false } });
}

/** The legend on or off; turned on where it cannot show, it says why, as the overview does. */
function toggleLegend(d: DiagramState, ctx: Ctx): Step {
  if (d.legend || ctx.legend !== undefined || ctx.scene === undefined) return stay({ ...d, legend: !d.legend });
  const text = ctx.scene.legend === undefined ? 'this diagram has no legend' : 'the screen is too small for the legend';
  return stay({ ...d, legend: true, message: { text, error: false } });
}

type Action = (d: DiagramState, ctx: Ctx, key: Key) => Step;

const page = (ctx: Ctx): number => Math.max(1, ctx.view.height - 2);
const pan = (ctx: Ctx): CellPoint => ({ x: Math.max(4, ctx.view.width >> 2), y: Math.max(2, ctx.view.height >> 2) });

/** The keys of an open diagram, by name; `shift+` before an arrow's name for the
 * shifted one. */
const KEYS: Record<string, Action> = {
  up: (d, ctx) => move(d, ctx, 'up'),
  down: (d, ctx) => move(d, ctx, 'down'),
  left: (d, ctx) => move(d, ctx, 'left'),
  right: (d, ctx) => move(d, ctx, 'right'),
  k: (d, ctx) => move(d, ctx, 'up'),
  j: (d, ctx) => move(d, ctx, 'down'),
  h: (d, ctx) => move(d, ctx, 'left'),
  l: (d, ctx) => move(d, ctx, 'right'),
  'shift+up': (d, ctx) => stay(scrolled(d, ctx, { x: 0, y: -pan(ctx).y })),
  'shift+down': (d, ctx) => stay(scrolled(d, ctx, { x: 0, y: pan(ctx).y })),
  'shift+left': (d, ctx) => stay(scrolled(d, ctx, { x: -pan(ctx).x, y: 0 })),
  'shift+right': (d, ctx) => stay(scrolled(d, ctx, { x: pan(ctx).x, y: 0 })),
  pageup: (d, ctx) => stay(scrolled(d, ctx, { x: 0, y: -page(ctx) })),
  pagedown: (d, ctx) => stay(scrolled(d, ctx, { x: 0, y: page(ctx) })),
  home: (d) => stay({ ...d, scroll: { x: 0, y: 0 } }),
  end: (d, ctx) => stay(scrolled(d, ctx, { x: 0, y: ctx.scene?.layout.height ?? 0 })),
  tab: (d, ctx) => tab(d, ctx, false),
  'shift+tab': (d, ctx) => tab(d, ctx, true),
  enter: (d, ctx) => toggleFold(d, ctx),
  space: (d, ctx) => toggleFold(d, ctx),
  e: (d, ctx) => foldAll(d, ctx, 'expanded'),
  c: (d, ctx) => foldAll(d, ctx, 'collapsed'),
  '>': (d, ctx) => drillIn(d, ctx),
  '<': (d) => drillOut(d),
  p: (d, ctx) => switchPlane(d, ctx, 1),
  P: (d, ctx) => switchPlane(d, ctx, -1),
  '/': (d) => stay({ ...d, search: { query: '', editing: true } }),
  n: (d, ctx) => nextMatch(d, ctx, 1),
  N: (d, ctx) => nextMatch(d, ctx, -1),
  i: (d) => stay({ ...d, panel: !d.panel }),
  o: (d, ctx) => toggleOverview(d, ctx),
  L: (d, ctx) => toggleLegend(d, ctx),
  '?': (d) => stay({ ...d, help: !d.help }),
  s: (d, ctx) => ({ diagram: d, effects: [{ kind: 'relayout' }], style: otherStyle(ctx.style) }),
  r: (d) => ({ diagram: d, effects: [{ kind: 'reload' }] }),
  q: (d) => ({ diagram: d, effects: [{ kind: 'quit' }] }),
  escape: (d) => escape(d),
};

export function onKey(d: DiagramState, ctx: Ctx, key: Key): Step {
  if (key.ctrl === true && key.name === 'c') return { diagram: d, effects: [{ kind: 'quit' }] };
  if (d.search?.editing === true) return editSearch(d, ctx, key);
  if (d.help && key.name !== 'q') return stay({ ...d, help: false });
  if (/^[1-9]$/.test(key.name)) return toggleLayer(d, ctx, Number(key.name));
  const action = KEYS[key.shift === true ? `shift+${key.name}` : key.name];
  return action === undefined ? stay(d) : action(d, ctx, key);
}

/** A press: select the box under it, or toggle a container's fold on a double click.
 * Every press also starts a pan, which a drag then moves: once a group is open, most
 * of the canvas is inside some frame, so panning only from bare canvas would hardly
 * ever be possible. */
function onPress(d: DiagramState, ctx: Ctx, mouse: Mouse): Step {
  const cell = { x: mouse.x + d.scroll.x, y: mouse.y - ctx.view.top + d.scroll.y };
  const hit = ctx.scene === undefined ? undefined : hitTest(ctx.scene.layout.boxes, cell.x, cell.y);
  const last = d.lastPress;
  const double = last !== undefined && last.x === mouse.x && last.y === mouse.y && ctx.at - last.at <= DOUBLE_CLICK_MS;
  const { lastPress: _last, ...rest } = d;
  const drag = { x: mouse.x, y: mouse.y };
  const pressed = { ...rest, drag, lastPress: { x: mouse.x, y: mouse.y, at: ctx.at } };
  if (hit === undefined) return stay(pressed);
  // a third press is a new first one, not a second double click
  if (double) return toggleFold({ ...rest, drag, selected: hit }, ctx, hit);
  return stay({ ...pressed, selected: hit });
}

/** The screen moved to the part of the picture under `mouse` on the overview, and a
 * drag started there, which goes on moving it however far it strays off the overview. */
function jump(d: DiagramState, ctx: Ctx, mouse: Mouse): Step {
  if (ctx.overview === undefined || ctx.scene === undefined) return stay(d);
  const { lastPress: _last, ...rest } = d;
  const scroll = overviewJump(ctx.overview, mouse, ctx.view, ctx.scene.layout);
  return stay({ ...rest, scroll, drag: { x: mouse.x, y: mouse.y, overview: true } });
}

function onDrag(d: DiagramState, ctx: Ctx, mouse: Mouse): Step {
  if (d.drag === undefined) return stay(d);
  if (d.drag.overview === true) return jump(d, ctx, mouse);
  const moved = scrolled(d, ctx, { x: d.drag.x - mouse.x, y: d.drag.y - mouse.y });
  return stay({ ...moved, drag: { x: mouse.x, y: mouse.y } });
}

export function onMouse(d: DiagramState, ctx: Ctx, mouse: Mouse): Step {
  const inCanvas = mouse.y >= ctx.view.top && mouse.y < ctx.view.top + ctx.view.height && mouse.x < ctx.view.width;
  switch (mouse.action) {
    case 'press':
      // the overview and the legend lie over the canvas, so they are asked first; a
      // legend's rows switch nothing, so a press there does nothing
      if (d.overview && ctx.overview !== undefined && onOverview(ctx.overview, mouse)) return jump(d, ctx, mouse);
      if (d.legend && ctx.legend !== undefined && onLegend(ctx.legend, mouse)) return stay(d);
      return inCanvas ? onPress(d, ctx, mouse) : stay(d);
    case 'drag':
      return onDrag(d, ctx, mouse);
    case 'release': {
      const { drag: _done, ...rest } = d;
      return stay(rest);
    }
    case 'wheel-up':
    case 'wheel-down': {
      const by = mouse.action === 'wheel-up' ? -WHEEL_ROWS : WHEEL_ROWS;
      return stay(scrolled(d, ctx, mouse.shift ? { x: by * 2, y: 0 } : { x: 0, y: by }));
    }
    default:
      return stay(scrolled(d, ctx, { x: mouse.action === 'wheel-left' ? -WHEEL_ROWS * 2 : WHEEL_ROWS * 2, y: 0 }));
  }
}
