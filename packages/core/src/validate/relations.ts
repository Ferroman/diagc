import {
  EDGE_LABEL_SIDES,
  RELATION_LINES,
  RELATION_MARKERS,
  RELATION_SHAPES,
  SIDES,
  type DiagramRelation,
  type RelationStyle,
} from '../types';
import { report, type Ctx } from './context';

/** Relations: duplicate ids, endpoints, layer refs, polarity/delay types, labels,
 * per-relation style overrides, and FK column references. */
export function validateRelations(ctx: Ctx): void {
  const { m, issues } = ctx;
  const relationIds = new Set<string>();
  for (const r of m.relations) {
    if (relationIds.has(r.id)) report(issues, 'duplicate-relation', `Duplicate relation id '${r.id}'`, r.id);
    relationIds.add(r.id);
    checkRefsAndFlags(ctx, r);
    checkLabels(ctx, r);
    if (r.style !== undefined) {
      checkStyleChoices(ctx, r, r.style);
      checkStyleValues(ctx, r, r.style);
    }
    checkColumnRefs(ctx, r);
  }
}

/** endpoints and layer must exist; polarity and delay are typed */
function checkRefsAndFlags(ctx: Ctx, r: DiagramRelation): void {
  const { issues, nodeIds, layerIds } = ctx;
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
}

function checkLabels({ issues }: Ctx, r: DiagramRelation): void {
  if (r.labels === undefined) return;
  const badLabel = (what: string) =>
    report(issues, 'invalid-edge-label', `Relation '${r.id}' has invalid label ${what}`, r.id);
  if (!Array.isArray(r.labels)) badLabel('list');
  else
    for (const [i, lb] of r.labels.entries()) {
      if (typeof lb?.text !== 'string') badLabel(`text at ${i}`);
      if (lb?.t !== undefined && !(typeof lb.t === 'number' && Number.isFinite(lb.t) && lb.t >= 0 && lb.t <= 1))
        badLabel(`t at ${i}`);
      if (lb?.side !== undefined && !(EDGE_LABEL_SIDES as readonly string[]).includes(lb.side))
        badLabel(`side at ${i}`);
    }
}

const badStyle =
  ({ issues }: Ctx, r: DiagramRelation) =>
  (what: string): void =>
    report(issues, 'invalid-style', `Relation '${r.id}' has invalid style ${what}`, r.id);

/** the style fields that name one of a fixed set: shape, line, end marker, fixed sides */
function checkStyleChoices(ctx: Ctx, r: DiagramRelation, s: RelationStyle): void {
  const bad = badStyle(ctx, r);
  if (s.shape !== undefined && !(RELATION_SHAPES as readonly string[]).includes(s.shape))
    bad(`shape '${String(s.shape)}'`);
  if (s.line !== undefined && !(RELATION_LINES as readonly string[]).includes(s.line)) bad(`line '${String(s.line)}'`);
  if (s.end !== undefined && !(RELATION_MARKERS as readonly string[]).includes(s.end)) bad(`end '${String(s.end)}'`);
  for (const [key, v] of [
    ['fromSide', s.fromSide],
    ['toSide', s.toSide],
  ] as const) {
    if (v !== undefined && !(SIDES as readonly string[]).includes(v)) bad(`${key} '${String(v)}'`);
  }
}

/** the style fields that hold a value: width, curvature, color, animated */
function checkStyleValues(ctx: Ctx, r: DiagramRelation, s: RelationStyle): void {
  const bad = badStyle(ctx, r);
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

/** an FK's columns must be columns of the tables it joins */
function checkColumnRefs({ m, issues }: Ctx, r: DiagramRelation): void {
  const colsOf = (id: string) => m.nodes.find((n) => n.id === id)?.columns ?? [];
  if (r.fromColumn !== undefined && !colsOf(r.from).some((c) => c.name === r.fromColumn)) {
    report(
      issues,
      'unknown-column',
      `Relation '${r.id}' fromColumn '${r.fromColumn}' is not a column of '${r.from}'`,
      r.id,
    );
  }
  if (r.toColumn !== undefined && !colsOf(r.to).some((c) => c.name === r.toColumn)) {
    report(issues, 'unknown-column', `Relation '${r.id}' toColumn '${r.toColumn}' is not a column of '${r.to}'`, r.id);
  }
}
