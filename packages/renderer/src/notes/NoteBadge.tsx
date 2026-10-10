import { useContext, type CSSProperties, type MouseEvent, type PointerEvent } from 'react';
import { elementKey, type ElementRef } from '@diagc/core/internal';
import { NoteStateContext } from './note-state';

/**
 * A count on an element that has a note: its threats (the threat badge) or
 * its comments and links (the comment badge), on a node or on a flow. With a
 * canvas that draws notes (NoteStateContext provided) the badge is the switch
 * for the element's note, in both modes; view mode's toggles are the canvas's
 * own session state. Without one, and for a `target` the canvas does not draw
 * a note for, it is the passive count. Stays in exports: a reviewer reading
 * the PNG should see that there is something to read.
 */
export function NoteBadge({
  className,
  target,
  edge,
  state,
  title,
  text,
  style,
}: {
  /** the passive count's classes; the switch adds `nodrag`, and `nopan` on a
   * flow, whose badge sits in the label portal over the pane */
  className: string;
  /** whose note the badge switches; undefined keeps it passive (an external
   * stub, a bundled flow) */
  target: ElementRef | undefined;
  /** a flow's view-edge id. Every flow badge goes into React Flow's one label
   * portal, so the badge itself has to say which flow it belongs to. */
  edge?: string;
  state?: string;
  title: string;
  text: string;
  style?: CSSProperties;
}) {
  const notes = useContext(NoteStateContext);
  if (notes === null || target === undefined) {
    return (
      <span className={className} data-edge={edge} data-state={state} title={title} style={style}>
        {text}
      </span>
    );
  }
  const open = notes.isOpen(elementKey(target));
  return (
    <button
      type="button"
      className={`${className} nodrag${edge !== undefined ? ' nopan' : ''}`}
      data-edge={edge}
      data-state={state}
      title={title}
      aria-expanded={open}
      aria-label={`${title} — ${open ? 'hide' : 'show'}`}
      style={style}
      // neither a drag start nor a click on the element
      onMouseDown={stopPropagation}
      onClick={(e) => {
        e.stopPropagation();
        notes.toggle(target);
      }}
    >
      {text}
    </button>
  );
}

/**
 * The `+` that adds a threat: the empty threat badge on a node or a flow (no
 * threats to count yet), and a note's add row. Chrome, so it is dropped from
 * exports. The canvas must read neither the press as the start of a drag nor
 * the click as "select".
 */
export function AddThreatButton({
  className,
  edge,
  state,
  style,
  onAdd,
  onPointerDown,
}: {
  className: string;
  /** a flow's view-edge id (see NoteBadge) */
  edge?: string;
  /** 'empty' where the button stands in for the threat badge */
  state?: 'empty';
  style?: CSSProperties;
  onAdd: () => void;
  onPointerDown?: (e: PointerEvent) => void;
}) {
  return (
    <button
      type="button"
      className={className}
      data-edge={edge}
      data-state={state}
      aria-label="Add a threat"
      title="Add a threat"
      style={style}
      onMouseDown={stopPropagation}
      onPointerDown={onPointerDown}
      onClick={(e) => {
        e.stopPropagation();
        onAdd();
      }}
    >
      +
    </button>
  );
}

const stopPropagation = (e: MouseEvent) => e.stopPropagation();
