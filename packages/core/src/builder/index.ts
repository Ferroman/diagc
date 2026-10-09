// The builder DSL a diagram is written in: the model builder, the node refs it
// hands back, and each notation's builder. Both entry points export it from here.
export { model, ModelBuilder } from './model-builder';
export {
  NodeRef,
  type NodeOpts,
  type RelateOpts,
  type ContainsOpts,
  type ThreatOpts,
  type CommentOpts,
  type ElementOpts,
} from './node-ref';
export {
  BranchRef,
  CommitRef,
  GitGraphBuilder,
  type CommitOpts,
  type StageOpts,
  type MergeOpts,
} from '../notations/git-graph/builder';
export { ActivityBuilder, ActivityScope, LaneRef, RegionRef, type ActivityElementOpts } from '../activity/builder';
export { ConsequenceRef, SecondOrderBuilder, type ConsequenceOpts } from '../notations/second-order/builder';
export { FishboneBuilder, CategoryRef, CauseRef, type FishboneOpts } from '../notations/fishbone/builder';
export { ThreatModelBuilder, FlowRef } from '../notations/threat-model/builder';
export { PlanBuilder, ZoneBuilder, type ZoneOpts, type EventOpts } from '../notations/plan/builder';
