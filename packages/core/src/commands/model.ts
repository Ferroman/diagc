import type {
  Column,
  Comment,
  DiagramLayer,
  DiagramLegend,
  DiagramModel,
  DiagramNode,
  DiagramPlane,
  TextRun,
  Threat,
} from '../types';
import type { ElementRef } from '../elements';
import { layoutPlaneKey } from '../planes';
import { pruneDrawingsPlane } from '../drawings';
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
import type { CommandResult, EditorState, Handlers } from './index';
import { prunePlaneLayout, prunePositions } from './layout-pruning';

/** Commands that change the model. The ones that destroy nodes or planes also drop
 * the layout and drawings entries that belonged to them. */
export type ModelCommand =
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
  | { type: 'delete-plane'; id: string };

type Of<K extends ModelCommand['type']> = Extract<ModelCommand, { type: K }>;

/** The result of a command that changed the model and nothing else. */
const withModel = (state: EditorState, model: DiagramModel): CommandResult => ({ state: { ...state, model } });

function handleAddNode(state: EditorState, command: Of<'add-node'>): CommandResult {
  const model = addNode(state.model, command.node);
  if (command.parent === undefined) return withModel(state, model);
  const { id, plane, before, after } = command.parent;
  const beside =
    before !== undefined
      ? { sibling: before, side: 'before' as const }
      : after !== undefined
        ? { sibling: after, side: 'after' as const }
        : undefined;
  return withModel(state, addContainment(model, { parent: id, child: command.node.id, plane }, beside));
}

function handleDeleteNode(state: EditorState, command: Of<'delete-node'>): CommandResult {
  // Cascade destroys the whole containment subtree (notation containers whose
  // children cannot be re-homed), so the layout pruning must cover every doomed
  // id, not just the root.
  const cascade = command.cascade === true;
  const doomed = cascade ? subtreeOf(state.model, command.id) : new Set([command.id]);
  return {
    state: {
      ...state,
      model: deleteNode(state.model, command.id, cascade),
      layout: prunePositions(state.layout, (id) => doomed.has(id)),
    },
  };
}

function handleGroupNodes(state: EditorState, command: Of<'group-nodes'>): CommandResult {
  const model = groupNodes(state.model, command.node, command.memberIds, command.plane);
  // The members were positioned as top-level nodes; once nested, those
  // coordinates are reinterpreted parent-relative and collide. Drop them
  // (and the new group's) so the view re-lays them out fresh under elk.
  const key = layoutPlaneKey(model, command.plane);
  const bucket = state.layout.planes[key];
  if (bucket === undefined) return withModel(state, model);
  const positions = { ...bucket };
  for (const id of [command.node.id, ...command.memberIds]) delete positions[id];
  return {
    state: { ...state, model, layout: { ...state.layout, planes: { ...state.layout.planes, [key]: positions } } },
  };
}

function handleAddRelation(state: EditorState, command: Of<'add-relation'>): CommandResult {
  const { model, id } = addRelation(state.model, command.from, command.to, command.opts);
  return { state: { ...state, model }, relationId: id };
}

function handleDeleteLayer(state: EditorState, command: Of<'delete-layer'>): CommandResult {
  // Destructive delete removes the layer's tagged nodes, so drop their layout
  // too — the same node pruning as delete-node.
  const doomed = new Set(state.model.nodes.filter((n) => n.layer === command.id).map((n) => n.id));
  return {
    state: {
      ...state,
      model: deleteLayer(state.model, command.id),
      layout: prunePositions(state.layout, (id) => doomed.has(id)),
    },
  };
}

function handleDeletePlane(state: EditorState, command: Of<'delete-plane'>): CommandResult {
  // Everything the layout and the drawings file kept for the plane goes with it;
  // both sidecars key their buckets by plane id.
  return {
    state: {
      model: deletePlane(state.model, command.id),
      layout: prunePlaneLayout(state.layout, command.id),
      drawings: pruneDrawingsPlane(state.drawings, command.id),
    },
  };
}

export const MODEL_HANDLERS: Handlers<ModelCommand> = {
  'add-node': handleAddNode,
  'rename-node': (state, { id, name }) => withModel(state, renameNode(state.model, id, name)),
  'set-node-details': (state, { id, details }) => withModel(state, setNodeDetails(state.model, id, details)),
  'set-plan-dates': (state, { id, dates }) => withModel(state, setPlanDates(state.model, id, dates)),
  'set-node-rich': (state, { id, runs }) => withModel(state, setNodeRich(state.model, id, runs)),
  'set-table-columns': (state, { id, columns }) => withModel(state, setTableColumns(state.model, id, columns)),
  'add-threat': (state, { target, threat }) => withModel(state, addThreat(state.model, target, threat)),
  'update-threat': (state, { target, id, patch }) => withModel(state, updateThreat(state.model, target, id, patch)),
  'remove-threat': (state, { target, id }) => withModel(state, removeThreat(state.model, target, id)),
  'add-comment': (state, { target, comment }) => withModel(state, addComment(state.model, target, comment)),
  'update-comment': (state, { target, id, patch }) => withModel(state, updateComment(state.model, target, id, patch)),
  'remove-comment': (state, { target, id }) => withModel(state, removeComment(state.model, target, id)),
  'set-node-plane-hidden': (state, { nodeId, plane, hidden }) =>
    withModel(state, setNodePlaneHidden(state.model, nodeId, plane, hidden)),
  'set-diagram-style': (state, { style }) => withModel(state, setDiagramStyle(state.model, style)),
  'set-diagram-notation': (state, { notation }) => withModel(state, setDiagramNotation(state.model, notation)),
  'set-diagram-legend': (state, { legend }) => withModel(state, setDiagramLegend(state.model, legend)),
  'delete-node': handleDeleteNode,
  // A containment command is the edge it names, plus its type.
  'add-containment': (state, command) => withModel(state, addContainment(state.model, command)),
  'remove-containment': (state, command) => withModel(state, removeContainment(state.model, command)),
  'move-child': (state, command) => withModel(state, moveChild(state.model, command, command.offset)),
  'group-nodes': handleGroupNodes,
  'add-relation': handleAddRelation,
  'update-relation': (state, { id, patch }) => withModel(state, updateRelation(state.model, id, patch)),
  'delete-relation': (state, { id }) => withModel(state, deleteRelation(state.model, id)),
  'upsert-layer': (state, { layer }) => withModel(state, upsertLayer(state.model, layer)),
  'delete-layer': handleDeleteLayer,
  'merge-layers': (state, { sources, target }) => withModel(state, mergeLayers(state.model, sources, target)),
  'upsert-plane': (state, { plane }) => withModel(state, upsertPlane(state.model, plane)),
  'delete-plane': handleDeletePlane,
};
