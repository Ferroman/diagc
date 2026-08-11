import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { TextRun } from '@diagramming/core';
import { editorHtmlToRuns, runsToEditorHtml } from './richtext';

/** Inline rich-text editor for a box label. contentEditable + execCommand for
 * bold/italic; the DOM→runs parser is the commit source of truth. Enter inserts
 * a line break; blur or Ctrl/Cmd+Enter commits; Escape cancels. */
export function RichLabelEditor({
  runs,
  onCommit,
}: {
  runs: TextRun[];
  onCommit: (runs: TextRun[] | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const done = useRef(false);
  const [toolbar, setToolbar] = useState<CSSProperties | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (el === null) return;
    el.innerHTML = runsToEditorHtml(runs);
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = (value: TextRun[] | null) => {
    if (done.current) return;
    done.current = true;
    onCommit(value);
  };
  const commit = () => finish(ref.current !== null ? editorHtmlToRuns(ref.current) : []);

  const syncToolbar = () => {
    const sel = window.getSelection();
    if (sel === null || sel.isCollapsed || sel.rangeCount === 0) {
      setToolbar(null);
      return;
    }
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    setToolbar({ position: 'fixed', left: rect.left, top: Math.max(0, rect.top - 30) });
  };

  const applyMark = (cmd: 'bold' | 'italic') => {
    document.execCommand(cmd);
    ref.current?.focus();
    syncToolbar();
  };

  return (
    <>
      <div
        ref={ref}
        className="dg-label-input dg-rich-input nodrag nopan"
        role="textbox"
        aria-label="Edit text"
        contentEditable
        suppressContentEditableWarning
        onBlur={commit}
        onMouseUp={syncToolbar}
        onKeyUp={syncToolbar}
        onDoubleClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onPaste={(e) => {
          e.preventDefault();
          const text = e.clipboardData.getData('text/plain');
          document.execCommand('insertText', false, text);
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') {
            finish(null);
          } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            commit();
          } else if ((e.metaKey || e.ctrlKey) && (e.key === 'b' || e.key === 'B')) {
            e.preventDefault();
            applyMark('bold');
          } else if ((e.metaKey || e.ctrlKey) && (e.key === 'i' || e.key === 'I')) {
            e.preventDefault();
            applyMark('italic');
          }
          // plain Enter falls through → browser inserts a line break
        }}
      />
      {toolbar !== null &&
        // Portal to <body>: the toolbar is position:fixed, but a React Flow
        // ancestor (the zoom/pan-transformed viewport) would otherwise be its
        // containing block and reinterpret the screen coords — offsetting it by
        // the pan/zoom. Rendering at the body root makes `fixed` resolve to the
        // real viewport so `rect`-derived coords land on the selection.
        createPortal(
          <div className="dg-rich-toolbar nodrag nopan" style={toolbar} onMouseDown={(e) => e.preventDefault()}>
            <button type="button" aria-label="Bold" onClick={() => applyMark('bold')}>
              <b>B</b>
            </button>
            <button type="button" aria-label="Italic" onClick={() => applyMark('italic')}>
              <i>I</i>
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}
