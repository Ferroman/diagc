import { containmentOn, containmentPlaneOf, nodeScopeOn, relationOnPlane } from '../../planes';
import type { DiagramModel, DiagramNode, DiagramRelation } from '../../types';
import { report, type Ctx, type ValidationIssue } from '../../validate/context';
import {
  isStateMachineType,
  SM_BAR_TYPE,
  SM_CHOICE_TYPE,
  SM_ENTRY_TYPE,
  SM_FINAL_TYPE,
  SM_INITIAL_TYPE,
  SM_JUNCTION_TYPE,
  SM_MACHINE_TYPE,
  SM_REGION_TYPE,
  SM_STATE_TYPE,
  SM_TERMINATE_TYPE,
  SM_TRANSITION_KIND,
} from './state-machine';
import { hasTransitionParts } from './transition';

/** What one plane shows of a model, read once: the state-machine nodes, who contains whom
 * and the relations. Containment is the plane's own, or its donor's when it borrows. */
export interface PlaneView {
  nodes: Map<string, DiagramNode>;
  /** a node's first parent on the plane; a loose node has none */
  parentOf: Map<string, string>;
  childrenOf: Map<string, string[]>;
  /** every relation drawn on the plane, whatever its kind */
  relations: DiagramRelation[];
  transitions: DiagramRelation[];
}

export function planeView(model: DiagramModel, plane: string | undefined): PlaneView {
  const inScope = nodeScopeOn(model, plane);
  const nodes = new Map(model.nodes.filter((n) => isStateMachineType(n.type) && inScope(n)).map((n) => [n.id, n]));
  const parentOf = new Map<string, string>();
  const childrenOf = new Map<string, string[]>();
  for (const e of containmentOn(model, containmentPlaneOf(model, plane))) {
    if (!nodes.has(e.child) || !nodes.has(e.parent)) continue;
    if (!parentOf.has(e.child)) parentOf.set(e.child, e.parent);
    const siblings = childrenOf.get(e.parent) ?? [];
    siblings.push(e.child);
    childrenOf.set(e.parent, siblings);
  }
  const relations = model.relations.filter((r) => relationOnPlane(r, plane));
  return {
    nodes,
    parentOf,
    childrenOf,
    relations,
    transitions: relations.filter((r) => r.kind === SM_TRANSITION_KIND),
  };
}

/** the type of a vertex on the plane; undefined for no id, or one the plane does not show */
export const typeOf = (view: PlaneView, id: string | undefined) =>
  id === undefined ? undefined : view.nodes.get(id)?.type;

export const ofType = (view: PlaneView, id: string, type: string): string[] =>
  (view.childrenOf.get(id) ?? []).filter((child) => typeOf(view, child) === type);

/** transitions leaving and entering each vertex, in declaration order */
function transitionsByEnd(view: PlaneView): {
  out: Map<string, DiagramRelation[]>;
  into: Map<string, DiagramRelation[]>;
} {
  const out = new Map<string, DiagramRelation[]>();
  const into = new Map<string, DiagramRelation[]>();
  for (const t of view.transitions) {
    out.set(t.from, [...(out.get(t.from) ?? []), t]);
    into.set(t.to, [...(into.get(t.to) ?? []), t]);
  }
  return { out, into };
}

/** Reports one warning of a plane's rules, naming the plane on a model that has any: the same
 * shape may be wrong on two of them, and the two must be told apart. */
export type Warn = (code: ValidationIssue['code'], message: string, ref: string) => void;

export function planeWarner(ctx: Ctx, plane: string | undefined): Warn {
  const at = ctx.planes.length > 0 ? ` on plane '${plane}'` : '';
  return (code, message, ref) => report(ctx.warnings, code, message + at, ref);
}

/** The flow-shape rules of one plane, in the order the design lists them. All warnings. */
export function flowRules(ctx: Ctx, plane: string | undefined): void {
  const view = planeView(ctx.model, plane);
  const warn = planeWarner(ctx, plane);
  const ends = transitionsByEnd(view);
  initialRules(view, ends, warn);
  endRules(view, ends, warn);
  choiceRules(view, ends, warn);
  barRules(view, ends, warn);
  for (const id of unreachableStates(ctx.model, plane)) {
    warn('sm-unreachable', `'${id}' is reached by no path from an initial; every state is reached from one`, id);
  }
  for (const r of view.relations) {
    if (hasTransitionParts(r) && r.label !== undefined && r.label !== '') {
      warn(
        'sm-transition-label',
        `'${r.id}' has both a label and trigger/guard/effect; the parts are drawn and the label is ignored`,
        r.id,
      );
    }
  }
}

type Ends = ReturnType<typeof transitionsByEnd>;

const ofKind = (view: PlaneView, ...types: string[]) =>
  [...view.nodes.values()].filter((n) => types.includes(n.type ?? ''));

function initialRules(view: PlaneView, { out, into }: Ends, warn: Warn): void {
  initialCount(view, warn);
  for (const n of ofKind(view, SM_INITIAL_TYPE)) {
    const fact = initialFlowFact(into.get(n.id) ?? [], out.get(n.id) ?? []);
    if (fact !== undefined) {
      warn(
        'sm-initial-flow',
        `'${n.id}' ${fact}; an initial has no incoming transition and exactly one outgoing, with no trigger or guard`,
        n.id,
      );
    }
  }
}

/** what is wrong with an initial's transitions, the first thing found; undefined when nothing is */
function initialFlowFact(ins: DiagramRelation[], outs: DiagramRelation[]): string | undefined {
  if (ins.length > 0) return `has ${transitions(ins.length, 'incoming')}`;
  if (outs.length !== 1) return `has ${transitions(outs.length, 'outgoing')}`;
  return hasTriggerOrGuard(outs[0]!) ? 'leaves by a transition with a trigger or guard' : undefined;
}

const transitions = (count: number, way: string) => `${count} ${way} transition${count === 1 ? '' : 's'}`;

function endRules(view: PlaneView, { out }: Ends, warn: Warn): void {
  for (const n of ofKind(view, SM_FINAL_TYPE, SM_TERMINATE_TYPE)) {
    const exits = out.get(n.id)?.length ?? 0;
    if (exits > 0) {
      const fact = `'${n.id}' has ${transitions(exits, 'outgoing')}`;
      warn('sm-final-outgoing', `${fact}; a final or a terminate ends the machine and has none`, n.id);
    }
  }
}

function choiceRules(view: PlaneView, { out }: Ends, warn: Warn): void {
  for (const n of ofKind(view, SM_CHOICE_TYPE, SM_JUNCTION_TYPE)) {
    const exits = out.get(n.id) ?? [];
    const elses = exits.filter((t) => t.guard?.trim() === 'else').length;
    const unguarded = exits.filter((t) => t.guard === undefined).length;
    if (unguarded > 0 || elses > 1) {
      const fact = unguarded > 0 ? `${unguarded} unguarded exit${unguarded === 1 ? '' : 's'}` : `${elses} [else] exits`;
      warn(
        'sm-choice-guards',
        `'${n.id}' has ${fact}; every exit of a choice or junction has a guard, and at most one is [else]`,
        n.id,
      );
    }
  }
}

function barRules(view: PlaneView, { out, into }: Ends, warn: Warn): void {
  for (const n of ofKind(view, SM_BAR_TYPE)) {
    const exits = out.get(n.id) ?? [];
    const ins = into.get(n.id)?.length ?? 0;
    const fact =
      ins !== 1 && exits.length !== 1
        ? `has ${ins} incoming and ${transitions(exits.length, 'outgoing')}`
        : exits.length > 1 && !forkInRegions(view, exits)
          ? 'forks into targets that are not different regions of one state'
          : undefined;
    if (fact !== undefined) {
      warn(
        'sm-bar-shape',
        `'${n.id}' ${fact}; a bar is a fork (one in, several out, into different regions of one state) or a join (several in, one out)`,
        n.id,
      );
    }
  }
}

const hasTriggerOrGuard = (t: DiagramRelation) => t.trigger !== undefined || t.guard !== undefined;

/** more than one initial in one region, or in one container that is not split into regions */
function initialCount(view: PlaneView, warn: Warn): void {
  const first = new Map<string, string>();
  for (const n of view.nodes.values()) {
    if (n.type !== SM_INITIAL_TYPE) continue;
    const parent = view.parentOf.get(n.id) ?? '';
    const earlier = first.get(parent);
    if (earlier === undefined) first.set(parent, n.id);
    else warn('sm-initial-count', `'${n.id}' is a second initial next to '${earlier}'; a region has one`, n.id);
  }
}

/** a vertex's parent, its parent's parent, and so on; stops on a containment cycle, which
 * validation reports as an error of its own but which this rule still has to survive */
function* ancestors(view: PlaneView, id: string): Generator<string> {
  const seen = new Set([id]);
  for (let at = view.parentOf.get(id); at !== undefined && !seen.has(at); at = view.parentOf.get(at)) {
    seen.add(at);
    yield at;
  }
}

/** the region a vertex sits in, however deep, or undefined when it sits in none */
function regionOf(view: PlaneView, id: string): string | undefined {
  for (const at of ancestors(view, id)) if (typeOf(view, at) === SM_REGION_TYPE) return at;
  return undefined;
}

/** whether a fork's targets sit in different regions, all of one state */
function forkInRegions(view: PlaneView, exits: DiagramRelation[]): boolean {
  const regions = exits.map((t) => regionOf(view, t.to));
  if (regions.some((r) => r === undefined) || new Set(regions).size !== regions.length) return false;
  return new Set(regions.map((r) => view.parentOf.get(r!))).size === 1;
}

/**
 * The sm-states that no path from an initial reaches (pseudo-states are not asked: the
 * design's own order machine leaves a final and a history unconnected), in node order. A reached composite
 * reaches its initial and its entry points; a reached orthogonal state, or a machine,
 * reaches the initial of each region. A machine with no initial in it is skipped: it
 * has not been given a way in yet, and every state of it would be reported. The nodes
 * outside any machine are one such scope.
 */
export function unreachableStates(model: DiagramModel, plane: string | undefined): string[] {
  const view = planeView(model, plane);
  const { out } = transitionsByEnd(view);

  const reached = new Set<string>();
  const queue: string[] = [];
  const reach = (id: string) => {
    if (!view.nodes.has(id) || reached.has(id)) return;
    reached.add(id);
    queue.push(id);
    // Entering a substate activates every state around it, so they are reached too.
    for (const parent of ancestors(view, id)) reach(parent);
  };
  for (const n of view.nodes.values()) {
    if (n.type === SM_MACHINE_TYPE || (n.type === SM_INITIAL_TYPE && !view.parentOf.has(n.id))) reach(n.id);
  }
  for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
    for (const t of out.get(id) ?? []) reach(t.to);
    for (const child of view.childrenOf.get(id) ?? []) {
      const type = typeOf(view, child);
      if (type === SM_INITIAL_TYPE || type === SM_ENTRY_TYPE) reach(child);
      else if (type === SM_REGION_TYPE) ofType(view, child, SM_INITIAL_TYPE).forEach(reach);
    }
  }

  /** the machine a vertex belongs to, '' for one outside any */
  const machineOf = (id: string): string => {
    const top = [...ancestors(view, id)].pop() ?? id;
    return typeOf(view, top) === SM_MACHINE_TYPE ? top : '';
  };
  const rooted = new Set<string>();
  for (const n of view.nodes.values()) if (n.type === SM_INITIAL_TYPE) rooted.add(machineOf(n.id));
  return [...view.nodes.values()]
    .filter((n) => n.type === SM_STATE_TYPE && !reached.has(n.id) && rooted.has(machineOf(n.id)))
    .map((n) => n.id);
}
