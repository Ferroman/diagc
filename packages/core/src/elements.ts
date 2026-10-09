import type { DiagramModel, DiagramNode, DiagramRelation } from './types';

/** What a threat, a comment or a note attaches to: one node or one relation. Node
 * and relation ids are separate namespaces, so a ref says which it means. */
export type ElementRef = { node: string } | { relation: string };

/** @deprecated Use `ElementRef`. Kept so code written against 1.0 still compiles. */
export type ThreatTarget = ElementRef;

/** @deprecated Use `ElementRef`. Kept so code written against 1.0 still compiles. */
export type ElementTarget = ElementRef;

export const isNodeRef = (ref: ElementRef): ref is { node: string } => 'node' in ref;

/** The key an element's note is filed under in `LayoutOverlay.notes`. Saved layouts
 * hold these strings, so they never change. */
export const elementKey = (ref: ElementRef): string =>
  isNodeRef(ref) ? `node:${ref.node}` : `relation:${ref.relation}`;

/** The node or relation `ref` names; undefined when the model has none. */
export function findElement(
  model: Pick<DiagramModel, 'nodes' | 'relations'>,
  ref: ElementRef,
): DiagramNode | DiagramRelation | undefined {
  return isNodeRef(ref)
    ? model.nodes.find((n) => n.id === ref.node)
    : model.relations.find((r) => r.id === ref.relation);
}
