import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Background, ConnectionMode, Panel, ReactFlow, ReactFlowProvider, useReactFlow } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  countAnchored,
  DEFAULT_STROKE_WIDTH,
  layoutPlaneKey,
  type Point,
  type Stroke,
  type ViewNode,
} from '@diagc/core/internal';
import { createIconRegistry } from '@diagc/icons';
import { Breadcrumbs } from './Breadcrumbs';
import { edgeTypes, nodeTypes } from './adapter';
import { NoteStateContext } from '../notes/note-state';
import { DrawingsLayer } from '../drawings/DrawingsLayer';
import { GuidesLayer } from './GuidesLayer';
import { SelectionToolbar } from './SelectionToolbar';
import { Legend } from '../legend/Legend';
import { LoopHighlightContext } from '../loops/loop-highlight';
import { stylePreset } from '../sketch/stylePresets';
import { useCanvasGestures } from '../drawings/useCanvasGestures';
import { useCanvasClicks } from './useCanvasClicks';
import { useDropAndPaste } from './useDropAndPaste';
import { canvasToggles, toggleOf } from './canvas-toggles';
import { useCanvasCommands } from './useCanvasCommands';
import { CanvasControls } from './CanvasControls';
import { CanvasOverlays } from './CanvasOverlays';
import { useCompiledView } from './useCompiledView';
import { useNotation } from './useNotation';
import { useViewModeMoves } from './useViewModeMoves';
import { useDrillNavigation } from './useDrillNavigation';
import { useLegendState } from '../legend/useLegendState';
import { useLoopOverlay } from '../loops/useLoopOverlay';
import { useViewLayout } from './useViewLayout';
import { useEditRequests } from './useEditRequests';
import { useCommitMoves } from './useCommitMoves';
import { useNodeDragging } from './useNodeDragging';
import { useNudgeAndArrange } from './useNudgeAndArrange';
import { MAX_ZOOM, MIN_ZOOM, useLayoutApi } from './useLayoutApi';
import { useNoteNodes } from './useNoteNodes';
import { useFlowNodes, type LabelEdit } from './useFlowNodes';
import { useNodeResync } from './useNodeResync';
import { useFlowEdges } from './useFlowEdges';
import { useNoteSession } from './useNoteSession';
import { LaserLayer } from '../drawings/LaserLayer';
import '../styles.css';
import '@fontsource/kalam/400.css';
import '@fontsource/kalam/700.css';

import { DEFAULT_ON_NODE_META_KEYS, type DiagramViewProps } from './view-types';

function Inner(props: DiagramViewProps) {
  const reactFlow = useReactFlow();
  // The edit-mode callbacks travel as one optional object (see EditingApi); the
  // affordance gate `editing` below derives from `mode` alone, so a read-only
  // host without an `edit` object disables every mutation path structurally.
  const edit = props.edit;
  const preset = useMemo(() => stylePreset(props.styleId), [props.styleId]);
  const notation = useNotation(props);
  const { profile, typeRegistry, kindRegistry, nodeColors } = notation;
  const icons = useMemo(() => props.icons ?? createIconRegistry(), [props.icons]);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // In-place label editing target (edit mode double-click): a node's name or a
  // single-relation edge's label.
  const [labelEdit, setLabelEdit] = useState<LabelEdit | null>(null);
  const editing = props.mode === 'edit';
  const notes = useNoteSession(editing, props.model.id);
  const { setNoteEdit, setNoteOverrides } = notes;
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
      setNoteEdit(null);
      setNoteOverrides(new Map());
    },
    isAlwaysExpanded: notation.isAlwaysExpanded,
  });
  const { enteredPath, drillRoot, focus, enterNode, exitTo, pendingRootFitRef } = nav;

  // A requested node that React Flow's copy does not hold yet, waiting for
  // useNodeResync to hand it the selection (see useEditRequests).
  const selectOnAppearRef = useRef<string | null>(null);

  const nameOf = useMemo(() => new Map(props.model.nodes.map((n) => [n.id, n.name])), [props.model]);

  // The active plane's strokes. Keyed like layout.planes, so a borrowing plane
  // shares its donor's bucket exactly as it shares positions.
  const strokes = useMemo(
    () => props.drawings?.planes[layoutPlaneKey(props.model, props.plane)] ?? [],
    [props.drawings, props.model, props.plane],
  );
  // Render-phase ref (same pattern as useDrillNavigation's enteredPathRef): useLayoutApi's
  // effect keeps deps of just [layoutApiRef, reactFlow], so it reads the ink
  // through a ref rather than re-installing the api object on every stroke.
  const strokesRef = useRef<readonly Stroke[]>([]);
  strokesRef.current = strokes;
  // Tracing-paper switch: viewer state, on by default (an author drew it to be
  // seen), reset per diagram like pins. Never saved.
  const [drawingsVisible, setDrawingsVisible] = useState(true);
  useEffect(() => {
    setDrawingsVisible(true);
  }, [props.model.id]);
  const chromeless = props.chrome === false;
  const { pen: penSettings } = props;
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
  const { laserOn, setLaserOn, penActive, eraserActive, gestureCaptured, pen, laser, gestureHandlers } = gestures;

  const { compiled, compiledRef } = useCompiledView({ props, profile, typeRegistry, focus, drillRoot, visibleRef });

  const legend = useLegendState({
    model: props.model,
    plane: props.plane,
    compiled,
    drillRoot,
    activeLayers: props.activeLayers,
    typeRegistry,
    kindRegistry,
    canToggleLayers: props.onToggleLayer !== undefined,
    strokes,
    drawingsVisible,
    nodeColors,
  });
  const { legendConfig, showLegend, setShowLegend, setLegendSize, legendRowList, legendReserveRef } = legend;

  const moves = useViewModeMoves({ props, editing });
  const { altHeld, viewPositions, setViewPositions } = moves;

  // Both feed the node data below AND the layout's box-size estimate (a folded
  // container's count badge and a node's meta badges take real width), so they
  // are derived ahead of the geometry pipeline.
  const hiddenCounts = useMemo(() => countAnchored(props.model, compiled), [props.model, compiled]);
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
    viewPositions,
  });
  const { geometryRef, placedGeometry, arrangedGeometry, containerShifts, settledFor, flowDirection } = viewLayout;
  // Render-phase ref, same pattern and reason as useCompiledView's compiledRef: commitMoves
  // (useCommitMoves) needs the ARRANGED geometry to compute a move's displacement,
  // but its dependency list is hand-managed and must not grow with every
  // re-layout, so it reads arrangedGeometry through a ref kept current every
  // render instead.
  const arrangedRef = useRef(arrangedGeometry);
  arrangedRef.current = arrangedGeometry;

  // Where each open container's origin sits BEFORE the fit pass shifted it, in
  // absolute flow coordinates — the frame a child's saved position is relative
  // to (see fit-containers.ts). Summed root-first, the same order commitMoves
  // sums the on-screen chain, so with no shift the two are the same float and
  // a saved position is exactly the on-screen one.
  const containerBases = useMemo(() => {
    const bases = new Map<string, Point>();
    if (arrangedGeometry === null) return bases;
    const walk = (n: ViewNode, ox: number, oy: number) => {
      const g = arrangedGeometry.get(n.id);
      if (g === undefined) return;
      const x = ox + g.x;
      const y = oy + g.y;
      if (n.children.length === 0) return;
      const shift = containerShifts.get(n.id);
      bases.set(n.id, { x: x - (shift?.dx ?? 0), y: y - (shift?.dy ?? 0) });
      n.children.forEach((c) => walk(c, x, y));
    };
    compiled.roots.forEach((r) => walk(r, 0, 0));
    return bases;
  }, [compiled, arrangedGeometry, containerShifts]);
  // Render-phase refs (the strokesRef pattern): commitMoves reads them at
  // gesture time and must not change identity with every re-layout.
  const containerBasesRef = useRef(containerBases);
  containerBasesRef.current = containerBases;
  const containerShiftsRef = useRef(containerShifts);
  containerShiftsRef.current = containerShifts;

  // A drill (enter/exit) or a different diagram swaps the whole scene, so once
  // it re-layouts, fit the new view: a glide into a level of the same diagram, a
  // jump to where a first open would land for another one (see RootFit).
  //
  // "Once it re-layouts" is `settledFor`, not `arrangedGeometry !== null`: the
  // last arrangement is kept while the next is computed, so the render that
  // swaps the scene already holds a non-null one — the OLD scene's. Where the
  // two share ids (a drill always does; so does a diagram and the copy that was
  // added to) that is a complete-looking, already-measured set of boxes, React
  // Flow resolves the fit against it on the spot, and the real arrangement then
  // lands under a camera framing the wrong thing.
  useEffect(() => {
    const fit = pendingRootFitRef.current;
    if (fit === null || arrangedGeometry === null || settledFor !== compiled) return;
    pendingRootFitRef.current = null;
    void reactFlow.fitView(fit === 'glide' ? { padding: 0.15, duration: 500 } : undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pendingRootFitRef is a stable useRef identity (owned by useDrillNavigation) read through .current
  }, [compiled, arrangedGeometry, settledFor, reactFlow]);

  const drop = useDropAndPaste({ editing, edit, reactFlow, wrapperRef });

  const { noteState, noteNodes } = useNoteNodes({
    model: props.model,
    plane: props.plane,
    notes: props.notes,
    layout: props.layout,
    session: notes,
    editing,
    edit,
    onOpenLink: props.onOpenLink,
    compiled,
    arrangedGeometry,
    profile,
    nameOf,
    typeRegistry,
  });
  const { derivedNodes, allNodes, allNodesRef, rfNodes, setRfNodes, rfNodesRef } = useFlowNodes({
    props,
    editing,
    edit,
    notation,
    icons,
    preset,
    compiled,
    layout: viewLayout,
    hiddenCounts,
    metaKeys,
    labelEdit,
    setLabelEdit,
    enterNode,
    noteNodes,
  });
  useEditRequests({
    editing,
    edit,
    derivedNodes,
    setLabelEdit,
    setNoteEdit,
    setRfNodes,
    selectOnAppearRef,
  });
  const commitMoves = useCommitMoves({
    editing,
    edit,
    rfNodesRef,
    containerBasesRef,
    containerShiftsRef,
    arrangedRef,
    setViewPositions,
  });
  const arrange = useNudgeAndArrange({
    editing,
    chromeless,
    gestureCaptured,
    savesViewPositions: props.onViewPositionsChange !== undefined,
    snapGrid: props.snapGrid,
    reactFlow,
    rfNodes,
    rfNodesRef,
    setRfNodes,
    commitMoves,
  });
  const { nudge, selectedIds, canArrange } = arrange;
  const drag = useNodeDragging({
    editing,
    edit,
    model: props.model,
    plane: props.plane,
    profile,
    reactFlow,
    rfNodesRef,
    setRfNodes,
    allNodesRef,
    arrangedRef,
    flushNudge: nudge.flush,
    commitMoves,
  });
  useNodeResync({ allNodes, derivedNodes, setRfNodes, selectOnAppearRef, pendingRef: nudge.pendingRef });

  useLayoutApi({
    layoutApiRef: props.layoutApiRef,
    reactFlow,
    rfNodesRef,
    compiledRef,
    geometryRef,
    wrapperRef,
    strokesRef,
    legendReserveRef,
  });

  const { rfEdges, onEdgesChange, setFixedSideRelation, setAddLabelAt } = useFlowEdges({
    props,
    editing,
    edit,
    notation,
    preset,
    compiled,
    layout: viewLayout,
    moves,
  });

  const loops = useLoopOverlay({
    profile,
    compiled,
    model: props.model,
    plane: props.plane,
    externalHighlight: props.externalHighlight,
    onCldEdges: props.onCldEdges,
  });
  const {
    cld,
    loopEdges,
    showLoops,
    setShowLoops,
    selectedNode,
    setSelectedNode,
    focusConnected,
    setFocusConnected,
    loopHighlight,
  } = loops;
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
    setFixedSideRelation,
    setAddLabelAt,
    setSelectedNode,
    loopHighlight,
  });

  const toggles = canvasToggles({
    dim: [focusConnected, setFocusConnected],
    laser: [laserOn, setLaserOn],
    drawings: [drawingsVisible, setDrawingsVisible],
    legend: [showLegend, setShowLegend],
    loops: [showLoops, setShowLoops],
    drawingsOffered: strokes.length > 0 && drillRoot === undefined,
    legendOffered: legendRowList.length > 0,
    loopsOffered: cld,
    clearLoopHighlight: loopHighlight.clear,
  });
  useCanvasCommands({
    canvasCommandsRef: props.canvasCommandsRef,
    layoutApiRef: props.layoutApiRef,
    reactFlow,
    toggles,
    arrange,
  });

  return (
    <LoopHighlightContext.Provider value={loopHighlight}>
      {/* the badges inside read this to know whether their note is
        open and how to flip it — one provider around the whole canvas, the
        LoopHighlightContext precedent */}
      <NoteStateContext.Provider value={noteState}>
        <div
          ref={wrapperRef}
          className={`dg-canvas${props.chrome === false ? ' dg-no-chrome' : ''}${editing ? ' dg-mode-edit' : ''}${!editing && altHeld ? ' dg-alt-move' : ''}${drag.dragging ? ' dg-dragging' : ''}${
            preset.id !== 'clean' ? ` dg-style-${preset.id}` : ''
          }${preset.rough !== undefined ? ' dg-style-rough' : ''}${preset.fontFamily !== undefined ? ' dg-style-font' : ''}${
            profile.className !== undefined ? ' ' + profile.className : ''
          }${penActive ? ' dg-tool-pen' : ''}${eraserActive ? ' dg-tool-eraser' : ''}${laserOn ? ' dg-tool-laser' : ''}`}
          style={
            {
              width: '100%',
              height: '100%',
              '--dg-style-font': preset.fontFamily,
              ...(preset.cssVars ?? {}),
            } as CSSProperties
          }
          onDragOver={drop.onDragOver}
          onDrop={drop.onDrop}
          onKeyDownCapture={nudge.onKeyDownCapture}
          onBlurCapture={nudge.onBlurCapture}
          {...gestureHandlers}
        >
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            onEdgesChange={onEdgesChange}
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
            nodesDraggable={(editing || altHeld) && !gestureCaptured}
            nodesConnectable={editing && !gestureCaptured}
            proOptions={{ hideAttribution: true }}
          >
            {/* With snapping on the dots ARE the grid, so a dropped box visibly lands on one. */}
            <Background {...(props.snapGrid !== undefined ? { gap: props.snapGrid, className: 'dg-grid-on' } : {})} />
            <DrawingsLayer
              strokes={strokes}
              live={
                pen.live === null
                  ? null
                  : {
                      points: pen.live,
                      width: penSettings?.width ?? DEFAULT_STROKE_WIDTH,
                      color: penSettings?.color,
                    }
              }
              visible={drawingsVisible && drillRoot === undefined}
              erasing={eraserActive}
              onErase={(id) => edit?.onDeleteStroke?.(id)}
            />
            <LaserLayer trails={laser.trails} live={laser.live} />
            <GuidesLayer lines={drag.guides} />
            {canArrange && (
              <SelectionToolbar
                ids={selectedIds}
                onAlign={arrange.alignSelection}
                onDistribute={arrange.distributeSelection}
              />
            )}
            <Breadcrumbs path={enteredPath} nameOf={(id) => nameOf.get(id) ?? id} onCrumb={exitTo} />
            {showLegend && legendRowList.length > 0 && (
              // LegendPosition is a subset of React Flow's PanelPosition — no cast needed.
              <Panel position={legendConfig?.position ?? 'bottom-right'}>
                <Legend
                  rows={legendRowList}
                  title={legendConfig?.title}
                  interactive={props.chrome !== false}
                  onToggleLayer={props.onToggleLayer}
                  // Same derivation as `interactive` above: Legend decides "is this
                  // row a button" from the handler alone, so a chrome-less host (the
                  // PNG export) must get no handler — or the export would carry a
                  // focusable control nothing can press.
                  onToggleDrawings={props.chrome !== false ? toggleOf(toggles, 'drawings').flip : undefined}
                  icons={icons}
                  onMeasure={setLegendSize}
                />
              </Panel>
            )}
            {props.chrome !== false && (
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
              placed={placedGeometry !== null}
              flowDirection={flowDirection}
              today={props.today}
              loopEdges={showLoops ? loopEdges : null}
              rough={preset.rough}
              loopNodeFilter={editing ? null : selectedNode}
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
