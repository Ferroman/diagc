import { containmentOn, containmentPlaneOf, SM_STATE_TYPE, SM_ZONE_TYPE } from '@diagc/core/internal';
import type { DiagramModel, StateKind, ViewEdge } from '@diagc/core/internal';

/** A state's accent by kind: theme tokens, so each reads on both canvases. */
export const STATE_KIND_COLOR: Record<StateKind, string> = {
  ok: 'var(--dg-sm-ok)',
  failed: 'var(--dg-sm-failed)',
  waiting: 'var(--dg-sm-waiting)',
};

/** what the legend calls each kind */
export const STATE_KIND_LABEL: Record<StateKind, string> = {
  ok: 'Succeeded',
  failed: 'Failed',
  waiting: 'Waiting',
};

/** The colours zones take in turn. Six, then round again: a machine with more
 * zones than that tells them apart by their titles, as it does in any case. */
export const ZONE_COLORS: readonly string[] = [1, 2, 3, 4, 5, 6].map((i) => `var(--dg-sm-zone${i})`);

/**
 * A state machine's accents: a zone takes the next of the theme's set, in the
 * order the plane's containment lists the zones, and a state takes the colour of
 * its kind. The node's own `color` still wins (typeColor), so neither is ever
 * more than a default. A zone with its own colour still uses up its turn: giving
 * one zone a colour must not recolour the zones after it.
 */
export function stateMachineColors(model: DiagramModel, plane: string | undefined): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  const zones = new Set(model.nodes.filter((n) => n.type === SM_ZONE_TYPE).map((n) => n.id));
  if (zones.size > 0) {
    let turn = 0;
    for (const e of containmentOn(model, containmentPlaneOf(model, plane))) {
      if (!zones.has(e.child) || out.has(e.child)) continue;
      out.set(e.child, ZONE_COLORS[turn % ZONE_COLORS.length]!);
      turn++;
    }
  }
  for (const n of model.nodes) {
    if (n.type === SM_STATE_TYPE && n.stateKind !== undefined) out.set(n.id, STATE_KIND_COLOR[n.stateKind]);
  }
  return out;
}

// one lookup per model, not one scan per edge: the hook is asked for every edge drawn
const failedOf = new WeakMap<DiagramModel, ReadonlySet<string>>();
function failedStates(model: DiagramModel): ReadonlySet<string> {
  let failed = failedOf.get(model);
  if (failed === undefined) {
    failed = new Set(model.nodes.filter((n) => n.type === SM_STATE_TYPE && n.stateKind === 'failed').map((n) => n.id));
    failedOf.set(model, failed);
  }
  return failed;
}

/** A transition into a failed state is drawn in the failure colour: the way a
 * process goes wrong is then one colour from its cause to its end. */
export function stateMachineEdgeColor(e: ViewEdge, model: DiagramModel): string | undefined {
  return failedStates(model).has(e.to) ? STATE_KIND_COLOR.failed : undefined;
}
