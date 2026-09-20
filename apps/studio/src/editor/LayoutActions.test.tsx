// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HotkeysContext } from '../hotkeys/HotkeysContext';
import { resolveKeymap } from '../hotkeys/keymap';
import { EditLayoutActions } from './LayoutActions';
import type { EditorApi } from './useEditor';

function fakeEditor(overrides: Partial<EditorApi> = {}): EditorApi {
  return {
    session: null,
    peek: () => null,
    start: vi.fn(),
    stop: vi.fn(),
    dispatch: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    canUndo: false,
    canRedo: false,
    dirty: false,
    save: vi.fn(async () => ({ ok: true })),
    ...overrides,
  };
}

function renderActions(
  editor: EditorApi,
  activePlane: string | undefined,
  extra: {
    autoLayout?: boolean;
    onToggleAutoLayout?: () => void;
    getAutoPositions?: () => Record<string, { x: number; y: number }>;
  } = {},
) {
  return render(
    <EditLayoutActions
      editor={editor}
      activePlane={activePlane}
      autoLayout={extra.autoLayout ?? true}
      onToggleAutoLayout={extra.onToggleAutoLayout ?? (() => {})}
      getAutoPositions={extra.getAutoPositions ?? (() => ({}))}
    />,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('EditLayoutActions', () => {
  it('re-layouts the active plane after confirm as clear-positions', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const editor = fakeEditor();
    renderActions(editor, 'arch');
    fireEvent.click(screen.getByRole('button', { name: /re-layout/i }));
    await waitFor(() => expect(editor.dispatch).toHaveBeenCalledWith({ type: 'clear-positions', plane: 'arch' }));
  });

  it('does not re-layout when the confirm is cancelled', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const editor = fakeEditor();
    renderActions(editor, 'arch');
    fireEvent.click(screen.getByRole('button', { name: /re-layout/i }));
    // flush the async dialog before asserting nothing was dispatched
    await waitFor(() => expect(confirmSpy).toHaveBeenCalled());
    expect(editor.dispatch).not.toHaveBeenCalled();
  });

  it('re-layout in manual mode re-pins the fresh arrangement instead of clearing', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const editor = fakeEditor();
    renderActions(editor, 'arch', { autoLayout: false, getAutoPositions: () => ({ a: { x: 9, y: 9 } }) });
    fireEvent.click(screen.getByRole('button', { name: /re-layout/i }));
    await waitFor(() =>
      expect(editor.dispatch).toHaveBeenCalledWith({
        type: 'set-positions',
        plane: 'arch',
        positions: { a: { x: 9, y: 9 } },
      }),
    );
  });

  it('renders the auto-layout toggle pressed when automatic layout is on', () => {
    renderActions(fakeEditor(), undefined, { autoLayout: true });
    expect(screen.getByRole('button', { name: /auto-layout/i }).getAttribute('aria-pressed')).toBe('true');
  });

  it('calls onToggleAutoLayout when the toggle is clicked', () => {
    const onToggleAutoLayout = vi.fn();
    renderActions(fakeEditor(), undefined, { onToggleAutoLayout });
    fireEvent.click(screen.getByRole('button', { name: /auto-layout/i }));
    expect(onToggleAutoLayout).toHaveBeenCalledTimes(1);
  });

  it('names the key each command has now', () => {
    render(
      <HotkeysContext.Provider
        value={{ keymap: resolveKeymap({ 'edit.relayout': ['Shift+R'], 'edit.toggle-auto-layout': ['Shift+A'] }), mac: false }}
      >
        <EditLayoutActions editor={fakeEditor()} activePlane={undefined} autoLayout onToggleAutoLayout={() => {}} getAutoPositions={() => ({})} />
      </HotkeysContext.Provider>,
    );
    expect(screen.getByRole('button', { name: /re-layout/i }).title).toBe('Re-layout (Shift+R)');
    expect(screen.getByRole('button', { name: /auto-layout/i }).title).toMatch(/ \(Shift\+A\)$/);
  });
});
