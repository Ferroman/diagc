import {
  ACTIVITY_FRAME_TYPE,
  ACTIVITY_LANE_TYPE,
  ACTIVITY_REGION_TYPE,
  defined,
  isOnPlane,
  type DiagramModel,
  type DiagramNode,
  type EditorCommand,
} from '@diagc/core/internal';
import type { DiagramSelection } from '@diagc/renderer';

/**
 * The move-child steps that restack a frame's lanes from `current` into
 * `target`, as one undo step — or null when the orders already agree. Each lane
 * in turn is walked up into its slot, so the batch replays exactly on the model
 * the panel saw.
 */
export function reorderLanesCommand(
  frameId: string,
  current: readonly string[],
  target: readonly string[],
  plane: string | undefined,
): EditorCommand | null {
  const order = [...current];
  const commands: EditorCommand[] = [];
  target.forEach((lane, slot) => {
    for (let at = order.indexOf(lane); at > slot; at--) {
      commands.push({
        type: 'move-child',
        parent: frameId,
        child: lane,
        offset: -1,
        ...defined({ plane }),
      });
      [order[at - 1], order[at]] = [order[at]!, order[at - 1]!];
    }
  });
  if (commands.length === 0) return null;
  return commands.length === 1 ? commands[0]! : { type: 'batch', commands };
}

/** A lane moved `offset` band slots (a canvas drag can cross several at once)
 * as one undo step: move-child steps a single slot, so it repeats. null for no
 * move at all. */
export function moveLaneCommand(
  frameId: string,
  laneId: string,
  offset: number,
  plane: string | undefined,
): EditorCommand | null {
  if (offset === 0) return null;
  const step: EditorCommand = {
    type: 'move-child',
    parent: frameId,
    child: laneId,
    offset: offset < 0 ? -1 : 1,
    ...defined({ plane }),
  };
  const n = Math.abs(offset);
  return n === 1 ? step : { type: 'batch', commands: Array.from({ length: n }, () => step) };
}

export interface ActivityContext {
  frame: DiagramNode;
  /** where an element quick-add lands: the selected lane or region, or the one
   * around the selected element; undefined on the frame itself */
  target?: DiagramNode;
}

/**
 * The frame the panel works on, and the lane or region it adds into. Anything
 * inside a frame resolves to it — an action as much as a lane — so the lanes stay
 * listed while you work on their contents. With nothing selected a diagram's only
 * frame is the one; with several, a selection has to say which.
 */
export function activityContext(
  model: DiagramModel,
  selection: DiagramSelection | null,
  planeId: string | undefined,
): ActivityContext | undefined {
  const byId = new Map(model.nodes.map((n) => [n.id, n]));
  const parentOf = new Map<string, string>();
  for (const e of model.containment) {
    if (isOnPlane(e, planeId, model) && !parentOf.has(e.child)) parentOf.set(e.child, e.parent);
  }
  if (selection?.kind === 'node') {
    let target: DiagramNode | undefined;
    const seen = new Set<string>();
    for (let n = byId.get(selection.id); n !== undefined && !seen.has(n.id); n = byId.get(parentOf.get(n.id) ?? '')) {
      seen.add(n.id);
      if (n.type === ACTIVITY_FRAME_TYPE) return { frame: n, target };
      if (target === undefined && (n.type === ACTIVITY_LANE_TYPE || n.type === ACTIVITY_REGION_TYPE)) target = n;
    }
  }
  const frames = model.nodes.filter(
    (n) => n.type === ACTIVITY_FRAME_TYPE && (n.plane === undefined || n.plane === planeId),
  );
  return frames.length === 1 ? { frame: frames[0]! } : undefined;
}
