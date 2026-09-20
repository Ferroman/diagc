import type { Dispatch, SetStateAction } from 'react';
import {
  openingPins,
  presetLayers,
  uniqueNodeId,
  type DiagramModel,
  type DiagramPlane,
  type LayoutOverlay,
  type LayoutSettings,
} from '@diagc/core';
import type { DiagramSelection } from '@diagc/renderer';
import type { EditorApi } from '../editor/useEditor';
import { getHost } from '../host';
import { remapVisibleLayers } from '../layerMerge';
import { unfoldedOf } from '../savedPositions';
import type { LeverageFocus } from '../LeveragePanel';

export interface UseViewOpsOptions {
  editor: EditorApi;
  model: DiagramModel | undefined;
  /** the overlay on screen — where a plane's saved `unfolded` list is read from */
  layout: LayoutOverlay | undefined;
  pins: Record<string, 'expanded' | 'collapsed'>;
  selection: DiagramSelection | null;
  groupSel: string[];
  editing: boolean;
  notation: string | undefined;
  activePlane: string | undefined;
  activePlaneBorrowsContainment: boolean;
  planes: DiagramPlane[];
  activeLayer: string | null;
  activeLayers: string[];
  setSelection: Dispatch<SetStateAction<DiagramSelection | null>>;
  setRenameId: Dispatch<SetStateAction<string | null>>;
  setLeverageFocus: Dispatch<SetStateAction<LeverageFocus | null>>;
  setCompareId: Dispatch<SetStateAction<string | null>>;
  setPlane: Dispatch<SetStateAction<string | undefined>>;
  setPins: Dispatch<SetStateAction<Record<string, 'expanded' | 'collapsed'>>>;
  setLayoutPreview: Dispatch<SetStateAction<Record<string, LayoutSettings>>>;
  setActiveLayers: Dispatch<SetStateAction<string[]>>;
  setActiveLayer: Dispatch<SetStateAction<string | null>>;
}

export interface ViewOps {
  select: (sel: DiagramSelection | null) => void;
  compareSelect: (id: string) => void;
  groupSelected: () => Promise<void>;
  switchPlane: (id: string) => void;
  activateLayer: (id: string | null) => void;
  mergeSelectedLayers: (sources: string[], target?: string) => void;
  toggleExpand: (id: string, next: 'expanded' | 'collapsed') => void;
  toggleLayer: (id: string) => void;
  resetView: () => void;
}

/**
 * View/navigation domain: selection, CLD compare/group, plane switching, layer
 * pens, pin disclosure and full view reset. These transitions mostly re-derive
 * from (selection, plane, activeLayers, pins); keeping them in one hook makes
 * the shared bookkeeping (e.g. every selection move clears rename/compare/group
 * state) visible in one place.
 */
export function useViewOps({
  editor,
  model,
  layout,
  pins,
  selection,
  groupSel,
  editing,
  notation,
  activePlane,
  activePlaneBorrowsContainment,
  planes,
  activeLayer,
  activeLayers,
  setSelection,
  setRenameId,
  setLeverageFocus,
  setCompareId,
  setPlane,
  setPins,
  setLayoutPreview,
  setActiveLayers,
  setActiveLayer,
}: UseViewOpsOptions): ViewOps {
  // Selection moves anywhere but the pending-rename node → the rename moment is
  // over. What it deliberately does NOT touch is the inspector tab: the dock
  // keeps the one the user chose, because a canvas click while the Library was
  // open used to flip to Properties and cost a trip back to the palette for
  // every node placed or container selected. Only the toolbar add (which renames
  // in the Properties Name field) and re-entering edit mode set the tab.
  const select = (sel: DiagramSelection | null) => {
    setSelection(sel);
    setLeverageFocus(null); // a new selection drops any leverage-row highlight
    setCompareId(null); // …and any active dependency comparison
    // the multi-selection mirrors the canvas (App.multiSelect) — it is not cleared here
    setRenameId((r) => (r !== null && sel?.kind === 'node' && sel.id === r ? r : null));
  };

  // ctrl-click a second node in the causal-loop view → compare it with the
  // currently-selected variable. Toggle off if it's the same one; ignore self
  // or clicks outside a valid CLD single-node selection.
  const compareSelect = (id: string) => {
    if (editing || notation !== 'causal-loop' || selection?.kind !== 'node' || id === selection.id) return;
    setLeverageFocus(null);
    setCompareId((cur) => (cur === id ? null : id));
  };

  // Wrap the shift-selected variables in a new abstract variable, scoped to the
  // active plane so (in the causal-loop view) it stays out of the base view.
  const groupSelected = async () => {
    if (groupSel.length < 2 || model === undefined) return;
    const name = (await getHost().promptText('Group name:', 'group'))?.trim();
    if (name === undefined || name === '') return;
    const id = uniqueNodeId(model, name);
    const scoped = activePlane !== undefined && !activePlaneBorrowsContainment;
    editor.dispatch({
      type: 'group-nodes',
      node: { id, name, ...(scoped ? { plane: activePlane } : {}) },
      memberIds: groupSel,
      ...(scoped ? { plane: activePlane } : {}),
    });
    setSelection({ kind: 'node', id });
  };

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
        ...(activePlane !== undefined ? { plane: activePlane } : {}),
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
    select,
    compareSelect,
    groupSelected,
    switchPlane,
    activateLayer,
    mergeSelectedLayers,
    toggleExpand,
    toggleLayer,
    resetView,
  };
}