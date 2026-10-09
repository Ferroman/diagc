import type {
  Column,
  Comment,
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
  Threat,
} from '../types';
import { elementKey, type ElementRef } from '../elements';
import { layoutPlaneKey } from '../planes';
import { CommandError } from '../command-error';
import { addStroke, deleteStroke, pruneDrawingsPlane } from '../drawings';
import {
  addNode,
  deleteNode,
  renameNode,
  setNodeDetails,
  setNodeRich,
  setPlanDates,
  setTableColumns,
  subtreeOf,
  type NodeDetails,
  type PlanDates,
} from '../mutate/nodes';
import { addContainment, groupNodes, moveChild, removeContainment } from '../mutate/containment';
import {
  addRelation,
  deleteRelation,
  updateRelation,
  type RelationOptsInput,
  type RelationPatch,
} from '../mutate/relations';
import {
  deleteLayer,
  deletePlane,
  mergeLayers,
  setNodePlaneHidden,
  upsertLayer,
  upsertPlane,
} from '../mutate/layers-and-planes';
import {
  addComment,
  addThreat,
  removeComment,
  removeThreat,
  updateComment,
  updateThreat,
  type CommentPatch,
  type ThreatPatch,
} from '../mutate/threats-and-comments';
import { setDiagramLegend, setDiagramNotation, setDiagramStyle } from '../mutate/diagram';
import type { Point } from '../geometry';
import {
  pruneEdgeLabels,
  pruneNotes,
  prunePlaneLayout,
  prunePositions,
  withNote,
  withNoteBucket,
  withOpen,
  withUnfolded,
} from './layout-pruning';

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

/**
 * The pins a plane opens with: its saved `unfolded` containers, in the shape
 * `compileView`'s viewport reads. One reader for every host (studio, published
 * page, embed), so a saved arrangement reopens the same everywhere.
 */
export function openingPins(
  layout: LayoutOverlay | undefined,
  m: DiagramModel,
  plane?: string,
): Record<string, 'expanded' | 'collapsed'> {
  const ids = layout?.unfolded?.[layoutPlaneKey(m, plane)] ?? [];
  return Object.fromEntries(ids.map((id) => [id, 'expanded' as const]));
}

export type EditorCommand =
  | {
      type: 'add-node';
      node: DiagramNode;
      /** `before`/`after` name a sibling to slot the new membership beside:
       * child order is containment declaration order (activity lanes, git lanes) */
      parent?: { id: string; plane?: string; before?: string; after?: string };
    }
  | { type: 'rename-node'; id: string; name: string }
  | { type: 'set-node-details'; id: string; details: NodeDetails }
  | { type: 'set-plan-dates'; id: string; dates: PlanDates }
  | { type: 'set-node-rich'; id: string; runs: TextRun[] }
  | { type: 'set-table-columns'; id: string; columns: Column[] }
  /** STRIDE findings ride on the node/relation they are about, so the three
   * threat commands take a {@link ElementRef} instead of a bare id. */
  | { type: 'add-threat'; target: ElementRef; threat: Threat }
  | { type: 'update-threat'; target: ElementRef; id: string; patch: ThreatPatch }
  | { type: 'remove-threat'; target: ElementRef; id: string }
  /** Comments ride on the element too — same target type as the threat trio. */
  | { type: 'add-comment'; target: ElementRef; comment: Comment }
  | { type: 'update-comment'; target: ElementRef; id: string; patch: CommentPatch }
  | { type: 'remove-comment'; target: ElementRef; id: string }
  | { type: 'set-node-plane-hidden'; nodeId: string; plane: string; hidden: boolean }
  | { type: 'set-diagram-style'; style: string | null }
  | { type: 'set-diagram-notation'; notation: string | null }
  | { type: 'set-diagram-legend'; legend: DiagramLegend | null }
  | { type: 'delete-node'; id: string; cascade?: boolean }
  | { type: 'add-containment'; parent: string; child: string; plane?: string }
  | { type: 'remove-containment'; parent: string; child: string; plane?: string }
  /** restack a child one place earlier (-1) or later (+1) among its siblings */
  | { type: 'move-child'; parent: string; child: string; offset: -1 | 1; plane?: string }
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
  | { type: 'set-positions'; plane?: string; positions: Record<string, Point> }
  | { type: 'set-plane-layout'; plane?: string; manual: boolean }
  /** replace the list of containers the plane opens with unfolded
   * (LayoutOverlay.unfolded); `[]` clears it */
  | { type: 'set-unfolded'; plane?: string; ids: string[] }
  | { type: 'set-layout-settings'; plane?: string; patch: Partial<LayoutSettings> }
  /** a threat note was dragged: its offset from the automatic anchor, or null to
   * let it sit beside its element again. Layout-only — the threats stay put. */
  | { type: 'set-note-offset'; target: ElementRef; plane?: string; offset: { dx: number; dy: number } | null }
  /** open or close one element's threat bubble in this picture (saved, so the export shows it) */
  | { type: 'set-note-open'; target: ElementRef; plane?: string; open: boolean }
  /** every element in the model that carries a threat, at once — the `Notes` chip */
  | { type: 'set-notes-open'; plane?: string; open: boolean }
  | { type: 'add-stroke'; plane?: string; stroke: Stroke }
  | { type: 'delete-stroke'; plane?: string; id: string }
  /** several commands as one step: applied in order, all or nothing, one undo entry */
  | { type: 'batch'; commands: EditorCommand[] };

function setPos(layout: LayoutOverlay, key: string, nodeId: string, pos?: Point): LayoutOverlay {
  const plane = { ...(layout.planes[key] ?? {}) };
  if (pos === undefined) delete plane[nodeId];
  else plane[nodeId] = pos;
  return { ...layout, planes: { ...layout.planes, [key]: plane } };
}

function applyModelLayout(state: ModelLayout, command: EditorCommand): ModelLayout {
  const { model, layout } = state;
  switch (command.type) {
    case 'add-node': {
      let next = addNode(model, command.node);
      if (command.parent !== undefined) {
        const { id, plane, before, after } = command.parent;
        const beside =
          before !== undefined
            ? { sibling: before, side: 'before' as const }
            : after !== undefined
              ? { sibling: after, side: 'after' as const }
              : undefined;
        next = addContainment(next, { parent: id, child: command.node.id, plane }, beside);
      }
      return { model: next, layout };
    }
    case 'rename-node':
      return { model: renameNode(model, command.id, command.name), layout };
    case 'set-node-details':
      return { model: setNodeDetails(model, command.id, command.details), layout };
    case 'set-plan-dates':
      return { model: setPlanDates(model, command.id, command.dates), layout };
    case 'set-node-rich':
      return { model: setNodeRich(model, command.id, command.runs), layout };
    case 'set-table-columns':
      return { model: setTableColumns(model, command.id, command.columns), layout };
    case 'add-threat':
      return { model: addThreat(model, command.target, command.threat), layout };
    case 'update-threat':
      return { model: updateThreat(model, command.target, command.id, command.patch), layout };
    case 'remove-threat':
      return { model: removeThreat(model, command.target, command.id), layout };
    case 'add-comment':
      return { model: addComment(model, command.target, command.comment), layout };
    case 'update-comment':
      return { model: updateComment(model, command.target, command.id, command.patch), layout };
    case 'remove-comment':
      return { model: removeComment(model, command.target, command.id), layout };
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
      return { model: addContainment(model, command), layout };
    case 'remove-containment':
      return { model: removeContainment(model, command), layout };
    case 'move-child':
      return { model: moveChild(model, command, command.offset), layout };
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
    case 'set-unfolded':
      return { model, layout: withUnfolded(layout, layoutPlaneKey(model, command.plane), command.ids) };
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
    case 'set-note-offset':
      // `null` = back to the automatic spot; whether the bubble is open is a
      // separate fact and survives the move
      return {
        model,
        layout: withNote(layout, layoutPlaneKey(model, command.plane), command.target, (p) => ({
          ...p,
          ...(command.offset ?? { dx: 0, dy: 0 }),
        })),
      };
    case 'set-note-open':
      return {
        model,
        layout: withNote(layout, layoutPlaneKey(model, command.plane), command.target, (p) =>
          withOpen(p, command.open),
        ),
      };
    case 'set-notes-open': {
      // Model-wide: every element that carries a threat, whether or not this
      // plane draws it. An entry for an undrawn element is harmless (nothing
      // renders it) and far simpler than threading the compiled view into
      // core; allNotesOpen counts the same set, so the chip cannot disagree.
      const key = layoutPlaneKey(model, command.plane);
      const bucket = { ...(layout.notes?.[key] ?? {}) };
      const targets: ElementRef[] = [
        ...model.nodes.filter((n) => (n.threats?.length ?? 0) > 0).map((n) => ({ node: n.id })),
        ...model.relations.filter((r) => (r.threats?.length ?? 0) > 0).map((r) => ({ relation: r.id })),
      ];
      for (const t of targets) {
        const tk = elementKey(t);
        bucket[tk] = withOpen(bucket[tk] ?? { dx: 0, dy: 0 }, command.open);
      }
      return { model, layout: withNoteBucket(layout, key, bucket) };
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
      return {
        model: next.model,
        layout: pruneNotes(pruneEdgeLabels(next.layout, model, next.model), model, next.model),
        drawings,
      };
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
