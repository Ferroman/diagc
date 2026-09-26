import {
  BUILTIN_NOTATIONS,
  type Column,
  type Comment,
  type DiagramLayer,
  type DiagramLegend,
  type DiagramModel,
  type DiagramNode,
  type DiagramPlane,
  type EdgeLabel,
  type FontScale,
  type Link,
  type Polarity,
  type RelationStyle,
  type StrideCategory,
  type TextAlign,
  type TextRun,
  type Threat,
  type ThreatSeverity,
  type ThreatStatus,
} from './types';
import { normalizeRuns, runsToPlainText } from './text';
import { childrenOf } from './children';
import { isIsoDate } from './dates';
import type { ThreatTarget } from './threat-model';

export class CommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommandError';
  }
}

const requireNode = (m: DiagramModel, id: string): DiagramNode => {
  const n = m.nodes.find((x) => x.id === id);
  if (n === undefined) throw new CommandError(`Unknown node '${id}'`);
  return n;
};

export function uniqueNodeId(m: DiagramModel, base: string): string {
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'node';
  const taken = new Set(m.nodes.map((n) => n.id));
  if (!taken.has(slug)) return slug;
  for (let i = 2; ; i++) {
    if (!taken.has(`${slug}-${i}`)) return `${slug}-${i}`;
  }
}

export function addNode(m: DiagramModel, node: DiagramNode): DiagramModel {
  if (m.nodes.some((n) => n.id === node.id)) throw new CommandError(`Duplicate node id '${node.id}'`);
  return { ...m, nodes: [...m.nodes, node] };
}

export function renameNode(m: DiagramModel, id: string, name: string): DiagramModel {
  requireNode(m, id);
  return {
    ...m,
    nodes: m.nodes.map((n) => {
      if (n.id !== id) return n;
      const { rich: _rich, ...rest } = n;
      return { ...rest, name };
    }),
  };
}

export function setNodeRich(m: DiagramModel, id: string, runs: TextRun[]): DiagramModel {
  requireNode(m, id);
  const norm = normalizeRuns(runs);
  const name = runsToPlainText(norm);
  const first = norm[0];
  const isPlain = norm.length <= 1 && (first === undefined || (first.bold === undefined && first.italic === undefined));
  return {
    ...m,
    nodes: m.nodes.map((n) => {
      if (n.id !== id) return n;
      const { rich: _rich, ...rest } = n;
      return isPlain ? { ...rest, name } : { ...rest, name, rich: norm };
    }),
  };
}

export interface NodeDetails {
  type?: string | null;
  icon?: string | null;
  image?: string | null;
  shape?: string | null;
  color?: string | null;
  textColor?: string | null;
  technology?: string | null;
  link?: string | null;
  textAlign?: TextAlign | null;
  fontScale?: FontScale | null;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
  plane?: string | null;
  layer?: string | null;
  links?: Link[] | null;
}

/** Whitelist of {@link NodeDetails} fields wired through the loop below. Every
 * field is flat (optional, null-clearable), so one typed pass replaces the
 * hand-rolled `applyNullable` chain. */
const NODE_DETAIL_KEYS = [
  'type',
  'icon',
  'image',
  'shape',
  'color',
  'textColor',
  'technology',
  'link',
  'textAlign',
  'fontScale',
  'description',
  'metadata',
  'plane',
  'layer',
  'links',
] as const;
type NodeDetailKey = (typeof NODE_DETAIL_KEYS)[number];

// Compile-time guarantee that the whitelist is EXACTLY the interface's keys:
// add a field to NodeDetails without listing it here and `_assertNodeKeyCoverage`
// becomes `false`, failing this const — the silent drift a hand-written chain
// used to permit. `void` reads the const so noUnusedLocals doesn't flag it.
type NodeKeyCoverage = [keyof NodeDetails] extends [NodeDetailKey]
  ? [NodeDetailKey] extends [keyof NodeDetails]
    ? true
    : false
  : false;
const _assertNodeKeyCoverage: NodeKeyCoverage = true;
void _assertNodeKeyCoverage;

const applyNullable = <T extends object, K extends keyof T>(obj: T, key: K, value: T[K] | null | undefined): T => {
  if (value === undefined) return obj;
  const next = { ...obj };
  if (value === null) delete next[key];
  else next[key] = value;
  return next;
};

export function setNodeDetails(m: DiagramModel, id: string, details: NodeDetails): DiagramModel {
  requireNode(m, id);
  if (details.layer != null && !m.layers.some((l) => l.id === details.layer)) {
    throw new CommandError(`Unknown layer '${details.layer}'`);
  }
  // An emptied list is a cleared one. A panel sends `links` whole, so deleting
  // the last row arrives as `[]` — and a saved file must no more hold
  // `links: []` than the threat/comment lists mapList prunes.
  const patch: NodeDetails = details.links?.length === 0 ? { ...details, links: null } : details;
  const nodes = m.nodes.map((n) => {
    if (n.id !== id) return n;
    let next = { ...n };
    // One typed loop over the field whitelist (see NODE_DETAIL_KEYS) instead of
    // 12 hand-written applyNullable calls — adding a field wires automatically
    // and the coverage const above makes an omission a compile error.
    for (const key of NODE_DETAIL_KEYS) {
      next = applyNullable(next, key, patch[key]);
    }
    return next;
  });
  let next: DiagramModel = { ...m, nodes };
  // Scoping a node to a plane makes it view-local; drop it from every plane's
  // `hides`/`hidesTree` so a formerly-hidden shared node doesn't linger there
  // with no way to clear it via the UI (and to avoid tripping `redundant-hide`).
  if (typeof details.plane === 'string') {
    next = { ...next, planes: prunePlaneHides(next.planes, (h) => h === id) };
  }
  return next;
}

/** The dated keys of a plan node. A key left undefined is untouched. */
export interface PlanDates {
  start?: string;
  end?: string;
  at?: string;
}

/** Writes zone/event dates into `node.metadata`. Only the FORMAT is guarded
 * here (a value that is not a real day can never be right); ordering and
 * nesting are validation's findings, so a drag that momentarily crosses a
 * bound still lands as a command and undo has something to undo. */
export function setPlanDates(m: DiagramModel, id: string, dates: PlanDates): DiagramModel {
  requireNode(m, id);
  const patch: Record<string, string> = {};
  for (const key of ['start', 'end', 'at'] as const) {
    const v = dates[key];
    if (v === undefined) continue;
    if (!isIsoDate(v)) throw new CommandError(`'${key}' must be a YYYY-MM-DD date, got '${v}'`);
    patch[key] = v;
  }
  if (Object.keys(patch).length === 0) return m;
  return {
    ...m,
    nodes: m.nodes.map((n) => (n.id === id ? { ...n, metadata: { ...(n.metadata ?? {}), ...patch } } : n)),
  };
}

/** Drop every id satisfying `drop` from each plane's `hides`/`hidesTree`,
 * omitting emptied lists; a plane with no change keeps its reference. */
function prunePlaneHides(planes: DiagramPlane[], drop: (id: string) => boolean): DiagramPlane[] {
  const without = (list: string[] | undefined): string[] | undefined =>
    list === undefined ? undefined : list.filter((h) => !drop(h));
  return planes.map((p) => {
    const hides = without(p.hides);
    const hidesTree = without(p.hidesTree);
    if (hides?.length === p.hides?.length && hidesTree?.length === p.hidesTree?.length) return p;
    const { hides: _h, hidesTree: _t, ...rest } = p;
    return {
      ...rest,
      ...(hides !== undefined && hides.length > 0 ? { hides } : {}),
      ...(hidesTree !== undefined && hidesTree.length > 0 ? { hidesTree } : {}),
    };
  });
}

/** Transitive containment descendants of `id` across every plane, plus `id`
 * itself — the set a cascade delete destroys. */
export function subtreeOf(m: DiagramModel, id: string): Set<string> {
  const children = childrenOf(m.containment);
  const doomed = new Set<string>();
  const stack = [id];
  while (stack.length > 0) {
    const cur = stack.pop();
    if (cur === undefined || doomed.has(cur)) continue;
    doomed.add(cur);
    stack.push(...(children.get(cur) ?? []));
  }
  return doomed;
}

export function deleteNode(m: DiagramModel, id: string, cascade = false): DiagramModel {
  requireNode(m, id);
  const doomed = cascade ? subtreeOf(m, id) : new Set([id]);
  return {
    ...m,
    nodes: m.nodes.filter((n) => !doomed.has(n.id)),
    containment: m.containment.filter((e) => !doomed.has(e.parent) && !doomed.has(e.child)),
    relations: m.relations.filter((r) => !doomed.has(r.from) && !doomed.has(r.to)),
    // A destroyed node must not linger in any plane's hides/hidesTree — the
    // stale entry would fail `unknown-hidden-node` validation on the next save.
    planes: prunePlaneHides(m.planes, (h) => doomed.has(h)),
  };
}

export function setTableColumns(m: DiagramModel, id: string, columns: Column[]): DiagramModel {
  requireNode(m, id);
  // Deliberately NOT rejecting duplicate names: edit-mode inputs commit per
  // keystroke, so a transient collision must not throw. `validate` reports
  // duplicate-column at publish time.
  return { ...m, nodes: m.nodes.map((n) => (n.id === id ? { ...n, columns } : n)) };
}

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
  target: ThreatTarget,
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
  return 'node' in target
    ? { ...m, nodes: next(m.nodes, target.node, 'node') }
    : { ...m, relations: next(m.relations, target.relation, 'relation') };
}

const mapThreats = (m: DiagramModel, target: ThreatTarget, fn: (threats: readonly Threat[]) => Threat[]): DiagramModel =>
  mapList(m, target, 'threats', fn);

export function addThreat(m: DiagramModel, target: ThreatTarget, threat: Threat): DiagramModel {
  return mapThreats(m, target, (threats) => {
    if (threats.some((t) => t.id === threat.id)) throw new CommandError(`Duplicate threat id '${threat.id}'`);
    return [...threats, threat];
  });
}

export function updateThreat(
  m: DiagramModel,
  target: ThreatTarget,
  id: string,
  patch: ThreatPatch,
): DiagramModel {
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

export function removeThreat(m: DiagramModel, target: ThreatTarget, id: string): DiagramModel {
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
  ? [CommentNullableKey] extends [CommentNullableKeys] ? true : false
  : false;
const _assertCommentKeyCoverage: CommentKeyCoverage = true;
void _assertCommentKeyCoverage;

/** A date the studio's date input could not have produced is refused here, not
 * only at compile time: the studio autosaves on a timer, and a model that fails
 * validation wedges that save with a 400 while the user is still typing. */
const checkCommentDate = (at: string | null | undefined): void => {
  if (at !== undefined && at !== null && !isIsoDate(at)) throw new CommandError(`Comment date '${at}' is not a YYYY-MM-DD date`);
};

export function addComment(m: DiagramModel, target: ThreatTarget, comment: Comment): DiagramModel {
  checkCommentDate(comment.at);
  return mapList(m, target, 'comments', (comments) => {
    if (comments.some((c) => c.id === comment.id)) throw new CommandError(`Duplicate comment id '${comment.id}'`);
    return [...comments, comment];
  });
}

export function updateComment(m: DiagramModel, target: ThreatTarget, id: string, patch: CommentPatch): DiagramModel {
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

export function removeComment(m: DiagramModel, target: ThreatTarget, id: string): DiagramModel {
  return mapList(m, target, 'comments', (comments) => {
    if (!comments.some((c) => c.id === id)) throw new CommandError(`Unknown comment '${id}'`);
    return comments.filter((c) => c.id !== id);
  });
}

function wouldCycle(m: DiagramModel, parent: string, child: string, plane?: string): boolean {
  const defaultPlane = (m.planes ?? [])[0]?.id;
  const key = plane ?? defaultPlane;
  // Children index over this plane's edges, plus the candidate edge being added.
  const children = childrenOf(m.containment.filter((e) => (e.plane ?? defaultPlane) === key));
  children.set(parent, [...(children.get(parent) ?? []), child]);
  // child must not reach parent
  const stack = [child];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const cur = stack.pop();
    if (cur === undefined || seen.has(cur)) continue;
    if (cur === parent && seen.size > 0) return true;
    seen.add(cur);
    stack.push(...(children.get(cur) ?? []));
  }
  return false;
}

/**
 * Resolve a plane argument to its canonical containment form: undefined stays
 * undefined; a declared plane resolves its `containmentOf` borrow (one hop) and,
 * if that lands on the first-declared (default) plane, collapses to `undefined`
 * so a NEW edge is always written in the untagged base form. Throws on unknowns.
 *
 * That collapse is a write-time convention only — an existing edge can still
 * carry an explicit tag for the default plane (the builder DSL always names
 * a plan's own plane on its containment, "so the plan need not be the first
 * plane declared", even when it happens to be first — ZoneBuilder). A caller
 * comparing against this function's result must therefore resolve THAT side
 * too (`e.plane ?? defaultPlane`, the same normalisation `wouldCycle` above
 * already does for its own read), not compare `e.plane` against `canon`
 * directly, or a builder-tagged default-plane edge never matches a command
 * that (correctly) canonicalizes to `undefined`.
 */
function canonicalPlane(m: DiagramModel, plane?: string): string | undefined {
  if (plane === undefined) return undefined;
  const planes = m.planes ?? [];
  const p = planes.find((x) => x.id === plane);
  if (p === undefined) throw new CommandError(`Unknown plane '${plane}'`);
  const resolved = p.containmentOf ?? p.id;
  return resolved === planes[0]?.id ? undefined : resolved;
}

export function addContainment(
  m: DiagramModel,
  parent: string,
  child: string,
  plane?: string,
  beside?: { sibling: string; side: 'before' | 'after' },
): DiagramModel {
  requireNode(m, parent);
  requireNode(m, child);
  if (parent === child) throw new CommandError(`Node '${parent}' cannot contain itself`);
  const canon = canonicalPlane(m, plane);
  // Resolved on both sides (see canonicalPlane's comment): an edge already in
  // the model may carry an explicit tag for what is, today, the default
  // plane (the builder DSL always tags a plan's containment), which a bare
  // `e.plane === canon` would miss.
  const defaultPlane = (m.planes ?? [])[0]?.id;
  const key = canon ?? defaultPlane;
  if (m.containment.some((e) => e.parent === parent && e.child === child && (e.plane ?? defaultPlane) === key)) return m;
  if (wouldCycle(m, parent, child, canon)) {
    throw new CommandError(`'${parent}' > '${child}' would create a containment cycle`);
  }
  const edge = { parent, child, ...(canon !== undefined ? { plane: canon } : {}) };
  if (beside === undefined) return { ...m, containment: [...m.containment, edge] };
  // Children read in declaration order, so the slot in the flat array IS the
  // sibling order — insert next to the sibling's own membership.
  const at = m.containment.findIndex((e) => e.parent === parent && e.child === beside.sibling && e.plane === canon);
  if (at === -1) throw new CommandError(`'${beside.sibling}' is not a child of '${parent}'`);
  const i = beside.side === 'before' ? at : at + 1;
  return { ...m, containment: [...m.containment.slice(0, i), edge, ...m.containment.slice(i)] };
}

/**
 * Group existing nodes under a new abstract parent: add `node`, then nest each
 * member under it. `plane` scopes both the containment edges and (via the
 * caller setting `node.plane`) the abstract node, so the grouping can live in a
 * single plane's view. Atomic: a bad member id throws before any partial model
 * escapes (the intermediate is a local value, never returned).
 */
export function groupNodes(
  m: DiagramModel,
  node: DiagramNode,
  memberIds: readonly string[],
  plane?: string,
): DiagramModel {
  let next = addNode(m, node);
  for (const child of memberIds) {
    next = addContainment(next, node.id, child, plane);
  }
  return next;
}

export function removeContainment(m: DiagramModel, parent: string, child: string, plane?: string): DiagramModel {
  const canon = canonicalPlane(m, plane);
  // Same resolved-both-sides comparison as addContainment's duplicate check —
  // see canonicalPlane's comment.
  const defaultPlane = (m.planes ?? [])[0]?.id;
  const key = canon ?? defaultPlane;
  return {
    ...m,
    containment: m.containment.filter((e) => !(e.parent === parent && e.child === child && (e.plane ?? defaultPlane) === key)),
  };
}

/** Pin the diagram's visual style preset id, or clear it with null (the
 * app-level preference applies again). Unknown ids are intentionally
 * accepted — the renderer treats them as unpinned. */
export function setDiagramStyle(m: DiagramModel, style: string | null): DiagramModel {
  if (style === null) {
    const { style: _dropped, ...rest } = m;
    return rest;
  }
  return { ...m, style };
}

/** Pin the diagram's notation id, or clear it with null. Unlike
 * `setDiagramStyle`, unknown ids are rejected — a model-level notation drives
 * structural validation rules the same way a plane's own notation does (e.g.
 * `validateGit` in validate.ts resolves `plane.notation ?? model.notation`),
 * so it must resolve to a known one. */
export function setDiagramNotation(m: DiagramModel, notation: string | null): DiagramModel {
  if (notation === null) {
    if (m.notation === undefined) return m;
    const { notation: _dropped, ...rest } = m;
    return rest;
  }
  if (!(BUILTIN_NOTATIONS as readonly string[]).includes(notation)) {
    throw new CommandError(`Unknown notation '${notation}'`);
  }
  return m.notation === notation ? m : { ...m, notation };
}

/** Declare the diagram's legend, or clear it entirely with null. */
export function setDiagramLegend(m: DiagramModel, legend: DiagramLegend | null): DiagramModel {
  if (legend === null) {
    const { legend: _dropped, ...rest } = m;
    return rest;
  }
  return { ...m, legend };
}

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

export function upsertLayer(m: DiagramModel, layer: DiagramLayer): DiagramModel {
  const exists = m.layers.some((l) => l.id === layer.id);
  return {
    ...m,
    layers: exists ? m.layers.map((l) => (l.id === layer.id ? layer : l)) : [...m.layers, layer],
  };
}

export function deleteLayer(m: DiagramModel, id: string): DiagramModel {
  if (!m.layers.some((l) => l.id === id)) throw new CommandError(`Unknown layer '${id}'`);
  // Destructive: remove the layer's tagged nodes + relations. Cascade like
  // deleteNode — a destroyed node's containment is severed (untagged children
  // survive top-level) and relations touching it are dropped.
  const doomed = new Set(m.nodes.filter((n) => n.layer === id).map((n) => n.id));
  return {
    ...m,
    layers: m.layers.filter((l) => l.id !== id),
    nodes: m.nodes.filter((n) => n.layer !== id),
    relations: m.relations.filter((r) => r.layer !== id && !doomed.has(r.from) && !doomed.has(r.to)),
    containment: m.containment.filter((e) => !doomed.has(e.parent) && !doomed.has(e.child)),
    planes: (m.planes ?? []).map((p) => {
      const touchesHides = [...(p.hides ?? []), ...(p.hidesTree ?? [])].some((h) => doomed.has(h));
      if (p.layers === undefined && !touchesHides) return p;
      return {
        ...p,
        ...(p.layers !== undefined ? { layers: p.layers.filter((l) => l !== id) } : {}),
        ...(p.hides !== undefined ? { hides: p.hides.filter((h) => !doomed.has(h)) } : {}),
        ...(p.hidesTree !== undefined ? { hidesTree: p.hidesTree.filter((h) => !doomed.has(h)) } : {}),
      };
    }),
  };
}

export function mergeLayers(m: DiagramModel, sourceIds: string[], targetId?: string): DiagramModel {
  if (targetId !== undefined && !m.layers.some((l) => l.id === targetId)) {
    throw new CommandError(`Unknown layer '${targetId}'`);
  }
  for (const id of sourceIds) {
    if (!m.layers.some((l) => l.id === id)) throw new CommandError(`Unknown layer '${id}'`);
    if (id === targetId) throw new CommandError('Cannot merge a layer into itself');
  }
  if (sourceIds.length === 0) return m;
  const sources = new Set(sourceIds);
  // Retag a source-tagged node/relation onto the target, or drop the tag
  // entirely when merging to the base sheet (targetId omitted).
  const retag = <T extends { layer?: string }>(x: T): T => {
    if (x.layer === undefined || !sources.has(x.layer)) return x;
    if (targetId === undefined) {
      const { layer: _layer, ...rest } = x;
      return rest as T;
    }
    return { ...x, layer: targetId };
  };
  return {
    ...m,
    layers: m.layers.filter((l) => !sources.has(l.id)),
    nodes: m.nodes.map(retag),
    relations: m.relations.map(retag),
    planes: (m.planes ?? []).map((p) => {
      if (p.layers === undefined) return p;
      const layers =
        targetId === undefined
          ? p.layers.filter((l) => !sources.has(l))
          : [...new Set(p.layers.map((l) => (sources.has(l) ? targetId : l)))];
      return { ...p, layers };
    }),
  };
}

export function upsertPlane(m: DiagramModel, plane: DiagramPlane): DiagramModel {
  if (plane.notation !== undefined && !(BUILTIN_NOTATIONS as readonly string[]).includes(plane.notation)) {
    throw new CommandError(`Unknown notation '${plane.notation}'`);
  }
  if (plane.containmentOf !== undefined) {
    if (plane.containmentOf === plane.id) {
      throw new CommandError(`Plane '${plane.id}' cannot borrow containment from itself`);
    }
    const target = (m.planes ?? []).find((p) => p.id === plane.containmentOf);
    if (target === undefined) {
      throw new CommandError(`Unknown plane '${plane.containmentOf}'`);
    }
    if (target.containmentOf !== undefined) {
      throw new CommandError(
        `Plane '${plane.containmentOf}' itself borrows containment — chains are not allowed`,
      );
    }
  }
  const planes = m.planes ?? [];
  const exists = planes.some((p) => p.id === plane.id);
  return { ...m, planes: exists ? planes.map((p) => (p.id === plane.id ? plane : p)) : [...planes, plane] };
}

/** Add/remove a shared node from a plane's `hides`. A node already scoped to a
 * plane is view-local, so hiding it is a no-op (validation flags a stray one). */
export function setNodePlaneHidden(
  m: DiagramModel,
  nodeId: string,
  planeId: string,
  hidden: boolean,
): DiagramModel {
  const node = requireNode(m, nodeId);
  if (hidden && node.plane !== undefined) return m;
  return {
    ...m,
    planes: (m.planes ?? []).map((p) => {
      if (p.id !== planeId) return p;
      const set = new Set(p.hides ?? []);
      if (hidden) set.add(nodeId);
      else set.delete(nodeId);
      const { hides: _drop, ...rest } = p;
      return set.size > 0 ? { ...rest, hides: [...set] } : rest;
    }),
  };
}

export function deletePlane(m: DiagramModel, id: string): DiagramModel {
  const planes = m.planes ?? [];
  if (!planes.some((p) => p.id === id)) throw new CommandError(`Unknown plane '${id}'`);
  const borrower = planes.find((p) => p.containmentOf === id);
  if (borrower !== undefined) {
    throw new CommandError(`Plane '${borrower.id}' borrows containment from '${id}' — delete or repoint it first`);
  }
  // The first-declared plane owns the untagged (base) edges; drop them with it so
  // structure doesn't silently migrate to whichever plane becomes first next.
  const isFirst = planes[0]?.id === id;
  return {
    ...m,
    planes: planes.filter((p) => p.id !== id),
    containment: m.containment.filter((e) => e.plane !== id && !(isFirst && e.plane === undefined)),
  };
}
