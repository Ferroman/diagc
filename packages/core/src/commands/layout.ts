import type { DiagramModel, LayoutOverlay, LayoutSettings } from '../types';
import { elementKey, type ElementRef } from '../elements';
import type { Point } from '../geometry';
import { layoutPlaneKey } from '../planes';
import type { CommandResult, EditorState, Handlers } from './index';
import { withNote, withNoteBucket, withOpen, withUnfolded } from './layout-pruning';

/** Commands that change the layout overlay and nothing else: positions, sizes,
 * folds, layout settings and note placement. */
export type LayoutCommand =
  | { type: 'set-position'; plane?: string; nodeId: string; x: number; y: number }
  | { type: 'set-size'; nodeId: string; w: number; h: number }
  | { type: 'clear-position'; plane?: string; nodeId: string }
  | { type: 'clear-positions'; plane?: string }
  | { type: 'set-positions'; plane?: string; positions: Record<string, Point> }
  | { type: 'set-plane-layout'; plane?: string; manual: boolean }
  /** replace the list of containers the plane opens with unfolded
   * (LayoutOverlay.unfolded); `[]` clears it */
  | { type: 'set-unfolded'; plane?: string; ids: string[] }
  | { type: 'set-layout-settings'; plane?: string; patch: Partial<LayoutSettings> }
  /** a threat note was dragged: its offset from the automatic anchor, or null to
   * let it sit beside its element again. Layout-only — the threats stay put. */
  | { type: 'set-note-offset'; target: ElementRef; plane?: string; offset: { dx: number; dy: number } | null }
  /** open or close one element's threat bubble in this picture (saved, so the export shows it) */
  | { type: 'set-note-open'; target: ElementRef; plane?: string; open: boolean }
  /** every element in the model that carries a threat, at once — the `Notes` chip */
  | { type: 'set-notes-open'; plane?: string; open: boolean };

type Of<K extends LayoutCommand['type']> = Extract<LayoutCommand, { type: K }>;

export const emptyLayout = (): LayoutOverlay => ({ version: 1, planes: {} });

/**
 * The pins a plane opens with: its saved `unfolded` containers, in the shape
 * `compileView`'s viewport reads. One reader for every host (studio, published
 * page, embed), so a saved arrangement reopens the same everywhere.
 */
export function openingPins(
  layout: LayoutOverlay | undefined,
  m: DiagramModel,
  plane?: string,
): Record<string, 'expanded' | 'collapsed'> {
  const ids = layout?.unfolded?.[layoutPlaneKey(m, plane)] ?? [];
  return Object.fromEntries(ids.map((id) => [id, 'expanded' as const]));
}

/** The result of a command that changed the layout and nothing else. */
const withLayout = (state: EditorState, layout: LayoutOverlay): CommandResult => ({ state: { ...state, layout } });

function setPos(layout: LayoutOverlay, key: string, nodeId: string, pos?: Point): LayoutOverlay {
  const plane = { ...(layout.planes[key] ?? {}) };
  if (pos === undefined) delete plane[nodeId];
  else plane[nodeId] = pos;
  return { ...layout, planes: { ...layout.planes, [key]: plane } };
}

function handleSetPositions(state: EditorState, command: Of<'set-positions'>): CommandResult {
  const { layout } = state;
  const key = layoutPlaneKey(state.model, command.plane);
  return withLayout(state, {
    ...layout,
    planes: { ...layout.planes, [key]: { ...(layout.planes[key] ?? {}), ...command.positions } },
  });
}

function handleSetPlaneLayout(state: EditorState, command: Of<'set-plane-layout'>): CommandResult {
  const key = layoutPlaneKey(state.model, command.plane);
  const manual = { ...(state.layout.manual ?? {}) };
  if (command.manual) manual[key] = true;
  else delete manual[key];
  const { manual: _drop, ...rest } = state.layout;
  return withLayout(state, Object.keys(manual).length > 0 ? { ...rest, manual } : rest);
}

function handleSetLayoutSettings(state: EditorState, command: Of<'set-layout-settings'>): CommandResult {
  // Merge the patch into this plane's settings; a field explicitly set to
  // undefined clears it. An emptied bucket is dropped, and an emptied
  // settings map is omitted entirely (mirrors set-plane-layout hygiene).
  const key = layoutPlaneKey(state.model, command.plane);
  const merged: Record<string, unknown> = { ...(state.layout.settings?.[key] ?? {}) };
  for (const [k, v] of Object.entries(command.patch)) {
    if (v === undefined) delete merged[k];
    else merged[k] = v;
  }
  const settings = { ...(state.layout.settings ?? {}) };
  if (Object.keys(merged).length === 0) delete settings[key];
  else settings[key] = merged as LayoutSettings;
  const { settings: _drop, ...rest } = state.layout;
  return withLayout(state, Object.keys(settings).length > 0 ? { ...rest, settings } : rest);
}

function handleSetNotesOpen(state: EditorState, command: Of<'set-notes-open'>): CommandResult {
  // Model-wide: every element that carries a threat, whether or not this
  // plane draws it. An entry for an undrawn element is harmless (nothing
  // renders it) and far simpler than threading the compiled view into
  // core; allNotesOpen counts the same set, so the chip cannot disagree.
  const { model, layout } = state;
  const key = layoutPlaneKey(model, command.plane);
  const bucket = { ...(layout.notes?.[key] ?? {}) };
  const targets: ElementRef[] = [
    ...model.nodes.filter((n) => (n.threats?.length ?? 0) > 0).map((n) => ({ node: n.id })),
    ...model.relations.filter((r) => (r.threats?.length ?? 0) > 0).map((r) => ({ relation: r.id })),
  ];
  for (const t of targets) {
    const tk = elementKey(t);
    bucket[tk] = withOpen(bucket[tk] ?? { dx: 0, dy: 0 }, command.open);
  }
  return withLayout(state, withNoteBucket(layout, key, bucket));
}

export const LAYOUT_HANDLERS: Handlers<LayoutCommand> = {
  'set-position': (state, { plane, nodeId, x, y }) =>
    withLayout(state, setPos(state.layout, layoutPlaneKey(state.model, plane), nodeId, { x, y })),
  'set-size': (state, { nodeId, w, h }) =>
    withLayout(state, { ...state.layout, sizes: { ...(state.layout.sizes ?? {}), [nodeId]: { w, h } } }),
  'clear-position': (state, { plane, nodeId }) =>
    withLayout(state, setPos(state.layout, layoutPlaneKey(state.model, plane), nodeId)),
  'clear-positions': (state, { plane }) =>
    withLayout(state, {
      ...state.layout,
      planes: { ...state.layout.planes, [layoutPlaneKey(state.model, plane)]: {} },
    }),
  'set-positions': handleSetPositions,
  'set-plane-layout': handleSetPlaneLayout,
  'set-unfolded': (state, { plane, ids }) =>
    withLayout(state, withUnfolded(state.layout, layoutPlaneKey(state.model, plane), ids)),
  'set-layout-settings': handleSetLayoutSettings,
  // `null` = back to the automatic spot; whether the bubble is open is a
  // separate fact and survives the move
  'set-note-offset': (state, { target, plane, offset }) =>
    withLayout(
      state,
      withNote(state.layout, layoutPlaneKey(state.model, plane), target, (p) => ({
        ...p,
        ...(offset ?? { dx: 0, dy: 0 }),
      })),
    ),
  'set-note-open': (state, { target, plane, open }) =>
    withLayout(
      state,
      withNote(state.layout, layoutPlaneKey(state.model, plane), target, (p) => withOpen(p, open)),
    ),
  'set-notes-open': handleSetNotesOpen,
};
