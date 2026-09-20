// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DrawTool } from '@diagc/renderer';
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

type ToolOverrides = {
  tool?: DrawTool;
  onSetTool?: (tool: DrawTool) => void;
  pen?: { color: string; width: number };
  onSetPen?: (patch: Partial<{ color: string; width: number }>) => void;
  drawingDisabled?: boolean;
};

function renderToolbar(editor: EditorApi, extra: ToolOverrides = {}) {
  const {
    tool = 'select' as DrawTool,
    onSetTool = noop,
    pen = { color: '', width: 3 },
    onSetPen = noop,
    drawingDisabled = false,
  } = extra;
  return render(
    <EditorToolbar
      editor={editor}
      onExit={noop}
      onSave={noop}
      saveIssues={null}
      selectionColor={null}
      tool={tool}
      onSetTool={onSetTool}
      pen={pen}
      onSetPen={onSetPen}
      drawingDisabled={drawingDisabled}
    />,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('EditorToolbar', () => {
  it('calls onSave from the Save button when dirty', () => {
    const onSave = vi.fn();
    const editor = fakeEditor({ dirty: true });
    render(
      <EditorToolbar
        editor={editor}
        onExit={noop}
        onSave={onSave}
        saveIssues={null}
        selectionColor={null}
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
        onExit={noop}
        onSave={noop}
        saveIssues={[{ message: 'boom' }]}
        selectionColor={null}
        tool="select"
        onSetTool={noop}
        pen={{ color: '', width: 3 }}
        onSetPen={noop}
        drawingDisabled={false}
      />,
    );
    expect(screen.getByText(/boom/i)).toBeDefined();
  });

  it('does not render the relocated buttons', () => {
    renderToolbar(fakeEditor());
    expect(screen.queryByRole('button', { name: /add node/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /add image/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^library$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /layers & planes/i })).toBeNull();
    // the layout commands and pickers went to the dock's Layout & style section
    // (LayoutPanel / LayoutActions), New diagram to the topbar
    expect(screen.queryByRole('button', { name: /new diagram/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /re-layout/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /auto-layout/i })).toBeNull();
    expect(screen.queryByLabelText(/edge routing/i)).toBeNull();
    // what the row is for is still here
    expect(screen.getByRole('button', { name: 'Done' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDefined();
  });

  it('offers Select, Pen and Eraser as a pressed-state tool group', () => {
    const onSetTool = vi.fn();
    renderToolbar(fakeEditor(), { tool: 'pen', onSetTool });
    expect(screen.getByRole('button', { name: 'Pen' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Select' }).getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'Eraser' }));
    expect(onSetTool).toHaveBeenCalledWith('eraser');
  });

  it('shows pen color and width only while the pen is active', () => {
    const onSetPen = vi.fn();
    const { rerender, unmount } = renderToolbar(fakeEditor(), { tool: 'select', onSetPen });
    expect(screen.queryByRole('group', { name: 'Pen color' })).toBeNull();
    unmount();
    renderToolbar(fakeEditor(), { tool: 'pen', onSetPen });
    fireEvent.click(screen.getByRole('button', { name: 'Thick' }));
    expect(onSetPen).toHaveBeenCalledWith({ width: 6 });
    fireEvent.click(screen.getByTitle('Auto (theme ink)'));
    expect(onSetPen).toHaveBeenCalledWith({ color: '' });
    void rerender;
  });

  it('disables Pen and Eraser while drilled in, with the reason in the title', () => {
    renderToolbar(fakeEditor(), { drawingDisabled: true });
    const pen = screen.getByRole('button', { name: 'Pen' }) as HTMLButtonElement;
    expect(pen.disabled).toBe(true);
    expect(pen.title).toContain('top level');
  });
});
