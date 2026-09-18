// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LayoutSettings } from '@diagramming/core';
import type { DrawTool } from '@diagramming/renderer';
import { EditorToolbar } from './EditorToolbar';
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

function noop() {
  /* intentionally empty */
}

type AutoLayoutOverrides = {
  autoLayout?: boolean;
  onToggleAutoLayout?: () => void;
  getAutoPositions?: () => Record<string, { x: number; y: number }>;
  layoutSettings?: LayoutSettings;
  onSetLayoutSettings?: (patch: Partial<LayoutSettings>) => void;
  tool?: DrawTool;
  onSetTool?: (tool: DrawTool) => void;
  pen?: { color: string; width: number };
  onSetPen?: (patch: Partial<{ color: string; width: number }>) => void;
  drawingDisabled?: boolean;
  layoutLocked?: boolean;
  algorithmLocked?: boolean;
};

function renderToolbar(editor: EditorApi, activePlane: string | undefined, extra: AutoLayoutOverrides = {}) {
  const {
    autoLayout = true,
    onToggleAutoLayout = noop,
    getAutoPositions = () => ({}),
    layoutSettings = {},
    onSetLayoutSettings = noop,
    tool = 'select' as DrawTool,
    onSetTool = noop,
    pen = { color: '', width: 3 },
    onSetPen = noop,
    drawingDisabled = false,
    layoutLocked = false,
    algorithmLocked = false,
  } = extra;
  return render(
    <EditorToolbar
      editor={editor}
      onNewDiagram={noop}
      onExit={noop}
      onSave={noop}
      saveIssues={null}
      activePlane={activePlane}
      selectionColor={null}
      autoLayout={autoLayout}
      onToggleAutoLayout={onToggleAutoLayout}
      getAutoPositions={getAutoPositions}
      layoutSettings={layoutSettings}
      onSetLayoutSettings={onSetLayoutSettings}
      tool={tool}
      onSetTool={onSetTool}
      pen={pen}
      layoutLocked={layoutLocked}
      algorithmLocked={algorithmLocked}
      onSetPen={onSetPen}
      drawingDisabled={drawingDisabled}
    />,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('EditorToolbar', () => {
  it('re-layouts the active plane after confirm as clear-positions', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const editor = fakeEditor();
    renderToolbar(editor, 'arch');
    fireEvent.click(screen.getByRole('button', { name: /re-layout/i }));
    await waitFor(() => expect(editor.dispatch).toHaveBeenCalledWith({ type: 'clear-positions', plane: 'arch' }));
  });

  it('does not re-layout when the confirm is cancelled', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const editor = fakeEditor();
    renderToolbar(editor, 'arch');
    fireEvent.click(screen.getByRole('button', { name: /re-layout/i }));
    // flush the async dialog before asserting nothing was dispatched
    await waitFor(() => expect(confirmSpy).toHaveBeenCalled());
    expect(editor.dispatch).not.toHaveBeenCalled();
  });

  it('renders the auto-layout toggle pressed when automatic layout is on', () => {
    renderToolbar(fakeEditor(), undefined, { autoLayout: true });
    const btn = screen.getByRole('button', { name: /auto-layout/i });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('calls onToggleAutoLayout when the toggle is clicked', () => {
    const onToggleAutoLayout = vi.fn();
    renderToolbar(fakeEditor(), undefined, { autoLayout: true, onToggleAutoLayout });
    fireEvent.click(screen.getByRole('button', { name: /auto-layout/i }));
    expect(onToggleAutoLayout).toHaveBeenCalledTimes(1);
  });

  it('re-layout in manual mode re-pins the fresh arrangement instead of clearing', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const editor = fakeEditor();
    renderToolbar(editor, 'arch', { autoLayout: false, getAutoPositions: () => ({ a: { x: 9, y: 9 } }) });
    fireEvent.click(screen.getByRole('button', { name: /re-layout/i }));
    await waitFor(() =>
      expect(editor.dispatch).toHaveBeenCalledWith({
        type: 'set-positions',
        plane: 'arch',
        positions: { a: { x: 9, y: 9 } },
      }),
    );
  });

  it('calls onSave from the Save button when dirty', () => {
    const onSave = vi.fn();
    const editor = fakeEditor({ dirty: true });
    render(
      <EditorToolbar
        editor={editor}
        onNewDiagram={noop}
        onExit={noop}
        onSave={onSave}
        saveIssues={null}
        activePlane={undefined}
        selectionColor={null}
        autoLayout={true}
        onToggleAutoLayout={noop}
        getAutoPositions={() => ({})}
        layoutSettings={{}}
        onSetLayoutSettings={noop}
        tool="select"
        onSetTool={noop}
        pen={{ color: '', width: 3 }}
        onSetPen={noop}
        drawingDisabled={false}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(onSave).toHaveBeenCalled();
  });

  it('renders save issues surfaced by App', () => {
    render(
      <EditorToolbar
        editor={fakeEditor()}
        onNewDiagram={noop}
        onExit={noop}
        onSave={noop}
        saveIssues={[{ message: 'boom' }]}
        activePlane={undefined}
        selectionColor={null}
        autoLayout={true}
        onToggleAutoLayout={noop}
        getAutoPositions={() => ({})}
        layoutSettings={{}}
        onSetLayoutSettings={noop}
        tool="select"
        onSetTool={noop}
        pen={{ color: '', width: 3 }}
        onSetPen={noop}
        drawingDisabled={false}
      />,
    );
    expect(screen.getByText(/boom/i)).toBeDefined();
  });

  it('switching edge routing to orthogonal patches the plane settings', () => {
    const onSetLayoutSettings = vi.fn();
    renderToolbar(fakeEditor(), 'arch', { onSetLayoutSettings });
    fireEvent.change(screen.getByLabelText(/edge routing/i), { target: { value: 'orthogonal' } });
    expect(onSetLayoutSettings).toHaveBeenCalledWith({ edgeRouting: 'orthogonal' });
  });

  it('does not render the relocated buttons', () => {
    renderToolbar(fakeEditor(), undefined);
    expect(screen.queryByRole('button', { name: /add node/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /add image/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^library$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /layers & planes/i })).toBeNull();
    // kept controls still present
    expect(screen.getByRole('button', { name: /new diagram/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /re-layout/i })).toBeDefined();
  });

  it('offers Select, Pen and Eraser as a pressed-state tool group', () => {
    const onSetTool = vi.fn();
    renderToolbar(fakeEditor(), undefined, { tool: 'pen', onSetTool });
    expect(screen.getByRole('button', { name: 'Pen' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Select' }).getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'Eraser' }));
    expect(onSetTool).toHaveBeenCalledWith('eraser');
  });

  it('shows pen color and width only while the pen is active', () => {
    const onSetPen = vi.fn();
    const { rerender, unmount } = renderToolbar(fakeEditor(), undefined, { tool: 'select', onSetPen });
    expect(screen.queryByRole('group', { name: 'Pen color' })).toBeNull();
    unmount();
    renderToolbar(fakeEditor(), undefined, { tool: 'pen', onSetPen });
    fireEvent.click(screen.getByRole('button', { name: 'Thick' }));
    expect(onSetPen).toHaveBeenCalledWith({ width: 6 });
    fireEvent.click(screen.getByTitle('Auto (theme ink)'));
    expect(onSetPen).toHaveBeenCalledWith({ color: '' });
    void rerender;
  });

  it('disables Pen and Eraser while drilled in, with the reason in the title', () => {
    renderToolbar(fakeEditor(), undefined, { drawingDisabled: true });
    const pen = screen.getByRole('button', { name: 'Pen' }) as HTMLButtonElement;
    expect(pen.disabled).toBe(true);
    expect(pen.title).toContain('top level');
  });

  it('hides the layout pickers when the notation owns the arrangement', () => {
    renderToolbar(fakeEditor(), undefined, { layoutLocked: true });
    expect(screen.queryByLabelText(/algorithm/i)).toBeNull();
    expect(screen.getByRole('button', { name: /auto-layout/i })).toBeTruthy();
  });

  it('hides only the algorithm picker when the notation pins it (partitioned layout)', () => {
    renderToolbar(fakeEditor(), undefined, { algorithmLocked: true });
    expect(screen.queryByLabelText('Layout algorithm')).toBeNull();
    expect(screen.getByLabelText('Layout direction')).toBeTruthy();
  });
});
