/*
 * @diagramming/core — diagram model, validator, builder DSL, and view compiler.
 * Copyright (C) 2026 Bogdan Frankovskyi
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU Affero General Public License version 3 as
 * published by the Free Software Foundation, with the additional permissions
 * granted under section 7 that are set out in the LICENSE file alongside this
 * package. Those permissions let you license diagram sources you author, and
 * the output produced from them, under terms of your choosing.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License
 * for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
export const CORE_VERSION = 1;
export { ejectSource } from './eject';
export * from './types';
export * from './mutate';
export { normalizeRuns, runsToPlainText } from './text';
export { relationLabels } from './labels';
export {
  model,
  ModelBuilder,
  NodeRef,
  BranchRef,
  CommitRef,
  GitGraphBuilder,
  ActivityBuilder,
  ActivityScope,
  LaneRef,
  RegionRef,
  type NodeOpts,
  type RelateOpts,
  type CommitOpts,
  type MergeOpts,
  type ActivityElementOpts,
} from './builder';
export { validate, DiagramValidationError, IMAGE_REF, LIBRARY_IMAGE_REF, type ValidationIssue } from './validate';
export { isDrawings, isLayoutOverlay } from './guards';
export { addStroke, deleteStroke, emptyDrawings, pruneDrawingsPlane, uniqueStrokeId } from './drawings';
export { errMessage, SOURCE_URL } from './util';
export { childrenOf, countAnchored } from './children';
export { activeNotation, compileView, presetLayers, resolveContainmentPlane } from './view/compile';
export { buildHierarchy, type HierarchyIndex } from './view/hierarchy';
export { relationLayer } from './view/layers';
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
export {
  GIT_KINDS,
  GIT_NOTATION,
  gapOf,
  gitGraph,
  isGitKind,
  latestCommit,
  mergedAway,
  type GitGraph,
  type GitKind,
  type GitLane,
} from './git';
