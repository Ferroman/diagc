// Validation: the checks every model gets, then each notation's own rules.
import type { DiagramModel } from '../types';
import { lintModel } from '../lint';
import { validateActivity } from '../activity/validate';
import { validateFishbone } from '../notations/fishbone/validate';
import { validateGit } from '../notations/git-graph/validate';
import { validatePlan } from '../notations/plan/validate';
import { validateSecondOrder } from '../notations/second-order/validate';
import { validateThreatModel } from '../notations/threat-model/validate';
import { validateComments, validateThreats } from './annotations';
import type { Ctx, ValidationIssue } from './context';
import { validateLegend, validateModelStyle } from './diagram';
import { validateNodes } from './nodes';
import { validateRelations } from './relations';
import { validateContainment, validateCycles, validateLayers, validatePlaneHides, validatePlanes } from './structure';

export { DiagramValidationError, type ValidationIssue } from './context';

/** Each notation's own rules, run in this order after the checks every model gets.
 * Activity is a set of node types rather than a notation id, but its structure
 * rules are this kind of rule. */
const NOTATION_VALIDATORS: readonly ((ctx: Ctx) => void)[] = [
  validateGit,
  validateActivity,
  validateSecondOrder,
  validateFishbone,
  validateThreatModel,
  validatePlan,
];

export function validate(model: DiagramModel): ValidationIssue[] {
  return check(model).issues;
}

/**
 * What is worth telling the author but never blocks a save, a compile or an
 * open: the model is sound and draws, just not the way it was likely meant
 * (a fishbone cause that reaches no bone). Same issue shape as validate().
 */
export function diagramWarnings(model: DiagramModel): ValidationIssue[] {
  return [...check(model).warnings, ...lintModel(model)];
}

function check(model: DiagramModel): Ctx {
  const ctx: Ctx = {
    issues: [],
    warnings: [],
    model,
    planes: model.planes ?? [],
    nodeIds: new Set<string>(),
    layerIds: new Set<string>(),
    planeIds: new Set<string>(),
  };
  validateModelStyle(ctx);
  validateLegend(ctx);
  // Declarations (layers, planes) run before the consumers (nodes' plane/layer
  // tags, containment/relation refs, plane hides) so the derived id sets are
  // fully populated when cross-reference checks read them.
  validateLayers(ctx);
  validatePlanes(ctx);
  validateNodes(ctx);
  validatePlaneHides(ctx);
  validateContainment(ctx);
  validateRelations(ctx);
  validateThreats(ctx);
  validateComments(ctx);
  validateCycles(ctx);
  for (const rules of NOTATION_VALIDATORS) rules(ctx);
  return ctx;
}
