import type { DrawTool } from '@diagc/renderer';
import type { EditorApi } from './useEditor';
import { PRESET_COLORS } from './pickers';
import { useKeyHint } from '../hotkeys/HotkeysContext';

interface EditorToolbarProps {
  editor: EditorApi;
  /** leave edit mode (confirm-discard handled by the caller) */
  onExit: () => void;
  /** persist the current diagram + layout (App owns the save flow) */
  onSave: () => void;
  /** a save (auto or manual) is currently in flight */
  saving?: boolean;
  /** save issues surfaced by App's save flow (null = none) */
  saveIssues: { message: string }[] | null;
  /** color of the current selection (node or single-relation edge); null = no color target */
  selectionColor: { value: string; onChange: (color: string) => void } | null;
  /** the canvas tool; Pen/Eraser are edit-mode canvas modes, Select is the usual canvas */
  tool: DrawTool;
  onSetTool: (tool: DrawTool) => void;
  /** what the pen draws with; color '' = Auto (theme ink) */
  pen: { color: string; width: number };
  onSetPen: (patch: Partial<{ color: string; width: number }>) => void;
  /** drilled in: drawings live at the top level only, so the tools are off */
  drawingDisabled: boolean;
}

/** The preset swatch row, shared by the selection color and the pen color —
 *  same markup, two owners (the empty value is each row's own "Auto"). */
function ColorRow({
  label,
  autoTitle,
  value,
  onChange,
}: {
  label: string;
  autoTitle: string;
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <span className="picker-row toolbar-colors" role="group" aria-label={label}>
      <button
        type="button"
        className={`picker-btn${value === '' ? ' active' : ''}`}
        title={autoTitle}
        aria-pressed={value === ''}
        onClick={() => onChange('')}
      >
        ∅
      </button>
      {PRESET_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          className={`picker-btn swatch${value === c ? ' active' : ''}`}
          style={{ background: c }}
          title={c}
          aria-label={`Color ${c}`}
          aria-pressed={value === c}
          onClick={() => onChange(c)}
        />
      ))}
    </span>
  );
}

/**
 * Edit mode's tool row: leave, pick a canvas tool, undo / redo / save, colour
 * the selection. The layout pickers and commands that used to ride here are in
 * the dock's Layout & style section (LayoutPanel, LayoutActions) and New diagram
 * is in the topbar — with them this row wrapped onto a second line at 1280px.
 */
export function EditorToolbar({
  editor,
  onExit,
  onSave,
  saving = false,
  saveIssues,
  selectionColor,
  tool,
  onSetTool,
  pen,
  onSetPen,
  drawingDisabled,
}: EditorToolbarProps) {
  const error = editor.session?.error;
  // titles name the key an action has NOW — it is rebindable (hotkeys/)
  const hint = useKeyHint();

  return (
    <div className="editor-toolbar" role="toolbar" aria-label="Editor">
      <button className="chip" onClick={onExit} title={`Leave edit mode${hint('diagram.toggle-edit')}`}>
        Done
      </button>
      <span className="sep" />
      <span className="tool-group" role="group" aria-label="Canvas tool">
        {(
          [
            ['select', 'Select', `Select and move${hint('tool.select')} — Esc also gets you here`],
            ['pen', 'Pen', drawingDisabled ? 'Drawings are shown at the top level only — leave the drilled view to draw' : `Draw freehand${hint('tool.pen')}`],
            ['eraser', 'Eraser', drawingDisabled ? 'Drawings are shown at the top level only — leave the drilled view to erase' : `Click a stroke to erase it${hint('tool.eraser')}`],
          ] as const
        ).map(([id, label, title]) => (
          <button
            key={id}
            type="button"
            className={`chip${tool === id ? ' active' : ''}`}
            aria-pressed={tool === id}
            title={title}
            disabled={id !== 'select' && drawingDisabled}
            onClick={() => onSetTool(id)}
          >
            {label}
          </button>
        ))}
      </span>
      {tool === 'pen' && (
        <>
          <ColorRow label="Pen color" autoTitle="Auto (theme ink)" value={pen.color} onChange={(c) => onSetPen({ color: c })} />
          <span className="tool-group" role="group" aria-label="Pen width">
            {(
              [
                [2, 'Thin'],
                [3, 'Medium'],
                [6, 'Thick'],
              ] as const
            ).map(([w, label]) => (
              <button
                key={w}
                type="button"
                className={`chip${pen.width === w ? ' active' : ''}`}
                aria-pressed={pen.width === w}
                onClick={() => onSetPen({ width: w })}
              >
                {label}
              </button>
            ))}
          </span>
        </>
      )}
      <span className="sep" />
      <button className="chip" onClick={() => editor.undo()} disabled={!editor.canUndo} title={`Undo${hint('edit.undo')}`}>
        Undo
      </button>
      <button className="chip" onClick={() => editor.redo()} disabled={!editor.canRedo} title={`Redo${hint('edit.redo')}`}>
        Redo
      </button>
      <button className="chip primary" onClick={onSave} disabled={!editor.dirty || saving} title={`Save${hint('edit.save')}`}>
        Save
      </button>
      <span className="save-status" aria-live="polite">
        {saving ? 'Saving…' : editor.dirty ? 'Unsaved…' : 'Saved'}
      </span>
      {selectionColor !== null && (
        <>
          <span className="sep" />
          <ColorRow
            label="Selection color"
            autoTitle="Auto (default color)"
            value={selectionColor.value}
            onChange={selectionColor.onChange}
          />
        </>
      )}
      <span className="spacer" />
      {error !== undefined && <span className="toolbar-error">{error}</span>}
      {saveIssues !== null && saveIssues.length > 0 && (
        <span className="toolbar-error">{saveIssues.map((i) => i.message).join('; ')}</span>
      )}
    </div>
  );
}
