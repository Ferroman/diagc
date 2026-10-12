import type { DiagramModel } from './types';
import type { CompiledView, ViewNode } from './view/types';
import {
  ACTIVITY_FRAME_TYPE,
  ACTIVITY_LANE_TYPE,
  ACTIVITY_REGION_TYPE,
  isActivityChrome,
  isActivityType,
} from './activity/activity';

/**
 * Build a parent → children index over a set of containment edges. Shared by the
 * two cycle detectors — mutate's BFS-reachability guard (`wouldCycle`) and
 * validate's DFS-coloring check (`findContainmentCycle`) — which agree on this
 * map shape even though they walk it differently. Absent parents (nodes with no
 * children) do not appear; callers read with `?? []`.
 */
export function childrenOf(edges: DiagramModel['containment']): Map<string, string[]> {
  const children = new Map<string, string[]>();
  for (const e of edges) {
    children.set(e.parent, [...(children.get(e.parent) ?? []), e.child]);
  }
  return children;
}

/**
 * Per-node hidden counts over a compiled view, for the collapse badge
 * (`hiddenCount` on collapsed containers): how many hidden nodes each visible
 * box stands in for. Each hidden node counts once, for the one box that absorbed
 * it on the plane being viewed — so another plane's containment, or a second
 * path to the same node, adds nothing. A node the view filters out (an inactive
 * layer, a plane's `hides`) is absorbed by no box, and unfolding would not show
 * it either. Every visible node has an entry; one that absorbs nothing has 0.
 */
export function countAnchored(view: CompiledView): Map<string, number> {
  const counts = new Map<string, number>();
  const walk = (n: ViewNode) => {
    counts.set(n.id, 0);
    n.children.forEach(walk);
  };
  view.roots.forEach(walk);
  for (const anchor of view.anchorOf.values()) counts.set(anchor, (counts.get(anchor) ?? 0) + 1);
  return counts;
}

/**
 * The parent types a node of `type` may sit in, or undefined when any container
 * will do. Only the activity notation constrains this: validate() refuses a lane
 * outside a frame and a region outside a lane, and the flow elements belong in a
 * lane or a region — offering an action or a decision as a parent only builds a
 * model the canvas draws as a stray box.
 */
export function allowedParentTypes(type: string | undefined): ReadonlySet<string> | undefined {
  if (type === ACTIVITY_LANE_TYPE) return ACTIVITY_LANE_PARENTS;
  if (type === ACTIVITY_REGION_TYPE) return ACTIVITY_REGION_PARENTS;
  if (isActivityType(type) && !isActivityChrome(type)) return ACTIVITY_FLOW_PARENTS;
  return undefined;
}

const ACTIVITY_LANE_PARENTS: ReadonlySet<string> = new Set([ACTIVITY_FRAME_TYPE]);
const ACTIVITY_REGION_PARENTS: ReadonlySet<string> = new Set([ACTIVITY_LANE_TYPE]);
const ACTIVITY_FLOW_PARENTS: ReadonlySet<string> = new Set([ACTIVITY_LANE_TYPE, ACTIVITY_REGION_TYPE]);
