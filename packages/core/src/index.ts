export const CORE_VERSION = 1;
export * from './types';
export * from './mutate';
export { normalizeRuns, runsToPlainText } from './text';
export { relationLabels } from './labels';
export { model, ModelBuilder, NodeRef, type NodeOpts, type RelateOpts } from './builder';
export { validate, DiagramValidationError, IMAGE_REF, LIBRARY_IMAGE_REF, type ValidationIssue } from './validate';
export { isLayoutOverlay } from './guards';
export { errMessage } from './util';
export { childrenOf, countAnchored } from './children';
export { compileView, resolveContainmentPlane } from './view/compile';
export { buildHierarchy, type HierarchyIndex } from './view/hierarchy';
export { scopeToRoot, EXTERNAL_STUB_PREFIX, type ScopedModel } from './view/scope';
export { estimateSizes, LEAF_SIZE, CONTAINER_PADDING, CONTAINER_HEADER } from './view/size';
export type {
  CompiledView,
  LodState,
  NodeViewState,
  Size,
  ViewEdge,
  ViewNode,
  ViewportState,
} from './view/types';
export {
  applyCommand,
  applyCommandWithResult,
  emptyLayout,
  layoutPlaneKey,
  type EditorCommand,
  type EditorState,
} from './commands';
export {
  composeIncludes,
  IncludeError,
  MAX_INCLUDE_DEPTH,
  type IncludeResolver,
  type IncludeSource,
} from './compose';
