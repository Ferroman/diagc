import type { DiagramModel } from '@diagc/core/internal';
import type { DiagramDiff } from './compare';

function nameIn(m: DiagramModel, id: string): string {
  const n = m.nodes.find((x) => x.id === id);
  return n === undefined || n.name === '' ? id : n.name;
}

/** The change list for one diagram, one line each, `+`/`-`/`~` first. */
export function describeDiff(d: DiagramDiff): string[] {
  if (d.status === 'error') return [];
  if (d.status === 'added')
    return [
      `+ new diagram: ${d.after.model.name} (${d.diff.nodes.added.length} nodes, ${d.diff.relations.added.length} relations)`,
    ];
  if (d.status === 'removed') return [`- diagram removed: ${d.before.model.name}`];
  const before = d.before.model;
  const after = d.after.model;
  const rel = (m: DiagramModel, r: { from: string; to: string; kind: string; label?: string }) =>
    `${nameIn(m, r.from)} -> ${nameIn(m, r.to)} (${r.kind}${r.label !== undefined && r.label !== '' ? `: ${r.label}` : ''})`;
  const x = d.diff;
  return [
    ...x.nodes.added.map((n) => `+ ${n.name !== '' ? n.name : n.id}${n.type !== undefined ? ` [${n.type}]` : ''}`),
    ...x.nodes.removed.map((n) => `- ${n.name !== '' ? n.name : n.id}${n.type !== undefined ? ` [${n.type}]` : ''}`),
    ...x.nodes.changed.map((n) => {
      // A rename reads better as the two names than as the word "name".
      const was = nameIn(before, n.id);
      const now = nameIn(after, n.id);
      const rest = n.fields.filter((f) => f !== 'name');
      const head = n.fields.includes('name') ? `${was} -> ${now} (renamed)` : now;
      return `~ ${head}${rest.length > 0 ? `: ${rest.join(', ')}` : ''}`;
    }),
    ...x.relations.added.map((r) => `+ ${rel(after, r)}`),
    ...x.relations.removed.map((r) => `- ${rel(before, r)}`),
    ...x.relations.changed.map((r) => {
      const now = after.relations.find((y) => y.id === r.after);
      return `~ ${now !== undefined ? rel(after, now) : r.after}: ${r.fields.join(', ')}`;
    }),
    ...x.layers.added.map((id) => `+ layer ${id}`),
    ...x.layers.removed.map((id) => `- layer ${id}`),
    ...x.planes.added.map((id) => `+ plane ${id}`),
    ...x.planes.removed.map((id) => `- plane ${id}`),
  ];
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
