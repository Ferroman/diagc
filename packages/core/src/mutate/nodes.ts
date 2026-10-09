import type { Column, DiagramModel, DiagramNode, FontScale, Link, TextAlign, TextRun } from '../types';
import { normalizeRuns, runsToPlainText } from '../text';
import { childrenOf } from '../children';
import { isIsoDate } from '../dates';
import { CommandError } from '../command-error';
import { applyNullable, prunePlaneHides, requireNode } from './shared';

export function uniqueNodeId(m: DiagramModel, base: string): string {
  const slug =
    base
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
  for (const c of columns) {
    if (c.layer !== undefined && !m.layers.some((l) => l.id === c.layer)) {
      throw new CommandError(`Unknown layer '${c.layer}'`);
    }
  }
  // Deliberately NOT rejecting duplicate names: edit-mode inputs commit per
  // keystroke, so a transient collision must not throw. `validate` reports
  // duplicate-column at publish time.
  return { ...m, nodes: m.nodes.map((n) => (n.id === id ? { ...n, columns } : n)) };
}
