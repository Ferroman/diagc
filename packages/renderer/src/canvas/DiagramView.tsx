import { useMemo, useRef, useState } from 'react';
import { Background, ConnectionMode, ReactFlow, ReactFlowProvider, useReactFlow } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { countAnchored } from '@diagc/core/internal';
import { createIconRegistry } from '@diagc/icons';
import { Breadcrumbs } from './Breadcrumbs';
import { edgeTypes, nodeTypes } from './adapter';
import { NoteStateContext } from '../notes/note-state';
import { DrawingsLayer, liveStroke } from '../drawings/DrawingsLayer';
import { LaserLayer } from '../drawings/LaserLayer';
import { useCanvasGestures } from '../drawings/useCanvasGestures';
import { useDrawings } from '../drawings/useDrawings';
import { GuidesLayer } from './GuidesLayer';
import { SelectionToolbar } from './SelectionToolbar';
import { LegendPanel } from '../legend/LegendPanel';
import { useLegendState } from '../legend/useLegendState';
import { LoopHighlightContext } from '../loops/loop-highlight';
import { useLoopOverlay } from '../loops/useLoopOverlay';
import { stylePreset } from '../sketch/stylePresets';
import { typeHuesOf } from './type-hues';
import { canvasClassName, canvasGrid, canvasStyle } from './canvas-frame';
import { canvasToggles, toggleOf } from './canvas-toggles';
import { CanvasControls } from './CanvasControls';
import { CanvasOverlays } from './CanvasOverlays';
import { useCanvasClicks } from './useCanvasClicks';
import { useCanvasCommands } from './useCanvasCommands';
import { useCommitMoves } from './useCommitMoves';
import { useCompiledView } from './useCompiledView';
import { useDrillNavigation } from './useDrillNavigation';
import { useDropAndPaste } from './useDropAndPaste';
import { useEditRequests } from './useEditRequests';
import { useFlowEdges } from './useFlowEdges';
import { useFlowNodes, type LabelEdit } from './useFlowNodes';
import { MAX_ZOOM, MIN_ZOOM, useLayoutApi } from './useLayoutApi';
import { useMoveFrames } from './useMoveFrames';
import { useNodeDragging } from './useNodeDragging';
import { useNodeResync } from './useNodeResync';
import { useNoteNodes } from './useNoteNodes';
import { useNoteSession } from './useNoteSession';
import { useNotation } from './useNotation';
import { useNudgeAndArrange } from './useNudgeAndArrange';
import { useRootFit } from './useRootFit';
import { useViewLayout } from './useViewLayout';
import { useViewModeMoves } from './useViewModeMoves';
import '../styles.css';
import '../presets.css';
import '@fontsource/kalam/400.css';
import '@fontsource/kalam/700.css';
import '../fonts.css';

import { DEFAULT_ON_NODE_META_KEYS, type DiagramViewProps } from './view-types';

/**
 * The canvas: the hooks in the order their effects must register, then React
 * Flow. Each hook names what it reads from the props; what one hook makes,
 * the next takes as an input.
 */
function Inner(props: DiagramViewProps) {
  const reactFlow = useReactFlow();
  // The edit-mode callbacks travel as one optional object (see EditingApi); the
  // affordance gate `editing` derives from `mode` alone, so a read-only host
  // without an `edit` object disables every mutation path structurally.
  const edit = props.edit;
  const editing = props.mode === 'edit';
  const chromeless = props.chrome === false;
  const preset = useMemo(() => stylePreset(props.styleId), [props.styleId]);
  const icons = useMemo(() => props.icons ?? createIconRegistry(), [props.icons]);
  const notation = useNotation(props);
  const { profile, typeRegistry } = notation;
  // A palette preset's colour for each node type, over the whole model (type-hues.ts)
  const hues = useMemo(() => typeHuesOf(preset, props.model, typeRegistry), [preset, props.model, typeRegistry]);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // In-place label editing target (edit mode double-click): a node's name or a
  // single-relation edge's label.
  const [labelEdit, setLabelEdit] = useState<LabelEdit | null>(null);
  const noteSession = useNoteSession(editing, props.model.id);
  const visibleRef = useRef<string[]>([]);
  // The drill trail plus the render-phase navigation sync (new model / plane
  // switch / model edit / host-driven path). It adjusts state DURING render, so
  // it has to run before anything that reads focus/drillRoot/enteredPath —
  // notably useCompiledView.
  const nav = useDrillNavigation({
    model: props.model,
    plane: props.plane,
    enteredPathProp: props.enteredPath,
    onEnteredPathChange: props.onEnteredPathChange,
    visibleRef,
    // a fresh arrow each render is fine: the hook only calls this from the
    // plane-switch branch, it never depends on its identity. Both open editors
    // go: each is keyed to something the new plane may not draw at all (a node,
    // a note), and a field left open would reopen on the way back —
    // and the session's note toggles, which were about elements this plane
    // may not draw.
    onPlaneSwitch: () => {
      setLabelEdit(null);
      noteSession.setNoteEdit(null);
      noteSession.setNoteOverrides(new Map());
    },
    isAlwaysExpanded: notation.isAlwaysExpanded,
  });
  const { drillRoot, enterNode } = nav;

  // A requested node that React Flow's copy does not hold yet, waiting for
  // useNodeResync to hand it the selection (see useEditRequests).
  const selectOnAppearRef = useRef<string | null>(null);
  const nameOf = useMemo(() => new Map(props.model.nodes.map((n) => [n.id, n.name])), [props.model]);
  const ink = useDrawings(props);
  const gestures = useCanvasGestures({
    editing,
    tool: props.tool,
    drillRoot,
    chromeless,
    builtinKeys: props.builtinKeys !== false,
    modelId: props.model.id,
    pen: props.pen,
    onAddStroke: edit?.onAddStroke,
    toFlow: reactFlow.screenToFlowPosition,
  });
  const { gestureCaptured } = gestures;
  const { compiled, compiledRef } = useCompiledView({
    props,
    profile,
    typeRegistry,
    focus: nav.focus,
    drillRoot,
    visibleRef,
  });
  const legend = useLegendState({
    model: props.model,
    plane: props.plane,
    compiled,
    drillRoot,
    activeLayers: props.activeLayers,
    typeRegistry,
    kindRegistry: notation.kindRegistry,
    canToggleLayers: props.onToggleLayer !== undefined,
    strokes: ink.strokes,
    drawingsVisible: ink.drawingsVisible,
    nodeColors: notation.nodeColors,
    hues,
  });
  const moves = useViewModeMoves({ props, editing });

  // Both feed the node data AND the layout's box-size estimate (a folded
  // container's count badge and a node's meta badges take real width), so they
  // are derived ahead of the geometry pipeline.
  const hiddenCounts = useMemo(() => countAnchored(compiled), [compiled]);
  const metaKeys = props.onNodeMetaKeys ?? DEFAULT_ON_NODE_META_KEYS;
  // The geometry pipeline (size hints → elk/notation layout → overlay-applied
  // and band-arranged geometry): see useViewLayout.
  const viewLayout = useViewLayout({
    model: props.model,
    plane: props.plane,
    layout: props.layout,
    compiled,
    profile,
    typeRegistry,
    metaKeys,
    hiddenCounts,
    editing,
    ignoreSavedPositions: props.ignoreSavedPositions,
    viewPositions: moves.viewPositions,
  });
  const frames = useMoveFrames(compiled, viewLayout.arrangedGeometry, viewLayout.containerShifts);
  useRootFit({ pendingRootFitRef: nav.pendingRootFitRef, compiled, layout: viewLayout, reactFlow });
  const drop = useDropAndPaste({ editing, edit, reactFlow, wrapperRef });

  const notes = useNoteNodes({
    model: props.model,
    plane: props.plane,
    notes: props.notes,
    layout: props.layout,
    session: noteSession,
    editing,
    edit,
    onOpenLink: props.onOpenLink,
    compiled,
    arrangedGeometry: viewLayout.arrangedGeometry,
    profile,
    nameOf,
    typeRegistry,
  });
  const flow = useFlowNodes({
    props,
    editing,
    edit,
    notation,
    icons,
    preset,
    hues,
    compiled,
    layout: viewLayout,
    hiddenCounts,
    metaKeys,
    labelEdit,
    setLabelEdit,
    enterNode,
    noteNodes: notes.noteNodes,
  });
  const { derivedNodes, setRfNodes, rfNodesRef } = flow;
  const { setNoteEdit } = noteSession;
  useEditRequests({ editing, edit, derivedNodes, setLabelEdit, setNoteEdit, setRfNodes, selectOnAppearRef });
  const commitMoves = useCommitMoves({
    editing,
    edit,
    rfNodesRef,
    ...frames,
    setViewPositions: moves.setViewPositions,
  });
  const arrange = useNudgeAndArrange({
    editing,
    chromeless,
    gestureCaptured,
    savesViewPositions: props.onViewPositionsChange !== undefined,
    snapGrid: props.snapGrid,
    reactFlow,
    rfNodes: flow.rfNodes,
    rfNodesRef,
    setRfNodes,
    commitMoves,
  });
  const { nudge } = arrange;
  const drag = useNodeDragging({
    editing,
    edit,
    model: props.model,
    plane: props.plane,
    profile,
    reactFlow,
    rfNodesRef,
    setRfNodes,
    allNodesRef: flow.allNodesRef,
    arrangedRef: frames.arrangedRef,
    flushNudge: nudge.flush,
    commitMoves,
  });
  useNodeResync({ allNodes: flow.allNodes, derivedNodes, setRfNodes, selectOnAppearRef, pendingRef: nudge.pendingRef });
  useLayoutApi({
    layoutApiRef: props.layoutApiRef,
    reactFlow,
    rfNodesRef,
    compiledRef,
    geometryRef: viewLayout.geometryRef,
    wrapperRef,
    strokesRef: ink.strokesRef,
    legendReserveRef: legend.legendReserveRef,
  });
  const edges = useFlowEdges({ props, editing, edit, notation, preset, compiled, layout: viewLayout, moves });

  const loops = useLoopOverlay({
    profile,
    compiled,
    model: props.model,
    plane: props.plane,
    externalHighlight: props.externalHighlight,
    onCldEdges: props.onCldEdges,
  });
  const { loopHighlight } = loops;
  const clicks = useCanvasClicks({
    props,
    editing,
    edit,
    reactFlow,
    compiled,
    enterNode,
    setLabelEdit,
    setRfNodes,
    selectOnAppearRef,
    setFixedSideRelation: edges.setFixedSideRelation,
    setAddLabelAt: edges.setAddLabelAt,
    setSelectedNode: loops.setSelectedNode,
    loopHighlight,
  });
  const toggles = canvasToggles({
    dim: [loops.focusConnected, loops.setFocusConnected],
    laser: [gestures.laserOn, gestures.setLaserOn],
    drawings: [ink.drawingsVisible, ink.setDrawingsVisible],
    legend: [legend.showLegend, legend.setShowLegend],
    loops: [loops.showLoops, loops.setShowLoops],
    drawingsOffered: ink.strokes.length > 0 && drillRoot === undefined,
    legendOffered: legend.legendRowList.length > 0,
    loopsOffered: loops.cld,
    clearLoopHighlight: loopHighlight.clear,
  });
  useCanvasCommands({
    canvasCommandsRef: props.canvasCommandsRef,
    layoutApiRef: props.layoutApiRef,
    reactFlow,
    toggles,
    arrange,
  });

  const { pen, laser } = gestures;
  const grid = canvasGrid(preset, props.snapGrid);
  return (
    <LoopHighlightContext.Provider value={loopHighlight}>
      {/* the badges inside read this to know whether their note is
        open and how to flip it — one provider around the whole canvas, the
        LoopHighlightContext precedent */}
      <NoteStateContext.Provider value={notes.noteState}>
        <div
          ref={wrapperRef}
          className={canvasClassName({
            chromeless,
            editing,
            altHeld: moves.altHeld,
            dragging: drag.dragging,
            preset,
            notationClass: profile.className,
            penActive: gestures.penActive,
            eraserActive: gestures.eraserActive,
            laserOn: gestures.laserOn,
          })}
          style={canvasStyle(preset)}
          onDragOver={drop.onDragOver}
          onDrop={drop.onDrop}
          onKeyDownCapture={nudge.onKeyDownCapture}
          onBlurCapture={nudge.onBlurCapture}
          {...gestures.gestureHandlers}
        >
          <ReactFlow
            nodes={flow.rfNodes}
            edges={edges.rfEdges}
            onEdgesChange={edges.onEdgesChange}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            colorMode={props.colorMode ?? 'light'}
            connectionMode={ConnectionMode.Loose}
            {...clicks}
            {...drag.handlers}
            fitView
            minZoom={MIN_ZOOM}
            maxZoom={MAX_ZOOM}
            zoomOnScroll={false}
            zoomOnDoubleClick={false}
            {...(props.snapGrid !== undefined
              ? { snapToGrid: true, snapGrid: [props.snapGrid, props.snapGrid] as [number, number] }
              : {})}
            // Shift+click adds to the selection; Shift+drag on the pane draws a
            // marquee (full containment: sweeping over children inside an expanded
            // group never grabs the group). Both off while the pen/laser owns the drag.
            multiSelectionKeyCode={gestureCaptured ? null : 'Shift'}
            selectionKeyCode={gestureCaptured ? null : 'Shift'}
            panOnScroll
            // The pen (or the laser) owns the drag: no pan, no selection rectangle,
            // no node drag or connect — a stroke that started on a box would
            // otherwise move it.
            panOnDrag={!gestureCaptured}
            elementsSelectable={!gestureCaptured}
            nodesDraggable={(editing || moves.altHeld) && !gestureCaptured}
            nodesConnectable={editing && !gestureCaptured}
            proOptions={{ hideAttribution: true }}
          >
            {grid !== null && <Background {...grid} />}
            <DrawingsLayer
              strokes={ink.strokes}
              live={liveStroke(pen.live, props.pen)}
              visible={ink.drawingsVisible && drillRoot === undefined}
              erasing={gestures.eraserActive}
              onErase={(id) => edit?.onDeleteStroke?.(id)}
            />
            <LaserLayer trails={laser.trails} live={laser.live} />
            <GuidesLayer lines={drag.guides} />
            {arrange.canArrange && (
              <SelectionToolbar
                ids={arrange.selectedIds}
                onAlign={arrange.alignSelection}
                onDistribute={arrange.distributeSelection}
              />
            )}
            <Breadcrumbs path={nav.enteredPath} nameOf={(id) => nameOf.get(id) ?? id} onCrumb={nav.exitTo} />
            <LegendPanel
              legend={legend}
              interactive={!chromeless}
              onToggleLayer={props.onToggleLayer}
              onToggleDrawings={toggleOf(toggles, 'drawings').flip}
              icons={icons}
            />
            {!chromeless && (
              <CanvasControls
                toggles={toggles}
                keyHints={props.keyHints}
                builtinKeys={props.builtinKeys}
                colorMode={props.colorMode}
                onToggleTheme={props.onToggleTheme}
              />
            )}
            <CanvasOverlays
              model={props.model}
              plane={props.plane}
              overlay={profile.canvasOverlay}
              placed={viewLayout.placedGeometry !== null}
              flowDirection={viewLayout.flowDirection}
              today={props.today}
              loopEdges={loops.showLoops ? loops.loopEdges : null}
              rough={preset.rough}
              loopNodeFilter={editing ? null : loops.selectedNode}
            />
          </ReactFlow>
        </div>
      </NoteStateContext.Provider>
    </LoopHighlightContext.Provider>
  );
}

export function DiagramView(props: DiagramViewProps) {
  return (
    <ReactFlowProvider>
      <Inner {...props} />
    </ReactFlowProvider>
  );
}
