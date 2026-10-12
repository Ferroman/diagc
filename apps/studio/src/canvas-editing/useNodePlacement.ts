import type { RefObject } from 'react';
import { defined, LEAF_SIZE, type DiagramModel, type NotationId, type Point } from '@diagc/core/internal';
import type { DiagramSelection, LayoutApi } from '@diagc/renderer';
import type { EditorApi } from '../session/useEditor';
import type { LibraryEntry } from '../library/types';
import type { UseLibrary } from '../library/useLibrary';
import { defaultParentId } from './newNodeParent';
import { createNodeAt, placeTags } from './create-node';
import { importImages } from './imageImport';
import { applyLibraryEntry, placeLibraryEntry, type PlaceAt } from './libraryPlacement';
import type { InspectorTab } from '../inspector/InspectorTabs';

export interface UseNodePlacementOptions {
  /** the edit session's editor (dispatch + session reads) */
  editor: EditorApi;
  /** viewport center/auto-position reads for manual-layout placement */
  layoutApiRef: RefObject<LayoutApi | null>;
  /** select the node just made (the canvas selection's), and also focus its
   * Name field in the Properties panel */
  selectNode: (id: string) => void;
  selectNodeForRename: (id: string) => void;
  /** the left dock's inspector tab */
  selectTab: (tab: InspectorTab) => void;
  /** open the canvas label editor on a node created outside a canvas gesture
   * (the canvas selection's nonce-keyed editLabelRequest) — library placement names in place
   * so the Library tab never has to give way to Properties */
  requestLabelEdit: (id: string) => void;
  /** the edit session's issue banner: an upload that failed */
  reportIssues: (issues: { message: string }[] | null) => void;
  /** active plane + whether it borrows containment (drives plane scoping) */
  activePlane: string | undefined;
  activePlaneBorrowsContainment: boolean;
  /** whether the active plane is manual (frozen) layout — new root nodes get a
   * viewport-center position instead of an elk placement */
  activePlaneManual: boolean;
  /** the pen layer new nodes land on (null = base sheet) */
  penLayer: string | null;
  /** drill/selection context for nesting */
  selection: DiagramSelection | null;
  drillRoot: string | undefined;
  /** the render-bound model (edit mode: the session's) — used by applyFromLibrary */
  model: DiagramModel | undefined;
  lib: UseLibrary;
  /** the active plane's notation — where it draws x as days, a dropped zone/event's dates follow the drop point */
  notation?: NotationId;
  /** the host's date, YYYY-MM-DD: where a seeded drop lands with no other anchor */
  today: string;
}

export interface NodePlacement {
  /** Whiteboard-style add (Library Add button / N key). */
  addNode: () => void;
  /** Empty-canvas double-click create; returns the new node id for in-canvas rename. */
  createAt: (pos: Point) => string | undefined;
  /** Place a library entry (click = under the selection; drop = at the point). */
  placeFromLibrary: (entry: LibraryEntry, opts?: PlaceAt) => void;
  /** Restyle the selected node to match a library card. */
  applyFromLibrary: (entry: LibraryEntry) => void;
  /** A palette entry dragged onto the canvas. */
  dropLibraryEntry: (entryId: string, position: Point, targetNodeId?: string) => void;
  /** Drop/paste/picker: upload files and create image nodes. */
  addImages: (files: File[], position?: Point) => Promise<void>;
}

/**
 * The add-node/placement domain: everything that creates a node through the
 * shared createNodeAt helper — the whiteboard add, empty-canvas create, library
 * click-to-place and drag-to-drop, library restyle (apply), and image import.
 * Each flow shares the plane/pen scoping + parent resolution; only the node
 * payload, size/position handling and rename-focus differ per flow.
 */
export function useNodePlacement(options: UseNodePlacementOptions): NodePlacement {
  const {
    editor,
    layoutApiRef,
    selectNode,
    selectNodeForRename,
    selectTab,
    activePlane,
    activePlaneBorrowsContainment,
    activePlaneManual,
    penLayer,
    selection,
    drillRoot,
    lib,
  } = options;
  // Whiteboard-style add: drop the node immediately (under the selected
  // container, if any) and put focus in its name field — no prompt.
  const addNode = () => {
    const m = editor.session?.state.model;
    if (m === undefined) return;
    const place = createNodeAt(m, {
      kind: 'node',
      plane: activePlane,
      borrowsContainment: activePlaneBorrowsContainment,
      parentId: defaultParentId(selection, drillRoot),
    });
    editor.dispatch({
      type: 'add-node',
      node: { id: place.id, name: place.id, ...placeTags(place, penLayer) },
      ...defined({ parent: place.parent }),
    });
    // In manual layout elk won't place the new node, so drop it at the viewport
    // center so it lands in view instead of at the origin. viewportCenter() is
    // an absolute flow coordinate, only correct for a root node — a child added
    // under a container is left for a one-time elk placement within its parent
    // (same deferral the feature already applies to container children), then
    // dragged to a saved position.
    if (activePlaneManual && place.parent === undefined) {
      const c = layoutApiRef.current?.viewportCenter();
      if (c !== undefined)
        editor.dispatch({
          type: 'set-position',
          nodeId: place.id,
          x: c.x - LEAF_SIZE.width / 2,
          y: c.y - LEAF_SIZE.height / 2,
          ...defined({ plane: activePlane }),
        });
    }
    // Add node lives on the Library tab now; flip to Properties so the new node's
    // Name field autofocuses (preserves the whiteboard-add rename flow).
    selectTab('properties');
    selectNodeForRename(place.id);
  };

  // Double-click on empty canvas: drop a typeless node centered on that flow
  // point and open its name for renaming (mirrors the toolbar add, minus the
  // type). Returning the id lets DiagramView open it in canvas in-place rename
  // mode — the sole rename affordance here, so no selectNodeForRename (a panel autofocus
  // would race the canvas editor across DiagramView's async layout timing).
  const createAt = (pos: Point) => {
    const m = editor.session?.state.model;
    if (m === undefined) return;
    const place = createNodeAt(m, {
      kind: 'node',
      plane: activePlane,
      borrowsContainment: activePlaneBorrowsContainment,
      parentId: defaultParentId(null, drillRoot), // empty-canvas create ignores selection
    });
    editor.dispatch({
      type: 'add-node',
      node: { id: place.id, name: place.id, ...placeTags(place, penLayer) },
      ...defined({ parent: place.parent }),
    });
    // Top-level create lands at the exact double-click point; a node nested into
    // the drilled level is elk-placed inside its parent instead.
    if (place.parent === undefined) {
      editor.dispatch({
        type: 'set-position',
        nodeId: place.id,
        x: pos.x - LEAF_SIZE.width / 2,
        y: pos.y - LEAF_SIZE.height / 2,
        ...defined({ plane: activePlane }),
      });
    }
    selectNode(place.id);
    return place.id;
  };

  // A card from the palette: placed (libraryPlacement), or restyling the selection.
  const placeFromLibrary = (entry: LibraryEntry, opts?: PlaceAt) => placeLibraryEntry(options, entry, opts);
  const applyFromLibrary = (entry: LibraryEntry) => applyLibraryEntry(options, entry);

  // A palette entry dragged onto the canvas: look it up and place it at the drop point,
  // or nest it under the node it landed on.
  const dropLibraryEntry = (entryId: string, position: Point, targetNodeId?: string) => {
    const entry = lib.library.entries.find((e) => e.id === entryId);
    if (entry === undefined) return;
    placeFromLibrary(entry, { position, parentId: targetNodeId });
  };

  // Drop/paste/picker all land here (imageImport).
  const addImages = (files: File[], position?: Point) => importImages(options, files, position);

  return { addNode, createAt, placeFromLibrary, applyFromLibrary, dropLibraryEntry, addImages };
}
