import type { Dispatch, SetStateAction } from 'react';
import {
  defined,
  openingPins,
  presetLayers,
  type DiagramModel,
  type DiagramPlane,
  type LayoutOverlay,
  type LayoutSettings,
} from '@diagc/core/internal';
import type { DiagramSelection } from '@diagc/renderer';
import type { EditorApi } from '../session/useEditor';
import { remapVisibleLayers } from './layerMerge';
import { unfoldedOf } from '../layout/savedPositions';

export interface UseViewOpsOptions {
  editor: EditorApi;
  model: DiagramModel | undefined;
  /** the overlay on screen — where a plane's saved `unfolded` list is read from */
  layout: LayoutOverlay | undefined;
  pins: Record<string, 'expanded' | 'collapsed'>;
  editing: boolean;
  activePlane: string | undefined;
  planes: DiagramPlane[];
  activeLayer: string | null;
  activeLayers: string[];
  /** the canvas selection's: a plane change or a reset clears it */
  select: (sel: DiagramSelection | null) => void;
  setPlane: Dispatch<SetStateAction<string | undefined>>;
  setPins: Dispatch<SetStateAction<Record<string, 'expanded' | 'collapsed'>>>;
  setLayoutPreview: Dispatch<SetStateAction<Record<string, LayoutSettings>>>;
  setActiveLayers: Dispatch<SetStateAction<string[]>>;
  setActiveLayer: Dispatch<SetStateAction<string | null>>;
}

export interface ViewOps {
  switchPlane: (id: string) => void;
  activateLayer: (id: string | null) => void;
  mergeSelectedLayers: (sources: string[], target?: string) => void;
  toggleExpand: (id: string, next: 'expanded' | 'collapsed') => void;
  toggleLayer: (id: string) => void;
  resetView: () => void;
}

/**
 * View/navigation domain: plane switching, layer pens, pin disclosure and full
 * view reset. These transitions mostly re-derive from (plane, activeLayers,
 * pins).
 */
export function useViewOps({
  editor,
  model,
  layout,
  pins,
  editing,
  activePlane,
  planes,
  activeLayer,
  activeLayers,
  select,
  setPlane,
  setPins,
  setLayoutPreview,
  setActiveLayers,
  setActiveLayer,
}: UseViewOpsOptions): ViewOps {
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
    setLayoutPreview({});
    // The Default chip clears `plane`, and compileView resolves an absent plane to
    // planes[0] — so the seed comes from planes[0] too. Seeding [] instead would
    // leave the layer chips describing a different view from the one on canvas.
    setActiveLayers(presetLayers(planes, undefined));
    setActiveLayer(null);
    select(null);
  };

  return {
    switchPlane,
    activateLayer,
    mergeSelectedLayers,
    toggleExpand,
    toggleLayer,
    resetView,
  };
}
