// What the apps import and docs/reference/renderer.md shows, and nothing else: the
// package is private, so a name neither uses has no reader. A test imports from
// the module itself.
export { applyTheme, darkTheme, lightTheme, THEME_STORAGE_KEY, type ThemeTokens } from './theme';
export { createKindRegistry, createTypeRegistry, DEFAULT_TYPE_STYLES } from './registry';
export { notationProfile } from './notations';
export { DiagramView } from './canvas/DiagramView';
export {
  LIBRARY_ENTRY_DND_TYPE,
  type CanvasCommands,
  type DiagramSelection,
  type DrawTool,
  type LayoutApi,
  type QuickAddSide,
} from './canvas/view-types';
export type { EdgeLabelMoves } from './canvas/build-data';
export type { Side } from '@diagc/core/internal';
export { isKnownStyle, STYLE_PRESETS } from './sketch/stylePresets';
export type { LoopEdgeInput } from './loops/loops';
export { LeveragePanel, type LeverageFocus } from './loops/LeveragePanel';
export { ACTIVITY_LAYOUT } from './layout/activity-frame';
export { PLAN_LAYOUT, planGraphCached, planX } from './layout/plan-layout';
export { todayIso } from './overlays/time-axis';
