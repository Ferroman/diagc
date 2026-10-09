import type { DiagramModel, EdgeLabel, Polarity, RelationStyle } from '../types';
import { CommandError } from '../command-error';
import { applyNullable, requireNode } from './shared';

export interface RelationOptsInput {
  kind: string;
  label?: string;
  layer?: string;
  description?: string;
  style?: RelationStyle;
  polarity?: Polarity;
  delay?: boolean;
  fromColumn?: string;
  toColumn?: string;
}

export function addRelation(
  m: DiagramModel,
  from: string,
  to: string,
  opts: RelationOptsInput,
): { model: DiagramModel; id: string } {
  requireNode(m, from);
  requireNode(m, to);
  if (opts.layer !== undefined && !m.layers.some((l) => l.id === opts.layer)) {
    throw new CommandError(`Unknown layer '${opts.layer}'`);
  }
  // First free suffix — counting existing pairs collides after a middle delete
  // (delete `a->b#0`, then adding again would reuse `#1`).
  let i = 0;
  while (m.relations.some((r) => r.id === `${from}->${to}#${i}`)) i++;
  const id = `${from}->${to}#${i}`;
  const { kind, ...rest } = opts;
  const relation = {
    id,
    from,
    to,
    kind,
    ...Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)),
  };
  return { model: { ...m, relations: [...m.relations, relation] }, id };
}

export interface RelationPatch {
  /** move an endpoint (edge reconnection); the relation id is unchanged */
  from?: string;
  to?: string;
  kind?: string;
  label?: string | null;
  labels?: EdgeLabel[] | null;
  layer?: string | null;
  description?: string | null;
  style?: RelationStyle | null;
  polarity?: Polarity | null;
  delay?: boolean | null;
  fromColumn?: string | null;
  toColumn?: string | null;
}

/** Whitelist of {@link RelationPatch} fields that are null-clearable and applied
 * through the loop below. `from`/`to`/`kind` are excluded — they are required
 * relation keys set with a plain `!== undefined` guard, never null-cleared. */
const RELATION_NULLABLE_KEYS = [
  'label',
  'labels',
  'layer',
  'description',
  'style',
  'polarity',
  'delay',
  'fromColumn',
  'toColumn',
] as const;
type RelationNullableKey = (typeof RELATION_NULLABLE_KEYS)[number];

// Same exhaustive-coverage guard as NodeDetails: a new null-clearable field on
// RelationPatch must be listed here or this const becomes `false` and fails to
// compile (the non-nullable `from`/`to`/`kind` are intentionally excluded).
type RelationNullableKeys = Exclude<keyof RelationPatch, 'from' | 'to' | 'kind'>;
type RelationKeyCoverage = [RelationNullableKeys] extends [RelationNullableKey]
  ? [RelationNullableKey] extends [RelationNullableKeys]
    ? true
    : false
  : false;
const _assertRelationKeyCoverage: RelationKeyCoverage = true;
void _assertRelationKeyCoverage;

export function updateRelation(m: DiagramModel, id: string, patch: RelationPatch): DiagramModel {
  if (!m.relations.some((r) => r.id === id)) throw new CommandError(`Unknown relation '${id}'`);
  if (patch.layer != null && !m.layers.some((l) => l.id === patch.layer)) {
    throw new CommandError(`Unknown layer '${patch.layer}'`);
  }
  for (const end of [patch.from, patch.to]) {
    if (end !== undefined && !m.nodes.some((n) => n.id === end)) {
      throw new CommandError(`Unknown node '${end}'`);
    }
  }
  return {
    ...m,
    relations: m.relations.map((r) => {
      if (r.id !== id) return r;
      let next = { ...r };
      if (patch.from !== undefined) next.from = patch.from;
      if (patch.to !== undefined) next.to = patch.to;
      if (patch.kind !== undefined) next.kind = patch.kind;
      // The null-clearable fields go through one typed loop over the whitelist
      // (see RELATION_NULLABLE_KEYS), preserving the same behavior as the prior
      // hand-written chain.
      for (const key of RELATION_NULLABLE_KEYS) {
        next = applyNullable(next, key, patch[key]);
      }
      // `labels` supersedes the legacy single `label`: any labels write drops the
      // legacy string, so removing the last label truly removes it (relationLabels
      // won't re-synthesize) and upgraded models don't persist a redundant `label`.
      if (patch.labels !== undefined) next = applyNullable(next, 'label', null);
      return next;
    }),
  };
}

export function deleteRelation(m: DiagramModel, id: string): DiagramModel {
  if (!m.relations.some((r) => r.id === id)) throw new CommandError(`Unknown relation '${id}'`);
  return { ...m, relations: m.relations.filter((r) => r.id !== id) };
}
