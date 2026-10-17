import { relationLabels, type DiagramModel, type DiagramNode, type NotationId } from '@diagc/core/internal';
import { subtitleOf } from '../text/vocabulary';
import { cellWidth, printable, wrapCells } from '../text/width';

// The details panel: what the picture cannot say in a box — the description, every
// relation in and out (folded or not), threats, comments and links.

const nameOf = (model: DiagramModel, id: string): string => printable(model.nodes.find((n) => n.id === id)?.name ?? id);

/** Prose that may hold line breaks, as one panel line per line it has. */
const paragraphs = (text: string): string[] => text.split(/\r?\n/).map(printable);

const labelOf = (labels: readonly { text: string }[]): string =>
  labels
    .map((l) => printable(l.text).trim())
    .filter((t) => t !== '')
    .join(' / ');

/** A titled section, or nothing when it has no lines. */
const section = (title: string, lines: string[]): string[] => (lines.length === 0 ? [] : ['', title, ...lines]);

function relations(model: DiagramModel, id: string): string[] {
  const line = (arrow: string, other: string, label: string): string =>
    `${arrow} ${nameOf(model, other)}${label === '' ? '' : `  ${label}`}`;
  const out = model.relations.filter((r) => r.from === id).map((r) => line('→', r.to, labelOf(relationLabels(r))));
  const into = model.relations.filter((r) => r.to === id).map((r) => line('←', r.from, labelOf(relationLabels(r))));
  return [...section('Out', out), ...section('In', into)];
}

function notes(node: DiagramNode): string[] {
  const threats = (node.threats ?? []).map(
    (t) => `[${t.category}] ${printable(t.title)} (${t.severity ?? 'unrated'}, ${t.status ?? 'open'})`,
  );
  const comments = (node.comments ?? []).flatMap((c) => {
    const who = printable([c.by, c.at].filter((s) => s !== undefined).join(' '));
    const [first = '', ...rest] = paragraphs(c.text);
    return [who === '' ? first : `${who}: ${first}`, ...rest];
  });
  const links = [
    ...(node.links ?? []).map((l) => printable(`${l.label} ${l.url}`)),
    ...(node.link !== undefined ? [printable(`link ${node.link}`)] : []),
  ];
  return [...section('Threats', threats), ...section('Comments', comments), ...section('Links', links)];
}

/** The panel's lines for node `id`, each at most `width` cells; none for an unknown id. */
export function detailLines(model: DiagramModel, id: string, width: number, notation?: NotationId): string[] {
  const node = model.nodes.find((n) => n.id === id);
  if (node === undefined) return [];
  const subtitle = subtitleOf(node, notation);
  const parents = [...new Set(model.containment.filter((c) => c.child === id).map((c) => c.parent))];
  const lines = [
    printable(node.name),
    ...(subtitle !== '' ? [printable(subtitle)] : node.technology !== undefined ? [printable(node.technology)] : []),
    `id ${id}`,
    ...(node.description !== undefined ? ['', ...paragraphs(node.description)] : []),
    ...(parents.length > 0 ? ['', `Inside ${parents.map((p) => nameOf(model, p)).join(', ')}`] : []),
    ...relations(model, id),
    ...notes(node),
  ];
  // A line that fits keeps its spacing (the gap before a relation's label); only one
  // that does not is wrapped.
  const max = Math.max(1, width);
  return lines.flatMap((line) => (cellWidth(line) <= max ? [line] : wrapCells(line, max)));
}
