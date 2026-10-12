import { defined, type DiagramModel, type LayoutOverlay, type LayoutSettings } from '@diagc/core/internal';
import type { QuickAddSide } from '@diagc/renderer';
import { studioNotation } from '../notations';
import type { EditSession } from '../session/useEditSession';
import type { CanvasSelection } from '../view/useCanvasSelection';
import type { ViewNavigation } from '../view/useViewNavigation';
import type { InspectorTab } from '../inspector/InspectorTabs';
import type { UseLibrary } from '../library/useLibrary';
import { computeSelectionColor, type SelectionColor } from '../view/selection-color';
import {
  connectAndDeleteHandlers,
  groupSelection,
  nodeGestureHandlers,
  noteHandlers,
  notesToggle,
  planeLayoutHandlers,
  quickAddHandlers,
  relationEndHandlers,
  strokeHandlers,
  type EditContext,
  type EditingApi,
  type NotesToggle,
} from './canvasEditHandlers';
import { useNodePlacement, type NodePlacement } from './useNodePlacement';

export interface UseCanvasEditingOptions {
  /** the edit session's mode, editor, canvas API and issue banner */
  session: Pick<EditSession, 'editing' | 'editor' | 'layoutApiRef' | 'reportIssues'>;
  /** the diagram on screen: the session's while editing */
  model: DiagramModel | undefined;
  layout: LayoutOverlay | undefined;
  /** the plane on screen, what it draws as, and the sheet being drawn on */
  nav: Pick<
    ViewNavigation,
    'activePlane' | 'notation' | 'activePlaneBorrowsContainment' | 'activePlaneManual' | 'penLayer'
  >;
  selection: CanvasSelection;
  /** the left dock's inspector tab, which a node placed from the Library leaves alone */
  selectTab: (tab: InspectorTab) => void;
  lib: UseLibrary;
  /** the drilled-into node: a new node with no other parent goes under it */
  drillRoot: string | undefined;
  /** the host's date, YYYY-MM-DD */
  today: string;
}

export interface CanvasEditing {
  /** DiagramView's `edit` while editing: every canvas gesture that changes the diagram */
  edit: EditingApi;
  /** everything that creates a node: the toolbar add, the Library tab, image import */
  placement: NodePlacement;
  /** the `+` and Tab: add the node the notation expects on `id`; whether it did */
  runQuickAdd: (id: string, side?: QuickAddSide) => boolean;
  /** wrap the canvas multi-selection in a new group node */
  groupSelected: () => Promise<void>;
  toggleAutoLayout: () => void;
  setLayoutSettings: (patch: Partial<LayoutSettings>) => void;
  notes: NotesToggle;
  /** the toolbar swatch row's target: the selected node or single-relation edge (null outside edit mode) */
  selectionColor: SelectionColor | null;
}

/**
 * What edit mode does to the diagram from the canvas and its palettes: placing
 * nodes, the canvas's edit callbacks, and the operations the keys and the chips
 * share with them. Every handler is built fresh each render over this render's
 * session, diagram and plane (see EditContext). Nothing in it holds state or
 * runs an effect, so where App calls it changes no hook order; copy and paste,
 * which listen for the clipboard's events, are App's own useClipboard.
 */
export function useCanvasEditing({
  session,
  model,
  layout,
  nav,
  selection,
  selectTab,
  lib,
  drillRoot,
  today,
}: UseCanvasEditingOptions): CanvasEditing {
  const { editing, editor, layoutApiRef, reportIssues } = session;
  const { activePlane, notation, activePlaneBorrowsContainment, activePlaneManual, penLayer } = nav;

  // Everything that creates a node: whiteboard add, canvas create, library
  // place/apply/drop, image import — all through createNodeAt.
  const placement = useNodePlacement({
    editor,
    layoutApiRef,
    selectNode: selection.selectNode,
    selectNodeForRename: selection.selectNodeForRename,
    selectTab,
    requestLabelEdit: selection.requestLabelEdit,
    reportIssues,
    activePlane,
    activePlaneBorrowsContainment,
    activePlaneManual,
    penLayer,
    selection: selection.selection,
    drillRoot,
    model,
    lib,
    notation,
    today,
  });
  const { createAt, addImages, dropLibraryEntry } = placement;

  const ctx: EditContext = {
    editor,
    editing,
    model,
    layout,
    activePlane,
    planeOpt: defined({ plane: activePlane }),
    activePlaneBorrowsContainment,
    activePlaneManual,
    penLayer,
    notation,
    profile: studioNotation(notation),
    layoutApiRef,
    select: selection.select,
    selectNode: selection.selectNode,
    requestLabelEdit: selection.requestLabelEdit,
    requestThreatEdit: selection.requestThreatEdit,
    groupSel: selection.groupSel,
  };
  const quickAdd = quickAddHandlers(ctx);
  return {
    edit: {
      editLabelRequest: selection.labelRequest,
      editThreatRequest: selection.threatRequest,
      ...noteHandlers(ctx),
      quickAdd,
      ...nodeGestureHandlers(ctx),
      onCreateAt: (pos) => createAt(pos),
      onImageFiles: (files, position) => void addImages(files, position),
      onDropLibraryEntry: dropLibraryEntry,
      ...connectAndDeleteHandlers(ctx),
      onSetTableColumns: (id, columns) => editor.dispatch({ type: 'set-table-columns', id, columns }),
      onRenameNode: (id, name) => editor.dispatch({ type: 'rename-node', id, name }),
      onSetNodeRich: (id, runs) => editor.dispatch({ type: 'set-node-rich', id, runs }),
      ...relationEndHandlers(ctx),
      ...strokeHandlers(ctx),
    },
    placement,
    runQuickAdd: quickAdd.run,
    groupSelected: groupSelection(ctx),
    ...planeLayoutHandlers(ctx),
    notes: notesToggle(ctx),
    // Global color target: the selected node, or the selected single-relation
    // edge — drives the toolbar swatch row (select object -> click color).
    selectionColor:
      editing && model !== undefined ? computeSelectionColor(model, selection.selection, editor.dispatch) : null,
  };
}
