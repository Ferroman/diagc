import { layoutPlaneKey, type DiagramModel, type LayoutOverlay } from '@diagc/core/internal';
import { LeveragePanel, type DiagramSelection } from '@diagc/renderer';
import { getHost } from '../host';
import type { NodePlacement } from '../canvas-editing/useNodePlacement';
import { Dock } from '../dock/Dock';
import { DOCK_MAX, LEFT_MIN, type DockLayout } from '../dock/useDockLayout';
import { LibraryPanel } from '../library/LibraryPanel';
import { libraryImports } from '../library/libraryImports';
import type { UseLibrary } from '../library/useLibrary';
import type { CausalLoopAnalysis } from '../notations/causal-loop/useCausalLoopAnalysis';
import type { EditSession } from '../session/useEditSession';
import type { CanvasSelection } from '../view/useCanvasSelection';
import type { ViewNavigation } from '../view/useViewNavigation';
import { EdgePanel } from './EdgePanel';
import { InspectorTabs } from './InspectorTabs';
import { NodePanel } from './NodePanel';
import { Sidebar } from './Sidebar';

export interface InspectorDockProps {
  model: DiagramModel;
  /** the saved layout overlay: where the node panel reads a saved position */
  layout: LayoutOverlay | undefined;
  editing: boolean;
  dock: DockLayout;
  selection: Pick<CanvasSelection, 'selection' | 'renameId' | 'select'>;
  nav: Pick<ViewNavigation, 'activePlane' | 'notation'>;
  /** the host's date, YYYY-MM-DD */
  today: string;
  session: Pick<EditSession, 'editor' | 'layoutApiRef' | 'reportIssues'>;
  lib: UseLibrary;
  placement: Pick<NodePlacement, 'placeFromLibrary' | 'applyFromLibrary' | 'addNode' | 'addImages'>;
  /** the notation analyses loops: its leverage report takes the dock in view mode */
  loopAnalysis: boolean;
  loops: Pick<CausalLoopAnalysis, 'cldEdges' | 'leverageFocus' | 'focusLeverage' | 'compareId' | 'clearCompare'>;
}

/**
 * The left dock: the inspector's Properties and Library tabs while editing;
 * in view mode the leverage report on a causal loop, else the selection's
 * details, else a hint.
 */
export function InspectorDock(props: InspectorDockProps) {
  const { model, editing, dock, loops } = props;
  const { selection, select } = props.selection;
  return (
    <Dock
      side="left"
      collapsed={dock.leftCollapsed}
      onToggle={dock.toggleLeft}
      hasContent={editing ? true : selection !== null}
      width={dock.leftWidth}
      minWidth={LEFT_MIN}
      maxWidth={DOCK_MAX}
      onWidthChange={dock.setLeftWidth}
    >
      {editing ? (
        <InspectorTabs
          activeTab={dock.leftTab}
          onTabChange={dock.selectTab}
          properties={
            <SelectionPanel
              model={model}
              layout={props.layout}
              selection={props.selection}
              nav={props.nav}
              today={props.today}
              session={props.session}
            />
          }
          library={
            <LibraryTab
              model={model}
              selection={props.selection}
              dock={dock}
              lib={props.lib}
              placement={props.placement}
              session={props.session}
            />
          }
        />
      ) : props.loopAnalysis && selection?.kind === 'node' && model.nodes.some((n) => n.id === selection.id) ? (
        <LeveragePanel
          key={selection.id}
          model={model}
          edges={loops.cldEdges}
          target={selection.id}
          activeFocusKey={loops.leverageFocus?.key ?? null}
          onFocus={loops.focusLeverage}
          onClose={() => select(null)}
          compareId={loops.compareId}
          onClearCompare={loops.clearCompare}
        />
      ) : selection !== null ? (
        <Sidebar model={model} selection={selection} />
      ) : (
        <div className="sidebar dock-empty">Select a node or edge for details.</div>
      )}
    </Dock>
  );
}

/** The Properties tab: the selected node's or relation's panel, else its details. */
function SelectionPanel({
  model,
  layout,
  selection: canvas,
  nav,
  today,
  session,
}: Pick<InspectorDockProps, 'model' | 'layout' | 'selection' | 'nav' | 'today' | 'session'>) {
  const { selection, select } = canvas;
  const { activePlane, notation } = nav;
  const { editor, layoutApiRef } = session;
  // The node panel's position inputs: the selected node's saved position on
  // this plane, and where it sits on screen.
  const savedPosition =
    selection?.kind === 'node' ? layout?.planes[layoutPlaneKey(model, activePlane)]?.[selection.id] : undefined;
  const live = selection?.kind === 'node' ? layoutApiRef.current?.snapshotPositions()[selection.id] : undefined;
  return selection?.kind === 'node' && model.nodes.some((n) => n.id === selection.id) ? (
    <NodePanel
      key={selection.id}
      model={model}
      nodeId={selection.id}
      activePlane={activePlane}
      hasSavedPosition={savedPosition !== undefined}
      savedPosition={savedPosition}
      live={live}
      autoFocusName={selection.id === canvas.renameId}
      notation={notation}
      today={today}
      onCommand={editor.dispatch}
      onClose={() => select(null)}
      onDeleted={() => select(null)}
    />
  ) : selection?.kind === 'edge' ? (
    <EdgePanel
      key={selection.id}
      model={model}
      constituentIds={selection.constituentIds ?? [selection.id]}
      onCommand={editor.dispatch}
      onClose={() => select(null)}
      notation={notation}
      activePlane={activePlane}
    />
  ) : (
    <Sidebar model={model} selection={selection} />
  );
}

// The Apply-target for a selected node (LibraryPanel restyle toggle); undefined
// when nothing is selected (hides the toggle).
const applyTargetFor = (
  model: DiagramModel,
  selection: DiagramSelection | null,
): { id: string; name: string } | undefined => {
  if (selection?.kind !== 'node') return undefined;
  const n = model.nodes.find((x) => x.id === selection.id);
  return n !== undefined ? { id: n.id, name: n.name || n.id } : undefined;
};

/** The Library tab: the palette, and what adds to it. */
function LibraryTab({
  model,
  selection,
  dock,
  lib,
  placement,
  session,
}: Pick<InspectorDockProps, 'model' | 'selection' | 'dock' | 'lib' | 'placement' | 'session'>) {
  const { importLibraryIcon, importLibraryShape } = libraryImports(lib, session.reportIssues);
  return (
    <LibraryPanel
      library={lib.library}
      onPlace={placement.placeFromLibrary}
      onApply={placement.applyFromLibrary}
      applyTarget={applyTargetFor(model, selection.selection)}
      onAddNode={placement.addNode}
      onAddImages={(files) => void placement.addImages(files)}
      onAddCategory={lib.addCategory}
      onDeleteCategory={lib.deleteCategory}
      onImportIcon={(categoryId, file) => void importLibraryIcon(categoryId, file)}
      onImportShape={(categoryId, file) => void importLibraryShape(categoryId, file)}
      assetBase={getHost().assetBase}
      viewState={dock.libraryView}
    />
  );
}
