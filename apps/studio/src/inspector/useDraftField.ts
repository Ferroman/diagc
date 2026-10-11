import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

/** A text box's value and its setter, as `useState` hands them out. */
export type DraftField = [string, Dispatch<SetStateAction<string>>];

/**
 * The local value of a text box that edits a stored field. Typing changes only
 * the draft; a change to the stored value underneath it (an Undo above all)
 * replaces the draft, so a later blur never commits a stale value over it, and
 * the blur after such a refresh diffs the stored value against itself and
 * commits nothing.
 *
 * The refresh is an effect keyed on the stored value exactly as it is stored,
 * not as the box shows it: absent to `''` is a change too. It runs after the
 * render that brought the new value, as every panel's own effect did.
 * `whenMissing: 'keep'` leaves the draft alone while the value is absent, for a
 * required field whose element is gone (a node's name, a relation's kind).
 */
export function useDraftField(stored: string | undefined, whenMissing: 'clear' | 'keep' = 'clear'): DraftField {
  const [draft, setDraft] = useState(stored ?? '');
  useEffect(() => {
    if (stored !== undefined || whenMissing === 'clear') setDraft(stored ?? '');
  }, [stored, whenMissing]);
  return [draft, setDraft];
}
