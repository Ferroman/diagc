import type { MutableRefObject } from 'react';
import type { DiagramModel, Drawings } from '@diagc/core/internal';
import { DiagramView, type CanvasCommands, type LayoutApi } from '@diagc/renderer';
import type { CanvasEditing } from '../canvas-editing/useCanvasEditing';
import type { DrawToolState } from '../canvas-editing/useDrawTool';
import type { DeepLink } from '../diagrams/useDeepLink';
import { getHost } from '../host';
import { useKeyHint } from '../hotkeys/HotkeysContext';
import type { ViewArrangement } from '../layout/useViewArrangement';
import type { CausalLoopAnalysis } from '../notations/causal-loop/useCausalLoopAnalysis';
import { diagramStyleOf, SNAP_GRID, type ViewerPrefs } from '../useViewerPrefs';
import type { CanvasSelection } from './useCanvasSelection';
import type { ViewNavigation } from './useViewNavigation';

export interface StudioCanvasProps {
  model: DiagramModel;
  /** the host's date, YYYY-MM-DD: a plan plane's today line */
  today: string;
  editing: boolean;
  nav: Pick<ViewNavigation, 'activePlane' | 'activeLayers' | 'toggleLayer' | 'pins' | 'toggleExpand' | 'notation'>;
  selection: Pick<CanvasSelection, 'select' | 'multiSelect' | 'groupSel'>;
  deepLink: Pick<DeepLink, 'enteredPath' | 'handleEnteredPathChange'>;
  loops: Pick<CausalLoopAnalysis, 'compareSelect' | 'handleCldEdges' | 'externalHighlight'>;
  prefs: Pick<ViewerPrefs, 'theme' | 'style' | 'snap'>;
  arrangement: Pick<ViewArrangement, 'viewLayout' | 'autoArrange' | 'setMovedPositions' | 'setMovedLabels'>;
  drawings: Drawings | undefined;
  draw: Pick<DrawToolState, 'tool' | 'penColor' | 'penWidth'>;
  canvasEditing: Pick<CanvasEditing, 'edit' | 'groupSelected'>;
  layoutApiRef: MutableRefObject<LayoutApi | null>;
  canvasCommandsRef: MutableRefObject<CanvasCommands | null>;
  /** the canvas controls' key names, as the user has bound them */
  keyHints: { laser: string; dim: string; legend: string; drawings: string; loops: string };
}

/** The canvas, in either mode, and the Group chip over it while a multi-selection can be grouped. */
export function StudioCanvas({
  model,
  today,
  editing,
  nav,
  selection,
  deepLink,
  loops,
  prefs,
  arrangement,
  drawings,
  draw,
  canvasEditing,
  layoutApiRef,
  canvasCommandsRef,
  keyHints,
}: StudioCanvasProps) {
  const hint = useKeyHint();
  const { groupSel } = selection;
  const { tool, penColor, penWidth } = draw;
  return (
    <div className="canvas-area">
      <DiagramView
        model={model}
        plane={nav.activePlane}
        today={today}
        activeLayers={nav.activeLayers}
        onToggleLayer={nav.toggleLayer}
        pins={nav.pins}
        onToggleExpand={nav.toggleExpand}
        onSelect={selection.select}
        onMultiSelect={selection.multiSelect}
        onEnteredPathChange={deepLink.handleEnteredPathChange}
        enteredPath={deepLink.enteredPath}
        onCompareSelect={loops.compareSelect}
        colorMode={prefs.theme}
        assetBase={getHost().assetBase}
        libraryBase={getHost().libraryBase}
        onOpenLink={(l) => getHost().openLink(l)}
        styleId={diagramStyleOf(model) ?? prefs.style}
        snapGrid={prefs.snap ? SNAP_GRID : undefined}
        onCldEdges={loops.handleCldEdges}
        onViewPositionsChange={arrangement.setMovedPositions}
        onViewLabelMovesChange={arrangement.setMovedLabels}
        layoutApiRef={layoutApiRef}
        canvasCommandsRef={canvasCommandsRef}
        builtinKeys={false}
        keyHints={keyHints}
        ignoreSavedPositions={arrangement.autoArrange}
        externalHighlight={loops.externalHighlight}
        notation={nav.notation}
        layout={arrangement.viewLayout}
        drawings={drawings}
        {...(editing
          ? {
              mode: 'edit' as const,
              tool,
              pen: { ...(penColor !== '' ? { color: penColor } : {}), width: penWidth },
              // Everything that mutates the model travels as ONE edit object
              // (the read-only path passes `mode` without it — the view/edit
              // split is then structural, not by convention).
              edit: canvasEditing.edit,
            }
          : {})}
      />
      {editing && groupSel.length >= 2 && (
        <button
          className="chip group-action"
          title={`Group the selection${hint('edit.group')}`}
          onClick={() => void canvasEditing.groupSelected()}
        >
          ⊞ Group {groupSel.length}
        </button>
      )}
    </div>
  );
}
