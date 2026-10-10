import { useCallback, useMemo, useState } from 'react';
import type { Node } from '@xyflow/react';
import {
  elementKey,
  layoutPlaneKey,
  type CompiledView,
  type DiagramModel,
  type LayoutOverlay,
  type Point,
} from '@diagc/core/internal';
import { deriveNoteNodes, type BadgeSpot } from '../notes/derive-note-nodes';
import type { Rect } from '../notes/note-place';
import type { NoteState } from '../notes/note-state';
import type { NotationProfile } from '../notations';
import type { Registry, TypeStyle } from '../registry';
import type { NoteSession } from './useNoteSession';
import type { EditingApi } from './view-types';

export interface NoteNodesInput {
  model: DiagramModel;
  plane: string | undefined;
  /** `false` draws no notes at all */
  notes: boolean | undefined;
  layout: LayoutOverlay | undefined;
  session: NoteSession;
  editing: boolean;
  edit: EditingApi | undefined;
  onOpenLink: ((link: string) => void) | undefined;
  compiled: CompiledView;
  arrangedGeometry: ReadonlyMap<string, Rect> | null;
  profile: NotationProfile;
  nameOf: ReadonlyMap<string, string>;
  typeRegistry: Registry<TypeStyle>;
}

export interface NoteNodes {
  /** what the badges read to know whether their note is open and how to flip
   * it; null on a canvas that draws no notes */
  noteState: NoteState | null;
  noteNodes: Node[];
}

/** The open notes, as nodes, and the switch the badges flip them with. */
export function useNoteNodes(input: NoteNodesInput): NoteNodes {
  const { session, editing, edit, compiled, arrangedGeometry, profile, nameOf, typeRegistry } = input;
  const { noteEdit, setNoteEdit, noteOverrides, setNoteOverrides } = session;
  // Where each threat-carrying flow's counting badge is drawn (relation id →
  // flow coordinates, the side of the line it sits on, and the line itself),
  // reported by the edges (NoteState.placeBadge): a flow's note hangs off its
  // badge, every note keeps off the line, and both sit on the routed curve
  // only the edge knows. Entries outlive their edges — a hidden flow draws no
  // note, and a returning one reports again — so nothing prunes it; the
  // derivation reads only the flows it draws.
  const [badgeSpots, setBadgeSpots] = useState<ReadonlyMap<string, BadgeSpot>>(() => new Map());
  const placeBadge = useCallback((relation: string, at: Point, away: Point, line: readonly Point[]) => {
    setBadgeSpots((prev) => {
      const was = prev.get(relation);
      const same =
        was !== undefined &&
        was.at.x === at.x &&
        was.at.y === at.y &&
        was.away.x === away.x &&
        was.away.y === away.y &&
        was.line.length === line.length &&
        was.line.every((p, i) => p.x === line[i]!.x && p.y === line[i]!.y);
      return same ? prev : new Map(prev).set(relation, { at, away, line });
    });
  }, []);

  const planeKey = layoutPlaneKey(input.model, input.plane);
  const noNotes = input.notes === false;
  const notePlacements = input.layout?.notes?.[planeKey];
  // The open set: saved flags, then this session's toggles on top.
  const openNotes = useMemo(() => {
    const open = new Set<string>();
    for (const [key, p] of Object.entries(notePlacements ?? {})) if (p.open === true) open.add(key);
    for (const [key, isOpen] of noteOverrides) {
      if (isOpen) open.add(key);
      else open.delete(key);
    }
    return open;
  }, [notePlacements, noteOverrides]);
  const onToggleNote = edit?.onToggleNote;
  const noteState = useMemo<NoteState | null>(
    () =>
      noNotes
        ? null
        : {
            isOpen: (key) => openNotes.has(key),
            toggle: (target) => {
              const key = elementKey(target);
              const next = !openNotes.has(key);
              if (editing && onToggleNote !== undefined) onToggleNote(target, next);
              else setNoteOverrides((prev) => new Map(prev).set(key, next));
            },
            placeBadge,
          },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setNoteOverrides is a stable useState identity from useNoteSession
    [noNotes, openNotes, editing, onToggleNote, placeBadge],
  );
  const onOpenLink = input.onOpenLink;
  const noteNodes = useMemo((): Node[] => {
    if (noNotes || openNotes.size === 0 || arrangedGeometry === null) return [];
    return deriveNoteNodes({
      compiled,
      geometry: arrangedGeometry,
      open: openNotes,
      placements: notePlacements,
      badgeSpots,
      editing,
      offersThreats: profile.offersThreats === true,
      editingRow: noteEdit,
      onAddThreat: edit?.onAddThreat,
      onRetitleThreat: edit?.onRetitleThreat,
      onSetThreatStatus: edit?.onSetThreatStatus,
      onEditThreatText: edit?.onEditThreatText,
      onOpenLink,
      onEndEdit: () => setNoteEdit(null),
      nameOf,
      typeRegistry,
    });
    // edit?.onAddThreat / onRetitleThreat / onSetThreatStatus / onEditThreatText /
    // onOpenLink may be fresh closures per host render — the same trade
    // nodeDataCtx makes, and for the same reason: a stale callback would edit
    // the wrong document, or open a link through a host that is no longer there.
    // profile is here because the threat offer is gated on it (see
    // deriveNoteNodes): switching to a threat-model plane has to redraw the notes.
    // It is memoized on props.notation, so it changes exactly when that does.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setNoteEdit is a stable useState identity from useNoteSession
  }, [
    noNotes,
    openNotes,
    arrangedGeometry,
    compiled,
    notePlacements,
    badgeSpots,
    editing,
    edit?.onAddThreat,
    edit?.onRetitleThreat,
    edit?.onSetThreatStatus,
    edit?.onEditThreatText,
    onOpenLink,
    profile,
    noteEdit,
    nameOf,
    typeRegistry,
  ]);
  return { noteState, noteNodes };
}
