import type { Dispatch, SetStateAction } from 'react';
import { uniqueNodeId, type DiagramModel, type DiagramPlane } from '@diagramming/core';
import type { DiagramSelection } from '@diagramming/renderer';
import type { EditorApi } from '../editor/useEditor';
import { remapVisibleLayers } from '../layerMerge';
import type { InspectorTab } from '../editor/InspectorTabs';
import type { LeverageFocus } from '../LeveragePanel';

export interface UseViewOpsOptions {
  editor: EditorApi;
  model: DiagramModel | undefined;
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
  setLeftTab: Dispatch<SetStateAction<InspectorTab>>;
  setLeverageFocus: Dispatch<SetStateAction<LeverageFocus | null>>;
  setCompareId: Dispatch<SetStateAction<string | null>>;
  setGroupSel: Dispatch<SetStateAction<string[]>>;
  setPlane: Dispatch<SetStateAction<string | undefined>>;
  setPins: Dispatch<SetStateAction<Record<string, 'expanded' | 'collapsed'>>>;
  setActiveLayers: Dispatch<SetStateAction<string[]>>;
  setActiveLayer: Dispatch<SetStateAction<string | null>>;
}

export interface ViewOps {
  select: (sel: DiagramSelection | null) => void;
  compareSelect: (id: string) => void;
  groupSelected: () => void;
  switchPlane: (id: string) => void;
  activateLayer: (id: string | null) => void;
  mergeSelectedLayers: (sources: string[], target?: string) => void;
  togglePin: (id: string) => void;
  toggleExpand: (id: string) => void;
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
  setLeftTab,
  setLeverageFocus,
  setCompareId,
  setGroupSel,
  setPlane,
  setPins,
  setActiveLayers,
  setActiveLayer,
}: UseViewOpsOptions): ViewOps {
  // Selection moves anywhere but the pending-rename node → the rename moment is over.
  const select = (sel: DiagramSelection | null) => {
    setSelection(sel);
    setLeverageFocus(null); // a new selection drops any leverage-row highlight
    setCompareId(null); // …and any active dependency comparison
    setGroupSel([]); // …and any pending grouping multi-selection
    setRenameId((r) => (r !== null && sel?.kind === 'node' && sel.id === r ? r : null));
    // Canvas clicks (this is DiagramView's onSelect) mean "edit this" → Properties.
    // Library placement uses setSelection directly, so it stays on the Library tab.
    if (sel?.kind === 'node' || sel?.kind === 'edge') setLeftTab('properties');
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
  const groupSelected = () => {
    if (groupSel.length < 2 || model === undefined) return;
    const name = window.prompt('Group name:', 'group')?.trim();
    if (name === undefined || name === '') return;
    const id = uniqueNodeId(model, name);
    const scoped = activePlane !== undefined && !activePlaneBorrowsContainment;
    editor.dispatch({
      type: 'group-nodes',
      node: { id, name, ...(scoped ? { plane: activePlane } : {}) },
      memberIds: groupSel,
      ...(scoped ? { plane: activePlane } : {}),
    });
    setGroupSel([]);
    setSelection({ kind: 'node', id });
  };

  const switchPlane = (id: string) => {
    const def = planes.find((p) => p.id === id);
    setPlane(id);
    setPins({});
    select(null);
    setActiveLayers(def?.layers ?? []);
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

  const togglePin = (id: string) =>
    setPins((p) => {
      const next = { ...p };
      if (next[id] === undefined) next[id] = 'collapsed';
      else if (next[id] === 'collapsed') next[id] = 'expanded';
      else delete next[id];
      return next;
    });

  // CLD group disclosure: flip straight between expanded and collapsed (no
  // auto state), so one click always toggles.
  const toggleExpand = (id: string) =>
    setPins((p) => ({ ...p, [id]: p[id] === 'expanded' ? 'collapsed' : 'expanded' }));

  const toggleLayer = (id: string) => {
    // Hiding the sheet you're drawing on drops the pen back to the base.
    if (activeLayer === id && activeLayers.includes(id)) setActiveLayer(null);
    setActiveLayers((ls) => (ls.includes(id) ? ls.filter((l) => l !== id) : [...ls, id]));
  };

  const resetView = () => {
    setPlane(undefined);
    setPins({});
    setActiveLayers([]);
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
    togglePin,
    toggleExpand,
    toggleLayer,
    resetView,
  };
}