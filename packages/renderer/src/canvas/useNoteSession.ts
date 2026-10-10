import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

/** The threat row a note holds open for typing: which note (`elementKey`) and
 * which row (threat id). */
export type NoteRow = { key: string; id: string };

export interface NoteSession {
  noteEdit: NoteRow | null;
  setNoteEdit: Dispatch<SetStateAction<NoteRow | null>>;
  noteOverrides: ReadonlyMap<string, boolean>;
  setNoteOverrides: Dispatch<SetStateAction<ReadonlyMap<string, boolean>>>;
}

/**
 * What this canvas remembers about notes beyond the saved layout: the threat
 * row held open for typing, and the notes toggled without a host to save
 * through. Called before the drill navigation, whose plane switch clears both.
 */
export function useNoteSession(editing: boolean, modelId: string): NoteSession {
  // The threat row a note is holding open for typing. The edit requests write
  // it, and the note derivation reads it.
  const [noteEdit, setNoteEdit] = useState<NoteRow | null>(null);
  // Notes toggled in THIS session without a host to save through (view mode,
  // the viewer): key → open. Layered over the overlay's saved `open` flags. In
  // edit mode the badge goes to the host instead, and entering edit mode clears
  // this map (below) so edit mode shows exactly what the export will.
  const [noteOverrides, setNoteOverrides] = useState<ReadonlyMap<string, boolean>>(() => new Map());

  // Edit mode shows the saved state. A toggle
  // made while reading would otherwise mask the state the badge is about to
  // save, and the first click in edit mode would appear to do nothing.
  useEffect(() => {
    if (editing) setNoteOverrides(new Map());
  }, [editing]);

  // ...and on a switch to another diagram. The keys are per model (`node:web`
  // names an element of THIS one, and the next diagram is free to reuse the
  // id), but nothing else clears them on that path: useDrillNavigation resets
  // itself on a new model WITHOUT going through onPlaneSwitch, and the studio
  // does not re-key <DiagramView>. A toggle made while reading diagram A would
  // otherwise open — or hide — a colliding note on diagram B.
  useEffect(() => {
    setNoteOverrides(new Map());
  }, [modelId]);

  return { noteEdit, setNoteEdit, noteOverrides, setNoteOverrides };
}
