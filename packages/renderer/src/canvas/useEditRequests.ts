import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { Node } from '@xyflow/react';
import { elementKey } from '@diagc/core/internal';
import { soleSelection } from './node-copy';
import type { NoteRow } from './useNoteSession';
import type { EditingApi } from './view-types';

export interface EditRequestsInput {
  editing: boolean;
  edit: EditingApi | undefined;
  /** the boxes this render lays out (no notes): a requested node may not be among them yet */
  derivedNodes: readonly Node[];
  setLabelEdit: (edit: { kind: 'node'; id: string }) => void;
  setNoteEdit: Dispatch<SetStateAction<NoteRow | null>>;
  setRfNodes: Dispatch<SetStateAction<Node[]>>;
  /** where a requested node not laid out yet waits for the resync to select it */
  selectOnAppearRef: MutableRefObject<string | null>;
}

/** The host's requests to open an editor: a node's name, a threat's title. Each
 * is acted on once per nonce, and only while editing. */
export function useEditRequests(input: EditRequestsInput): void {
  const { editing, edit, derivedNodes, setLabelEdit, setNoteEdit, setRfNodes, selectOnAppearRef } = input;
  // Open a node's name for a host-driven rename that did not originate from a
  // canvas gesture (a panel button creating a node "outside" the canvas, e.g.
  // second-order's "And then what?"). Mirrors onCreateAt's own in-place rename.
  const labelRequest = edit?.editLabelRequest;
  // The last nonce this effect actually acted on. Needed because `edit` — and
  // the request riding on it — disappears while merely viewing (mode toggles
  // off), so `labelRequest?.nonce` itself goes nonce -> undefined -> the SAME
  // nonce on the way back into edit mode. "the nonce changed" would then be
  // true again on re-entry with no new user action, replaying a stale (maybe
  // deleted, maybe no-longer-selected) rename. The ref is deliberately left
  // untouched while the request is absent (view mode) — only a genuinely new
  // nonce, seen while editing, is allowed to open the box.
  const consumedLabelNonceRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!editing || labelRequest === undefined || labelRequest.nonce === consumedLabelNonceRef.current) return;
    consumedLabelNonceRef.current = labelRequest.nonce;
    setLabelEdit({ kind: 'node', id: labelRequest.id });
    // ...and make it React Flow's sole selection. The host's own select() never
    // reaches React Flow's copy of the nodes, and the selection ring, the image
    // resizer and the quick-add button all render off THAT flag — so without this the
    // button would stay on the node the add came from and a `+`, type, `+` chain
    // would fan siblings off one source instead of walking down the chain. A
    // label request is by definition "this is the node you are working on now".
    // A request almost always names a node the host has JUST created, and elk
    // lays out asynchronously: React Flow's copy reaches it only once it turns
    // up in derivedNodes. So select it here when this render already has it,
    // and otherwise leave a claim the resync useLayoutEffect takes the moment
    // the node lands — deselecting the source now would only flash an empty
    // selection in between.
    if (derivedNodes.some((n) => n.id === labelRequest.id)) {
      setRfNodes((prev) => soleSelection(prev, labelRequest.id));
    } else {
      selectOnAppearRef.current = labelRequest.id;
    }
    // keyed on the nonce alone: the id may repeat, the request may not
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labelRequest?.nonce]);

  // The same contract one level down: the host just added a threat and wants
  // its (empty) title open on the note. No selection claim to leave here — the
  // note is not selectable, and it appears in the same render as the threat it
  // draws, so there is nothing to wait for.
  const threatRequest = edit?.editThreatRequest;
  const consumedThreatNonceRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!editing || threatRequest === undefined || threatRequest.nonce === consumedThreatNonceRef.current) return;
    consumedThreatNonceRef.current = threatRequest.nonce;
    setNoteEdit({ key: elementKey(threatRequest.target), id: threatRequest.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the nonce alone, as editLabelRequest is
  }, [threatRequest?.nonce]);
}
