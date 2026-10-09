import type { Comment, DiagramModel, StrideCategory, Threat, ThreatSeverity, ThreatStatus } from '../types';
import { isIsoDate } from '../dates';
import { isNodeRef, type ElementRef } from '../elements';
import { CommandError } from '../command-error';
import { applyNullable } from './shared';

/** Patch for update-threat: `null` clears an optional field. `category` and
 * `title` are required on a {@link Threat}, so they are set-only. */
export interface ThreatPatch {
  category?: StrideCategory;
  title?: string;
  description?: string | null;
  severity?: ThreatSeverity | null;
  status?: ThreatStatus | null;
  mitigation?: string | null;
}

/** Whitelist of the null-clearable {@link ThreatPatch} fields, applied through
 * `applyNullable` below — same shape as RELATION_NULLABLE_KEYS. */
const THREAT_NULLABLE_KEYS = ['description', 'severity', 'status', 'mitigation'] as const;
type ThreatNullableKey = (typeof THREAT_NULLABLE_KEYS)[number];

// Same exhaustive-coverage guard as NodeDetails/RelationPatch: a new
// null-clearable field on ThreatPatch must be listed above or this const
// becomes `false` and fails to compile.
type ThreatNullableKeys = Exclude<keyof ThreatPatch, 'category' | 'title'>;
type ThreatKeyCoverage = [ThreatNullableKeys] extends [ThreatNullableKey]
  ? [ThreatNullableKey] extends [ThreatNullableKeys]
    ? true
    : false
  : false;
const _assertThreatKeyCoverage: ThreatKeyCoverage = true;
void _assertThreatKeyCoverage;

/** The two per-element lists that commands edit in place: threats and
 * comments. Same seam for both — only the named element is replaced, every
 * sibling keeps its reference, and an empty result drops the key so saved files
 * stay free of empty arrays. */
// A map, not a conditional type: `K extends 'threats' ? Threat : Comment` would
// silently hand a third list `Comment` instead of failing to compile.
interface ElementLists {
  threats: Threat;
  comments: Comment;
}
type ElementList = keyof ElementLists;
type ListItem<K extends ElementList> = ElementLists[K];

function mapList<K extends ElementList>(
  m: DiagramModel,
  target: ElementRef,
  key: K,
  fn: (items: readonly ListItem<K>[]) => ListItem<K>[],
): DiagramModel {
  const next = <T extends { id: string }>(items: T[], id: string, what: string): T[] => {
    if (!items.some((x) => x.id === id)) throw new CommandError(`Unknown ${what} '${id}'`);
    return items.map((x) => {
      if (x.id !== id) return x;
      const record = x as T & Partial<Record<K, ListItem<K>[]>>;
      const list = fn(record[key] ?? []);
      // Computed-key destructuring here defeats tsc's narrowing back to `T`
      // (the omit doesn't provably overlap); spread-then-delete keeps the same
      // "drop the key, no empty array survives" behavior without the cast.
      const rest = { ...record };
      delete rest[key];
      return (list.length === 0 ? rest : { ...rest, [key]: list }) as T;
    });
  };
  return isNodeRef(target)
    ? { ...m, nodes: next(m.nodes, target.node, 'node') }
    : { ...m, relations: next(m.relations, target.relation, 'relation') };
}

const mapThreats = (m: DiagramModel, target: ElementRef, fn: (threats: readonly Threat[]) => Threat[]): DiagramModel =>
  mapList(m, target, 'threats', fn);

export function addThreat(m: DiagramModel, target: ElementRef, threat: Threat): DiagramModel {
  return mapThreats(m, target, (threats) => {
    if (threats.some((t) => t.id === threat.id)) throw new CommandError(`Duplicate threat id '${threat.id}'`);
    return [...threats, threat];
  });
}

export function updateThreat(m: DiagramModel, target: ElementRef, id: string, patch: ThreatPatch): DiagramModel {
  return mapThreats(m, target, (threats) => {
    if (!threats.some((t) => t.id === id)) throw new CommandError(`Unknown threat '${id}'`);
    return threats.map((t) => {
      if (t.id !== id) return t;
      let out: Threat = { ...t };
      if (patch.category !== undefined) out.category = patch.category;
      if (patch.title !== undefined) out.title = patch.title;
      for (const key of THREAT_NULLABLE_KEYS) {
        out = applyNullable(out, key, patch[key]);
      }
      return out;
    });
  });
}

export function removeThreat(m: DiagramModel, target: ElementRef, id: string): DiagramModel {
  return mapThreats(m, target, (threats) => {
    if (!threats.some((t) => t.id === id)) throw new CommandError(`Unknown threat '${id}'`);
    return threats.filter((t) => t.id !== id);
  });
}

/** Patch for update-comment: `null` clears an optional field. `text` is
 * required on a {@link Comment}, so it is set-only. */
export interface CommentPatch {
  text?: string;
  by?: string | null;
  at?: string | null;
}
const COMMENT_NULLABLE_KEYS = ['by', 'at'] as const;
type CommentNullableKey = (typeof COMMENT_NULLABLE_KEYS)[number];
type CommentNullableKeys = Exclude<keyof CommentPatch, 'text'>;
type CommentKeyCoverage = [CommentNullableKeys] extends [CommentNullableKey]
  ? [CommentNullableKey] extends [CommentNullableKeys]
    ? true
    : false
  : false;
const _assertCommentKeyCoverage: CommentKeyCoverage = true;
void _assertCommentKeyCoverage;

/** A date the studio's date input could not have produced is refused here, not
 * only at compile time: the studio autosaves on a timer, and a model that fails
 * validation wedges that save with a 400 while the user is still typing. */
const checkCommentDate = (at: string | null | undefined): void => {
  if (at !== undefined && at !== null && !isIsoDate(at))
    throw new CommandError(`Comment date '${at}' is not a YYYY-MM-DD date`);
};

export function addComment(m: DiagramModel, target: ElementRef, comment: Comment): DiagramModel {
  checkCommentDate(comment.at);
  return mapList(m, target, 'comments', (comments) => {
    if (comments.some((c) => c.id === comment.id)) throw new CommandError(`Duplicate comment id '${comment.id}'`);
    return [...comments, comment];
  });
}

export function updateComment(m: DiagramModel, target: ElementRef, id: string, patch: CommentPatch): DiagramModel {
  checkCommentDate(patch.at);
  return mapList(m, target, 'comments', (comments) => {
    if (!comments.some((c) => c.id === id)) throw new CommandError(`Unknown comment '${id}'`);
    return comments.map((c) => {
      if (c.id !== id) return c;
      let out: Comment = { ...c };
      if (patch.text !== undefined) out.text = patch.text;
      for (const key of COMMENT_NULLABLE_KEYS) out = applyNullable(out, key, patch[key]);
      return out;
    });
  });
}

export function removeComment(m: DiagramModel, target: ElementRef, id: string): DiagramModel {
  return mapList(m, target, 'comments', (comments) => {
    if (!comments.some((c) => c.id === id)) throw new CommandError(`Unknown comment '${id}'`);
    return comments.filter((c) => c.id !== id);
  });
}
