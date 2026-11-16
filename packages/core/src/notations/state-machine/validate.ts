import type { DiagramModel, DiagramNode } from '../../types';
import type { Ctx } from '../../validate/context';
import { flowRules, ofType, planeView, planeWarner, typeOf, type PlaneView, type Warn } from './reachability';
import {
  isPseudoState,
  isStateMachineType,
  SM_DEEP_HISTORY_TYPE,
  SM_ENTRY_TYPE,
  SM_EXIT_TYPE,
  SM_HISTORY_TYPE,
  SM_MACHINE_TYPE,
  SM_NOTATION,
  SM_REGION_TYPE,
  SM_STATE_TYPE,
} from './state-machine';

/**
 * State machine conventions, checked on EVERY plane that draws the notation (the
 * other notations check only the first), because one model may hold several
 * machines on several planes. Each rule is a warning: any studio gesture can
 * produce any shape, so a half-drawn machine must stay savable and openable. An
 * element with no parent breaks none of the structure rules, as a loose activity
 * region does, so a palette drop never trips one.
 *
 * Within a plane the structure rules run first, then the flow-shape rules.
 */
export function validateStateMachine(ctx: Ctx): void {
  for (const plane of machinePlanes(ctx.model)) {
    structureRules(ctx, plane);
    flowRules(ctx, plane);
  }
}

/** the ids of the planes drawn as a state machine, in declaration order; `[undefined]`
 * for a model without planes whose notation it is */
function machinePlanes(model: DiagramModel): (string | undefined)[] {
  const planes = model.planes ?? [];
  if (planes.length === 0) return model.notation === SM_NOTATION ? [undefined] : [];
  return planes.filter((p) => (p.notation ?? model.notation) === SM_NOTATION).map((p) => p.id);
}

function structureRules(ctx: Ctx, plane: string | undefined): void {
  const view = planeView(ctx.model, plane);
  const warn = planeWarner(ctx, plane);
  const nodes = [...view.nodes.values()];
  regionRules(view, nodes, warn);
  for (const n of nodes) {
    const parent = view.parentOf.get(n.id);
    if (n.type === SM_MACHINE_TYPE && parent !== undefined) {
      warn('sm-machine-parent', `Machine '${n.id}' sits in '${parent}'; a machine is top level`, n.id);
    }
  }
  for (const n of nodes) {
    if (isPseudoState(n.type) && (view.childrenOf.get(n.id)?.length ?? 0) > 0) {
      warn(
        'sm-pseudo-children',
        `'${n.id}' holds other nodes; a pseudo-state, a final or a terminate holds none`,
        n.id,
      );
    }
  }
  transitionEnds(ctx, view, warn);
  for (const n of nodes) historyRule(view, n, warn);
  for (const n of nodes) pointRule(view, n, warn);
}

const orthogonal = (view: PlaneView, id: string) => ofType(view, id, SM_REGION_TYPE).length > 0;

function regionRules(view: PlaneView, nodes: DiagramNode[], warn: Warn): void {
  for (const n of nodes) {
    const parent = view.parentOf.get(n.id);
    if (n.type === SM_REGION_TYPE && parent !== undefined && !isStateOrMachine(typeOf(view, parent))) {
      warn('sm-region-parent', `Region '${n.id}' sits in '${parent}'; a region sits in a state or a machine`, n.id);
    }
  }
  for (const [parent, children] of view.childrenOf) {
    if (!orthogonal(view, parent)) continue;
    for (const child of children) {
      const type = typeOf(view, child);
      if (type !== SM_REGION_TYPE && type !== SM_ENTRY_TYPE && type !== SM_EXIT_TYPE) {
        warn(
          'sm-region-siblings',
          `'${child}' sits beside the regions of '${parent}'; only regions and entry or exit points do`,
          child,
        );
      }
    }
  }
}

/** a history sits in a region or in a plain composite state, never directly in an orthogonal one */
function historyRule(view: PlaneView, n: DiagramNode, warn: Warn): void {
  const parent = view.parentOf.get(n.id);
  if (parent === undefined || (n.type !== SM_HISTORY_TYPE && n.type !== SM_DEEP_HISTORY_TYPE)) return;
  const inRegion = typeOf(view, parent) === SM_REGION_TYPE;
  const inPlainComposite = typeOf(view, parent) === SM_STATE_TYPE && !orthogonal(view, parent);
  if (!inRegion && !inPlainComposite) {
    warn(
      'sm-history-parent',
      `History '${n.id}' sits in '${parent}'; it sits in a region or a plain composite state`,
      n.id,
    );
  }
}

function pointRule(view: PlaneView, n: DiagramNode, warn: Warn): void {
  const parent = view.parentOf.get(n.id);
  if (parent === undefined || (n.type !== SM_ENTRY_TYPE && n.type !== SM_EXIT_TYPE)) return;
  if (!isStateOrMachine(typeOf(view, parent))) {
    warn('sm-point-parent', `Point '${n.id}' sits in '${parent}'; it sits on a state or a machine`, n.id);
  }
}

const isStateOrMachine = (type: string | undefined) => type === SM_STATE_TYPE || type === SM_MACHINE_TYPE;

/** a transition joins two vertices: not a machine, a region, or a node of another notation */
function transitionEnds(ctx: Ctx, view: PlaneView, warn: Warn): void {
  const types = new Map(ctx.model.nodes.map((n) => [n.id, n.type]));
  const joinable = (id: string) => {
    if (!types.has(id)) return true; // dangling is an error of its own
    const type = types.get(id);
    return isStateMachineType(type) && type !== SM_MACHINE_TYPE && type !== SM_REGION_TYPE;
  };
  for (const t of view.transitions) {
    if (!joinable(t.from) || !joinable(t.to)) {
      const end = joinable(t.from) ? t.to : t.from;
      warn(
        'sm-transition-ends',
        `Transition '${t.id}' has '${end}' as an end; a transition joins two states or pseudo-states`,
        t.id,
      );
    }
  }
}
