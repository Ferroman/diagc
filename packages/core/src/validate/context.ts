// What every check shares: the issue shape, the per-run context, and the two
// ways of reporting an issue.
import type { LintCode } from '../lint';
import type { DiagramModel, DiagramPlane } from '../types';
import { defaultPlaneOf, isOnPlane } from '../planes';

export interface ValidationIssue {
  code:
    | 'duplicate-node'
    | 'reserved-node-id'
    | 'duplicate-layer'
    | 'duplicate-plane'
    | 'duplicate-relation'
    | 'containment-cycle'
    | 'dangling-endpoint'
    | 'unknown-layer'
    | 'unknown-plane'
    | 'unknown-hidden-node'
    | 'redundant-hide'
    | 'invalid-plane'
    | 'invalid-style'
    | 'invalid-legend'
    | 'invalid-image'
    | 'invalid-shape'
    | 'invalid-link'
    | 'invalid-key'
    | 'duplicate-key'
    | 'invalid-include'
    | 'unknown-notation'
    | 'invalid-polarity'
    | 'invalid-delay'
    | 'invalid-rich'
    | 'invalid-align'
    | 'invalid-font-scale'
    | 'invalid-edge-label'
    | 'duplicate-column'
    | 'unknown-column'
    | 'git-link-endpoints'
    | 'git-commit-lane'
    | 'git-parents'
    | 'git-cycle'
    | 'git-commit-outside-lane'
    | 'git-gap'
    | 'git-stage-span'
    | 'activity-lane-parent'
    | 'activity-frame-children'
    | 'activity-region-parent'
    | 'so-no-decision'
    | 'so-cycle'
    | 'so-unreachable'
    | 'so-contained'
    | 'fb-no-effect'
    | 'fb-many-effects'
    | 'fb-unattached'
    | 'fb-misplaced'
    | 'fb-too-deep'
    | 'fb-contained'
    | 'invalid-threats'
    | 'threat-id'
    | 'threat-title'
    | 'threat-category'
    | 'threat-status'
    | 'threat-severity'
    | 'invalid-comments'
    | 'comment-id'
    | 'comment-text'
    | 'comment-at'
    | 'invalid-links'
    | 'tm-flow-boundary'
    | 'plan-date'
    | 'plan-missing'
    | 'plan-span'
    | 'plan-nested'
    | 'plan-role-target'
    | LintCode;
  message: string;
  ref?: string;
}

export class DiagramValidationError extends Error {
  constructor(readonly issues: ValidationIssue[]) {
    super(`Invalid diagram model:\n${issues.map((i) => `  - ${i.message}`).join('\n')}`);
    this.name = 'DiagramValidationError';
  }
}

type Code = ValidationIssue['code'];

/**
 * Append one issue. `ref` is omitted rather than `undefined` so serialized
 * issues stay minimal (an absent ref is the same shape as an absent key).
 */
export const report = (issues: ValidationIssue[], code: Code, message: string, ref?: string): void => {
  issues.push(ref === undefined ? { code, message } : { code, message, ref });
};

/** Sets derived once per validation run and threaded into every section, so the
 * per-section functions can cross-reference ids without rebuilding them. */
export interface Ctx {
  issues: ValidationIssue[];
  /** notices that never block a save or a compile (see diagramWarnings) */
  warnings: ValidationIssue[];
  m: DiagramModel;
  planes: DiagramPlane[];
  nodeIds: Set<string>;
  layerIds: Set<string>;
  planeIds: Set<string>;
}

/** Every containment edge on the active plane whose child is one of `ids` gets ONE
 * issue (`code`, `message(child, parent)`): the notation's arrangement and a group
 * want the same rectangle, so nothing in `ids` may be grouped. Untagged containment
 * belongs to the default plane. */
export function reportContained(
  ctx: Ctx,
  plane: DiagramPlane | undefined,
  ids: ReadonlySet<string>,
  code: Code,
  message: (child: string, parent: string) => string,
): void {
  const { issues, m } = ctx;
  const active = plane?.id ?? defaultPlaneOf(m);
  const reported = new Set<string>();
  for (const e of m.containment) {
    if (!isOnPlane(e, active, m) || !ids.has(e.child) || reported.has(e.child)) continue;
    reported.add(e.child);
    report(issues, code, message(e.child, e.parent), e.child);
  }
}
