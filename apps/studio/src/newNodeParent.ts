import type { DiagramSelection } from '@diagc/renderer';

/**
 * Which container a new node nests under by default: an explicitly selected node
 * wins, else the level the user has drilled into, else none (top-level). Shared
 * by Add node, empty-canvas create, and library click-to-place.
 */
export function defaultParentId(
  selection: DiagramSelection | null,
  drillRoot: string | undefined,
): string | undefined {
  if (selection?.kind === 'node') return selection.id;
  return drillRoot;
}
