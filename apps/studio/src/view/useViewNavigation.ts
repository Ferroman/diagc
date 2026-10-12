import { useEffect, useRef, useState } from 'react';
import {
  activeNotation,
  borrowsContainment,
  defined,
  layoutPlaneKey,
  openingPins,
  presetLayers,
  type DiagramModel,
  type LayoutOverlay,
  type NotationId,
} from '@diagc/core/internal';
import type { DiagramSelection } from '@diagc/renderer';
import type { EditorApi } from '../session/useEditor';
import { remapVisibleLayers } from './layerMerge';
import { unfoldedOf } from '../layout/savedPositions';

export type Pins = Record<string, 'expanded' | 'collapsed'>;

export interface UseViewNavigationOptions {
  /** the diagram on screen: the session's while editing */
  model: DiagramModel | undefined;
  /** its overlay — where a plane's saved `unfolded` list is read from */
  layout: LayoutOverlay | undefined;
  editing: boolean;
  editor: EditorApi;
  /** the open diagram: the layers and folds are seeded once per diagram */
  selected: string;
  /** the canvas selection's: a plane change or a reset clears it */
  select: (sel: DiagramSelection | null) => void;
  /** what else a reset drops: the layout preview, which the arrangement owns */
  onReset: () => void;
}

export interface ViewNavigation {
  /** the plane on screen; undefined is the base view */
  activePlane: string | undefined;
  /** the notation the plane on screen draws as */
  notation: NotationId | undefined;
  /** the plane borrows its containment, so a new node is added shared */
  activePlaneBorrowsContainment: boolean;
  /** the plane's layout is frozen (its manual flag is set) */
  activePlaneManual: boolean;
  /** the layers switched on */
  activeLayers: string[];
  /** the sheet new nodes and edges land on (null = the base sheet) */
  penLayer: string | null;
  /** the viewer's fold overrides */
  pins: Pins;
  /** the plane's saved open boxes, as one comparable string */
  savedUnfoldedKey: string;
  switchPlane: (id: string) => void;
  activateLayer: (id: string | null) => void;
  mergeSelectedLayers: (sources: string[], target?: string) => void;
  toggleExpand: (id: string, next: 'expanded' | 'collapsed') => void;
  toggleLayer: (id: string) => void;
  resetView: () => void;
}

/**
 * Where the viewer is in the diagram: the plane on screen, the layers switched
 * on and the sheet being drawn on, and which boxes are folded. These
 * transitions mostly re-derive from (plane, activeLayers, pins).
 */
export function useViewNavigation({
  model,
  layout,
  editing,
  editor,
  selected,
  select,
  onReset,
}: UseViewNavigationOptions): ViewNavigation {
  const [plane, setPlane] = useState<string | undefined>(undefined);
  const [activeLayers, setActiveLayers] = useState<string[]>([]);
  // The "pen": the transparent sheet new nodes/edges land on (null = base sheet).
  const [activeLayer, setActiveLayer] = useState<string | null>(null);
  const [pins, setPins] = useState<Pins>({});

  const planes = model?.planes ?? [];
  // undefined = the base/default view (no plane overlay). Kept distinct from
  // planes[0] so the Default chip stays reachable once planes exist — but the
  // default view's containment IS the first plane's, so it takes that plane's
  // notation too (activeNotation falls back to planes[0]), matching the
  // published page.
  const activePlane = plane;
  const notation = activeNotation(planes, activePlane, model?.notation);
  // A borrowing plane is a view of its donor's structure, so a node drawn
  // there is added shared and joins that structure (see createNodeAt).
  const activePlaneBorrowsContainment = model !== undefined && borrowsContainment(model, activePlane);

  // Seed the layer switch from the plane's presets when a diagram arrives on
  // screen. A plane's `layers` are a DEFAULT the user then owns (see
  // presetLayers): compileView no longer unions them in on every compile, so
  // without a seed a diagram opens with its own overlays off. Keyed on the
  // diagram, not on `model` — editing rebuilds the model on every keystroke, and
  // re-seeding there would undo the user's own toggles mid-edit. A plane change
  // does not re-seed here either; switchPlane owns that transition.
  const seededDiagram = useRef<string | null>(null);
  useEffect(() => {
    if (model === undefined || seededDiagram.current === selected) return;
    seededDiagram.current = selected;
    setActiveLayers(presetLayers(model.planes, plane));
    // Same seed as the exporter: a diagram whose layout names groups in
    // `export.collapsed` opens with exactly those folded here too. Without it the
    // studio drew a picture the published image never shows — the author would
    // fold by hand to see what they were shipping, or (worse) not notice that a
    // box is folded in the image at all. Empty list, empty pins: unchanged.
    // On top of that, the boxes the layout was SAVED with open (`unfolded`):
    // hand-placed interiors only show while their container is open.
    const folded = layout?.export?.collapsed ?? [];
    setPins({
      ...Object.fromEntries(folded.map((id) => [id, 'collapsed' as const])),
      ...openingPins(layout, model, plane),
    });
  }, [selected, model, plane, layout]);

  // Whether the active plane is in manual (frozen) layout — its manual flag is
  // set in the layout sidecar. Drives the toolbar toggle and new-node placement.
  const activePlaneManual = model !== undefined && layout?.manual?.[layoutPlaneKey(model, activePlane)] === true;

  // The pen, clamped to a layer that still exists (deleting the active layer
  // drops us back to the base sheet without any explicit reset).
  const penLayer = activeLayer !== null && (model?.layers ?? []).some((l) => l.id === activeLayer) ? activeLayer : null;

  // While editing, the open boxes are recorded in the session's overlay (see
  // toggleExpand), so undo/redo can change them underneath the canvas: follow.
  // Only a CHANGE while editing counts — entering edit mode must not fold away
  // what the viewer had open just because it was never saved.
  const savedUnfoldedKey =
    model !== undefined ? (layout?.unfolded?.[layoutPlaneKey(model, activePlane)] ?? []).join('\u0000') : '';
  const lastSavedUnfolded = useRef<string | null>(null);
  useEffect(() => {
    const was = lastSavedUnfolded.current;
    lastSavedUnfolded.current = editing ? savedUnfoldedKey : null;
    if (!editing || was === null || was === savedUnfoldedKey || model === undefined) return;
    setPins((p) => (unfoldedOf(p).join('\u0000') === savedUnfoldedKey ? p : openingPins(layout, model, activePlane)));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the saved list's CONTENT; layout/model/plane are read at that moment
  }, [editing, savedUnfoldedKey]);

  // A plane change re-seeds the layer switch from the new plane's presets, and the
  // user owns it from there (see presetLayers / ViewportState.activeLayers): a
  // plane's `layers` are a starting point, not a floor the compiler re-imposes.
  // The folds follow the same rule: each plane opens the way IT was saved.
  const switchPlane = (id: string) => {
    setPlane(id);
    setPins(model !== undefined ? openingPins(layout, model, id) : {});
    select(null);
    setActiveLayers(presetLayers(planes, id));
    setActiveLayer(null);
  };

  // Pick the pen (or the base sheet with null); activating a sheet also turns
  // it on, so you can always see what you draw. Other visible sheets stay on,
  // so you keep drawing "over the layers below".
  const activateLayer = (id: string | null) => {
    setActiveLayer(id);
    if (id !== null) setActiveLayers((ls) => (ls.includes(id) ? ls : [...ls, id]));
  };

  const mergeSelectedLayers = (sources: string[], target?: string) => {
    editor.dispatch({ type: 'merge-layers', sources, target });
    const set = new Set(sources);
    // The pen follows a merged-away source to the target, or back to the base
    // sheet (null) when merging to base — penLayer would otherwise derive back
    // to base once the source layer disappears.
    if (activeLayer !== null && set.has(activeLayer)) setActiveLayer(target ?? null);
    setActiveLayers((ls) => remapVisibleLayers(ls, sources, target));
  };

  // The fold chip (and a CLD group's disclosure): land in the state the canvas
  // asked for. The renderer names it because only the view knows whether the
  // box is open right now — focus can open one that carries no pin.
  //
  // While editing, which boxes are open is part of the document, exactly as the
  // positions are: the toggle is recorded (one undo step, written by autosave),
  // so a reload reopens what was being worked on. View mode only changes what
  // is on screen — saving it is the explicit Save positions chip.
  const toggleExpand = (id: string, next: 'expanded' | 'collapsed') => {
    setPins((p) => ({ ...p, [id]: next }));
    if (editing) {
      editor.dispatch({
        type: 'set-unfolded',
        ids: unfoldedOf({ ...pins, [id]: next }),
        ...defined({ plane: activePlane }),
      });
    }
  };

  const toggleLayer = (id: string) => {
    // Hiding the sheet you're drawing on drops the pen back to the base.
    if (activeLayer === id && activeLayers.includes(id)) setActiveLayer(null);
    setActiveLayers((ls) => (ls.includes(id) ? ls.filter((l) => l !== id) : [...ls, id]));
  };

  const resetView = () => {
    setPlane(undefined);
    setPins(model !== undefined ? openingPins(layout, model, undefined) : {});
    onReset();
    // The Default chip clears `plane`, and compileView resolves an absent plane to
    // planes[0] — so the seed comes from planes[0] too. Seeding [] instead would
    // leave the layer chips describing a different view from the one on canvas.
    setActiveLayers(presetLayers(planes, undefined));
    setActiveLayer(null);
    select(null);
  };

  return {
    activePlane,
    notation,
    activePlaneBorrowsContainment,
    activePlaneManual,
    activeLayers,
    penLayer,
    pins,
    savedUnfoldedKey,
    switchPlane,
    activateLayer,
    mergeSelectedLayers,
    toggleExpand,
    toggleLayer,
    resetView,
  };
}
