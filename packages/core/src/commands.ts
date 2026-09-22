import type {
  Column,
  Comment,
  DiagramLayer,
  DiagramLegend,
  DiagramModel,
  DiagramNode,
  DiagramPlane,
  Drawings,
  EdgeLabelPlacement,
  LayoutOverlay,
  LayoutSettings,
  NotePlacement,
  Stroke,
  TextRun,
  Threat,
} from './types';
import { threatTargetKey, type ThreatTarget } from './threat-model';
import { hasNoteContent } from './comments';
import { resolveContainmentPlane } from './view/compile';
import { addStroke, deleteStroke, pruneDrawingsPlane } from './drawings';
import { relationLabels } from './labels';
import {
  addComment,
  addContainment,
  addNode,
  addRelation,
  addThreat,
  CommandError,
  deleteLayer,
  deleteNode,
  deletePlane,
  deleteRelation,
  groupNodes,
  mergeLayers,
  removeComment,
  removeContainment,
  removeThreat,
  renameNode,
  setDiagramLegend,
  setDiagramNotation,
  setDiagramStyle,
  setNodeDetails,
  setNodePlaneHidden,
  setNodeRich,
  setTableColumns,
  subtreeOf,
  updateComment,
  updateRelation,
  updateThreat,
  upsertLayer,
  upsertPlane,
  type CommentPatch,
  type NodeDetails,
  type RelationOptsInput,
  type RelationPatch,
  type ThreatPatch,
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
  | { type: 'add-node'; node: DiagramNode; parent?: { id: string; plane?: string } }
  | { type: 'rename-node'; id: string; name: string }
  | { type: 'set-node-details'; id: string; details: NodeDetails }
  | { type: 'set-node-rich'; id: string; runs: TextRun[] }
  | { type: 'set-table-columns'; id: string; columns: Column[] }
  /** STRIDE findings ride on the node/relation they are about, so the three
   * threat commands take a {@link ThreatTarget} instead of a bare id. */
  | { type: 'add-threat'; target: ThreatTarget; threat: Threat }
  | { type: 'update-threat'; target: ThreatTarget; id: string; patch: ThreatPatch }
  | { type: 'remove-threat'; target: ThreatTarget; id: string }
  /** Comments ride on the element too — same target type as the threat trio. */
  | { type: 'add-comment'; target: ThreatTarget; comment: Comment }
  | { type: 'update-comment'; target: ThreatTarget; id: string; patch: CommentPatch }
  | { type: 'remove-comment'; target: ThreatTarget; id: string }
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
  /** replace the list of containers the plane opens with unfolded
   * (LayoutOverlay.unfolded); `[]` clears it */
  | { type: 'set-unfolded'; plane?: string; ids: string[] }
  | { type: 'set-layout-settings'; plane?: string; patch: Partial<LayoutSettings> }
  /** a threat note was dragged: its offset from the automatic anchor, or null to
   * let it sit beside its element again. Layout-only — the threats stay put. */
  | { type: 'set-note-offset'; target: ThreatTarget; plane?: string; offset: { dx: number; dy: number } | null }
  /** open or close one element's threat bubble in this picture (saved, so the export shows it) */
  | { type: 'set-note-open'; target: ThreatTarget; plane?: string; open: boolean }
  /** every element in the model that carries a threat, at once — the `Notes` chip */
  | { type: 'set-notes-open'; plane?: string; open: boolean }
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
 * Drop every node position and unfolded entry (across all planes) and every
 * size entry whose id satisfies `drop` — the shared "layout hygiene" contract for commands that
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
  let next = layout;
  for (const [key, ids] of Object.entries(layout.unfolded ?? {})) {
    const kept = ids.filter((nid) => !drop(nid));
    if (kept.length !== ids.length) next = withUnfolded(next, key, kept);
  }
  if (!changed && next === layout) return layout;
  return { ...next, planes, ...(sizes !== undefined ? { sizes } : {}) };
}

/**
 * `layout` with the plane's unfolded list replaced. Sorted and de-duplicated so
 * the file does not churn with the order boxes were clicked in; an emptied list
 * is dropped and an emptied map omitted entirely (the set-plane-layout hygiene).
 * Exported because the studio's view-mode save builds the same overlay without
 * a command.
 */
export function withUnfolded(layout: LayoutOverlay, key: string, ids: readonly string[]): LayoutOverlay {
  const { unfolded: current = {}, ...rest } = layout;
  const { [key]: _drop, ...others } = current;
  const list = [...new Set(ids)].sort();
  const next = list.length > 0 ? { ...others, [key]: list } : others;
  return Object.keys(next).length > 0 ? { ...rest, unfolded: next } : rest;
}

/**
 * `layout` with viewer label placements merged into the plane's bucket (see
 * LayoutOverlay.edgeLabels). Exported because the studio's view-mode save
 * builds the overlay without a command.
 */
export function withEdgeLabelPlacements(
  layout: LayoutOverlay,
  key: string,
  placements: Readonly<Record<string, Readonly<Record<string, EdgeLabelPlacement>>>>,
): LayoutOverlay {
  if (Object.keys(placements).length === 0) return layout;
  const plane = { ...(layout.edgeLabels?.[key] ?? {}) };
  for (const [relationId, labels] of Object.entries(placements)) plane[relationId] = { ...plane[relationId], ...labels };
  return { ...layout, edgeLabels: { ...(layout.edgeLabels ?? {}), [key]: plane } };
}

/**
 * `layout` with one plane's note bucket replaced, normalised: an entry at the
 * automatic spot that is not open (`{ dx: 0, dy: 0 }`) says nothing and is
 * dropped, then an emptied bucket and an emptied map are omitted — the
 * set-plane-layout hygiene, so a bubble dragged back and closed leaves no
 * trace in the file.
 */
function withNoteBucket(layout: LayoutOverlay, key: string, bucket: Record<string, NotePlacement>): LayoutOverlay {
  const kept: Record<string, NotePlacement> = {};
  for (const [tk, p] of Object.entries(bucket)) {
    if (p.dx === 0 && p.dy === 0 && p.open !== true) continue;
    kept[tk] = p;
  }
  const { notes: current = {}, ...rest } = layout;
  const { [key]: _drop, ...others } = current;
  const next = Object.keys(kept).length > 0 ? { ...others, [key]: kept } : others;
  return Object.keys(next).length > 0 ? { ...rest, notes: next } : rest;
}

/** one entry rewritten through `f` (absent = automatic, closed) */
function withNote(
  layout: LayoutOverlay,
  key: string,
  target: ThreatTarget,
  f: (current: NotePlacement) => NotePlacement,
): LayoutOverlay {
  const tk = threatTargetKey(target);
  const bucket = { ...(layout.notes?.[key] ?? {}) };
  bucket[tk] = f(bucket[tk] ?? { dx: 0, dy: 0 });
  return withNoteBucket(layout, key, bucket);
}

/** `open` set or removed on `p` — never `open: false`, see NotePlacement */
function withOpen(p: NotePlacement, open: boolean): NotePlacement {
  const { open: _drop, ...rest } = p;
  return open ? { ...rest, open: true } : rest;
}

/**
 * Mirror hygiene for `notes` after a command changed the model: a note exists
 * only while its element has something to show, so an offset for an element
 * that lost its last threat/comment/link — or was deleted — is dead data.
 * `hasNoteContent` is the renderer's own test for drawing a bubble; reusing it
 * is what stops a command that merely rewrote `nodes` (a rename, an edited
 * comment) from throwing away a live bubble's saved place. Identity is kept
 * when nothing is dropped, like pruneEdgeLabels.
 */
function pruneNotes(layout: LayoutOverlay, before: DiagramModel, after: DiagramModel): LayoutOverlay {
  if (layout.notes === undefined || (before.nodes === after.nodes && before.relations === after.relations)) return layout;
  const alive = new Set<string>();
  for (const n of after.nodes) if (hasNoteContent(n)) alive.add(threatTargetKey({ node: n.id }));
  for (const r of after.relations) if (hasNoteContent(r)) alive.add(threatTargetKey({ relation: r.id }));
  let changed = false;
  const planes: NonNullable<LayoutOverlay['notes']> = {};
  for (const [key, bucket] of Object.entries(layout.notes)) {
    const kept = Object.fromEntries(Object.entries(bucket).filter(([tk]) => alive.has(tk)));
    if (Object.keys(kept).length !== Object.keys(bucket).length) changed = true;
    if (Object.keys(kept).length > 0) planes[key] = kept;
  }
  if (!changed) return layout;
  const { notes: _drop, ...rest } = layout;
  return Object.keys(planes).length > 0 ? { ...rest, notes: planes } : rest;
}

/**
 * Mirror hygiene for `edgeLabels` after a command changed the relations: drop
 * the placement of a label that no longer exists (its relation or the label
 * itself is gone), and of one whose position the command just set in the MODEL
 * — a viewer's override must never shadow the document the author is editing,
 * or dragging the label in edit mode would appear to do nothing.
 */
function pruneEdgeLabels(layout: LayoutOverlay, before: DiagramModel, after: DiagramModel): LayoutOverlay {
  if (layout.edgeLabels === undefined || before.relations === after.relations) return layout;
  const labelsOf = (m: DiagramModel) =>
    new Map(m.relations.map((r) => [r.id, new Map(relationLabels(r).map((l) => [l.id, l] as const))] as const));
  const was = labelsOf(before);
  const now = labelsOf(after);
  let changed = false;
  const planes: NonNullable<LayoutOverlay['edgeLabels']> = {};
  for (const [key, plane] of Object.entries(layout.edgeLabels)) {
    const keptPlane: (typeof planes)[string] = {};
    for (const [relationId, placements] of Object.entries(plane)) {
      const kept = Object.fromEntries(
        Object.entries(placements).filter(([labelId]) => {
          const label = now.get(relationId)?.get(labelId);
          const old = was.get(relationId)?.get(labelId);
          return label !== undefined && (old === undefined || (old.t === label.t && old.side === label.side));
        }),
      );
      if (Object.keys(kept).length !== Object.keys(placements).length) changed = true;
      if (Object.keys(kept).length > 0) keptPlane[relationId] = kept;
    }
    if (Object.keys(keptPlane).length > 0) planes[key] = keptPlane;
  }
  if (!changed) return layout;
  const { edgeLabels: _drop, ...rest } = layout;
  return Object.keys(planes).length > 0 ? { ...rest, edgeLabels: planes } : rest;
}

/**
 * Drop every layout structure keyed by `plane` — its positions bucket, manual
 * flag, layout settings, unfolded list, label placements and threat-bubble
 * entries (the "mirror hygiene" for deleting a plane). An
 * emptied `manual`/`settings` map is omitted entirely, mirroring
 * set-plane-layout / set-layout-settings. Returns the input `layout` unchanged
 * when `plane` had no layout state at all.
 */
function prunePlaneLayout(layout: LayoutOverlay, plane: string): LayoutOverlay {
  const hasState =
    plane in layout.planes ||
    (layout.manual !== undefined && plane in layout.manual) ||
    (layout.settings !== undefined && plane in layout.settings) ||
    (layout.unfolded !== undefined && plane in layout.unfolded) ||
    (layout.edgeLabels !== undefined && plane in layout.edgeLabels) ||
    (layout.notes !== undefined && plane in layout.notes);
  if (!hasState) return layout;

  const next: LayoutOverlay = { ...withUnfolded(layout, plane, []), planes: { ...layout.planes } };
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
  if (layout.edgeLabels !== undefined) {
    const { [plane]: _dropLabels, ...labelsRest } = layout.edgeLabels;
    if (Object.keys(labelsRest).length > 0) next.edgeLabels = labelsRest;
    else delete next.edgeLabels;
  }
  if (layout.notes !== undefined) {
    const { [plane]: _dropNotes, ...notesRest } = layout.notes;
    if (Object.keys(notesRest).length > 0) next.notes = notesRest;
    else delete next.notes;
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
        layout: withNote(layout, layoutPlaneKey(model, command.plane), command.target, (p) => withOpen(p, command.open)),
      };
    case 'set-notes-open': {
      // Model-wide: every element that carries a threat, whether or not this
      // plane draws it. An entry for an undrawn element is harmless (nothing
      // renders it) and far simpler than threading the compiled view into
      // core; allNotesOpen counts the same set, so the chip cannot disagree.
      const key = layoutPlaneKey(model, command.plane);
      const bucket = { ...(layout.notes?.[key] ?? {}) };
      const targets: ThreatTarget[] = [
        ...model.nodes.filter((n) => (n.threats?.length ?? 0) > 0).map((n) => ({ node: n.id })),
        ...model.relations.filter((r) => (r.threats?.length ?? 0) > 0).map((r) => ({ relation: r.id })),
      ];
      for (const t of targets) {
        const tk = threatTargetKey(t);
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
