import {
  BUILTIN_NOTATIONS,
  FONT_SCALES,
  LEGEND_POSITIONS,
  LEGEND_SECTIONS,
  RELATION_LINES,
  RELATION_MARKERS,
  RELATION_SHAPES,
  SIDES,
  TEXT_ALIGNS,
  type DiagramModel,
  type DiagramPlane,
  type TextRun,
} from './types';
import { childrenOf } from './children';
import { GIT_NOTATION, gitGraph, isGitKind } from './git';

export interface ValidationIssue {
  code:
    | 'duplicate-node'
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
    | 'git-gap';
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
 * intentionally legal — the renderer treats them as unpinned. */
function validateModelStyle(ctx: Ctx): void {
  const { m, issues } = ctx;
  if (m.style !== undefined && (typeof m.style !== 'string' || m.style === '')) {
    report(issues, 'invalid-style', 'Diagram style must be a non-empty string');
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
    if (n.color !== undefined && typeof n.color !== 'string') {
      report(issues, 'invalid-style', `Node '${n.id}' has invalid color '${String(n.color)}'`, n.id);
    }
    if (n.textColor !== undefined && typeof n.textColor !== 'string') {
      report(issues, 'invalid-style', `Node '${n.id}' has invalid textColor '${String(n.textColor)}'`, n.id);
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
          if (lb?.side !== undefined && !['top', 'bottom', 'center'].includes(lb.side)) badLabel(`side at ${i}`);
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
 * Git-graph conventions, applied only when a plane declares the notation. The
 * layout never throws on a malformed graph — it cuts cycles and parks strays —
 * but an author should hear about it, so each convention is an issue here. Rules
 * read the FIRST git plane; several git planes per model is deferred.
 */
function validateGit(ctx: Ctx): void {
  const { issues, m } = ctx;
  const plane = ctx.planes.find((p) => p.notation === GIT_NOTATION);
  if (plane === undefined) return;
  const g = gitGraph(m, plane.id);
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
    report(issues, 'git-commit-outside-lane', `Commit '${s.id}' is not contained by a branch on plane '${plane.id}'`, s.id);
  }
  for (const n of m.nodes) {
    if (n.type !== 'commit') continue;
    const raw = n.metadata?.['gap'];
    if (raw === undefined) continue;
    const ok = (typeof raw === 'number' && Number.isInteger(raw) && raw >= 0) || (typeof raw === 'string' && /^\d+$/.test(raw));
    if (!ok) report(issues, 'git-gap', `Commit '${n.id}' has invalid gap '${String(raw)}'`, n.id);
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
  validateCycles(ctx);
  validateGit(ctx);
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
