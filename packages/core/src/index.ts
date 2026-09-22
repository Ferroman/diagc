/*
 * @diagc/core — diagram model, validator, builder DSL, and view compiler.
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
export { commentsOf, nextCommentId, type ElementTarget } from './comments';
export { isIsoDate } from './dates';
export { normalizeRuns, runsToPlainText } from './text';
export { relationLabels } from './labels';
export { defaultLayoutDirection, type LayoutDirection } from './layout-defaults';
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
  ConsequenceRef,
  SecondOrderBuilder,
  FishboneBuilder,
  CategoryRef,
  CauseRef,
  ThreatModelBuilder,
  FlowRef,
  type NodeOpts,
  type RelateOpts,
  type CommitOpts,
  type StageOpts,
  type MergeOpts,
  type ActivityElementOpts,
  type ConsequenceOpts,
  type FishboneOpts,
  type ThreatOpts,
  type CommentOpts,
  type ElementOpts,
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
  openingPins,
  withEdgeLabelPlacements,
  withUnfolded,
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
  GIT_STAGE_TYPE,
  gapOf,
  gitGraph,
  isGitKind,
  latestCommit,
  mergedAway,
  nextCommitId,
  stageCommit,
  type GitGraph,
  type GitKind,
  type GitLane,
  type GitStage,
} from './git';
export {
  SECOND_ORDER_NOTATION,
  SO_CONSEQUENCE_TYPES,
  SO_DECISION_TYPE,
  SO_LEADS_TO_KIND,
  consequenceOrders,
  consequenceTypeOf,
  isSecondOrderNode,
  valenceOf,
  type ConsequenceOrders,
  type Valence,
} from './second-order';
export {
  FB_CATEGORY_TYPE,
  FB_CAUSE_OF_KIND,
  FB_CAUSE_TYPE,
  FB_EFFECT_TYPE,
  FISHBONE_NOTATION,
  FISHBONE_PRESET_NAMES,
  FISHBONE_PRESETS,
  FISHBONE_TYPES,
  fishboneParents,
  fishboneTree,
  isFishboneNode,
  presetId,
  type FishboneCategory,
  type FishboneCause,
  type FishbonePreset,
  type FishboneTree,
} from './fishbone';
export {
  TM_NOTATION,
  TM_ENTITY_TYPE,
  TM_PROCESS_TYPE,
  TM_STORE_TYPE,
  TM_BOUNDARY_TYPE,
  TM_FLOW_KIND,
  TM_TYPES,
  STRIDE_NAMES,
  NEW_THREAT_TITLE,
  isThreatModelNode,
  isOpen,
  strideFor,
  boundaryOf,
  boundaryName,
  crossings,
  crossingLabel,
  threatRegister,
  threatSummary,
  threatTargetKey,
  threatsOf,
  nextThreatId,
  nextThreatStatus,
  allNotesOpen,
  type ThreatTarget,
  type Crossing,
  type ThreatRow,
} from './threat-model';
