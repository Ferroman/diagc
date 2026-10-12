import type { DiagramModel } from '@diagc/core/internal';
import { LayoutSection, type LayoutSectionProps } from '../layout/LayoutSection';
import type { DockEntry } from '../notations/types';
import type { CanvasSelection } from '../view/useCanvasSelection';
import { LayersPlanesPanel } from '../view/LayersPlanesPanel';
import type { ViewNavigation } from '../view/useViewNavigation';
import { Dock } from './Dock';
import { dockPanels } from './features';
import { DOCK_MAX, RIGHT_MIN, type DockLayout } from './useDockLayout';

export interface NotationDockProps extends Omit<LayoutSectionProps, 'nav'> {
  model: DiagramModel;
  dock: Pick<DockLayout, 'rightCollapsed' | 'toggleRight' | 'rightWidth' | 'setRightWidth'>;
  nav: ViewNavigation;
  /** the notation's own panel (its profile's `dock`) */
  notationDock: DockEntry | undefined;
  selection: Pick<CanvasSelection, 'selection' | 'select' | 'requestLabelEdit'>;
  /** the host's date, YYYY-MM-DD */
  today: string;
}

/**
 * The right dock: the notation's panel and the feature panels, how this plane is
 * arranged and drawn (Layout & style), then its layers and planes.
 */
export function NotationDock(props: NotationDockProps) {
  const { model, editing, editor, dock, nav, selection, today } = props;
  const { activePlane } = nav;
  return (
    <Dock
      side="right"
      collapsed={dock.rightCollapsed}
      onToggle={dock.toggleRight}
      hasContent
      width={dock.rightWidth}
      minWidth={RIGHT_MIN}
      maxWidth={DOCK_MAX}
      onWidthChange={dock.setRightWidth}
    >
      {dockPanels(props.notationDock, {
        model,
        editing,
        viewPlane: activePlane,
        scopePlane: nav.activePlaneBorrowsContainment ? undefined : activePlane,
        selection: selection.selection,
        today,
        onCommand: editor.dispatch,
        select: selection.select,
        requestLabelEdit: selection.requestLabelEdit,
      })}
      <LayoutSection
        model={model}
        layout={props.layout}
        editing={editing}
        editor={editor}
        nav={nav}
        drilled={props.drilled}
        arrangement={props.arrangement}
        canvasEditing={props.canvasEditing}
        prefs={props.prefs}
        layoutApiRef={props.layoutApiRef}
      />
      <LayersPlanesPanel
        model={model}
        onCommand={editor.dispatch}
        mode={editing ? 'edit' : 'view'}
        activeLayer={nav.penLayer}
        onActivateLayer={nav.activateLayer}
        activePlane={activePlane}
        onSelectPlane={(id) => (id === undefined ? nav.resetView() : nav.switchPlane(id))}
        activeLayers={nav.activeLayers}
        onToggleLayer={nav.toggleLayer}
        onMergeLayers={nav.mergeSelectedLayers}
      />
    </Dock>
  );
}
