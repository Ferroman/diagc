import { getHost } from '../host';
import { useKeyHint } from '../hotkeys/HotkeysContext';
import type { EditorApi } from './useEditor';

interface RelayoutInput {
  autoLayout: boolean;
  activePlane: string | undefined;
  getAutoPositions: () => Record<string, { x: number; y: number }>;
}

/** Re-layout the active plane: clear its pins under automatic layout, re-pin a
 *  fresh arrangement under manual. Exported because the button and the hotkey
 *  must be the same function — confirm and all. */
export async function relayoutPlane(editor: EditorApi, o: RelayoutInput): Promise<void> {
  const planeOpt = o.activePlane !== undefined ? { plane: o.activePlane } : {};
  if (o.autoLayout) {
    if (!(await getHost().confirmDialog('Clear all pinned positions on this plane and re-layout?'))) return;
    editor.dispatch({ type: 'clear-positions', ...planeOpt });
  } else {
    if (!(await getHost().confirmDialog('Re-arrange this plane and re-pin every node?'))) return;
    editor.dispatch({ type: 'set-positions', positions: o.getAutoPositions(), ...planeOpt });
  }
}

/**
 * Edit mode's two layout commands, shown in the dock's Layout & style section
 * beside the settings they act on. They sat in the editor toolbar until that row
 * was cut back to the tools; unlike the pickers they stay when a notation owns
 * the arrangement — pinning and re-running still mean something there.
 */
export function EditLayoutActions({
  editor,
  onToggleAutoLayout,
  ...relayout
}: RelayoutInput & { editor: EditorApi; onToggleAutoLayout: () => void }) {
  // titles name the key an action has NOW — it is rebindable (hotkeys/)
  const hint = useKeyHint();
  return (
    <>
      <button className="chip" onClick={() => void relayoutPlane(editor, relayout)} title={`Re-layout${hint('edit.relayout')}`}>
        Re-layout
      </button>
      <button
        type="button"
        className={`chip${relayout.autoLayout ? ' active' : ''}`}
        aria-pressed={relayout.autoLayout}
        title={`${
          relayout.autoLayout
            ? 'Automatic layout is ON — connecting nodes can re-arrange the diagram. Click to freeze positions.'
            : 'Manual layout — nodes stay where you put them. Click to re-enable automatic layout.'
        }${hint('edit.toggle-auto-layout')}`}
        onClick={onToggleAutoLayout}
      >
        Auto-layout
      </button>
    </>
  );
}
