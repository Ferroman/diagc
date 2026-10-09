import type { DiagramModel, DiagramNode } from './types';
import { buildHierarchy, type HierarchyIndex } from './view/hierarchy';
import { NODE_TYPES, NOTATION_NODE_TYPES, NOTATION_RELATION_KINDS, RELATION_KINDS } from './vocabulary';
import { isOnPlane } from './planes';
import { ACTIVITY_BAR_TYPE, ACTIVITY_DECISION_TYPE, ACTIVITY_END_TYPE, ACTIVITY_START_TYPE } from './activity/activity';

/**
 * Findings for a model that validates but probably does not say what its author
 * meant — the slips a generated diagram makes and nothing downstream catches,
 * because every one of them still draws: a typo'd type falls back to a plain box,
 * a node no plane shows simply is not there. `validate` owns what is broken; this
 * owns what is suspicious. Warnings only: a save or a compile never stops on them
 * (`diagc lint` is the place that fails on them).
 */
export interface LintFinding {
  code: LintCode;
  message: string;
  ref?: string;
}

export type LintCode =
  | 'duplicate-name'
  | 'unknown-type'
  | 'unknown-kind'
  | 'unused-layer'
  | 'empty-plane'
  | 'unused-legend-item'
  | 'undrawn-node'
  | 'undrawn-relation';

/** Shapes a diagram repeats on purpose: every activity has its start dot, and
 * forks, merges and ends are anonymous or share one caption. */
const REPEATED_GLYPHS = new Set<string>([
  ACTIVITY_START_TYPE,
  ACTIVITY_END_TYPE,
  ACTIVITY_BAR_TYPE,
  ACTIVITY_DECISION_TYPE,
]);

export function lintModel(m: DiagramModel): LintFinding[] {
  const out: LintFinding[] = [];
  const add = (code: LintCode, message: string, ref?: string): void => {
    out.push(ref === undefined ? { code, message } : { code, message, ref });
  };
  // Every plane's hierarchy with no layer filter: what each view CAN show.
  const views = (m.planes ?? []).length > 0 ? m.planes!.map((p) => buildHierarchy(m, p.id)) : [buildHierarchy(m)];
  duplicateNames(m, views, add);
  vocabulary(m, add);
  unused(m, add);
  undrawn(m, views, add);
  return out;
}

type Add = (code: LintCode, message: string, ref?: string) => void;

/** Two siblings of one type and one name are usually one thing declared twice.
 * Only siblings, since two included services may each have their own 'Database',
 * and only one type, since a git branch and the stage over it share a name. */
function duplicateNames(m: DiagramModel, views: HierarchyIndex[], add: Add): void {
  const byId = new Map(m.nodes.map((n) => [n.id, n]));
  const reported = new Set<string>();
  const check = (ids: readonly string[]): void => {
    const seen = new Map<string, DiagramNode>();
    for (const id of ids) {
      const n = byId.get(id);
      if (n === undefined || (n.type !== undefined && REPEATED_GLYPHS.has(n.type))) continue;
      const name = n.name.trim().toLowerCase();
      if (name === '') continue;
      const key = `${n.type ?? ''}\u0000${name}`;
      const first = seen.get(key);
      if (first === undefined) {
        seen.set(key, n);
        continue;
      }
      if (reported.has(n.id)) continue;
      reported.add(n.id);
      add('duplicate-name', `'${n.id}' has the same name as its sibling '${first.id}' ('${n.name}')`, n.id);
    }
  };
  for (const h of views) {
    check(h.roots);
    for (const kids of h.childrenOf.values()) check(kids);
  }
}

/** Notations the diagram draws in anywhere: the model's and each plane's. */
function notationsOf(m: DiagramModel): string[] {
  return [m.notation, ...(m.planes ?? []).map((p) => p.notation)].filter((x): x is string => x !== undefined);
}

function vocabulary(m: DiagramModel, add: Add): void {
  const notations = notationsOf(m) as (keyof typeof NOTATION_NODE_TYPES)[];
  const types = new Set([...NODE_TYPES, ...notations.flatMap((n) => NOTATION_NODE_TYPES[n] ?? [])]);
  const kinds = new Set([...RELATION_KINDS, ...notations.flatMap((n) => NOTATION_RELATION_KINDS[n] ?? [])]);
  const reported = new Set<string>();
  for (const n of m.nodes) {
    // a picture or a silhouette draws itself; its type is a label, not a shape
    if (n.type === undefined || types.has(n.type) || n.image !== undefined || n.shape !== undefined) continue;
    if (reported.has(`t:${n.type}`)) continue;
    reported.add(`t:${n.type}`);
    add('unknown-type', `'${n.id}' has type '${n.type}', which draws as a plain box${hint(n.type, types)}`, n.id);
  }
  for (const r of m.relations) {
    if (kinds.has(r.kind) || reported.has(`k:${r.kind}`)) continue;
    reported.add(`k:${r.kind}`);
    add('unknown-kind', `'${r.id}' has kind '${r.kind}', which draws as a plain arrow${hint(r.kind, kinds)}`, r.id);
  }
}

/** ` (did you mean 'x'?)` for the closest known id, when one is close enough to
 * be the intended one; '' otherwise. */
function hint(id: string, known: ReadonlySet<string>): string {
  const norm = (s: string): string => s.toLowerCase().replace(/[\s_]+/g, '-');
  let best: string | undefined;
  let bestDistance = Infinity;
  for (const k of known) {
    const d = norm(k) === norm(id) ? 0 : distance(norm(id), norm(k));
    if (d < bestDistance) {
      best = k;
      bestDistance = d;
    }
  }
  return best !== undefined && bestDistance <= Math.min(2, Math.floor(id.length / 3))
    ? ` (did you mean '${best}'?)`
    : '';
}

function distance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row.push(Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1)));
    }
    prev = row;
  }
  return prev[b.length]!;
}

/** Declarations nothing uses: a layer no node, row, relation or rule is on; a
 * plane identical to a flat view of the shared nodes; a legend row for a type or
 * kind the diagram never draws. */
function unused(m: DiagramModel, add: Add): void {
  const layersUsed = new Set<string>();
  for (const n of m.nodes) {
    if (n.layer !== undefined) layersUsed.add(n.layer);
    for (const c of n.columns ?? []) if (c.layer !== undefined) layersUsed.add(c.layer);
  }
  for (const r of m.relations) if (r.layer !== undefined) layersUsed.add(r.layer);
  for (const rule of m.layerRules ?? []) layersUsed.add(rule.layer);
  for (const l of m.layers) {
    if (!layersUsed.has(l.id)) add('unused-layer', `Layer '${l.id}' has nothing on it`, l.id);
  }

  const planes = m.planes ?? [];
  for (const p of planes) {
    const shaped =
      p.containmentOf !== undefined ||
      p.notation !== undefined ||
      p.baseRelations !== undefined ||
      (p.layers ?? []).length > 0 ||
      (p.hides ?? []).length > 0 ||
      (p.hidesTree ?? []).length > 0 ||
      m.containment.some((e) => isOnPlane(e, p.id, m)) ||
      m.nodes.some((n) => n.plane === p.id);
    if (!shaped)
      add(
        'empty-plane',
        `Plane '${p.id}' has no containment or settings of its own, so it shows every shared node flat`,
        p.id,
      );
  }

  const types = new Set(m.nodes.map((n) => n.type));
  const kinds = new Set(m.relations.map((r) => r.kind));
  for (const item of m.legend?.items ?? []) {
    if (item.type !== undefined && !types.has(item.type)) {
      add('unused-legend-item', `Legend row '${item.label}' describes type '${item.type}', which no node has`);
    }
    if (item.kind !== undefined && !kinds.has(item.kind)) {
      add('unused-legend-item', `Legend row '${item.label}' describes kind '${item.kind}', which no relation has`);
    }
  }
}

/** A node no plane shows (scoped to a plane that borrows another's hierarchy,
 * hidden everywhere) and a relation whose ends never share a view: both are in
 * the file and nowhere in the picture. */
function undrawn(m: DiagramModel, views: HierarchyIndex[], add: Add): void {
  const shown = (id: string, h: HierarchyIndex): boolean => h.parentsOf.has(id);
  for (const n of m.nodes) {
    if (!views.some((h) => shown(n.id, h)))
      add('undrawn-node', `'${n.id}' is in no plane's view, so it is never drawn`, n.id);
  }
  const anywhere = new Set(m.nodes.filter((n) => views.some((h) => shown(n.id, h))).map((n) => n.id));
  for (const r of m.relations) {
    // a relation to an undrawn node is that node's finding, not a second one
    if (!anywhere.has(r.from) || !anywhere.has(r.to)) continue;
    if (!views.some((h) => shown(r.from, h) && shown(r.to, h))) {
      add('undrawn-relation', `'${r.id}' joins '${r.from}' and '${r.to}', which no plane shows together`, r.id);
    }
  }
}
