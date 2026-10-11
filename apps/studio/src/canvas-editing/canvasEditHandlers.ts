import type { RefObject } from 'react';
import {
  allNotesOpen,
  defined,
  layoutPlaneKey,
  LEAF_SIZE,
  NEW_THREAT_TITLE,
  nextThreatId,
  strideFor,
  threatsOf,
  uniqueNodeId,
  uniqueStrokeId,
  type DiagramModel,
  type EdgeLabelSide,
  type ElementRef,
  type LayoutOverlay,
  type LayoutSettings,
  type NotationId,
  type PlanRole,
  type Point,
  type RelationStyle,
  type Side,
  type Stroke,
  type ThreatStatus,
} from '@diagc/core/internal';
import type { DiagramSelection, DiagramView, LayoutApi, QuickAddSide } from '@diagc/renderer';
import type { EditorApi } from '../session/useEditor';
import { getHost } from '../host';
import { moveLaneCommand } from '../activity/activityLanes';
import { setActorRole } from '../notations/plan/planActions';
import { connectKind } from '../notations';
import type { StudioNotationProfile } from '../notations/types';
import { anyCarriesThreats, threatsOffered } from '../inspector/threatsOffered';
import { deleteSelectionCommand } from './deleteSelection';
import { addEdgeLabel, edgeLabelsOf, editEdgeLabel, moveEdgeLabel } from './edge-labels';
import { quickAdd, quickAddLabel, quickAddPlaced, type QuickAddContext } from './quickAdd';
import { fkConnectionCommands } from './tableConnect';

/** The callbacks DiagramView takes in edit mode. */
export type EditingApi = NonNullable<Parameters<typeof DiagramView>[0]['edit']>;

/**
 * What every group of handlers below reads: this render's session, diagram and
 * plane. A handler that runs after a dispatch of its own reads `editor.peek()`
 * (the synchronous session); one that reads `model` reads the render's.
 */
export interface EditContext {
  editor: EditorApi;
  editing: boolean;
  /** the diagram on screen: the session's while editing */
  model: DiagramModel | undefined;
  layout: LayoutOverlay | undefined;
  activePlane: string | undefined;
  /** The plane every plane-scoped command is filed under; the base view
   * (undefined) sends no `plane` at all, which the commands read as "the
   * resolved default" (see layoutPlaneKey). */
  planeOpt: { plane?: string };
  activePlaneBorrowsContainment: boolean;
  activePlaneManual: boolean;
  penLayer: string | null;
  notation: NotationId | undefined;
  /** what the notation adds (see notations/types): the gestures it reads its own way */
  profile: StudioNotationProfile;
  layoutApiRef: RefObject<LayoutApi | null>;
  /** the canvas selection's operations, and the two requests that open an editor on something just made */
  select: (sel: DiagramSelection | null) => void;
  selectNode: (id: string) => void;
  requestLabelEdit: (id: string) => void;
  requestThreatEdit: (target: ElementRef, id: string) => void;
  /** the canvas multi-selection (Shift+click / marquee) */
  groupSel: string[];
}

/** The `Notes` chip and its key: offered, armed, pressed, and the press. */
export interface NotesToggle {
  /** the diagram has threats, or its notation is meant to grow them */
  offered: boolean;
  /** an element carries a threat, so there is a note to open */
  anyThreats: boolean;
  /** every note is open */
  allOpen: boolean;
  /** open every note, or close them all when they are */
  toggleAll: () => void;
}

// Notes on the canvas. A note only reports gestures — which threat
// to add, what a title became — and the host owns the model, exactly as it
// does for quick add: the renderer never invents an id or a category.
export function noteHandlers({ editor, planeOpt, requestThreatEdit }: EditContext) {
  const addThreatOn = (target: ElementRef) => {
    // peek(): the synchronous session, so a second + right after the first
    // commit sees the threat that commit added and picks the next free id.
    const m = editor.peek()?.state.model;
    if (m === undefined) return;
    const existing = threatsOf(m, target);
    if (existing === undefined) return; // no such element: a stale note
    // The element's own STRIDE letters, so a store opens on Tampering rather
    // than on a constant; the panel is where it gets corrected.
    const typeOrKind =
      'node' in target
        ? m.nodes.find((n) => n.id === target.node)?.type
        : m.relations.find((r) => r.id === target.relation)?.kind;
    const id = nextThreatId(existing);
    // NEW_THREAT_TITLE, never `''`: autosave fires on a 300ms timer, so the
    // model this dispatch produces is saved while the field is still open — and
    // an empty title fails validation, which the save handler answers with a
    // 400 and the toolbar with a red banner mid-typing. A placeholder keeps
    // every intermediate state a valid model.
    // One undo step: the first threat AND its note, open — the `+` was a
    // request to write on the canvas, and a closed note would swallow the
    // title field the request opens next.
    editor.dispatch({
      type: 'batch',
      commands: [
        {
          type: 'add-threat',
          target,
          threat: { id, category: strideFor(typeOrKind)[0] ?? 'S', title: NEW_THREAT_TITLE },
        },
        { type: 'set-note-open', target, open: true, ...planeOpt },
      ],
    });
    requestThreatEdit(target, id); // …and open it for typing, where it was added
  };
  const retitleThreat = (target: ElementRef, id: string, title: string) => {
    const m = editor.peek()?.state.model;
    const current = m !== undefined ? threatsOf(m, target)?.find((t) => t.id === id) : undefined;
    if (current === undefined) return;
    // An emptied or escaped field on a threat nobody has named yet takes it away
    // again — the placeholder is how "never titled" is recognised. On a threat
    // that carries a real title it is a cancelled edit, so the title stands; the
    // field never writes `''` into the model, which would fail validation and
    // wedge every autosave until it was fixed.
    if (title === '') {
      if (current.title === NEW_THREAT_TITLE) editor.dispatch({ type: 'remove-threat', target, id });
      return;
    }
    if (title !== current.title) editor.dispatch({ type: 'update-threat', target, id, patch: { title } });
  };
  const setThreatStatus = (target: ElementRef, id: string, status: ThreatStatus) =>
    editor.dispatch({ type: 'update-threat', target, id, patch: { status } });
  const editThreatText = (target: ElementRef, id: string, field: 'description' | 'mitigation', text: string) => {
    const m = editor.peek()?.state.model;
    const current = m !== undefined ? threatsOf(m, target)?.find((t) => t.id === id) : undefined;
    if (current === undefined) return;
    // `''` clears (null in the patch — the field is optional on a Threat, and
    // an empty string would be a third state); an unchanged value is no command
    if ((current[field] ?? '') === text) return;
    editor.dispatch({ type: 'update-threat', target, id, patch: { [field]: text === '' ? null : text } });
  };
  return {
    onNoteMoved: (target: ElementRef, offset: { dx: number; dy: number }) =>
      editor.dispatch({ type: 'set-note-offset', target, offset, ...planeOpt }),
    onToggleNote: (target: ElementRef, open: boolean) =>
      editor.dispatch({ type: 'set-note-open', target, open, ...planeOpt }),
    onAddThreat: addThreatOn,
    onRetitleThreat: retitleThreat,
    onSetThreatStatus: setThreatStatus,
    onEditThreatText: editThreatText,
  } satisfies EditingApi;
}

/** The Notes chip in the top bar and the `edit.toggle-notes` key. */
export function notesToggle({ editor, model, layout, activePlane, planeOpt, notation }: EditContext): NotesToggle {
  // The `Notes` chip reads pressed only when EVERY note is open (model-wide,
  // the set-notes-open rule), so a press always does what the picture lacks.
  const allOpen =
    model !== undefined && layout !== undefined && allNotesOpen(model, layout, layoutPlaneKey(model, activePlane));
  const anyThreats = model !== undefined && anyCarriesThreats(model);
  // Only a diagram that has threats (or is meant to grow them) gets the chip.
  const offered = model !== undefined && threatsOffered(notation, anyThreats);
  return {
    offered,
    anyThreats,
    allOpen,
    toggleAll: () => editor.dispatch({ type: 'set-notes-open', open: !allOpen, ...planeOpt }),
  };
}

// Set (or clear, with side=null) one endpoint's fixed side on a relation,
// merged into its existing style so other overrides survive; returns the next
// style object, or null when nothing remains (drops the style entirely). Shared
// by the fixed-side dots (onSetEdgeSide) and a reconnect drag that fixes a side.
const styleWithSide = (
  model: DiagramModel | undefined,
  relationId: string,
  end: 'from' | 'to',
  side: Side | null,
): RelationStyle | null => {
  const style: RelationStyle = { ...model?.relations.find((r) => r.id === relationId)?.style };
  const key = end === 'from' ? 'fromSide' : 'toSide';
  if (side === null) delete style[key];
  else style[key] = side;
  return Object.keys(style).length > 0 ? style : null;
};

/** A relation's labels and its ends: the label gestures, a reconnect drag and the fixed-side dots. */
export function relationEndHandlers({ editor, model }: EditContext) {
  // Multi-label edge editing. Each helper reads the relation, projects its
  // effective labels through relationLabels() (via edge-labels.ts, bridging a
  // legacy `label`), computes the next array, and dispatches update-relation
  // { labels }. A relation upgrades from a legacy `label` to `labels` on its
  // first edit. The pure compute lives in edge-labels.ts; the dispatch glue is
  // here because it needs the live editor session.
  const addEdgeLabelFor = (relationId: string, text: string, t: number, side: EdgeLabelSide) => {
    if (model === undefined) return;
    const cur = edgeLabelsOf(model, relationId);
    if (cur === null) return;
    editor.dispatch({
      type: 'update-relation',
      id: relationId,
      patch: { labels: addEdgeLabel(cur, text, t, side) },
    });
  };
  const editEdgeLabelFor = (relationId: string, labelId: string, text: string) => {
    if (model === undefined) return;
    const cur = edgeLabelsOf(model, relationId);
    if (cur === null) return;
    editor.dispatch({ type: 'update-relation', id: relationId, patch: { labels: editEdgeLabel(cur, labelId, text) } });
  };
  const moveEdgeLabelFor = (relationId: string, labelId: string, t: number, side: EdgeLabelSide) => {
    if (model === undefined) return;
    const cur = edgeLabelsOf(model, relationId);
    if (cur === null) return;
    editor.dispatch({
      type: 'update-relation',
      id: relationId,
      patch: { labels: moveEdgeLabel(cur, labelId, t, side) },
    });
  };
  return {
    onAddEdgeLabel: addEdgeLabelFor,
    onEditEdgeLabel: editEdgeLabelFor,
    onMoveEdgeLabel: moveEdgeLabelFor,
    onReconnect: (
      relationId: string,
      from: string,
      to: string,
      fixedSide?: { end: 'from' | 'to'; side: Side | null },
    ) =>
      // move the endpoint(s); the dragged end floats (new node) or
      // is fixed to the side it was dropped on (same node)
      editor.dispatch({
        type: 'update-relation',
        id: relationId,
        patch: {
          from,
          to,
          ...(fixedSide !== undefined
            ? { style: styleWithSide(model, relationId, fixedSide.end, fixedSide.side) }
            : {}),
        },
      }),
    onSetEdgeSide: (relationId: string, end: 'from' | 'to', side: Side | null) =>
      editor.dispatch({
        type: 'update-relation',
        id: relationId,
        patch: { style: styleWithSide(model, relationId, end, side) },
      }),
  } satisfies EditingApi;
}

/** Moves, drops, resizes and the plan's role chips: a notation that reads a gesture its own way answers first. */
export function nodeGestureHandlers({ editor, model, activePlane, planeOpt, profile }: EditContext) {
  return {
    onNodesMoved: (positions: Record<string, Point>, deltas: Record<string, { dx: number; dy: number }>) => {
      // a notation that reads a move its own way (the plan: as
      // dates) consumes it, even when it changed nothing
      const nodesMoved = profile.gestures?.nodesMoved;
      if (nodesMoved !== undefined && model !== undefined) {
        const command = nodesMoved({ model, plane: activePlane, positions, deltas });
        if (command !== undefined) editor.dispatch(command);
        return;
      }
      editor.dispatch({
        type: 'set-positions',
        positions,
        ...planeOpt,
      });
    },
    onDropInto: (id: string, targetId: string, rel: Point) => {
      // only a notation with drop targets (the plan) reads a drop
      const dropInto = profile.gestures?.dropInto;
      if (dropInto !== undefined && model !== undefined) {
        const command = dropInto({ model, plane: activePlane, id, targetId, rel });
        if (command !== undefined) editor.dispatch(command);
      }
    },
    onMoveLane: (frameId: string, laneId: string, offset: number) => {
      const command = moveLaneCommand(frameId, laneId, offset, activePlane);
      if (command !== null) editor.dispatch(command);
    },
    // the chip only ever renders where the renderer's profile draws
    // role chips (the plan), so no notation is asked here
    onSetRole: (zoneId: string, actorId: string, role: PlanRole | null) => {
      if (model === undefined) return;
      const command = setActorRole(model, zoneId, actorId, role);
      if (command !== undefined) editor.dispatch(command);
    },
    onResize: (id: string, w: number, h: number, pos: Point) => {
      // a notation may read a resize its own way (the plan: a zone's
      // dates), and hands back a node it does not
      const resize = profile.gestures?.resize;
      if (resize !== undefined && model !== undefined) {
        const command = resize({ model, plane: activePlane, id, w, h, pos });
        if (command !== 'generic') {
          if (command !== undefined) editor.dispatch(command);
          return;
        }
      }
      editor.dispatch({ type: 'set-size', nodeId: id, w, h });
      // top/left-handle resizes shift the node origin — save the
      // post-resize position too, or the next resync snaps it
      // back by the size delta.
      editor.dispatch({
        type: 'set-position',
        nodeId: id,
        x: pos.x,
        y: pos.y,
        ...planeOpt,
      });
    },
  } satisfies EditingApi;
}

/** A connect gesture, and Delete on the canvas selection. */
export function connectAndDeleteHandlers({ editor, penLayer, notation, select }: EditContext) {
  return {
    onConnect: (from: string, to: string, sourceHandle?: string | null) => {
      // Dragging from a table column's row handle creates an fk
      // relation (+ flags the column) instead of the default float
      // edge. float by default: no fixed sides, so the new edge
      // tracks the facing borders. Fix one later with a fixed-side
      // dot or the panel. The edge lands on the active sheet (the pen), like
      // nodes. The kind otherwise comes from the notation and the
      // two endpoints (connectKind) — a threat model's flows must be
      // data-flow to be read as flows at all, unless an end is a
      // trust boundary, which no flow may touch.
      const m = editor.session?.state.model;
      const cmds =
        m !== undefined ? fkConnectionCommands(m, { from, to, sourceHandle, layer: penLayer ?? undefined }) : null;
      if (cmds !== null) {
        for (const c of cmds) editor.dispatch(c);
        return;
      }
      editor.dispatch({
        type: 'add-relation',
        from,
        to,
        opts: defined({ kind: connectKind(notation, m, from, to), layer: penLayer ?? undefined }),
      });
    },
    onDeleteSelection: (sel: { nodeIds: string[]; relationIds: string[] }) => {
      // peek(): the synchronous session — the gesture must
      // translate against the model it was made on.
      const m = editor.peek()?.state.model;
      const cmd = m !== undefined ? deleteSelectionCommand(m, sel) : null;
      if (cmd === null) return;
      editor.dispatch(cmd);
      select(null); // the panel target is gone
    },
  } satisfies EditingApi;
}

/** The pen draws a stroke on the plane on screen; the eraser takes one away. */
export function strokeHandlers({ editor, activePlane, planeOpt }: EditContext) {
  return {
    onAddStroke: (stroke: Omit<Stroke, 'id'>) => {
      // peek(): the synchronous session, so two strokes in
      // quick succession never reuse an id.
      const d = editor.peek()?.state.drawings;
      const m = editor.peek()?.state.model;
      if (d === undefined || m === undefined) return;
      editor.dispatch({
        type: 'add-stroke',
        stroke: { id: uniqueStrokeId(d, layoutPlaneKey(m, activePlane)), ...stroke },
        ...planeOpt,
      });
    },
    onDeleteStroke: (id: string) =>
      editor.dispatch({
        type: 'delete-stroke',
        id,
        ...planeOpt,
      }),
  } satisfies EditingApi;
}

// The `+` on a selected node and the Tab key are one action: add the node
// the notation expects on the selection (a category / cause on a fish, a
// consequence, a flow to a new process, a connected sibling anywhere else)
// and open it for typing, the way the notation panels' own buttons do.
// Placement: a sibling goes beside its source only when elk would not place
// it (manual plane) or the source has a saved position — see quickAddPlaced.
// `run` reports whether it acted so the hotkeys dispatcher only swallows Tab's
// default focus move when there was something to extend (see useHotkeys).
export function quickAddHandlers(ctx: EditContext) {
  const { editor, editing, model, layout, activePlane, activePlaneManual, layoutApiRef } = ctx;
  const quickAddCtx: QuickAddContext = {
    notation: ctx.notation,
    plane: activePlane,
    borrowsContainment: ctx.activePlaneBorrowsContainment,
    penLayer: ctx.penLayer,
  };
  const run = (id: string, side?: QuickAddSide): boolean => {
    // peek(): the synchronous session, so the add is built on the model the
    // gesture was made on — Tab commits the name being typed a moment before it
    // adds, and the new node's id must not collide with that render's stale one.
    const m = editor.peek()?.state.model;
    if (!editing || m === undefined) return false;
    const out = quickAdd(m, id, quickAddCtx, side);
    if (out === undefined) return false;
    const key = layoutPlaneKey(m, activePlane);
    // the source's own box size, when it was ever resized — the sibling takes it
    // so a row of hand-sized stencils stays one size (see quickAddPlaced)
    const size = layout?.sizes?.[id];
    editor.dispatch(
      quickAddPlaced(out, {
        needsPosition: activePlaneManual || layout?.planes[key]?.[id] !== undefined,
        source: layoutApiRef.current?.snapshotPositions()[id],
        width: size?.w ?? LEAF_SIZE.width,
        size,
        plane: activePlane,
      }),
    );
    ctx.select({ kind: 'node', id: out.id });
    ctx.requestLabelEdit(out.id);
    return true;
  };
  return {
    label: (id: string, side?: QuickAddSide) =>
      model !== undefined ? quickAddLabel(model, id, quickAddCtx, side) : undefined,
    run,
  };
}

/** The plane's layout commands in edit mode: the auto-layout switch and the
 * settings the Layout & style section edits. */
export function planeLayoutHandlers({ editor, activePlaneManual, planeOpt, layoutApiRef }: EditContext) {
  return {
    // Flip the active plane between automatic and manual layout. Turning auto Off
    // freezes the current on-screen positions (so nothing jumps) then sets the
    // manual flag; turning it On just clears the flag (non-destructive — the saved
    // positions stay, but automatic layout resumes driving the arrangement).
    toggleAutoLayout: () => {
      if (editor.session?.state.model === undefined) return;
      if (activePlaneManual) {
        editor.dispatch({ type: 'set-plane-layout', manual: false, ...planeOpt });
      } else {
        editor.dispatch({
          type: 'set-positions',
          positions: layoutApiRef.current?.snapshotPositions() ?? {},
          ...planeOpt,
        });
        editor.dispatch({ type: 'set-plane-layout', manual: true, ...planeOpt });
      }
    },
    // Merge a layout-settings patch into the active plane (a field set to undefined
    // clears it back to the tuned default; the reducer drops emptied buckets).
    setLayoutSettings: (patch: Partial<LayoutSettings>) => {
      if (editor.session?.state.model === undefined) return;
      editor.dispatch({
        type: 'set-layout-settings',
        patch,
        ...planeOpt,
      });
    },
  };
}

// Wrap the shift-selected variables in a new abstract variable, scoped to the
// active plane so (in the causal-loop view) it stays out of the base view.
export const groupSelection =
  ({ editor, model, groupSel, activePlane, activePlaneBorrowsContainment, selectNode }: EditContext) =>
  async () => {
    if (groupSel.length < 2 || model === undefined) return;
    const name = (await getHost().promptText('Group name:', 'group'))?.trim();
    if (name === undefined || name === '') return;
    const id = uniqueNodeId(model, name);
    const scoped = activePlane !== undefined && !activePlaneBorrowsContainment;
    editor.dispatch({
      type: 'group-nodes',
      node: { id, name, ...(scoped ? { plane: activePlane } : {}) },
      memberIds: groupSel,
      ...(scoped ? { plane: activePlane } : {}),
    });
    selectNode(id);
  };
