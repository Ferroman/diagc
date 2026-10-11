import { useCallback, useEffect, useState } from 'react';
import type { ElementRef } from '@diagc/core/internal';
import type { DiagramSelection } from '@diagc/renderer';
import type { EditorSession } from '../session/reducer';

export interface UseCanvasSelectionOptions {
  editing: boolean;
  /** the relation the last connect gesture drew (the edit session's) */
  lastRelation: EditorSession['lastRelation'];
  /** what else a selection move drops: the loop analysis's row highlight and
   * comparison, which its own hook owns */
  onSelect: () => void;
}

export interface CanvasSelection {
  /** the node or edge the panels show */
  selection: DiagramSelection | null;
  /** the node whose Name field the Properties panel focuses */
  renameId: string | null;
  /** the canvas multi-selection (Shift+click / marquee) */
  groupSel: string[];
  labelRequest: { id: string; nonce: number } | undefined;
  threatRequest: { target: ElementRef; id: string; nonce: number } | undefined;
  /** a selection the user made (the canvas, a panel, a gesture's target) */
  select: (sel: DiagramSelection | null) => void;
  /** select a node the studio has just made, leaving everything else as it is */
  selectNode: (id: string) => void;
  /** the same, and focus its Name field in the Properties panel */
  selectNodeForRename: (id: string) => void;
  /** the renderer's multi-selection report */
  multiSelect: (ids: string[]) => void;
  /** open the canvas's label editor on a node made outside a canvas gesture */
  requestLabelEdit: (id: string) => void;
  /** open a threat's title on its note */
  requestThreatEdit: (target: ElementRef, id: string) => void;
}

/**
 * What is selected on the canvas — the single selection the panels follow, the
 * multi-selection a group is made from — and the two requests that open an
 * editor on something just made.
 */
export function useCanvasSelection({ editing, lastRelation, onSelect }: UseCanvasSelectionOptions): CanvasSelection {
  const [selection, setSelection] = useState<DiagramSelection | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  // A node created OUTSIDE the canvas (a panel button, e.g. second-order's "And
  // then what?") that should open for rename, same as onCreateAt's canvas
  // gesture does. Nonce-keyed (see EditingApi.editLabelRequest) so asking again
  // for the same id still re-arms the effect.
  const [labelRequest, setLabelRequest] = useState<{ id: string; nonce: number } | undefined>(undefined);
  const requestLabelEdit = (id: string) => setLabelRequest((r) => ({ id, nonce: (r?.nonce ?? 0) + 1 }));
  // A threat added from the canvas (an element's empty badge, a note's +) opens
  // its title on the note — the same nonce-keyed handshake as labelRequest, so
  // adding a second threat to the same element still re-arms the request.
  const [threatRequest, setThreatRequest] = useState<{ target: ElementRef; id: string; nonce: number } | undefined>(
    undefined,
  );
  const requestThreatEdit = (target: ElementRef, id: string) =>
    setThreatRequest((r) => ({ target, id, nonce: (r?.nonce ?? 0) + 1 }));
  // The canvas multi-selection (Shift+click / marquee), mirrored from the
  // renderer. Drives the ⊞ Group chip and the selection glow. Deduped by
  // contents so a re-report of the same set never re-renders the app.
  const [groupSel, setGroupSel] = useState<string[]>([]);
  const multiSelect = useCallback(
    (ids: string[]) =>
      setGroupSel((cur) => (cur.length === ids.length && cur.every((id, i) => id === ids[i]) ? cur : ids)),
    [],
  );

  // Select the relation a connect gesture just created, which opens its panel.
  // Keyed on the { id, nonce } object, not the id: the reducer replaces it on
  // every connect and nowhere else, and a relation drawn again after a delete
  // repeats its id but not its nonce.
  useEffect(() => {
    if (editing && lastRelation !== undefined) {
      setSelection({ kind: 'edge', id: lastRelation.id });
      setRenameId(null);
    }
  }, [editing, lastRelation]);

  // Selection moves anywhere but the pending-rename node → the rename moment is
  // over. What it deliberately does NOT touch is the inspector tab: the dock
  // keeps the one the user chose, because a canvas click that flipped the
  // Library to Properties would cost a trip back to the palette for every node
  // placed or container selected. Only the toolbar add (which renames in the
  // Properties Name field) and re-entering edit mode set the tab.
  const select = (sel: DiagramSelection | null) => {
    setSelection(sel);
    onSelect(); // a new selection drops any leverage-row highlight and any active dependency comparison
    // the multi-selection mirrors the canvas (multiSelect) — it is not cleared here
    setRenameId((r) => (r !== null && sel?.kind === 'node' && sel.id === r ? r : null));
  };

  return {
    selection,
    renameId,
    groupSel,
    labelRequest,
    threatRequest,
    select,
    selectNode: (id) => setSelection({ kind: 'node', id }),
    selectNodeForRename: (id) => {
      setSelection({ kind: 'node', id });
      setRenameId(id);
    },
    multiSelect,
    requestLabelEdit,
    requestThreatEdit,
  };
}
