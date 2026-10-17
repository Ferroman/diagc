import { presetLayers, type DiagramModel, type LayoutOverlay } from '@diagc/core/internal';
import type { CellPoint, CellRect } from '../text/canvas';
import type { TextStyle } from '../text/dos';
import { readerPins, type Pins } from '../text/folds';
import type { SceneInput, Scene } from '../text/scene';
import { onKey, onMouse, otherStyle } from './actions';
import type { UserInput } from './keys';
import { clampScroll, follow } from './nav';
import type { OverviewPlace } from './overview';

// The TUI's state and what an input event does to it: a pure reducer, so every key is
// tested without a terminal. What a change needs from outside — a new layout, a file
// read, the end of the program — comes back as effects for the app loop to run.

/** One open diagram, as the reader sees it. None of it is saved. */
export interface DiagramState {
  name: string;
  /** absent = the model's first plane */
  plane?: string;
  layers: string[];
  pins: Pins;
  /** the drill path; its last entry is the container whose inside is drawn */
  path: string[];
  selected?: string;
  /** the picture's cell at the canvas's top-left corner */
  scroll: CellPoint;
  /** the details panel */
  panel: boolean;
  help: boolean;
  /** the overview, which shows while the picture is bigger than the screen */
  overview: boolean;
  /** the legend, on as a diagram opens where it declares one */
  legend: boolean;
  search?: { query: string; editing: boolean };
  /** one line for the status row, cleared by the next key */
  message?: { text: string; error: boolean };
  /** the last mouse press, for telling a double click */
  lastPress?: { x: number; y: number; at: number };
  /** where a drag last was, while it pans the canvas or, started on the overview, moves
   * the screen about it */
  drag?: CellPoint & { overview?: true };
  /** scroll the selection into view once the layout it waits for arrives (`settle`) */
  follow?: boolean;
}

export interface TuiState {
  screen: 'list' | 'diagram';
  /** the diagrams there are to open */
  names: string[];
  /** the list's current row */
  index: number;
  diagram?: DiagramState;
  /** the style the reader picked, with `--style` or `s`, for every diagram; absent =
   * each diagram's own */
  style?: TextStyle;
}

/** What an event is read against: the open diagram's model and laid-out picture, the
 * canvas's place on the screen, and when the event came (ms). */
export interface Ctx {
  model?: DiagramModel;
  overlay?: LayoutOverlay;
  scene?: Scene;
  /** the canvas: its first screen row and its size */
  view: { top: number; width: number; height: number };
  /** where the overview goes on this screen, whether or not it is on */
  overview?: OverviewPlace;
  /** where the legend goes on this screen, its border included, whether or not it is on */
  legend?: CellRect;
  /** the style the diagram is drawn in; absent = the terminal's own */
  style?: TextStyle;
  at: number;
}

export type Effect = { kind: 'quit' } | { kind: 'open'; name: string } | { kind: 'relayout' } | { kind: 'reload' };

export interface Reduced {
  state: TuiState;
  effects: Effect[];
}

/** A diagram as it opens, and as a plane switch reopens it: the plane's own layers and
 * the folds its layout saved, as the published page opens it. */
export function openDiagram(
  name: string,
  model: DiagramModel,
  overlay: LayoutOverlay | undefined,
  plane?: string,
): DiagramState {
  return {
    name,
    ...(plane !== undefined ? { plane } : {}),
    layers: presetLayers(model.planes, plane),
    pins: readerPins(model, overlay, plane),
    path: [],
    scroll: { x: 0, y: 0 },
    panel: false,
    help: false,
    overview: true,
    legend: model.legend !== undefined,
  };
}

/** What to lay out for `state`, in `style`. */
export function sceneInput(
  state: DiagramState,
  model: DiagramModel,
  overlay: LayoutOverlay | undefined,
  style?: TextStyle,
): SceneInput {
  const root = state.path.at(-1);
  return {
    model,
    pins: state.pins,
    layers: state.layers,
    ...(overlay !== undefined ? { overlay } : {}),
    ...(state.plane !== undefined ? { plane: state.plane } : {}),
    ...(root !== undefined ? { root } : {}),
    ...(style !== undefined ? { style } : {}),
  };
}

/** `state` fitted to a new picture: a selection the picture no longer draws is gone,
 * one that asked to be followed is scrolled to, and the scroll stays on the picture. */
export function settle(state: DiagramState, scene: Scene, view: { width: number; height: number }): DiagramState {
  const { follow: wanted, selected, ...rest } = state;
  const box = selected === undefined ? undefined : scene.layout.boxes.get(selected);
  const scroll = wanted === true && box !== undefined ? follow(state.scroll, box, view) : state.scroll;
  return {
    ...rest,
    ...(box !== undefined ? { selected } : {}),
    scroll: clampScroll(scroll, scene.layout, view),
  };
}

function reduceList(state: TuiState, event: UserInput): Reduced {
  const stay = (index = state.index): Reduced => ({ state: { ...state, index }, effects: [] });
  if (event.kind !== 'key') return stay();
  const last = Math.max(0, state.names.length - 1);
  if (event.name === 'q' || (event.ctrl === true && event.name === 'c')) return { state, effects: [{ kind: 'quit' }] };
  if (event.name === 'up' || event.name === 'k') return stay(Math.max(0, state.index - 1));
  if (event.name === 'down' || event.name === 'j') return stay(Math.min(last, state.index + 1));
  if (event.name === 'r') return { state, effects: [{ kind: 'reload' }] };
  if (event.name === 's') return { state: { ...state, style: otherStyle(state.style) }, effects: [] };
  const name = state.names[state.index];
  if (event.name === 'enter' && name !== undefined) return { state, effects: [{ kind: 'open', name }] };
  return stay();
}

export function reduce(state: TuiState, event: UserInput, ctx: Ctx): Reduced {
  if (state.screen === 'list' || state.diagram === undefined) return reduceList(state, event);
  const { message: _cleared, ...diagram } = state.diagram;
  const step = event.kind === 'mouse' ? onMouse(diagram, ctx, event) : onKey(diagram, ctx, event);
  return {
    state: {
      ...state,
      diagram: step.diagram,
      ...(step.toList === true ? { screen: 'list' as const } : {}),
      ...(step.style !== undefined ? { style: step.style } : {}),
    },
    effects: step.effects,
  };
}
