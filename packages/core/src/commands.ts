import type {
  Column,
  DiagramLayer,
  DiagramLegend,
  DiagramModel,
  DiagramNode,
  DiagramPlane,
  Drawings,
  LayoutOverlay,
  LayoutSettings,
  Stroke,
  TextRun,
} from './types';
import { resolveContainmentPlane } from './view/compile';
import { addStroke, deleteStroke, pruneDrawingsPlane } from './drawings';
import {
  addContainment,
  addNode,
  addRelation,
  CommandError,
  deleteLayer,
  deleteNode,
  deletePlane,
  deleteRelation,
  groupNodes,
  mergeLayers,
  removeContainment,
  renameNode,
  setDiagramLegend,
  setDiagramNotation,
  setDiagramStyle,
  setNodeDetails,
  setNodePlaneHidden,
  setNodeRich,
  setTableColumns,
  subtreeOf,
  updateRelation,
  upsertLayer,
  upsertPlane,
  type NodeDetails,
  type RelationOptsInput,
  type RelationPatch,
} from './mutate';

export interface EditorState {
  model: DiagramModel;
  layout: LayoutOverlay;
  /** the freehand-drawings sidecar; emptyDrawings() when the diagram has none */
  drawings: Drawings;
}

/** The two members the original command switch knows about. Kept as its own
 * type so that switch is untouched by the drawings sidecar: `applyCommand`
 * wraps it and owns the third member. */
type ModelLayout = Pick<EditorState, 'model' | 'layout'>;

export const emptyLayout = (): LayoutOverlay => ({ version: 1, planes: {} });

export function layoutPlaneKey(m: DiagramModel, plane?: string): string {
  return resolveContainmentPlane(m, plane) ?? 'default';
}

export type EditorCommand =
  | { type: 'add-node'; node: DiagramNode; parent?: { id: string; plane?: string } }
  | { type: 'rename-node'; id: string; name: string }
  | { type: 'set-node-details'; id: string; details: NodeDetails }
  | { type: 'set-node-rich'; id: string; runs: TextRun[] }
  | { type: 'set-table-columns'; id: string; columns: Column[] }
  | { type: 'set-node-plane-hidden'; nodeId: string; plane: string; hidden: boolean }
  | { type: 'set-diagram-style'; style: string | null }
  | { type: 'set-diagram-notation'; notation: string | null }
  | { type: 'set-diagram-legend'; legend: DiagramLegend | null }
  | { type: 'delete-node'; id: string; cascade?: boolean }
  | { type: 'add-containment'; parent: string; child: string; plane?: string }
  | { type: 'remove-containment'; parent: string; child: string; plane?: string }
  | { type: 'group-nodes'; node: DiagramNode; memberIds: string[]; plane?: string }
  | { type: 'add-relation'; from: string; to: string; opts: RelationOptsInput }
  | { type: 'update-relation'; id: string; patch: RelationPatch }
  | { type: 'delete-relation'; id: string }
  | { type: 'upsert-layer'; layer: DiagramLayer }
  | { type: 'delete-layer'; id: string }
  | { type: 'merge-layers'; sources: string[]; target?: string }
  | { type: 'upsert-plane'; plane: DiagramPlane }
  | { type: 'delete-plane'; id: string }
  | { type: 'set-position'; plane?: string; nodeId: string; x: number; y: number }
  | { type: 'set-size'; nodeId: string; w: number; h: number }
  | { type: 'clear-position'; plane?: string; nodeId: string }
  | { type: 'clear-positions'; plane?: string }
  | { type: 'set-positions'; plane?: string; positions: Record<string, { x: number; y: number }> }
  | { type: 'set-plane-layout'; plane?: string; manual: boolean }
  | { type: 'set-layout-settings'; plane?: string; patch: Partial<LayoutSettings> }
  | { type: 'add-stroke'; plane?: string; stroke: Stroke }
  | { type: 'delete-stroke'; plane?: string; id: string }
  /** several commands as one step: applied in order, all or nothing, one undo entry */
  | { type: 'batch'; commands: EditorCommand[] };

function setPos(layout: LayoutOverlay, key: string, nodeId: string, pos?: { x: number; y: number }): LayoutOverlay {
  const plane = { ...(layout.planes[key] ?? {}) };
  if (pos === undefined) delete plane[nodeId];
  else plane[nodeId] = pos;
  return { ...layout, planes: { ...layout.planes, [key]: plane } };
}

/**
 * Drop every node position (across all planes) and every size entry whose id
 * satisfies `drop` — the shared "layout hygiene" contract for commands that
 * destroy nodes (delete-node, and delete-layer's cascade). Identity is preserved
 * as aggressively as possible: an untouched plane bucket keeps its reference,
 * and if nothing at all is dropped the input `layout` is returned unchanged, so
 * layout state unrelated to this command stays referentially stable.
 */
function prunePositions(layout: LayoutOverlay, drop: (nodeId: string) => boolean): LayoutOverlay {
  let changed = false;
  let planes = layout.planes;
  for (const [key, positions] of Object.entries(planes)) {
    const kept = Object.fromEntries(Object.entries(positions).filter(([nid]) => !drop(nid)));
    if (Object.keys(kept).length === Object.keys(positions).length) continue; // bucket untouched → keep ref
    if (!changed) planes = { ...planes }; // first real change: start the structural copy
    planes[key] = kept;
    changed = true;
  }
  let sizes = layout.sizes;
  if (sizes !== undefined) {
    const kept = Object.fromEntries(Object.entries(sizes).filter(([nid]) => !drop(nid)));
    if (Object.keys(kept).length !== Object.keys(sizes).length) {
      sizes = kept;
      changed = true;
    }
  }
  if (!changed) return layout;
  return { ...layout, planes, ...(sizes !== undefined ? { sizes } : {}) };
}

/**
 * Drop every layout structure keyed by `plane` — its positions bucket, manual
 * flag, and layout settings (the "mirror hygiene" for deleting a plane). An
 * emptied `manual`/`settings` map is omitted entirely, mirroring
 * set-plane-layout / set-layout-settings. Returns the input `layout` unchanged
 * when `plane` had no layout state at all.
 */
function prunePlaneLayout(layout: LayoutOverlay, plane: string): LayoutOverlay {
  const hasState =
    plane in layout.planes ||
    (layout.manual !== undefined && plane in layout.manual) ||
    (layout.settings !== undefined && plane in layout.settings);
  if (!hasState) return layout;

  const next: LayoutOverlay = { ...layout, planes: { ...layout.planes } };
  delete next.planes[plane];
  if (layout.manual !== undefined) {
    const { [plane]: _dropManual, ...manualRest } = layout.manual;
    if (Object.keys(manualRest).length > 0) next.manual = manualRest;
    else delete next.manual;
  }
  if (layout.settings !== undefined) {
    const { [plane]: _dropSettings, ...settingsRest } = layout.settings;
    if (Object.keys(settingsRest).length > 0) next.settings = settingsRest;
    else delete next.settings;
  }
  return next;
}

function applyModelLayout(state: ModelLayout, command: EditorCommand): ModelLayout {
  const { model, layout } = state;
  switch (command.type) {
    case 'add-node': {
      let next = addNode(model, command.node);
      if (command.parent !== undefined) {
        next = addContainment(next, command.parent.id, command.node.id, command.parent.plane);
      }
      return { model: next, layout };
    }
    case 'rename-node':
      return { model: renameNode(model, command.id, command.name), layout };
    case 'set-node-details':
      return { model: setNodeDetails(model, command.id, command.details), layout };
    case 'set-node-rich':
      return { model: setNodeRich(model, command.id, command.runs), layout };
    case 'set-table-columns':
      return { model: setTableColumns(model, command.id, command.columns), layout };
    case 'set-node-plane-hidden':
      return { model: setNodePlaneHidden(model, command.nodeId, command.plane, command.hidden), layout };
    case 'set-diagram-style':
      return { model: setDiagramStyle(model, command.style), layout };
    case 'set-diagram-notation':
      return { model: setDiagramNotation(model, command.notation), layout };
    case 'set-diagram-legend':
      return { model: setDiagramLegend(model, command.legend), layout };
    case 'delete-node': {
      // Cascade destroys the whole containment subtree (notation containers
      // whose children cannot be re-homed), so the layout hygiene must cover
      // every doomed id, not just the root.
      const doomed = command.cascade === true ? subtreeOf(model, command.id) : new Set([command.id]);
      return {
        model: deleteNode(model, command.id, command.cascade === true),
        layout: prunePositions(layout, (nid) => doomed.has(nid)),
      };
    }
    case 'add-containment':
      return { model: addContainment(model, command.parent, command.child, command.plane), layout };
    case 'remove-containment':
      return { model: removeContainment(model, command.parent, command.child, command.plane), layout };
    case 'group-nodes': {
      const grouped = groupNodes(model, command.node, command.memberIds, command.plane);
      // The members were positioned as top-level nodes; once nested, those
      // coordinates are reinterpreted parent-relative and collide. Drop them
      // (and the new group's) so the view re-lays them out fresh under elk.
      const key = layoutPlaneKey(grouped, command.plane);
      const bucket = layout.planes[key];
      if (bucket === undefined) return { model: grouped, layout };
      const positions = { ...bucket };
      for (const id of [command.node.id, ...command.memberIds]) delete positions[id];
      return { model: grouped, layout: { ...layout, planes: { ...layout.planes, [key]: positions } } };
    }
    case 'add-relation':
      return { model: addRelation(model, command.from, command.to, command.opts).model, layout };
    case 'update-relation':
      return { model: updateRelation(model, command.id, command.patch), layout };
    case 'delete-relation':
      return { model: deleteRelation(model, command.id), layout };
    case 'upsert-layer':
      return { model: upsertLayer(model, command.layer), layout };
    case 'delete-layer': {
      // Destructive delete removes the layer's tagged nodes, so drop their
      // layout too — the same node-pruning hygiene as delete-node, now shared.
      const doomed = new Set(model.nodes.filter((n) => n.layer === command.id).map((n) => n.id));
      return {
        model: deleteLayer(model, command.id),
        layout: prunePositions(layout, (nid) => doomed.has(nid)),
      };
    }
    case 'merge-layers':
      return { model: mergeLayers(model, command.sources, command.target), layout };
    case 'upsert-plane':
      return { model: upsertPlane(model, command.plane), layout };
    case 'delete-plane':
      // Drop the deleted plane's own positions bucket, manual flag, and layout
      // settings — the same hygiene as deleting a node, now shared in one helper.
      return {
        model: deletePlane(model, command.id),
        layout: prunePlaneLayout(layout, command.id),
      };
    case 'set-position':
      return {
        model,
        layout: setPos(layout, layoutPlaneKey(model, command.plane), command.nodeId, {
          x: command.x,
          y: command.y,
        }),
      };
    case 'set-size':
      return {
        model,
        layout: { ...layout, sizes: { ...(layout.sizes ?? {}), [command.nodeId]: { w: command.w, h: command.h } } },
      };
    case 'clear-position':
      return { model, layout: setPos(layout, layoutPlaneKey(model, command.plane), command.nodeId) };
    case 'clear-positions': {
      const key = layoutPlaneKey(model, command.plane);
      return { model, layout: { ...layout, planes: { ...layout.planes, [key]: {} } } };
    }
    case 'set-positions': {
      const key = layoutPlaneKey(model, command.plane);
      return {
        model,
        layout: {
          ...layout,
          planes: { ...layout.planes, [key]: { ...(layout.planes[key] ?? {}), ...command.positions } },
        },
      };
    }
    case 'set-plane-layout': {
      const key = layoutPlaneKey(model, command.plane);
      const manual = { ...(layout.manual ?? {}) };
      if (command.manual) manual[key] = true;
      else delete manual[key];
      const { manual: _drop, ...rest } = layout;
      return { model, layout: Object.keys(manual).length > 0 ? { ...rest, manual } : rest };
    }
    case 'set-layout-settings': {
      // Merge the patch into this plane's settings; a field explicitly set to
      // undefined clears it. An emptied bucket is dropped, and an emptied
      // settings map is omitted entirely (mirrors set-plane-layout hygiene).
      const key = layoutPlaneKey(model, command.plane);
      const merged: Record<string, unknown> = { ...(layout.settings?.[key] ?? {}) };
      for (const [k, v] of Object.entries(command.patch)) {
        if (v === undefined) delete merged[k];
        else merged[k] = v;
      }
      const settings = { ...(layout.settings ?? {}) };
      if (Object.keys(merged).length === 0) delete settings[key];
      else settings[key] = merged as LayoutSettings;
      const { settings: _drop, ...rest } = layout;
      return { model, layout: Object.keys(settings).length > 0 ? { ...rest, settings } : rest };
    }
    default:
      throw new CommandError(`Unknown command type '${(command as { type: string }).type}'`);
  }
}

export function applyCommand(state: EditorState, command: EditorCommand): EditorState {
  const { model, layout, drawings } = state;
  switch (command.type) {
    case 'add-stroke':
      return { model, layout, drawings: addStroke(drawings, layoutPlaneKey(model, command.plane), command.stroke) };
    case 'delete-stroke':
      return { model, layout, drawings: deleteStroke(drawings, layoutPlaneKey(model, command.plane), command.id) };
    case 'batch':
      return applyCommandWithResult(state, command).state;
    case 'delete-plane': {
      // The drawings bucket is keyed by the plane id, like the layout bucket —
      // same mirror hygiene, third file.
      const next = applyModelLayout(state, command);
      return { model: next.model, layout: next.layout, drawings: pruneDrawingsPlane(drawings, command.id) };
    }
    default: {
      const next = applyModelLayout(state, command);
      return { model: next.model, layout: next.layout, drawings };
    }
  }
}

/**
 * Like {@link applyCommand}, but surfaces the generated id for `add-relation` so
 * callers (e.g. a connect gesture) can select the new relation. All other
 * commands delegate unchanged and carry no id.
 */
export function applyCommandWithResult(
  state: EditorState,
  command: EditorCommand,
): { state: EditorState; relationId?: string } {
  if (command.type === 'batch') {
    // Atomic by construction: members apply to a running copy and a throw
    // unwinds before the caller sees anything. The last add-relation's id is
    // surfaced exactly as a lone add-relation's would be, so a panel that ends
    // a batch with a connect can still select the edge.
    let next = state;
    let relationId: string | undefined;
    for (const c of command.commands) {
      const r = applyCommandWithResult(next, c);
      next = r.state;
      if (r.relationId !== undefined) relationId = r.relationId;
    }
    return relationId !== undefined ? { state: next, relationId } : { state: next };
  }
  if (command.type === 'add-relation') {
    const { model, id } = addRelation(state.model, command.from, command.to, command.opts);
    return { state: { model, layout: state.layout, drawings: state.drawings }, relationId: id };
  }
  return { state: applyCommand(state, command) };
}
