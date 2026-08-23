export const RENDERER_VERSION = 1;
export * from './theme';
export * from './registry';
export { DiagramNode, type DiagramNodeData } from './DiagramNode';
export { DiagramEdge, type DiagramEdgeData } from './DiagramEdge';
export { RichLabelEditor } from './RichLabelEditor';
export { estimateLabelSize, MAX_LABEL_WIDTH, MIN_LABEL_WIDTH } from './label-size';
export {
  layoutView,
  layoutOptionsFor,
  COLLAPSED_SIZE,
  type NodeGeometry,
  type EdgePoint,
  type LayoutResult,
} from './layout';
export {
  computeFocusChain,
  FOCUS_ENTER_FRACTION,
  FOCUS_EXIT_FRACTION,
  FOCUS_EXIT_MARGIN,
  type FocusInput,
} from './focus';
export { connectionSides, getEdgeParams, type EdgeParams, type FloatingNode, type Side } from './floating';
export { NOTATION_PROFILES, notationProfile, type NotationProfile } from './notations';
export { isKnownStyle, STYLE_PRESETS, stylePreset, type RoughStyle, type StylePreset } from './stylePresets';
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
} from './loops';
export { LoopLabelLayer, type LoopLabelLayerProps } from './LoopLabelLayer';
export { GIT_LAYOUT, LANE_PALETTE, gitEdgeColor, gitGraphCached, gitLayout, gitNodeColors, gitRoute } from './git-layout';
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
} from './leverage';
export {
  DiagramView,
  DEFAULT_ON_NODE_META_KEYS,
  LIBRARY_ENTRY_DND_TYPE,
  type DiagramViewProps,
  type DiagramSelection,
  type DrawTool,
  type EditingApi,
  type LayoutApi,
  type PenSettings,
} from './DiagramView';
export { DrawingsLayer, type DrawingsLayerProps } from './DrawingsLayer';
export { strokePath, simplifyStroke, strokesBounds } from './drawings';
export { Legend, type LegendProps } from './Legend';
export { legendRows, type LegendInput, type LegendRow, type LegendSwatch } from './legend';
