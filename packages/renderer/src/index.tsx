export const RENDERER_VERSION = 1;
export * from './theme';
export * from './registry';
export { DiagramNode, type DiagramNodeData } from './node/DiagramNode';
export { DiagramEdge, type DiagramEdgeData } from './edge/DiagramEdge';
export { RichLabelEditor } from './node/RichLabelEditor';
export { estimateLabelSize, MAX_LABEL_WIDTH, MIN_LABEL_WIDTH } from './node/label-size';
export {
  layoutView,
  layoutOptionsFor,
  COLLAPSED_SIZE,
  type NodeGeometry,
  type EdgePoint,
  type LayoutResult,
  type LayoutExtras,
} from './layout/layout';
export {
  computeFocusChain,
  FOCUS_ENTER_FRACTION,
  FOCUS_EXIT_FRACTION,
  FOCUS_EXIT_MARGIN,
  type FocusInput,
} from './canvas/focus';
export { connectionSides, getEdgeParams, type EdgeParams, type FloatingNode, type Side } from './edge/floating';
export { NOTATION_PROFILES, notationProfile, planBadges, type NodeBadge, type NotationProfile } from './notations';
export { isKnownStyle, STYLE_PRESETS, stylePreset, type RoughStyle, type StylePreset } from './sketch/stylePresets';
export {
  findLoops,
  placeLoopLabels,
  absoluteRects,
  type LoopEdgeInput,
  type LoopKind,
  type Loop,
  type FindLoopsOptions,
  type FindLoopsResult,
  type NodeRect,
  type LoopLabelPlacement,
  type PlaceOptions,
} from './loops/loops';
export { LoopLabelLayer, type LoopLabelLayerProps } from './loops/LoopLabelLayer';
export {
  GIT_LAYOUT,
  LANE_PALETTE,
  gitEdgeColor,
  gitGraphCached,
  gitLayout,
  gitNodeColors,
  gitRoute,
} from './layout/git-layout';
export { PLAN_LAYOUT, planGraphCached, planLayout, planX } from './layout/plan-layout';
export { GitLanesOverlay, type GitLanesOverlayProps } from './overlays/GitLanesOverlay';
export { timeAxis, todayIso, type TimeAxis, type AxisBand } from './overlays/time-axis';
export { ACTIVITY_LAYOUT, arrangeActivityFrames } from './layout/activity-frame';
export {
  analyzeLeverage,
  analyzeDependency,
  type LeverageReport,
  type LeverageDriver,
  type LeverageHub,
  type LeverageLoopRef,
  type LeverageSign,
  type DependencyReport,
  type DependencyDirection,
} from './loops/leverage';
export { LeveragePanel, type LeveragePanelProps, type LeverageFocus } from './loops/LeveragePanel';
export {
  DiagramView,
  DEFAULT_ON_NODE_META_KEYS,
  LIBRARY_ENTRY_DND_TYPE,
  type CanvasCommands,
  type CanvasKeyHint,
  type DiagramViewProps,
  type DiagramSelection,
  type DrawTool,
  type EditingApi,
  type LayoutApi,
  type PenSettings,
} from './canvas/DiagramView';
export type { QuickAddSide } from './canvas/view-types';
export { useNudge, NUDGE_STEP, NUDGE_SHIFT_FACTOR, NUDGE_IDLE_MS, type NudgeInput } from './canvas/useNudge';
export { DrawingsLayer, type DrawingsLayerProps } from './drawings/DrawingsLayer';
export { strokePath, simplifyStroke, strokesBounds } from './drawings/drawings';
export { Legend, type LegendProps } from './legend/Legend';
export { legendRows, type LegendInput, type LegendRow, type LegendSwatch } from './legend/legendRows';
export type { Box } from './canvas/box';
export type { EdgeLabelMoves } from './canvas/build-data';
export { computeGuides, snapDragChanges, GUIDE_THRESHOLD_PX, type Guide, type GuideSnap } from './canvas/guides';
export { alignBoxes, distributeBoxes, dropDescendants, type AlignMode, type Delta } from './canvas/arrange';
export { SelectionToolbar, type SelectionToolbarProps } from './canvas/SelectionToolbar';
