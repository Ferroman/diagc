import {
  BUILTIN_NOTATIONS,
  EDGE_LABEL_SIDES,
  FONT_SCALES,
  LEGEND_POSITIONS,
  LEGEND_SECTIONS,
  RELATION_LINES,
  RELATION_MARKERS,
  RELATION_SHAPES,
  RESERVED_NODE_ID,
  SIDES,
  STRIDE,
  TEXT_ALIGNS,
  THREAT_SEVERITIES,
  THREAT_STATUSES,
  type DiagramModel,
  type DiagramPlane,
  type TextRun,
} from './types';
import { childrenOf } from './children';
import { isIsoDate } from './dates';
import { FB_CATEGORY_TYPE, FB_CAUSE_TYPE, FB_EFFECT_TYPE, FISHBONE_NOTATION, fishboneParents, fishboneTree, isFishboneNode } from './fishbone';
import { GIT_NOTATION, GIT_STAGE_TYPE, gitGraph, isGitKind, stageCommit } from './git';
import { SECOND_ORDER_NOTATION, SO_DECISION_TYPE, consequenceOrders, isSecondOrderNode } from './second-order';
import { TM_BOUNDARY_TYPE, TM_FLOW_KIND, TM_NOTATION } from './threat-model';

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
    | 'tm-flow-boundary';
  message: string;
  ref?: string;
}

export class DiagramValidationError extends Error {
  constructor(readonly issues: ValidationIssue[]) {
    super(`Invalid diagram model:\n${issues.map((i) => `  - ${i.message}`).join('\n')}`);
    this.name = 'DiagramValidationError';
  }
}

/** content-hashed asset filename shape (hex hash + extension); shared with the
 * studio dev middleware's asset naming (`apps/studio/vite-plugins/handlers.ts`) */
export const IMAGE_REF = /^[a-z0-9]+\.(png|jpe?g|svg|webp|gif)$/;
/** Bundled library icons served verbatim from apps/studio/public/library/<pack>/.
 * A fixed, traversal-free namespace (never passed to readAsset, which uses IMAGE_REF). */
export const LIBRARY_IMAGE_REF = /^\/library\/[a-z0-9-]+\/[a-z0-9-]+\.(png|jpe?g|svg|webp|gif)$/;

/** shared-identity keys are slugs; also the composed id of a merged node */
export const KEY_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

type Code = ValidationIssue['code'];

/**
 * Append one issue. `ref` is omitted rather than `undefined` so serialized
 * issues stay minimal (an absent ref is the same shape as an absent key).
 */
const report = (issues: ValidationIssue[], code: Code, message: string, ref?: string): void => {
  issues.push(ref === undefined ? { code, message } : { code, message, ref });
};

/** Sets derived once per validation run and threaded into every section, so the
 * per-section functions can cross-reference ids without rebuilding them. */
interface Ctx {
  issues: ValidationIssue[];
  m: DiagramModel;
  planes: DiagramPlane[];
  nodeIds: Set<string>;
  layerIds: Set<string>;
  planeIds: Set<string>;
}

/** Diagram-level style: pinned style must be a non-empty string. Unknown ids are
 * intentionally legal — the renderer treats them as unpinned. Also the
 * model-level `notation`, unlike style, must be one of BUILTIN_NOTATIONS —
 * it is a closed vocabulary the renderer keys a `Record` on, not an open
 * preset id. */
function validateModelStyle(ctx: Ctx): void {
  const { m, issues } = ctx;
  if (m.style !== undefined && (typeof m.style !== 'string' || m.style === '')) {
    report(issues, 'invalid-style', 'Diagram style must be a non-empty string');
  }
  if (
    m.notation !== undefined &&
    (typeof m.notation !== 'string' || !(BUILTIN_NOTATIONS as readonly string[]).includes(m.notation))
  ) {
    report(issues, 'unknown-notation', `Diagram has unknown notation '${String(m.notation)}'`, m.id);
  }
}

/** Per-node checks: duplicate ids, style scalars, rich runs, aligns/scale, image
 * & shape refs, keys, include, table columns. Builds the shared node-key/id maps. */
function validateNodes(ctx: Ctx): void {
  const { m, issues, nodeIds } = ctx;
  const keys = new Map<string, string>(); // key -> first declaring node id


  for (const n of m.nodes) {
    if (nodeIds.has(n.id)) report(issues, 'duplicate-node', `Duplicate node id '${n.id}'`, n.id);
    nodeIds.add(n.id);
    if (n.id === RESERVED_NODE_ID) {
      report(issues, 'reserved-node-id', `Node id '${n.id}' is reserved for the layout root`, n.id);
    }
    if (n.color !== undefined && typeof n.color !== 'string') {
      report(issues, 'invalid-style', `Node '${n.id}' has invalid color '${String(n.color)}'`, n.id);
    }
    if (n.textColor !== undefined && typeof n.textColor !== 'string') {
      report(issues, 'invalid-style', `Node '${n.id}' has invalid textColor '${String(n.textColor)}'`, n.id);
    }
    if (n.technology !== undefined && typeof n.technology !== 'string') {
      report(issues, 'invalid-style', `Node '${n.id}' has invalid technology '${String(n.technology)}'`, n.id);
    }
    if (n.rich !== undefined) {
      const bad =
        !Array.isArray(n.rich) ||
        n.rich.some((r) => {
          const run = r as TextRun;
          return (
            r === null || typeof r !== 'object' || typeof run.text !== 'string' ||
            (run.bold !== undefined && typeof run.bold !== 'boolean') ||
            (run.italic !== undefined && typeof run.italic !== 'boolean')
          );
        });
      if (bad) report(issues, 'invalid-rich', `Node '${n.id}' has invalid rich text`, n.id);
    }
    if (n.textAlign !== undefined && !(TEXT_ALIGNS as readonly string[]).includes(n.textAlign)) {
      report(issues, 'invalid-align', `Node '${n.id}' has invalid textAlign '${String(n.textAlign)}'`, n.id);
    }
    if (n.fontScale !== undefined && !(FONT_SCALES as readonly string[]).includes(n.fontScale)) {
      report(issues, 'invalid-font-scale', `Node '${n.id}' has invalid fontScale '${String(n.fontScale)}'`, n.id);
    }
    if (n.image !== undefined && (typeof n.image !== 'string' || !(IMAGE_REF.test(n.image) || LIBRARY_IMAGE_REF.test(n.image)))) {
      report(issues, 'invalid-image', `Node '${n.id}' has invalid image ref '${String(n.image)}'`, n.id);
    }
    if (n.shape !== undefined && (typeof n.shape !== 'string' || !(IMAGE_REF.test(n.shape) || LIBRARY_IMAGE_REF.test(n.shape)))) {
      report(issues, 'invalid-shape', `Node '${n.id}' has invalid shape ref '${String(n.shape)}'`, n.id);
    }
    if (n.link !== undefined && (typeof n.link !== 'string' || n.link.trim() === '')) {
      report(issues, 'invalid-link', `Node '${n.id}' has invalid link`, n.id);
    }
    if (n.key !== undefined) {
      if (typeof n.key !== 'string' || !KEY_PATTERN.test(n.key)) {
        report(issues, 'invalid-key', `Node '${n.id}' has invalid key '${String(n.key)}'`, n.id);
      } else if (keys.has(n.key)) {
        report(issues, 'duplicate-key', `Nodes '${keys.get(n.key) ?? ''}' and '${n.id}' share key '${n.key}' in one diagram`, n.id);
      } else {
        keys.set(n.key, n.id);
      }
    }
    if (n.include !== undefined && (typeof n.include !== 'string' || n.include === '')) {
      report(issues, 'invalid-include', `Node '${n.id}' has invalid include '${String(n.include)}'`, n.id);
    }
    if (n.includePlane !== undefined) {
      if (typeof n.includePlane !== 'string' || n.includePlane === '') {
        report(issues, 'invalid-include', `Node '${n.id}' has invalid includePlane '${String(n.includePlane)}'`, n.id);
      } else if (n.include === undefined) {
        report(issues, 'invalid-include', `Node '${n.id}' has includePlane without include`, n.id);
      }
    }
    if (n.includePlanes !== undefined) {
      if (typeof n.includePlanes !== 'boolean') {
        report(issues, 'invalid-include', `Node '${n.id}' has invalid includePlanes '${String(n.includePlanes)}'`, n.id);
      } else if (n.include === undefined) {
        report(issues, 'invalid-include', `Node '${n.id}' has includePlanes without include`, n.id);
      }
    }
    // node.plane must reference a declared plane; node.layer a declared layer
    if (n.plane !== undefined && !ctx.planeIds.has(n.plane)) {
      report(issues, 'unknown-plane', `Node '${n.id}' belongs to unknown plane '${n.plane}'`, n.id);
    }
    if (n.layer !== undefined && !ctx.layerIds.has(n.layer)) {
      report(issues, 'unknown-layer', `Node '${n.id}' references unknown layer '${n.layer}'`, n.id);
    }
    if (n.columns !== undefined) {
      if (!Array.isArray(n.columns)) {
        report(issues, 'duplicate-column', `Node '${n.id}' columns must be a list`, n.id);
      } else {
        const seen = new Set<string>();
        for (const c of n.columns) {
          if (c === null || typeof c !== 'object' || typeof (c as { name?: unknown }).name !== 'string') {
            report(issues, 'duplicate-column', `Node '${n.id}' has an invalid column`, n.id);
            continue;
          }
          if (seen.has(c.name)) {
            report(issues, 'duplicate-column', `Node '${n.id}' has duplicate column '${c.name}'`, n.id);
          }
          seen.add(c.name);
        }
      }
    }
  }
}

/** Duplicate layer ids, and `layerRules` that name a layer nobody declared (a
 * rule is the one place a layer can be referenced without a node or relation
 * carrying it, so it is checked here, right after the layers are known). */
function validateLayers(ctx: Ctx): void {
  const { m, issues, layerIds } = ctx;
  for (const l of m.layers) {
    if (layerIds.has(l.id)) report(issues, 'duplicate-layer', `Duplicate layer id '${l.id}'`, l.id);
    layerIds.add(l.id);
  }
  (m.layerRules ?? []).forEach((rule, i) => {
    if (!layerIds.has(rule.layer)) {
      report(issues, 'unknown-layer', `layerRules[${i}] references unknown layer '${rule.layer}'`);
    }
  });
}

/** Plane declarations: duplicate ids, notation, containmentOf borrowing (unknown
 * target or chained borrow), and per-plane layer presets referencing a layer. */
function validatePlanes(ctx: Ctx): void {
  const { issues, planeIds, layerIds, planes } = ctx;
  for (const p of planes) {
    if (planeIds.has(p.id)) report(issues, 'duplicate-plane', `Duplicate plane id '${p.id}'`, p.id);
    planeIds.add(p.id);
  }
  for (const p of planes) {
    if (
      p.notation !== undefined &&
      (typeof p.notation !== 'string' || !(BUILTIN_NOTATIONS as readonly string[]).includes(p.notation))
    ) {
      report(issues, 'unknown-notation', `Plane '${p.id}' has unknown notation '${String(p.notation)}'`, p.id);
    }
    if (p.containmentOf !== undefined) {
      const target = planes.find((t) => t.id === p.containmentOf);
      if (target === undefined) {
        report(issues, 'unknown-plane', `Plane '${p.id}' borrows containment from unknown plane '${p.containmentOf}'`, p.id);
      } else if (target.containmentOf !== undefined) {
        report(
          issues,
          'invalid-plane',
          `Plane '${p.id}' borrows containment from '${p.containmentOf}', which itself borrows — chains are not allowed`,
          p.id,
        );
      }
    }
    for (const layer of p.layers ?? []) {
      if (!layerIds.has(layer)) {
        report(issues, 'unknown-layer', `Plane '${p.id}' references unknown layer '${layer}'`, p.id);
      }
    }
  }
}

/** plane.hides and plane.hidesTree must reference existing, shared nodes. */
function validatePlaneHides(ctx: Ctx): void {
  const { m, issues, nodeIds, planes } = ctx;
  const scopedPlaneOf = new Map(m.nodes.map((n) => [n.id, n.plane]));
  for (const p of planes) {
    for (const id of [...(p.hides ?? []), ...(p.hidesTree ?? [])]) {
      if (!nodeIds.has(id)) {
        report(issues, 'unknown-hidden-node', `Plane '${p.id}' hides unknown node '${id}'`, p.id);
      } else if (scopedPlaneOf.get(id) !== undefined) {
        report(issues, 'redundant-hide', `Plane '${p.id}' hides node '${id}', which is already scoped to a plane`, p.id);
      }
    }
  }
}

/** Containment edges: endpoints must exist; a plane-tagged edge must reference a
 * declared plane (and there must be planes at all). */
function validateContainment(ctx: Ctx): void {
  const { m, issues, nodeIds, planeIds, planes } = ctx;
  for (const e of m.containment) {
    for (const end of [e.parent, e.child]) {
      if (!nodeIds.has(end)) {
        report(issues, 'dangling-endpoint', `Containment references unknown node '${end}'`, end);
      }
    }
    if (e.plane !== undefined) {
      if (planes.length === 0) {
        report(
          issues,
          'unknown-plane',
          `Containment '${e.parent}'>'${e.child}' is tagged with plane '${e.plane}' but no planes are declared`,
          e.plane,
        );
      } else if (!planeIds.has(e.plane)) {
        report(issues, 'unknown-plane', `Containment '${e.parent}'>'${e.child}' references unknown plane '${e.plane}'`, e.plane);
      }
    }
  }
}

/** Relations: duplicate ids, endpoints, layer refs, polarity/delay types, labels,
 * per-relation style overrides, and FK column references. */
function validateRelations(ctx: Ctx): void {
  const { m, issues, nodeIds, layerIds } = ctx;
  const relationIds = new Set<string>();
  for (const r of m.relations) {
    if (relationIds.has(r.id)) report(issues, 'duplicate-relation', `Duplicate relation id '${r.id}'`, r.id);
    relationIds.add(r.id);
    for (const end of [r.from, r.to]) {
      if (!nodeIds.has(end)) {
        report(issues, 'dangling-endpoint', `Relation '${r.id}' references unknown node '${end}'`, r.id);
      }
    }
    if (r.layer !== undefined && !layerIds.has(r.layer)) {
      report(issues, 'unknown-layer', `Relation '${r.id}' references unknown layer '${r.layer}'`, r.id);
    }
    if (r.polarity !== undefined && r.polarity !== '+' && r.polarity !== '-') {
      report(issues, 'invalid-polarity', `Relation '${r.id}' has invalid polarity '${String(r.polarity)}'`, r.id);
    }
    if (r.delay !== undefined && typeof r.delay !== 'boolean') {
      report(issues, 'invalid-delay', `Relation '${r.id}' has invalid delay '${String(r.delay)}'`, r.id);
    }
    if (r.labels !== undefined) {
      const badLabel = (what: string) =>
        report(issues, 'invalid-edge-label', `Relation '${r.id}' has invalid label ${what}`, r.id);
      if (!Array.isArray(r.labels)) badLabel('list');
      else
        for (const [i, lb] of r.labels.entries()) {
          if (typeof lb?.text !== 'string') badLabel(`text at ${i}`);
          if (lb?.t !== undefined && !(typeof lb.t === 'number' && Number.isFinite(lb.t) && lb.t >= 0 && lb.t <= 1))
            badLabel(`t at ${i}`);
          if (lb?.side !== undefined && !(EDGE_LABEL_SIDES as readonly string[]).includes(lb.side)) badLabel(`side at ${i}`);
        }
    }
    if (r.style !== undefined) {
      const s = r.style;
      const bad = (what: string) =>
        report(issues, 'invalid-style', `Relation '${r.id}' has invalid style ${what}`, r.id);
      if (s.shape !== undefined && !(RELATION_SHAPES as readonly string[]).includes(s.shape)) bad(`shape '${String(s.shape)}'`);
      if (s.line !== undefined && !(RELATION_LINES as readonly string[]).includes(s.line)) bad(`line '${String(s.line)}'`);
      if (s.end !== undefined && !(RELATION_MARKERS as readonly string[]).includes(s.end)) bad(`end '${String(s.end)}'`);
      for (const [key, v] of [['fromSide', s.fromSide], ['toSide', s.toSide]] as const) {
        if (v !== undefined && !(SIDES as readonly string[]).includes(v)) bad(`${key} '${String(v)}'`);
      }
      if (s.width !== undefined && !(typeof s.width === 'number' && Number.isFinite(s.width) && s.width > 0))
        bad(`width '${String(s.width)}'`);
      if (
        s.curvature !== undefined &&
        !(typeof s.curvature === 'number' && Number.isFinite(s.curvature) && s.curvature > 0)
      )
        bad(`curvature '${String(s.curvature)}'`);
      if (s.color !== undefined && typeof s.color !== 'string') bad(`color '${String(s.color)}'`);
      if (s.animated !== undefined && typeof s.animated !== 'boolean') bad(`animated '${String(s.animated)}'`);
    }
    const colsOf = (id: string) => m.nodes.find((n) => n.id === id)?.columns ?? [];
    if (r.fromColumn !== undefined && !colsOf(r.from).some((c) => c.name === r.fromColumn)) {
      report(issues, 'unknown-column', `Relation '${r.id}' fromColumn '${r.fromColumn}' is not a column of '${r.from}'`, r.id);
    }
    if (r.toColumn !== undefined && !colsOf(r.to).some((c) => c.name === r.toColumn)) {
      report(issues, 'unknown-column', `Relation '${r.id}' toColumn '${r.toColumn}' is not a column of '${r.to}'`, r.id);
    }
  }
}

/** `threats` is a generic field (any notation): each entry is checked for shape
 * wherever it appears, one issue per fault, the element as `ref`. */
function validateThreats(ctx: Ctx): void {
  const { issues, m } = ctx;
  const check = (ref: string, threats: unknown): void => {
    if (threats === undefined) return;
    // Shape before contents: a hand-edited file can put anything here, and the
    // derivations read it unguarded (threatSummary calls `.filter` on it), so a
    // wrong shape is an issue rather than something to skip past. One issue for
    // the element — the per-field checks below would only add noise about
    // entries that are not threats at all.
    if (!Array.isArray(threats) || threats.some((t) => t === null || typeof t !== 'object')) {
      report(issues, 'invalid-threats', `'threats' on '${ref}' must be a list of threats`, ref);
      return;
    }
    const seen = new Set<string>();
    for (const t of threats as Record<string, unknown>[]) {
      const id = t.id;
      if (typeof id !== 'string' || id === '') report(issues, 'threat-id', `A threat on '${ref}' has no id`, ref);
      else if (seen.has(id)) report(issues, 'threat-id', `Threat id '${id}' repeats on '${ref}'`, ref);
      else seen.add(id);
      if (!(STRIDE as readonly unknown[]).includes(t.category)) report(issues, 'threat-category', `Threat '${String(id)}' on '${ref}': category must be one of ${STRIDE.join(', ')}`, ref);
      if (typeof t.title !== 'string' || t.title === '') report(issues, 'threat-title', `Threat '${String(id)}' on '${ref}' has no title`, ref);
      if (t.status !== undefined && !(THREAT_STATUSES as readonly unknown[]).includes(t.status)) report(issues, 'threat-status', `Threat '${String(id)}' on '${ref}': status must be one of ${THREAT_STATUSES.join(', ')}`, ref);
      if (t.severity !== undefined && !(THREAT_SEVERITIES as readonly unknown[]).includes(t.severity)) report(issues, 'threat-severity', `Threat '${String(id)}' on '${ref}': severity must be one of ${THREAT_SEVERITIES.join(', ')}`, ref);
    }
  };
  for (const n of m.nodes) check(n.id, n.threats);
  for (const r of m.relations) check(r.id, r.threats);
}

/** `comments` (nodes and relations) and `links` (nodes) are generic fields:
 * checked for shape wherever they appear, the element as `ref` — the same
 * contract as validateThreats, for the same reason (the bubble reads them
 * unguarded). */
function validateComments(ctx: Ctx): void {
  const { issues, m } = ctx;
  const comments = (ref: string, list: unknown): void => {
    if (list === undefined) return;
    if (!Array.isArray(list) || list.some((c) => c === null || typeof c !== 'object')) {
      report(issues, 'invalid-comments', `'comments' on '${ref}' must be a list of comments`, ref);
      return;
    }
    const seen = new Set<string>();
    for (const c of list as Record<string, unknown>[]) {
      const id = c.id;
      if (typeof id !== 'string' || id === '') report(issues, 'comment-id', `A comment on '${ref}' has no id`, ref);
      else if (seen.has(id)) report(issues, 'comment-id', `Comment id '${id}' repeats on '${ref}'`, ref);
      else seen.add(id);
      if (typeof c.text !== 'string' || c.text === '') report(issues, 'comment-text', `Comment '${String(id)}' on '${ref}' has no text`, ref);
      if (c.at !== undefined && !isIsoDate(c.at)) report(issues, 'comment-at', `Comment '${String(id)}' on '${ref}': 'at' must be a YYYY-MM-DD date`, ref);
    }
  };
  const links = (ref: string, list: unknown): void => {
    if (list === undefined) return;
    if (!Array.isArray(list) || list.some((l) => l === null || typeof l !== 'object')) {
      report(issues, 'invalid-links', `'links' on '${ref}' must be a list of { label, url }`, ref);
      return;
    }
    for (const l of list as Record<string, unknown>[]) {
      if (typeof l.label !== 'string' || l.label === '' || typeof l.url !== 'string' || l.url === '')
        report(issues, 'invalid-links', `A link on '${ref}' needs a non-empty label and url`, ref);
    }
  };
  for (const n of m.nodes) {
    comments(n.id, n.comments);
    links(n.id, n.links);
  }
  for (const r of m.relations) comments(r.id, r.comments);
}

/** Containment cycles are checked per plane — an edge pair spanning two planes
 * is legal. Emits one `containment-cycle` issue per offending plane. */
function validateCycles(ctx: Ctx): void {
  const { m, issues, planes } = ctx;
  const defaultPlane = planes[0]?.id;
  const byPlane = new Map<string | undefined, DiagramModel['containment']>();
  for (const e of m.containment) {
    const key = e.plane ?? defaultPlane;
    byPlane.set(key, [...(byPlane.get(key) ?? []), e]);
  }
  for (const [plane, edges] of byPlane) {
    const cycle = findContainmentCycle(edges);
    if (cycle) {
      report(
        issues,
        'containment-cycle',
        `Containment cycle${plane !== undefined ? ` in plane '${plane}'` : ''}: ${cycle.join(' -> ')}`,
        cycle[0],
      );
    }
  }
}

/**
 * Git-graph conventions, applied wherever RENDERING would activate the git
 * profile — the same resolution `activeNotation` (view/compile.ts) uses: a
 * plane's own `notation` wins, otherwise the model-level `notation` applies.
 * That includes the zero-plane case (a model-level 'git-graph' with no planes
 * at all validates the whole, planeless model the way `gitLayout` draws it).
 * The layout never throws on a malformed graph — it cuts cycles and parks
 * strays — but an author should hear about it, so each convention is an issue
 * here. Rules read the FIRST plane whose EFFECTIVE notation is git; several
 * git planes per model is deferred.
 */
function validateGit(ctx: Ctx): void {
  const { issues, m } = ctx;
  const plane = ctx.planes.find((p) => (p.notation ?? m.notation) === GIT_NOTATION);
  const modelLevel = plane === undefined && ctx.planes.length === 0 && m.notation === GIT_NOTATION;
  if (plane === undefined && !modelLevel) return;
  const g = gitGraph(m, plane?.id);
  const typeOf = new Map(m.nodes.map((n) => [n.id, n.type]));
  const isCommit = (id: string): boolean => typeOf.get(id) === 'commit';
  const parents = new Map<string, { commit: number; branch: number }>();
  for (const r of m.relations) {
    if (!isGitKind(r.kind)) continue;
    // dangling endpoints are validateRelations' finding — don't double-report
    if (!ctx.nodeIds.has(r.from) || !ctx.nodeIds.has(r.to)) continue;
    if (!isCommit(r.from) || !isCommit(r.to)) {
      report(issues, 'git-link-endpoints', `Relation '${r.id}' (${r.kind}) must join two commit nodes`, r.id);
      continue;
    }
    const a = g.laneOf.get(r.from);
    const b = g.laneOf.get(r.to);
    if (a === undefined || b === undefined) continue; // reported per commit below
    const sameLane = a === b;
    if (r.kind === 'commit' && !sameLane) {
      report(issues, 'git-commit-lane', `Relation '${r.id}' (commit) must stay within one lane`, r.id);
      continue; // an out-of-lane link isn't a valid parent edge — don't also flag it as a git-parents conflict
    }
    if (r.kind !== 'commit' && sameLane) {
      report(issues, 'git-commit-lane', `Relation '${r.id}' (${r.kind}) must join commits of different lanes`, r.id);
      continue; // ditto
    }
    if (r.kind !== 'merge') {
      const p = parents.get(r.to) ?? { commit: 0, branch: 0 };
      p[r.kind] += 1;
      parents.set(r.to, p);
    }
  }
  for (const [id, p] of parents) {
    if (p.commit > 1) report(issues, 'git-parents', `Commit '${id}' has more than one incoming commit link`, id);
    if (p.branch > 1) report(issues, 'git-parents', `Commit '${id}' has more than one incoming branch link`, id);
  }
  const cut = g.cycleEdges[0];
  if (cut !== undefined) report(issues, 'git-cycle', `Git links form a cycle (cut at relation '${cut}')`, cut);
  for (const s of g.strays) {
    report(
      issues,
      'git-commit-outside-lane',
      `Commit '${s.id}' is not contained by a branch${plane !== undefined ? ` on plane '${plane.id}'` : ''}`,
      s.id,
    );
  }
  for (const n of m.nodes) {
    if (n.type !== GIT_STAGE_TYPE) continue;
    const from = stageCommit(n, 'from');
    if (from === undefined) {
      report(issues, 'git-stage-span', `Stage '${n.id}' names no 'from' commit in its metadata`, n.id);
      continue;
    }
    for (const id of [from, stageCommit(n, 'to')]) {
      if (id !== undefined && !isCommit(id)) report(issues, 'git-stage-span', `Stage '${n.id}' spans '${id}', which is not a commit`, n.id);
    }
  }
  for (const n of m.nodes) {
    if (n.type !== 'commit') continue;
    const raw = n.metadata?.['gap'];
    if (raw === undefined) continue;
    const ok = (typeof raw === 'number' && Number.isInteger(raw) && raw >= 0) || (typeof raw === 'string' && /^\d+$/.test(raw));
    if (!ok) report(issues, 'git-gap', `Commit '${n.id}' has invalid gap '${String(raw)}'`, n.id);
  }
}

/**
 * Activity-diagram structure, keyed purely on node types — no plane or
 * notation involvement (activity frames are ordinary vocabulary; several can
 * share a canvas). Deliberately minimal: the studio save API rejects invalid
 * models, so no rule here may make a normal editing sequence unsaveable —
 * loose leaf elements (palette drops not yet homed) are legal.
 */
function validateActivity(ctx: Ctx): void {
  const { issues, m } = ctx;
  const typeOf = new Map(m.nodes.map((n) => [n.id, n.type]));
  const parentsOf = new Map<string, string[]>();
  for (const e of m.containment) {
    // dangling ids are validateContainment's finding — don't double-report
    if (!ctx.nodeIds.has(e.parent) || !ctx.nodeIds.has(e.child)) continue;
    if (typeOf.get(e.parent) === 'activity-frame' && typeOf.get(e.child) !== 'activity-lane') {
      report(issues, 'activity-frame-children', `Activity frame '${e.parent}' may contain only lanes; '${e.child}' is not an activity-lane`, e.child);
    }
    const ct = typeOf.get(e.child);
    if (ct === 'activity-lane' || ct === 'activity-region') {
      parentsOf.set(e.child, [...(parentsOf.get(e.child) ?? []), e.parent]);
    }
  }
  for (const n of m.nodes) {
    if (n.type === 'activity-lane') {
      const ps = parentsOf.get(n.id) ?? [];
      if (ps.length === 0) {
        report(issues, 'activity-lane-parent', `Activity lane '${n.id}' must be contained by an activity-frame`, n.id);
      }
      for (const p of ps) {
        if (typeOf.get(p) !== 'activity-frame') {
          report(issues, 'activity-lane-parent', `Activity lane '${n.id}' has non-frame parent '${p}'`, n.id);
        }
      }
    } else if (n.type === 'activity-region') {
      // a loose region is legal (mid-edit); only a WRONG parent is a defect
      for (const p of parentsOf.get(n.id) ?? []) {
        if (typeOf.get(p) !== 'activity-lane') {
          report(issues, 'activity-region-parent', `Interruptible region '${n.id}' must sit inside a lane; parent '${p}' is not an activity-lane`, n.id);
        }
      }
    }
  }
}

/** Every containment edge on the active plane whose child is one of `ids` gets ONE
 * issue (`code`, `message(child, parent)`): the notation's arrangement and a group
 * want the same rectangle, so nothing in `ids` may be grouped. Untagged containment
 * belongs to the default plane. */
function reportContained(ctx: Ctx, plane: DiagramPlane | undefined, ids: ReadonlySet<string>, code: Code, message: (child: string, parent: string) => string): void {
  const { issues, m } = ctx;
  const defaultPlane = ctx.planes[0]?.id;
  const active = plane?.id ?? defaultPlane;
  const reported = new Set<string>();
  for (const e of m.containment) {
    if ((e.plane ?? defaultPlane) !== active || !ids.has(e.child) || reported.has(e.child)) continue;
    reported.add(e.child);
    report(issues, code, message(e.child, e.parent), e.child);
  }
}

/**
 * Second-order conventions, applied wherever RENDERING would activate the
 * profile — the same plane pick as validateGit: a plane's own `notation` wins,
 * otherwise the model-level one; the FIRST such plane is the one read.
 * The derivation never throws on a malformed graph, so each convention an
 * author should hear about is an issue here.
 */
function validateSecondOrder(ctx: Ctx): void {
  const { issues, m } = ctx;
  const plane = ctx.planes.find((p) => (p.notation ?? m.notation) === SECOND_ORDER_NOTATION);
  const modelLevel = plane === undefined && ctx.planes.length === 0 && m.notation === SECOND_ORDER_NOTATION;
  if (plane === undefined && !modelLevel) return;

  const soIds = new Set(m.nodes.filter(isSecondOrderNode).map((n) => n.id));
  // An empty diagram — or one holding only non-second-order nodes, e.g. a
  // stray comment — is where every second-order diagram starts, and the
  // studio never opens a model that already has issues: this must wait for
  // there to be a second-order node to judge before it can want a decision
  // among them.
  if (soIds.size > 0 && !m.nodes.some((n) => n.type === SO_DECISION_TYPE)) {
    report(issues, 'so-no-decision', 'A second-order diagram needs at least one decision (a node of type so-decision)', plane?.id ?? m.id);
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
  reportContained(
    ctx,
    plane,
    soIds,
    'so-contained',
    (child, parent) => `'${child}' sits inside '${parent}'; decisions and consequences cannot be grouped in a second-order diagram`,
  );
}

/**
 * Fishbone conventions, applied wherever RENDERING would activate the profile —
 * the same plane pick as validateGit. The tree derivation never throws and
 * simply leaves a malformed node off the fish; here each such node gets ONE
 * issue naming why, in this order: its own parent has the wrong type for it
 * (`fb-misplaced`); it hangs on a sub-cause (`fb-too-deep`); its chain never
 * reaches the effect (`fb-unattached`). A cause under a misplaced category is
 * therefore unattached, and the category is the misplaced one.
 */
function validateFishbone(ctx: Ctx): void {
  const { issues, m } = ctx;
  const plane = ctx.planes.find((p) => (p.notation ?? m.notation) === FISHBONE_NOTATION);
  const modelLevel = plane === undefined && ctx.planes.length === 0 && m.notation === FISHBONE_NOTATION;
  if (plane === undefined && !modelLevel) return;

  const fb = m.nodes.filter(isFishboneNode);
  // An empty diagram — or one holding only a stray comment — is where every
  // fishbone diagram starts, and the studio never opens a model that already
  // has issues: the head is only wanted once there is something to hang on it.
  if (fb.length === 0) return;
  const effects = fb.filter((n) => n.type === FB_EFFECT_TYPE);
  if (effects.length === 0) {
    report(issues, 'fb-no-effect', 'A fishbone diagram needs an effect (a node of type fb-effect) at its head', plane?.id ?? m.id);
  }
  for (const extra of effects.slice(1)) {
    report(issues, 'fb-many-effects', `'${extra.id}' is a second effect; a fishbone diagram has one head`, extra.id);
  }

  // The same parent pick fishboneTree makes — shared, so the rule can't drift between the two.
  const typeOf = new Map(fb.map((n) => [n.id, n.type]));
  const parentOf = fishboneParents(m);
  const tree = fishboneTree(m);
  const onFish = new Set<string>(tree.effect !== undefined ? [tree.effect] : []);
  const subIds = new Set<string>();
  for (const c of tree.categories) {
    onFish.add(c.id);
    for (const cause of c.causes) {
      onFish.add(cause.id);
      for (const s of cause.subs) {
        onFish.add(s);
        subIds.add(s);
      }
    }
  }
  for (const n of fb) {
    const parent = parentOf.get(n.id);
    if (n.type === FB_EFFECT_TYPE) {
      if (n.id === tree.effect && parent !== undefined) {
        report(issues, 'fb-misplaced', `'${n.id}' is the effect and hangs on '${parent}'; the effect is the head, nothing explains it`, n.id);
      }
      continue;
    }
    if (onFish.has(n.id)) continue;
    const parentType = parent !== undefined ? typeOf.get(parent) : undefined;
    if (n.type === FB_CATEGORY_TYPE && parent !== undefined && parentType !== FB_EFFECT_TYPE) {
      report(issues, 'fb-misplaced', `Category '${n.id}' hangs on '${parent}'; a category hangs on the effect`, n.id);
    } else if (n.type === FB_CAUSE_TYPE && parentType === FB_EFFECT_TYPE) {
      report(issues, 'fb-misplaced', `Cause '${n.id}' hangs on the effect; a cause hangs on a category or on another cause`, n.id);
    } else if (n.type === FB_CAUSE_TYPE && parent !== undefined && subIds.has(parent)) {
      report(issues, 'fb-too-deep', `'${n.id}' hangs on the sub-cause '${parent}'; three levels below the effect is the limit`, n.id);
    } else {
      report(issues, 'fb-unattached', `'${n.id}' does not reach the effect`, n.id);
    }
  }
  // The fish and a group want the same rectangle.
  const fbIds = new Set(fb.map((n) => n.id));
  reportContained(ctx, plane, fbIds, 'fb-contained', (child, parent) => `'${child}' sits inside '${parent}'; nothing on a fishbone diagram can be grouped`);
}

/**
 * Threat-model conventions, applied wherever RENDERING would activate the
 * notation (a plane's, or the model's with no planes) — the same plane pick as
 * validateGit. Deliberately lax, as C4 is: boundaries nest, elements may hold
 * elements. The one structural rule is that a data flow connects elements,
 * never a boundary — a boundary is a line around things, and an arrow into it
 * says nothing.
 */
function validateThreatModel(ctx: Ctx): void {
  const { issues, m } = ctx;
  const plane = ctx.planes.find((p) => (p.notation ?? m.notation) === TM_NOTATION);
  const modelLevel = plane === undefined && ctx.planes.length === 0 && m.notation === TM_NOTATION;
  if (plane === undefined && !modelLevel) return;
  const boundaries = new Set(m.nodes.filter((n) => n.type === TM_BOUNDARY_TYPE).map((n) => n.id));
  for (const r of m.relations) {
    if (r.kind !== TM_FLOW_KIND) continue;
    const end = boundaries.has(r.from) ? r.from : boundaries.has(r.to) ? r.to : undefined;
    if (end !== undefined) report(issues, 'tm-flow-boundary', `Data flow '${r.id}' touches the trust boundary '${end}'; flows connect elements, a boundary only surrounds them`, r.id);
  }
}

export function validate(m: DiagramModel): ValidationIssue[] {
  const ctx: Ctx = {
    issues: [],
    m,
    planes: m.planes ?? [],
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
  validateGit(ctx);
  validateActivity(ctx);
  validateSecondOrder(ctx);
  validateFishbone(ctx);
  validateThreatModel(ctx);
  return ctx.issues;
}

function findContainmentCycle(edges: DiagramModel['containment']): string[] | null {
  const children = childrenOf(edges);
  const state = new Map<string, 'visiting' | 'done'>();
  const stack: string[] = [];

  function dfs(id: string): string[] | null {
    if (state.get(id) === 'done') return null;
    if (state.get(id) === 'visiting') {
      const start = stack.indexOf(id);
      return [...stack.slice(start), id];
    }
    state.set(id, 'visiting');
    stack.push(id);
    for (const c of children.get(id) ?? []) {
      const found = dfs(c);
      if (found) return found;
    }
    stack.pop();
    state.set(id, 'done');
    return null;
  }

  for (const parent of children.keys()) {
    const found = dfs(parent);
    if (found) return found;
  }
  return null;
}

/** Legend checks. Registry ids (`item.type` / `item.kind`) are deliberately NOT
 * validated — unknown ids are legal everywhere else and fall back silently. */
function validateLegend(ctx: Ctx): void {
  const { m, issues } = ctx;
  const l = m.legend;
  if (l === undefined) return;
  if (typeof l !== 'object' || Array.isArray(l)) {
    issues.push({ code: 'invalid-legend', message: 'Legend must be an object' });
    return;
  }
  if (l.title !== undefined && (typeof l.title !== 'string' || l.title === '')) {
    issues.push({ code: 'invalid-legend', message: `Legend has invalid title '${String(l.title)}'` });
  }
  if (l.position !== undefined && !(LEGEND_POSITIONS as readonly string[]).includes(l.position)) {
    issues.push({ code: 'invalid-legend', message: `Legend has unknown position '${String(l.position)}'` });
  }
  if (l.show !== undefined) {
    if (!Array.isArray(l.show)) {
      issues.push({ code: 'invalid-legend', message: 'Legend show must be a list' });
    } else {
      for (const s of l.show) {
        if (!(LEGEND_SECTIONS as readonly string[]).includes(s)) {
          issues.push({ code: 'invalid-legend', message: `Legend has unknown section '${String(s)}'` });
        }
      }
    }
  }
  if (l.items !== undefined) {
    if (!Array.isArray(l.items)) {
      issues.push({ code: 'invalid-legend', message: 'Legend items must be a list' });
      return;
    }
    l.items.forEach((item, i) => {
      if (item === null || typeof item !== 'object') {
        issues.push({ code: 'invalid-legend', message: `Legend item ${i} must be an object` });
        return;
      }
      if (typeof item.label !== 'string' || item.label === '') {
        issues.push({ code: 'invalid-legend', message: `Legend item ${i} needs a non-empty label` });
      }
      if (item.color !== undefined && typeof item.color !== 'string') {
        issues.push({ code: 'invalid-legend', message: `Legend item ${i} has invalid color '${String(item.color)}'` });
      }
    });
  }
}
