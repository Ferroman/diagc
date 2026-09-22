import type { RefObject } from 'react';
import { DEFAULT_IMAGE_NODE_SIZE, LEAF_SIZE, PLAN_NOTATION, errMessage, type DiagramModel, type NotationId } from '@diagc/core';
import type { DiagramSelection, LayoutApi } from '@diagc/renderer';
import type { EditorApi } from '../editor/useEditor';
import { readImageSize, uploadAsset } from '../editor/images';
import { seedDates } from '../editor/planActions';
import { entryToNode, entryToNodeDetails } from '../library/entry';
import type { LibraryEntry } from '../library/types';
import type { UseLibrary } from '../library/useLibrary';
import { defaultParentId } from '../newNodeParent';
import { createNodeAt, placeTags } from '../create-node';
import type { InspectorTab } from '../editor/InspectorTabs';

export interface UseNodePlacementOptions {
  /** the edit session's editor (dispatch + session reads) */
  editor: EditorApi;
  /** viewport center/auto-position reads for manual-layout placement */
  layoutApiRef: RefObject<LayoutApi | null>;
  /** App-owned selection/rename/tab/bookkeeping setters */
  setSelection: (sel: DiagramSelection | null) => void;
  setRenameId: (id: string | null) => void;
  setLeftTab: (tab: InspectorTab) => void;
  /** open the canvas label editor on a node created outside a canvas gesture
   * (App's nonce-keyed editLabelRequest) — library placement names in place
   * so the Library tab never has to give way to Properties */
  requestLabelEdit: (id: string) => void;
  setSaveIssues: (issues: { message: string }[] | null) => void;
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
  /** the active plane's notation — a plan plane seeds a dropped zone/event's dates */
  notation?: NotationId;
  /** the host's date, YYYY-MM-DD: where a seeded drop lands with no other anchor */
  today: string;
}

export interface NodePlacement {
  /** Whiteboard-style add (Library Add button / N key). */
  addNode: () => void;
  /** Empty-canvas double-click create; returns the new node id for in-canvas rename. */
  createAt: (pos: { x: number; y: number }) => string | undefined;
  /** Place a library entry (click = under the selection; drop = at the point). */
  placeFromLibrary: (entry: LibraryEntry, opts?: { parentId?: string; position?: { x: number; y: number } }) => void;
  /** Restyle the selected node to match a library card. */
  applyFromLibrary: (entry: LibraryEntry) => void;
  /** A palette entry dragged onto the canvas. */
  dropLibraryEntry: (entryId: string, position: { x: number; y: number }, targetNodeId?: string) => void;
  /** Drop/paste/picker: upload files and create image nodes. */
  addImages: (files: File[], position?: { x: number; y: number }) => Promise<void>;
}

/**
 * The add-node/placement domain: everything that creates a node through the
 * shared createNodeAt helper — the whiteboard add, empty-canvas create, library
 * click-to-place and drag-to-drop, library restyle (apply), and image import.
 * Each flow shares the plane/pen scoping + parent resolution; only the node
 * payload, size/position handling and rename-focus differ per flow.
 */
export function useNodePlacement({
  editor,
  layoutApiRef,
  setSelection,
  setRenameId,
  setLeftTab,
  requestLabelEdit,
  setSaveIssues,
  activePlane,
  activePlaneBorrowsContainment,
  activePlaneManual,
  penLayer,
  selection,
  drillRoot,
  model,
  lib,
  notation,
  today,
}: UseNodePlacementOptions): NodePlacement {
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
      ...(place.parent !== undefined ? { parent: place.parent } : {}),
    });
    // In manual layout elk won't place the new node, so drop it at the viewport
    // center so it lands in view instead of at the origin. viewportCenter() is
    // an absolute flow coordinate, only correct for a root node — a child added
    // under a container is left for a one-time elk placement within its parent
    // (same deferral the feature already applies to container children), then
    // draggable to pin.
    if (activePlaneManual && place.parent === undefined) {
      const c = layoutApiRef.current?.viewportCenter();
      if (c !== undefined)
        editor.dispatch({
          type: 'set-position',
          nodeId: place.id,
          x: c.x - LEAF_SIZE.width / 2,
          y: c.y - LEAF_SIZE.height / 2,
          ...(activePlane !== undefined ? { plane: activePlane } : {}),
        });
    }
    // Add node lives on the Library tab now; flip to Properties so the new node's
    // Name field autofocuses (preserves the whiteboard-add rename flow).
    setLeftTab('properties');
    setSelection({ kind: 'node', id: place.id });
    setRenameId(place.id);
  };

  // Double-click on empty canvas: drop a typeless node centered on that flow
  // point and open its name for renaming (mirrors the toolbar add, minus the
  // type). Returning the id lets DiagramView open it in canvas in-place rename
  // mode — the sole rename affordance here, so no setRenameId (a panel autofocus
  // would race the canvas editor across DiagramView's async layout timing).
  const createAt = (pos: { x: number; y: number }) => {
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
      ...(place.parent !== undefined ? { parent: place.parent } : {}),
    });
    // Top-level create lands at the exact double-click point; a node nested into
    // the drilled level is elk-placed inside its parent instead.
    if (place.parent === undefined) {
      editor.dispatch({
        type: 'set-position',
        nodeId: place.id,
        x: pos.x - LEAF_SIZE.width / 2,
        y: pos.y - LEAF_SIZE.height / 2,
        ...(activePlane !== undefined ? { plane: activePlane } : {}),
      });
    }
    setSelection({ kind: 'node', id: place.id });
    return place.id;
  };

  // Place a library entry as a node: mirrors addNode's id generation and
  // plane/pen scoping, but stamps the entry's template instead of a blank node,
  // sizes it when the template carries dimensions, and names in place on the
  // canvas — the Properties Name field addNode focuses is not mounted while the
  // Library tab is up, and placing leaves that tab open on purpose (you place
  // several in a row).
  // Click-to-place (no position) nests under the selected container, mirroring
  // Add node; drag-to-place passes the drop point, so the node lands there
  // top-level instead.
  const placeFromLibrary = (
    entry: LibraryEntry,
    opts?: { parentId?: string; position?: { x: number; y: number } },
  ) => {
    const m = editor.session?.state.model;
    if (m === undefined) return;
    const kind = entry.template.image !== undefined || entry.template.shape !== undefined ? 'icon' : 'node';
    // Drop-on-node or click-with-selection nests; a bare drop point lands in the
    // current drilled level, or top-level when not drilled.
    const parentId = opts?.parentId ?? (opts?.position === undefined ? defaultParentId(selection, drillRoot) : drillRoot);
    const place = createNodeAt(m, { kind, plane: activePlane, borrowsContainment: activePlaneBorrowsContainment, parentId });
    // A plan plane's Zone/Event templates carry no dates of their own — a
    // library-dropped one is dateless (and invalid) without a seed here.
    const seeded =
      notation === PLAN_NOTATION
        ? seedDates(m, activePlane, entry.template.type, { ...(opts?.position !== undefined ? { x: opts.position.x } : {}), ...(parentId !== undefined ? { parentId } : {}) }, today)
        : undefined;
    const node = { ...entryToNode(entry, place.id, placeTags(place, penLayer)), ...(seeded !== undefined ? { metadata: seeded } : {}) };
    editor.dispatch({ type: 'add-node', node, ...(place.parent !== undefined ? { parent: place.parent } : {}) });
    if (entry.template.width !== undefined && entry.template.height !== undefined) {
      editor.dispatch({ type: 'set-size', nodeId: place.id, w: entry.template.width, h: entry.template.height });
    }
    if (place.parent === undefined && opts?.position !== undefined) {
      const w = entry.template.width ?? LEAF_SIZE.width;
      const h = entry.template.height ?? LEAF_SIZE.height;
      editor.dispatch({
        type: 'set-position',
        nodeId: place.id,
        x: opts.position.x - w / 2,
        y: opts.position.y - h / 2,
        ...(activePlane !== undefined ? { plane: activePlane } : {}),
      });
    }
    setSelection({ kind: 'node', id: place.id });
    requestLabelEdit(place.id);
  };

  // Restyle the selected node to match a library card: overwrite its visual
  // channels (type/color/image/shape) with the card's and adopt the card's
  // footprint, leaving the node's identity, containment and relations intact.
  // This is the "make this node look like that library entry" path (vs. placing
  // a fresh node), so the target is the current selection, not a new id.
  const applyFromLibrary = (entry: LibraryEntry) => {
    if (selection?.kind !== 'node') return;
    const id = selection.id;
    editor.dispatch({ type: 'set-node-details', id, details: entryToNodeDetails(entry) });
    if (entry.template.width !== undefined && entry.template.height !== undefined) {
      editor.dispatch({ type: 'set-size', nodeId: id, w: entry.template.width, h: entry.template.height });
    }
    // A seeded card (the Table entry) also stamps its columns — but only onto a
    // column-less target, so restyling an existing table with the Table card
    // keeps its columns instead of resetting them to the lone `id` seed.
    const node = model?.nodes.find((n) => n.id === id);
    if (entry.template.columns !== undefined && (node?.columns === undefined || node.columns.length === 0)) {
      editor.dispatch({ type: 'set-table-columns', id, columns: entry.template.columns });
    }
  };

  // A palette entry dragged onto the canvas: look it up and place it at the drop point,
  // or nest it under the node it landed on.
  const dropLibraryEntry = (entryId: string, position: { x: number; y: number }, targetNodeId?: string) => {
    const entry = lib.library.entries.find((e) => e.id === entryId);
    if (entry === undefined) return;
    if (targetNodeId !== undefined) placeFromLibrary(entry, { parentId: targetNodeId });
    else placeFromLibrary(entry, { position });
  };

  // Drop/paste/picker all land here: upload, then create an image node (sized
  // from the file, positioned at the drop point when there is one).
  const addImages = async (files: File[], position?: { x: number; y: number }) => {
    const issues: { message: string }[] = [];
    for (const file of files) {
      try {
        const name = await uploadAsset(file);
        const size = (await readImageSize(file)) ?? DEFAULT_IMAGE_NODE_SIZE;
        // peek(), not session: the render-bound session is stale inside this
        // loop, so a second file would reuse the first file's node id. Read
        // right before the dispatches (after all the awaits above) so the
        // stale window is zero.
        const m = editor.peek()?.state.model;
        if (m === undefined) break;
        // Plane-tag the image like any other added node: view-local on a
        // non-borrowing active plane, shared otherwise (createNodeAt). This
        // fixes the old inconsistency where the node was left shared while its
        // set-position below was written to the plane's bucket — an image added
        // on a plane used to leak into every view with an orphan position.
        const place = createNodeAt(m, {
          kind: 'image',
          plane: activePlane,
          borrowsContainment: activePlaneBorrowsContainment,
          parentId: undefined,
        });
        editor.dispatch({
          type: 'add-node',
          node: {
            id: place.id,
            name: file.name.replace(/\.[^.]*$/, '') || place.id,
            type: 'image',
            image: name,
            ...placeTags(place, penLayer),
          },
        });
        editor.dispatch({ type: 'set-size', nodeId: place.id, w: size.w, h: size.h });
        if (position !== undefined) {
          editor.dispatch({
            type: 'set-position',
            nodeId: place.id,
            x: position.x - size.w / 2,
            y: position.y - size.h / 2,
            ...(activePlane !== undefined ? { plane: activePlane } : {}),
          });
        }
        setSelection({ kind: 'node', id: place.id });
      } catch (e) {
        issues.push({ message: errMessage(e) });
      }
    }
    // One banner for the whole batch — per-file writes would overwrite each other.
    if (issues.length > 0) setSaveIssues(issues);
  };

  return { addNode, createAt, placeFromLibrary, applyFromLibrary, dropLibraryEntry, addImages };
}