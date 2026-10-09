import { notationPlane } from '../../planes';
import { report, type Ctx } from '../../validate/context';
import { TM_BOUNDARY_TYPE, TM_FLOW_KIND, TM_NOTATION } from './threat-model';

/**
 * Threat-model conventions, applied wherever RENDERING would activate the
 * notation (a plane's, or the model's with no planes) — the same plane pick as
 * validateGit. Deliberately lax, as C4 is: boundaries nest, elements may hold
 * elements. The one structural rule is that a data flow connects elements,
 * never a boundary — a boundary is a line around things, and an arrow into it
 * says nothing.
 */
export function validateThreatModel(ctx: Ctx): void {
  const { issues, model } = ctx;
  if (notationPlane(model, TM_NOTATION) === undefined) return;
  const boundaries = new Set(model.nodes.filter((n) => n.type === TM_BOUNDARY_TYPE).map((n) => n.id));
  for (const r of model.relations) {
    if (r.kind !== TM_FLOW_KIND) continue;
    const end = boundaries.has(r.from) ? r.from : boundaries.has(r.to) ? r.to : undefined;
    if (end !== undefined)
      report(
        issues,
        'tm-flow-boundary',
        `Data flow '${r.id}' touches the trust boundary '${end}'; flows connect elements, a boundary only surrounds them`,
        r.id,
      );
  }
}
