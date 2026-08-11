import type { LayoutSettings } from '@diagramming/core';
import type { EditorApi } from './useEditor';
import { PRESET_COLORS } from './pickers';

const ALGORITHMS: { value: string; label: string }[] = [
  { value: 'layered', label: 'Layered' },
  { value: 'force', label: 'Force' },
  { value: 'stress', label: 'Stress' },
  { value: 'mrtree', label: 'Tree' },
  { value: 'radial', label: 'Radial' },
  { value: 'rectpacking', label: 'Packed' },
];
const DIRECTIONS: { value: string; label: string }[] = [
  { value: 'RIGHT', label: 'Right →' },
  { value: 'DOWN', label: 'Down ↓' },
  { value: 'LEFT', label: 'Left ←' },
  { value: 'UP', label: 'Up ↑' },
];

interface EditorToolbarProps {
  editor: EditorApi;
  /** prompt for a name, create an empty diagram and edit it */
  onNewDiagram: () => void;
  /** leave edit mode (confirm-discard handled by the caller) */
  onExit: () => void;
  /** persist the current diagram + layout (App owns the save flow) */
  onSave: () => void;
  /** a save (auto or manual) is currently in flight */
  saving?: boolean;
  /** save issues surfaced by App's save flow (null = none) */
  saveIssues: { message: string }[] | null;
  /** active plane whose pinned positions Re-layout clears */
  activePlane: string | undefined;
  /** whether the active plane uses automatic layout (false = manual/frozen) */
  autoLayout: boolean;
  /** flip the active plane's auto/manual mode (App snapshots on turning off) */
  onToggleAutoLayout: () => void;
  /** a fresh elk arrangement to re-pin when Re-layout runs in manual mode */
  getAutoPositions: () => Record<string, { x: number; y: number }>;
  /** active plane's automatic-layout settings (algorithm/direction/spacing/edge routing) */
  layoutSettings: LayoutSettings;
  /** merge a settings patch into the active plane (an undefined field clears it) */
  onSetLayoutSettings: (patch: Partial<LayoutSettings>) => void;
  /** color of the current selection (node or single-relation edge); null = no color target */
  selectionColor: { value: string; onChange: (color: string) => void } | null;
}

export function EditorToolbar({
  editor,
  onNewDiagram,
  onExit,
  onSave,
  saving = false,
  saveIssues,
  activePlane,
  autoLayout,
  onToggleAutoLayout,
  getAutoPositions,
  layoutSettings,
  onSetLayoutSettings,
  selectionColor,
}: EditorToolbarProps) {
  const error = editor.session?.error;
  const algorithm = layoutSettings.algorithm ?? 'layered';
  const direction = layoutSettings.direction ?? 'RIGHT';
  const edgeRouting = layoutSettings.edgeRouting ?? 'curved';

  const relayout = () => {
    if (autoLayout) {
      if (!window.confirm('Clear all pinned positions on this plane and re-layout?')) return;
      editor.dispatch({ type: 'clear-positions', ...(activePlane !== undefined ? { plane: activePlane } : {}) });
    } else {
      if (!window.confirm('Re-arrange this plane and re-pin every node?')) return;
      editor.dispatch({
        type: 'set-positions',
        positions: getAutoPositions(),
        ...(activePlane !== undefined ? { plane: activePlane } : {}),
      });
    }
  };

  return (
    <div className="editor-toolbar" role="toolbar" aria-label="Editor">
      <button className="chip" onClick={onExit}>
        Done
      </button>
      <span className="sep" />
      <button className="chip" onClick={onNewDiagram}>
        New diagram
      </button>
      <button className="chip" onClick={relayout}>
        Re-layout
      </button>
      <button
        type="button"
        className={`chip${autoLayout ? ' active' : ''}`}
        aria-pressed={autoLayout}
        title={
          autoLayout
            ? 'Automatic layout is ON — connecting nodes can re-arrange the diagram. Click to freeze positions.'
            : 'Manual layout — nodes stay where you put them. Click to re-enable automatic layout.'
        }
        onClick={onToggleAutoLayout}
      >
        Auto-layout
      </button>
      <select
        className="chip-select"
        aria-label="Layout algorithm"
        title="Layout algorithm"
        value={algorithm}
        onChange={(e) => onSetLayoutSettings({ algorithm: e.target.value === 'layered' ? undefined : e.target.value })}
      >
        {ALGORITHMS.map((a) => (
          <option key={a.value} value={a.value}>
            {a.label}
          </option>
        ))}
      </select>
      {algorithm === 'layered' && (
        <select
          className="chip-select"
          aria-label="Layout direction"
          title="Layout direction"
          value={direction}
          onChange={(e) => onSetLayoutSettings({ direction: e.target.value === 'RIGHT' ? undefined : e.target.value })}
        >
          {DIRECTIONS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
      )}
      <input
        type="number"
        className="chip-num"
        aria-label="Node spacing"
        title="Node spacing in px (blank = default)"
        min={8}
        max={200}
        step={4}
        placeholder="40"
        value={layoutSettings.spacing ?? ''}
        onChange={(e) => {
          const v = e.target.value.trim();
          onSetLayoutSettings({ spacing: v === '' ? undefined : Number(v) });
        }}
      />
      <select
        className="chip-select"
        aria-label="Edge routing"
        title="Edge routing"
        value={edgeRouting}
        onChange={(e) =>
          onSetLayoutSettings({ edgeRouting: e.target.value === 'curved' ? undefined : (e.target.value as 'orthogonal') })
        }
      >
        <option value="curved">Curved edges</option>
        <option value="orthogonal">Orthogonal edges</option>
      </select>
      <span className="sep" />
      <button className="chip" onClick={() => editor.undo()} disabled={!editor.canUndo}>
        Undo
      </button>
      <button className="chip" onClick={() => editor.redo()} disabled={!editor.canRedo}>
        Redo
      </button>
      <button className="chip primary" onClick={onSave} disabled={!editor.dirty || saving}>
        Save
      </button>
      <span className="save-status" aria-live="polite">
        {saving ? 'Saving…' : editor.dirty ? 'Unsaved…' : 'Saved'}
      </span>
      {selectionColor !== null && (
        <>
          <span className="sep" />
          <span className="picker-row toolbar-colors" role="group" aria-label="Selection color">
            <button
              type="button"
              className={`picker-btn${selectionColor.value === '' ? ' active' : ''}`}
              title="Auto (default color)"
              aria-pressed={selectionColor.value === ''}
              onClick={() => selectionColor.onChange('')}
            >
              ∅
            </button>
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`picker-btn swatch${selectionColor.value === c ? ' active' : ''}`}
                style={{ background: c }}
                title={c}
                aria-label={`Color ${c}`}
                aria-pressed={selectionColor.value === c}
                onClick={() => selectionColor.onChange(c)}
              />
            ))}
          </span>
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
