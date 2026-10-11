import { useEffect, type DragEvent, type MutableRefObject } from 'react';
import type { ReactFlowInstance } from '@xyflow/react';
import { isNoteId } from '../notes/derive-note-nodes';
import { LIBRARY_ENTRY_DND_TYPE, type EditingApi } from './view-types';

export interface DropAndPasteInput {
  editing: boolean;
  edit: EditingApi | undefined;
  reactFlow: ReactFlowInstance;
  /** the canvas wrapper: a paste lands at its centre */
  wrapperRef: MutableRefObject<HTMLDivElement | null>;
}

export interface DropAndPaste {
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
}

const imageFilesOf = (list: FileList | null | undefined): File[] =>
  [...(list ?? [])].filter((f) => f.type.startsWith('image/'));

/** the node a palette drop landed on, or undefined when it fell on open canvas.
 * Cross-layer coupling: the host-side drop handler reads the renderer's DOM
 * internals (the `.react-flow__node` root + its `data-id`) to resolve the
 * nesting target — kept in one named helper so the coupling is explicit. */
const droppedOnNodeId = (e: { clientX: number; clientY: number }): string | undefined =>
  document.elementFromPoint(e.clientX, e.clientY)?.closest('.react-flow__node')?.getAttribute('data-id') ?? undefined;

/** Images pasted or dropped on the canvas, and library entries dragged from the palette (edit mode). */
export function useDropAndPaste(input: DropAndPasteInput): DropAndPaste {
  const { editing, edit, reactFlow, wrapperRef } = input;
  // Paste lands at the viewport center; pastes aimed at form fields stay theirs.
  const onImageFiles = edit?.onImageFiles;
  useEffect(() => {
    if (!editing || onImageFiles === undefined) return;
    const onPaste = (e: ClipboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const files = imageFilesOf(e.clipboardData?.files);
      if (files.length === 0) return;
      e.preventDefault();
      const rect = wrapperRef.current?.getBoundingClientRect();
      const position =
        rect !== undefined
          ? reactFlow.screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
          : undefined;
      onImageFiles(files, position);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- wrapperRef is a stable useRef identity from DiagramView, read through .current
  }, [editing, onImageFiles, reactFlow]);

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!editing) return;
    const hasEntry = edit?.onDropLibraryEntry !== undefined && e.dataTransfer.types.includes(LIBRARY_ENTRY_DND_TYPE);
    if (edit?.onImageFiles !== undefined || hasEntry) e.preventDefault();
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    if (!editing) return;
    // A library entry dragged from the palette places that entry at the drop
    // point — checked before the image path since both share this handler.
    const entryId =
      edit?.onDropLibraryEntry !== undefined && typeof e.dataTransfer?.getData === 'function'
        ? e.dataTransfer.getData(LIBRARY_ENTRY_DND_TYPE)
        : '';
    if (entryId !== undefined && entryId !== '') {
      e.preventDefault();
      // A drop that landed on a note is a drop on open canvas: a
      // `note:` id names no model node, and the host writes this straight
      // through as a containment parent.
      const hit = droppedOnNodeId(e);
      const targetNodeId = hit !== undefined && isNoteId(hit) ? undefined : hit;
      edit?.onDropLibraryEntry?.(entryId, reactFlow.screenToFlowPosition({ x: e.clientX, y: e.clientY }), targetNodeId);
      return;
    }
    if (edit?.onImageFiles === undefined) return;
    // dragOver already preventDefault()d to claim the drop, so the browser
    // is primed to otherwise navigate to the dropped file; claim it here
    // too before filtering, or a non-image drop falls through to that
    // navigation and unsaved edits are gone.
    e.preventDefault();
    const files = imageFilesOf(e.dataTransfer?.files);
    if (files.length === 0) return;
    edit.onImageFiles(files, reactFlow.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
  };
  return { onDragOver, onDrop };
}
