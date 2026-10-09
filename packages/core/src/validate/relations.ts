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
  const { model, issues } = ctx;
  const relationIds = new Set<string>();
  for (const r of model.relations) {
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
function checkRefsAndFlags(ctx: Ctx, relation: DiagramRelation): void {
  const { issues, nodeIds, layerIds } = ctx;
  for (const end of [relation.from, relation.to]) {
    if (!nodeIds.has(end)) {
      report(issues, 'dangling-endpoint', `Relation '${relation.id}' references unknown node '${end}'`, relation.id);
    }
  }
  if (relation.layer !== undefined && !layerIds.has(relation.layer)) {
    report(
      issues,
      'unknown-layer',
      `Relation '${relation.id}' references unknown layer '${relation.layer}'`,
      relation.id,
    );
  }
  if (relation.polarity !== undefined && relation.polarity !== '+' && relation.polarity !== '-') {
    report(
      issues,
      'invalid-polarity',
      `Relation '${relation.id}' has invalid polarity '${String(relation.polarity)}'`,
      relation.id,
    );
  }
  if (relation.delay !== undefined && typeof relation.delay !== 'boolean') {
    report(
      issues,
      'invalid-delay',
      `Relation '${relation.id}' has invalid delay '${String(relation.delay)}'`,
      relation.id,
    );
  }
}

function checkLabels({ issues }: Ctx, relation: DiagramRelation): void {
  if (relation.labels === undefined) return;
  const badLabel = (what: string) =>
    report(issues, 'invalid-edge-label', `Relation '${relation.id}' has invalid label ${what}`, relation.id);
  if (!Array.isArray(relation.labels)) badLabel('list');
  else
    for (const [i, lb] of relation.labels.entries()) {
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
function checkStyleChoices(ctx: Ctx, relation: DiagramRelation, style: RelationStyle): void {
  const bad = badStyle(ctx, relation);
  if (style.shape !== undefined && !(RELATION_SHAPES as readonly string[]).includes(style.shape))
    bad(`shape '${String(style.shape)}'`);
  if (style.line !== undefined && !(RELATION_LINES as readonly string[]).includes(style.line))
    bad(`line '${String(style.line)}'`);
  if (style.end !== undefined && !(RELATION_MARKERS as readonly string[]).includes(style.end))
    bad(`end '${String(style.end)}'`);
  for (const [key, v] of [
    ['fromSide', style.fromSide],
    ['toSide', style.toSide],
  ] as const) {
    if (v !== undefined && !(SIDES as readonly string[]).includes(v)) bad(`${key} '${String(v)}'`);
  }
}

/** the style fields that hold a value: width, curvature, color, animated */
function checkStyleValues(ctx: Ctx, relation: DiagramRelation, style: RelationStyle): void {
  const bad = badStyle(ctx, relation);
  if (
    style.width !== undefined &&
    !(typeof style.width === 'number' && Number.isFinite(style.width) && style.width > 0)
  )
    bad(`width '${String(style.width)}'`);
  if (
    style.curvature !== undefined &&
    !(typeof style.curvature === 'number' && Number.isFinite(style.curvature) && style.curvature > 0)
  )
    bad(`curvature '${String(style.curvature)}'`);
  if (style.color !== undefined && typeof style.color !== 'string') bad(`color '${String(style.color)}'`);
  if (style.animated !== undefined && typeof style.animated !== 'boolean') bad(`animated '${String(style.animated)}'`);
}

/** an FK's columns must be columns of the tables it joins. A table whose
 * `columns` is malformed has its own issue; here it simply lacks the column. */
function checkColumnRefs({ model, issues }: Ctx, relation: DiagramRelation): void {
  const hasColumn = (id: string, name: string): boolean => {
    const columns: unknown = model.nodes.find((n) => n.id === id)?.columns;
    return (
      Array.isArray(columns) &&
      columns.some((c) => typeof c === 'object' && c !== null && (c as { name?: unknown }).name === name)
    );
  };
  if (relation.fromColumn !== undefined && !hasColumn(relation.from, relation.fromColumn)) {
    report(
      issues,
      'unknown-column',
      `Relation '${relation.id}' fromColumn '${relation.fromColumn}' is not a column of '${relation.from}'`,
      relation.id,
    );
  }
  if (relation.toColumn !== undefined && !hasColumn(relation.to, relation.toColumn)) {
    report(
      issues,
      'unknown-column',
      `Relation '${relation.id}' toColumn '${relation.toColumn}' is not a column of '${relation.to}'`,
      relation.id,
    );
  }
}
