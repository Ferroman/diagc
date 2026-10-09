/*
 * @diagc/core/internal — everything diagc's own packages use; no semver promise.
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
export { ejectSource } from './eject';
export * from './types';
export * from './shared-constants';
export * from './activity/activity';
export * from './mutate/nodes';
export * from './mutate/containment';
export * from './mutate/relations';
export * from './mutate/layers-and-planes';
export * from './mutate/threats-and-comments';
export * from './mutate/diagram';
export { CommandError } from './command-error';
export * from './planes';
export { commentsOf, hasNoteContent, nextCommentId } from './comments';
export * from './elements';
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
  PlanBuilder,
  ZoneBuilder,
  type NodeOpts,
  type RelateOpts,
  type ContainsOpts,
  type CommitOpts,
  type StageOpts,
  type MergeOpts,
  type ActivityElementOpts,
  type ConsequenceOpts,
  type FishboneOpts,
  type ThreatOpts,
  type CommentOpts,
  type ElementOpts,
  type ZoneOpts,
  type EventOpts,
} from './builder/index';
export { validate, diagramWarnings, DiagramValidationError, type ValidationIssue } from './validate/index';
export { IMAGE_REF, LIBRARY_IMAGE_REF } from './validate/nodes';
export { isDrawings, isLayoutOverlay } from './guards';
export { addStroke, deleteStroke, emptyDrawings, pruneDrawingsPlane, uniqueStrokeId } from './drawings';
export { defined, errMessage, SOURCE_URL, type Defined } from './util';
export { allowedParentTypes, childrenOf, countAnchored } from './children';
export { bestLaneOrder } from './lanes';
export { lintModel, type LintCode, type LintFinding } from './lint';
export {
  diffMarks,
  diffModels,
  isEmptyDiff,
  type DiffMarks,
  type DiffStatus,
  type ModelDiff,
  type NodeChange,
  type RelationChange,
} from './diff';
export { NODE_TYPES, NOTATION_NODE_TYPES, NOTATION_RELATION_KINDS, RELATION_KINDS } from './vocabulary';
export { visibleColumns, withHiddenColumns } from './columns';
export { activeNotation, compileView, presetLayers } from './view/compile';
export { buildHierarchy, type HierarchyIndex } from './view/hierarchy';
export { soleRelation } from './view/edges';
export { relationLayer } from './view/layers';
export { scopeToRoot, EXTERNAL_STUB_PREFIX, type ScopedModel } from './view/scope';
export { estimateSizes, LEAF_SIZE, CONTAINER_PADDING, CONTAINER_HEADER } from './view/size';
export type { BoxSize, CompiledView, LodState, NodeViewState, ViewEdge, ViewNode, ViewportState } from './view/types';
export type { Point, Size } from './geometry';
export {
  applyCommand,
  emptyLayout,
  openingPins,
  withEdgeLabelPlacements,
  withUnfolded,
  type CommandResult,
  type EditorCommand,
  type EditorState,
} from './commands/index';
export { composeIncludes, IncludeError, MAX_INCLUDE_DEPTH, type IncludeResolver, type IncludeSource } from './compose';
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
} from './notations/git-graph/git-graph';
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
} from './notations/second-order/second-order';
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
} from './notations/fishbone/fishbone';
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
  threatsOf,
  nextThreatId,
  nextThreatStatus,
  allNotesOpen,
  type Crossing,
  type ThreatRow,
} from './notations/threat-model/threat-model';
export {
  DEPLOY_NOTATION,
  DEPLOY_ZONE_TYPES,
  DEPLOY_NODE_TYPES,
  DEPLOY_TYPES,
  isDeploymentNode,
  isDeployZone,
  type DeployZoneType,
  type DeployNodeType,
} from './notations/deployment/deployment';
export {
  PLAN_NOTATION,
  PLAN_ZONE_TYPE,
  PLAN_EVENT_TYPE,
  PLAN_PERSON_TYPE,
  PLAN_TEAM_TYPE,
  PLAN_ACTOR_TYPES,
  PLAN_TYPES,
  PLAN_ROLES,
  isPlanZone,
  isPlanEvent,
  isPlanActor,
  isPlanRole,
  dayOf,
  isoOf,
  spanOf,
  atOf,
  rolesOf,
  planGraph,
  planSubtree,
  type PlanRole,
  type PlanSpan,
  type PlanRoles,
  type PlanGraph,
  type PlanChildren,
} from './notations/plan/plan';
