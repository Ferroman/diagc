import {
  buildHierarchy,
  openingPins,
  type DiagramModel,
  type LayoutOverlay,
  type NotationId,
} from '@diagc/core/internal';
import { neverFolds } from './vocabulary';

// Which containers a text picture opens with. The fold rules themselves are core's
// (computeLod reads pins); these only decide the pins, the same way the browser hosts
// do, so a printed picture and a PNG — or the TUI and a published page — open alike.

export type Pins = Record<string, 'expanded' | 'collapsed'>;

const containers = (model: DiagramModel): string[] => [...new Set(model.containment.map((c) => c.parent))];

/** The PNG export's folds: every container open, except those the layout keeps
 * folded for the export (`layout.export.collapsed`). The viewer's `exportFolds`. */
export function exportPins(model: DiagramModel, overlay: LayoutOverlay | undefined): Pins {
  const folded = new Set(overlay?.export?.collapsed ?? []);
  return Object.fromEntries(containers(model).map((id) => [id, folded.has(id) ? 'collapsed' : 'expanded']));
}

/** Only the top `depth` levels open: a container whose shallowest way down from a root
 * on the plane is fewer than `depth` steps is open, every other one folded. */
export function depthPins(model: DiagramModel, plane: string | undefined, depth: number): Pins {
  const hierarchy = buildHierarchy(model, plane);
  const depthOf = new Map<string, number>(hierarchy.roots.map((id) => [id, 0]));
  const queue = [...hierarchy.roots];
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i]!;
    for (const child of hierarchy.childrenOf.get(id) ?? []) {
      if (depthOf.has(child)) continue;
      depthOf.set(child, depthOf.get(id)! + 1);
      queue.push(child);
    }
  }
  const pins: Pins = {};
  for (const [id, kids] of hierarchy.childrenOf) {
    if (kids.length > 0) pins[id] = (depthOf.get(id) ?? 0) < depth ? 'expanded' : 'collapsed';
  }
  return pins;
}

/** The published page's opening folds: what the layout saved as unfolded for the plane. */
export function readerPins(model: DiagramModel, overlay: LayoutOverlay | undefined, plane: string | undefined): Pins {
  return openingPins(overlay, model, plane);
}

/** `pins` with the containers that never fold — an activity lane, a trust boundary, a
 * git branch — pinned open over them, as the renderer pins them. Unchanged (the same
 * object) when there are none. */
export function withNeverFolds(model: DiagramModel, pins: Pins, notation: NotationId | undefined): Pins {
  const parents = new Set(containers(model));
  const open = model.nodes.filter((n) => parents.has(n.id) && neverFolds(n, notation));
  if (open.length === 0) return pins;
  return { ...pins, ...Object.fromEntries(open.map((n) => [n.id, 'expanded' as const])) };
}
