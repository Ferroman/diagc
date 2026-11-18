import type { DiagramModel, DiagramRelation } from '@diagc/core/internal';
import type { DiagramDiff } from './compare';

function nameIn(m: DiagramModel, id: string): string {
  const n = m.nodes.find((x) => x.id === id);
  return n === undefined || n.name === '' ? id : n.name;
}

/** One field of a changed element, in each version. */
export interface FieldValues {
  field: string;
  before: string;
  after: string;
}

/** One line of a diagram's change list, and what it is about. */
export interface DiffLine {
  sign: '+' | '-' | '~';
  text: string;
  /** the node, relation or plane the line is about, as the combined page knows it */
  target?: { node: string } | { relation: string } | { plane: string };
  /** a changed element's fields, old and new; none for an added or a removed one */
  values?: FieldValues[];
}

const MAX_VALUE = 240;

/** A field's value as a line can show it: text as it is, anything else as JSON, nothing as a dash. */
function shown(value: unknown): string {
  if (value === undefined) return '—';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > MAX_VALUE ? `${text.slice(0, MAX_VALUE)}…` : text;
}

function valuesOf(before: object | undefined, after: object | undefined, fields: readonly string[]): FieldValues[] {
  const b = (before ?? {}) as Record<string, unknown>;
  const a = (after ?? {}) as Record<string, unknown>;
  // `parent` is not a field of a node: the line says it moved, and the picture shows where.
  return fields.filter((f) => f !== 'parent').map((f) => ({ field: f, before: shown(b[f]), after: shown(a[f]) }));
}

/** What a relation says on its arrow: its label, or a transition's trigger and guard. */
function relationText(r: DiagramRelation): string {
  if (r.label !== undefined && r.label !== '') return r.label;
  const guard = r.guard !== undefined && r.guard !== '' ? ` [${r.guard}]` : '';
  return `${r.trigger ?? ''}${guard}`.trim();
}

/**
 * The change list for one diagram: what each line says and what it points at.
 * `removedIds` are the ids the combined model gives the removed relations, in
 * the diff's order (core's combineDiff renames one whose id is taken).
 */
export function diffLines(d: DiagramDiff, removedIds?: readonly string[]): DiffLine[] {
  if (d.status === 'error') return [];
  if (d.status === 'added')
    return [
      {
        sign: '+',
        text: `new diagram: ${d.after.model.name} (${d.diff.nodes.added.length} nodes, ${d.diff.relations.added.length} relations)`,
      },
    ];
  if (d.status === 'removed') return [{ sign: '-', text: `diagram removed: ${d.before.model.name}` }];
  const before = d.before.model;
  const after = d.after.model;
  const rel = (m: DiagramModel, r: DiagramRelation) => {
    const text = relationText(r);
    return `${nameIn(m, r.from)} -> ${nameIn(m, r.to)} (${r.kind}${text !== '' ? `: ${text}` : ''})`;
  };
  const node = (n: { id: string; name: string; type?: string }) =>
    `${n.name !== '' ? n.name : n.id}${n.type !== undefined ? ` [${n.type}]` : ''}`;
  const byId = <T extends { id: string }>(list: readonly T[], id: string) => list.find((x) => x.id === id);
  const x = d.diff;
  return [
    ...x.nodes.added.map((n): DiffLine => ({ sign: '+', text: node(n), target: { node: n.id } })),
    ...x.nodes.removed.map((n): DiffLine => ({ sign: '-', text: node(n), target: { node: n.id } })),
    ...x.nodes.changed.map((n): DiffLine => {
      // A rename reads better as the two names than as the word "name".
      const was = nameIn(before, n.id);
      const now = nameIn(after, n.id);
      const rest = n.fields.filter((f) => f !== 'name');
      const head = n.fields.includes('name') ? `${was} -> ${now} (renamed)` : now;
      return {
        sign: '~',
        text: `${head}${rest.length > 0 ? `: ${rest.join(', ')}` : ''}`,
        target: { node: n.id },
        values: valuesOf(byId(before.nodes, n.id), byId(after.nodes, n.id), rest),
      };
    }),
    ...x.relations.added.map((r): DiffLine => ({ sign: '+', text: rel(after, r), target: { relation: r.id } })),
    ...x.relations.removed.map((r, i): DiffLine => ({
      sign: '-',
      text: rel(before, r),
      target: { relation: removedIds?.[i] ?? r.id },
    })),
    ...x.relations.changed.map((r): DiffLine => {
      const now = byId(after.relations, r.after);
      return {
        sign: '~',
        text: `${now !== undefined ? rel(after, now) : r.after}: ${r.fields.join(', ')}`,
        target: { relation: r.after },
        values: valuesOf(byId(before.relations, r.before), now, r.fields),
      };
    }),
    ...x.layers.added.map((id): DiffLine => ({ sign: '+', text: `layer ${id}` })),
    ...x.layers.removed.map((id): DiffLine => ({ sign: '-', text: `layer ${id}` })),
    ...x.layers.changed.map((c): DiffLine => ({
      sign: '~',
      text: `layer ${c.id}: ${c.fields.join(', ')}`,
      values: valuesOf(byId(before.layers, c.id), byId(after.layers, c.id), c.fields),
    })),
    ...x.planes.added.map((id): DiffLine => ({ sign: '+', text: `plane ${id}`, target: { plane: id } })),
    ...x.planes.removed.map((id): DiffLine => ({ sign: '-', text: `plane ${id}`, target: { plane: id } })),
    ...x.planes.changed.map((c): DiffLine => ({
      sign: '~',
      text: `plane ${c.id}: ${c.fields.join(', ')}`,
      target: { plane: c.id },
      values: valuesOf(byId(before.planes, c.id), byId(after.planes, c.id), c.fields),
    })),
  ];
}

/** The change list for one diagram, one line each, `+`/`-`/`~` first. */
export function describeDiff(d: DiagramDiff): string[] {
  return diffLines(d).map((l) => `${l.sign} ${l.text}`);
}

/** `diff --json`'s text: each diagram's status, with its changes or why it was not
 * compared. The versions stay out: they are whole models, what the pictures are drawn
 * from, not the change. */
export function formatDiffJson(diffs: readonly DiagramDiff[], from: string, to: string): string {
  // Built key by key, so the printed order is the one written here, whatever order the
  // diff's own fields are in.
  const diagrams = diffs.map((d) =>
    d.status === 'error'
      ? { name: d.name, status: d.status, error: d.error }
      : { name: d.name, status: d.status, diff: d.diff },
  );
  return JSON.stringify({ from, to, diagrams }, null, 2);
}

export function formatDiffSummary(diffs: readonly DiagramDiff[], from: string, to: string): string {
  const lines = [`diagc diff ${from} -> ${to}`];
  for (const d of diffs) {
    if (d.status === 'unchanged') continue;
    if (d.status === 'error') {
      lines.push(`! ${d.name}: ${d.error}`);
      continue;
    }
    lines.push(`${d.name}:`);
    for (const l of describeDiff(d)) lines.push(`  ${l}`);
  }
  const changed = diffs.filter((d) => d.status !== 'unchanged' && d.status !== 'error').length;
  const same = diffs.filter((d) => d.status === 'unchanged').length;
  lines.push(
    changed === 0 ? `no diagram changed (${same} compared)` : `${changed} diagram(s) changed, ${same} unchanged`,
  );
  return lines.join('\n');
}
