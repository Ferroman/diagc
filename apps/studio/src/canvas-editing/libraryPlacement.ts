import {
  ACTIVITY_FRAME_TYPE,
  ACTIVITY_LANE_TYPE,
  defined,
  LEAF_SIZE,
  uniqueNodeId,
  type BoxSize,
  type DiagramModel,
  type DiagramNode,
  type EditorCommand,
  type Point,
} from '@diagc/core/internal';
import { activityDropPosition, homeActivityParent, type ActivityDrop } from '../activity/activityDrop';
import type { LibraryEntry } from '../library/types';
import { entryToNode, entryToNodeDetails } from '../library/entry';
import { studioNotation } from '../notations';
import { seedDates, seedOnRetype } from '../notations/plan/planActions';
import { createNodeAt, placeTags, type CreateNodePlace } from './create-node';
import { defaultParentId } from './newNodeParent';
import type { UseNodePlacementOptions } from './useNodePlacement';

/** What placing a card reads: the editor, the canvas, where new nodes land, and what follows an add. */
export type LibraryPlacementScope = Pick<
  UseNodePlacementOptions,
  | 'editor'
  | 'layoutApiRef'
  | 'activePlane'
  | 'activePlaneBorrowsContainment'
  | 'penLayer'
  | 'selection'
  | 'drillRoot'
  | 'notation'
  | 'today'
  | 'selectNode'
  | 'requestLabelEdit'
>;

/** Where a card goes: nested under a node, and/or at a drop point. */
export interface PlaceAt {
  parentId?: string;
  position?: Point;
}

/**
 * The card's node, dispatched: its template on the fresh id with the plane and
 * pen tags, and plan dates where it needs them. A frame arrives with its first
 * lane in the same batch.
 */
function addEntryNode(
  scope: LibraryPlacementScope,
  m: DiagramModel,
  entry: LibraryEntry,
  at: { place: CreateNodePlace; parentId: string | undefined; position: Point | undefined },
): void {
  const { editor, activePlane, penLayer, notation, today } = scope;
  const { place, parentId, position } = at;
  // The Zone/Event templates carry no dates of their own, and validation
  // checks a zone's or event's dates on any plane, so every placement seeds
  // them. Only a notation that draws x as days (the plan) lets the drop
  // point pick the day.
  const seeded = seedDates(
    { model: m, plane: activePlane, today },
    entry.template.type,
    defined({ x: studioNotation(notation).datesFromDropPoint === true ? position?.x : undefined, parentId }),
  );
  const node = {
    ...entryToNode(entry, place.id, placeTags(place, penLayer)),
    ...defined({ metadata: seeded }),
  };
  const add = { type: 'add-node', node, ...defined({ parent: place.parent }) } as const;
  if (node.type !== ACTIVITY_FRAME_TYPE) {
    editor.dispatch(add);
    return;
  }
  // A frame is only ever drawn as its lanes, and the Activity panel's Add
  // lane is out of sight until the frame is selected: arrive with the first
  // band so there is somewhere to drop into. One batch, one undo.
  const lane: DiagramNode = {
    id: uniqueNodeId(m, 'Lane 1'),
    name: 'Lane 1',
    type: ACTIVITY_LANE_TYPE,
    ...placeTags(place, penLayer),
  };
  const lanePlane = defined({ plane: activePlane });
  editor.dispatch({
    type: 'batch',
    commands: [add, { type: 'add-node', node: lane, parent: { id: place.id, ...lanePlane } }],
  });
}

/** A dropped card's spot: in a lane, where the pointer let go, not wherever elk
 * would put it — the band then grows around the node you placed; at the top
 * level, centred on the drop point. Anywhere else elk places it. */
function positionDrop(
  { editor, activePlane }: LibraryPlacementScope,
  m: DiagramModel,
  at: { place: CreateNodePlace; position: Point; size: BoxSize; boundsOf: NonNullable<ActivityDrop['boundsOf']> },
): void {
  const { place, position, size, boundsOf } = at;
  const local = activityDropPosition(m, place.parent?.id, { point: position, size, boundsOf });
  if (local !== undefined) {
    editor.dispatch({
      type: 'set-position',
      nodeId: place.id,
      ...local,
      ...defined({ plane: activePlane }),
    });
  }
  if (place.parent === undefined) {
    editor.dispatch({
      type: 'set-position',
      nodeId: place.id,
      x: position.x - size.width / 2,
      y: position.y - size.height / 2,
      ...defined({ plane: activePlane }),
    });
  }
}

/**
 * Place a library entry as a node: Add node's id generation and plane/pen
 * scoping, but the entry's template instead of a blank node, sized when the
 * template carries dimensions, and named in place on the canvas — the
 * Properties Name field Add node focuses is not mounted while the Library tab
 * is up, and placing leaves that tab open on purpose (you place several in a
 * row).
 *
 * Click-to-place (no position) nests under the selected container, as Add node
 * does; drag-to-place passes the drop point, so the node lands there top-level
 * instead — or, dropped on a node, nests under it (at the drop point when that
 * node is an activity lane or region, elk-placed otherwise).
 */
export function placeLibraryEntry(scope: LibraryPlacementScope, entry: LibraryEntry, opts?: PlaceAt): void {
  const { editor, layoutApiRef, activePlane, activePlaneBorrowsContainment, selection, drillRoot } = scope;
  const m = editor.session?.state.model;
  if (m === undefined) return;
  const kind = entry.template.image !== undefined || entry.template.shape !== undefined ? 'icon' : 'node';
  // Drop-on-node or click-with-selection nests; a bare drop point lands in the
  // current drilled level, or top-level when not drilled. Inside an activity
  // frame the target is re-homed to a lane (only lanes may sit in a frame).
  const boundsOf = (id: string) => layoutApiRef.current?.nodeBounds(id);
  const parentId = homeActivityParent(m, activePlane, {
    targetId: opts?.parentId ?? (opts?.position === undefined ? defaultParentId(selection, drillRoot) : drillRoot),
    point: opts?.position,
    boundsOf,
  });
  const place = createNodeAt(m, {
    kind,
    plane: activePlane,
    borrowsContainment: activePlaneBorrowsContainment,
    parentId,
  });
  addEntryNode(scope, m, entry, { place, parentId, position: opts?.position });
  if (entry.template.width !== undefined && entry.template.height !== undefined) {
    editor.dispatch({ type: 'set-size', nodeId: place.id, w: entry.template.width, h: entry.template.height });
  }
  const size = { width: entry.template.width ?? LEAF_SIZE.width, height: entry.template.height ?? LEAF_SIZE.height };
  if (opts?.position !== undefined) positionDrop(scope, m, { place, position: opts.position, size, boundsOf });
  scope.selectNode(place.id);
  scope.requestLabelEdit(place.id);
}

/**
 * Restyle the selected node to match a library card: overwrite its visual
 * channels (type/color/image/shape) with the card's and adopt the card's
 * footprint, leaving the node's identity, containment and relations intact.
 * This is the "make this node look like that library entry" path (vs. placing
 * a fresh node), so the target is the current selection, not a new id.
 */
export function applyLibraryEntry(
  scope: Pick<UseNodePlacementOptions, 'editor' | 'selection' | 'model' | 'activePlane' | 'today'>,
  entry: LibraryEntry,
): void {
  const { editor, selection, model, activePlane, today } = scope;
  if (selection?.kind !== 'node') return;
  const id = selection.id;
  const details = entryToNodeDetails(entry);
  const typeCmd: EditorCommand = { type: 'set-node-details', id, details };
  // A card can restyle the selection straight into plan-zone/plan-event —
  // the same missing-dates trap as a Properties → Type retype (NodeFields'
  // commitType, the notation's OTHER no-drop-point retype path), fixed the
  // same way: seed via seedOnRetype and batch it with the retype so undo
  // reverts both together. Anchored on the node's EXISTING containment on
  // `activePlane` (seedOnRetype's own planGraph lookup), since restyling
  // changes no containment of its own.
  const dateCmd =
    model !== undefined && typeof details.type === 'string'
      ? seedOnRetype({ model, plane: activePlane, today }, id, details.type)
      : undefined;
  editor.dispatch(dateCmd === undefined ? typeCmd : { type: 'batch', commands: [typeCmd, dateCmd] });
  if (entry.template.width !== undefined && entry.template.height !== undefined) {
    editor.dispatch({ type: 'set-size', nodeId: id, w: entry.template.width, h: entry.template.height });
  }
  // A seeded card (the Table entry) also stamps its columns — but only onto a
  // column-less target, so restyling an existing table with the Table card
  // keeps its columns instead of resetting them to the lone `id` seed.
  const node = model?.nodes.find((n) => n.id === id);
  if (entry.template.columns !== undefined && (node?.columns === undefined || node.columns.length === 0)) {
    editor.dispatch({ type: 'set-table-columns', id, columns: entry.template.columns });
  }
}
