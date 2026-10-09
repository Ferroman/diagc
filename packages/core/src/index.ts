/*
 * @diagc/core — the diagram model, its validator and the builder DSL.
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
// The author API: what a .diagram.ts file, or a tool that checks diagrams, needs.
// Semver covers exactly this. Everything else is in ./internal, which diagc's own
// packages use and which carries no promise.
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
export type * from './types';
// The geometry the model types use (LayoutOverlay's saved positions and sizes).
export type { Point, Size } from './geometry';
// The value lists the model types are built from (`Side` is `(typeof SIDES)[number]`).
export {
  TEXT_ALIGNS,
  FONT_SCALES,
  SIDES,
  RELATION_SHAPES,
  RELATION_LINES,
  RELATION_MARKERS,
  EDGE_LABEL_SIDES,
  STRIDE,
  THREAT_STATUSES,
  THREAT_SEVERITIES,
  LEGEND_SECTIONS,
  LEGEND_POSITIONS,
  BUILTIN_NOTATIONS,
} from './types';
// Types that public signatures mention (ModelBuilder.addThreat / addComment,
// ConsequenceOpts, FishboneBuilder, ValidationIssue.code). ThreatTarget and
// ElementTarget are ElementRef's deprecated 1.0 names.
export type { ElementRef, ElementTarget, ThreatTarget } from './elements';
export type { FishbonePreset } from './notations/fishbone/fishbone';
export type { LintCode } from './lint';
export type { Valence } from './notations/second-order/second-order';
