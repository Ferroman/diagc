import { notationPlane } from '../../planes';
import { report, reportContained, type Ctx } from '../../validate/context';
import { SECOND_ORDER_NOTATION, SO_DECISION_TYPE, consequenceOrders, isSecondOrderNode } from './second-order';

/**
 * Second-order conventions, applied wherever RENDERING would activate the
 * profile — the same plane pick as validateGit: a plane's own `notation` wins,
 * otherwise the model-level one; the FIRST such plane is the one read.
 * The derivation never throws on a malformed graph, so each convention an
 * author should hear about is an issue here.
 */
export function validateSecondOrder(ctx: Ctx): void {
  const { issues, m } = ctx;
  const where = notationPlane(m, SECOND_ORDER_NOTATION);
  if (where === undefined) return;
  const { plane } = where;

  const soIds = new Set(m.nodes.filter(isSecondOrderNode).map((n) => n.id));
  // An empty diagram — or one holding only non-second-order nodes, e.g. a
  // stray comment — is where every second-order diagram starts, and the
  // studio never opens a model that already has issues: this must wait for
  // there to be a second-order node to judge before it can want a decision
  // among them.
  if (soIds.size > 0 && !m.nodes.some((n) => n.type === SO_DECISION_TYPE)) {
    report(
      issues,
      'so-no-decision',
      'A second-order diagram needs at least one decision (a node of type so-decision)',
      plane?.id ?? m.id,
    );
  }
  const { cycle, unreachable } = consequenceOrders(m);
  if (cycle !== undefined) {
    report(
      issues,
      'so-cycle',
      `Consequences form a loop (${cycle.join(' → ')}); a feedback loop is a causal-loop diagram — use that notation for it`,
      cycle[0],
    );
  }
  for (const id of unreachable) {
    report(issues, 'so-unreachable', `Consequence '${id}' follows from no decision`, id);
  }
  // Bands and groups want the same rectangle; a group spanning two bands has no
  // sensible picture.
  reportContained(ctx, plane, soIds, {
    code: 'so-contained',
    message: (child, parent) =>
      `'${child}' sits inside '${parent}'; decisions and consequences cannot be grouped in a second-order diagram`,
  });
}
