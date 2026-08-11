import type { HierarchyIndex } from './hierarchy';
import type { LodState } from './types';

export interface LodInput {
  hierarchy: HierarchyIndex;
  /** ids of the containers the user is zoomed into (an ancestor chain, but any set works) */
  focus?: string[];
  pins?: Record<string, 'expanded' | 'collapsed'>;
}

/**
 * Focus-driven LOD: the diagram rests fully folded — every container renders
 * as a single box — and only pinned-expanded containers plus the focus chain
 * (what the viewer is zoomed into, computed by the renderer from the actual
 * viewport) expand. Pins always win over focus.
 */
export function computeLod(input: LodInput): LodState {
  const out: LodState = {};
  const focus = new Set(input.focus ?? []);
  for (const [id, kids] of input.hierarchy.childrenOf) {
    if (kids.length === 0) continue;
    const pin = input.pins?.[id];
    out[id] = pin ?? (focus.has(id) ? 'expanded' : 'collapsed');
  }
  return out;
}
