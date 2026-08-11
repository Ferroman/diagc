import {
  buildHierarchy,
  resolveContainmentPlane,
  type CompiledView,
  type DiagramModel,
  type Size,
  type ViewNode,
} from '@diagramming/core';
import type { NodeGeometry } from './layout';

/**
 * Sheet-flip focus mapping: given the node ids currently on screen, return the
 * focus set that keeps those entities visible in another plane — every
 * ancestor (in the target plane's hierarchy) of every visible entity.
 * Entities that don't exist in the target plane contribute nothing.
 */
export function focusForVisible(m: DiagramModel, plane: string | undefined, visibleIds: string[]): string[] {
  const h = buildHierarchy(m, resolveContainmentPlane(m, plane));
  const focus = new Set<string>();
  for (const id of visibleIds) {
    const stack = [...(h.parentsOf.get(id) ?? [])];
    while (stack.length > 0) {
      const parent = stack.pop();
      if (parent === undefined || focus.has(parent)) continue;
      focus.add(parent);
      stack.push(...(h.parentsOf.get(parent) ?? []));
    }
  }
  return [...focus];
}

/** a container is focusable once its expanded extent would cover this share of the viewport */
export const FOCUS_ENTER_FRACTION = 0.45;
/** ...and stays focused until it falls below this share (hysteresis) */
export const FOCUS_EXIT_FRACTION = 0.3;
/** world-unit slack around a previously focused container before panning away unfocuses it */
export const FOCUS_EXIT_MARGIN = 80;

export interface FocusInput {
  view: CompiledView;
  geometry: Map<string, NodeGeometry>;
  /** viewport center in world coordinates */
  center: { x: number; y: number };
  zoom: number;
  /** viewport min dimension in px */
  vmin: number;
  /** best-known EXPANDED extent per container (measured, else estimated) */
  extents: Map<string, Size>;
  prevFocus: string[];
}

/**
 * Which container chain is the viewer zoomed into? Walk the visible tree from
 * the roots: at each level pick the container under the viewport center whose
 * expanded extent would fill enough of the viewport, then descend into it.
 * Hysteresis comes from prevFocus: staying focused needs less size than
 * becoming focused, and a margin around the bounds tolerates small pans.
 */
export function computeFocusChain(input: FocusInput): string[] {
  const prev = new Set(input.prevFocus);
  const chain: string[] = [];
  let level: ViewNode[] = input.view.roots;
  let offsetX = 0;
  let offsetY = 0;

  for (;;) {
    let next: ViewNode | undefined;
    let nextX = 0;
    let nextY = 0;
    for (const n of level) {
      if (n.state === 'leaf') continue;
      const geo = input.geometry.get(n.id);
      if (geo === undefined) continue;
      const wasFocused = prev.has(n.id);
      const margin = wasFocused ? FOCUS_EXIT_MARGIN : 0;
      const x = offsetX + geo.x;
      const y = offsetY + geo.y;
      const inside =
        input.center.x >= x - margin &&
        input.center.x <= x + geo.width + margin &&
        input.center.y >= y - margin &&
        input.center.y <= y + geo.height + margin;
      if (!inside) continue;
      const extent = input.extents.get(n.id);
      if (extent === undefined) continue;
      const fraction = (Math.max(extent.width, extent.height) * input.zoom) / input.vmin;
      const threshold = wasFocused ? FOCUS_EXIT_FRACTION : FOCUS_ENTER_FRACTION;
      if (fraction < threshold) continue;
      next = n;
      nextX = x;
      nextY = y;
      break; // first match in model order wins
    }
    if (next === undefined) break;
    chain.push(next.id);
    offsetX = nextX;
    offsetY = nextY;
    level = next.children; // empty while still collapsed — chain deepens next round
    if (level.length === 0) break;
  }
  return chain;
}
