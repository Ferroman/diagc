// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyDrawings, type DiagramModel } from '@diagc/core/internal';
import { startSession } from '../session/reducer';
import type { EditorApi } from '../session/useEditor';
import type { CanvasSelection } from '../view/useCanvasSelection';
import type { UseLibrary } from '../library/useLibrary';
import { useCanvasEditing, type UseCanvasEditingOptions } from './useCanvasEditing';

// The placement it builds on, recorded on the way through, so a case can read
// what it was handed.
const calls = vi.hoisted(() => ({ placement: [] as unknown[] }));
vi.mock('./useNodePlacement', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./useNodePlacement')>();
  return {
    ...actual,
    useNodePlacement: (opts: Parameters<typeof actual.useNodePlacement>[0]) => {
      calls.placement.push(opts);
      return actual.useNodePlacement(opts);
    },
  };
});

afterEach(() => {
  calls.placement.length = 0;
});

const model: DiagramModel = {
  version: 1,
  id: 'm',
  name: 'm',
  nodes: [{ id: 'a', name: 'a' }],
  containment: [],
  relations: [],
  layers: [],
  planes: [],
};

const options = (over: Partial<UseCanvasEditingOptions> = {}): UseCanvasEditingOptions => {
  const session = startSession('m', { model, layout: { version: 1, planes: {} }, drawings: emptyDrawings() });
  const editor = { session, peek: () => session, dispatch: vi.fn() } as unknown as EditorApi;
  const selection = {
    selection: { kind: 'node', id: 'a' },
    renameId: null,
    groupSel: ['a'],
    labelRequest: { id: 'a', nonce: 1 },
    threatRequest: undefined,
    select: vi.fn(),
    selectNode: vi.fn(),
    selectNodeForRename: vi.fn(),
    multiSelect: vi.fn(),
    requestLabelEdit: vi.fn(),
    requestThreatEdit: vi.fn(),
  } satisfies CanvasSelection;
  return {
    session: { editing: true, editor, layoutApiRef: { current: null }, reportIssues: vi.fn() },
    model,
    layout: { version: 1, planes: {} },
    nav: {
      activePlane: 'p',
      notation: 'plan',
      activePlaneBorrowsContainment: false,
      activePlaneManual: true,
      penLayer: 'ink',
    },
    selection,
    selectTab: vi.fn(),
    lib: { library: { categories: [], entries: [] } } as unknown as UseLibrary,
    drillRoot: 'sys',
    today: '2026-01-20',
    ...over,
  };
};

describe('useCanvasEditing', () => {
  it('hands the canvas every edit callback, and the requests that open an editor on what was just made', () => {
    // Breaks if a canvas callback goes missing from `edit` (the canvas then
    // drops that gesture), or the label request stops reaching the canvas.
    const { result } = renderHook(() => useCanvasEditing(options()));
    expect(Object.keys(result.current.edit).sort()).toEqual([
      'editLabelRequest',
      'editThreatRequest',
      'onAddEdgeLabel',
      'onAddStroke',
      'onAddThreat',
      'onConnect',
      'onCreateAt',
      'onDeleteSelection',
      'onDeleteStroke',
      'onDropInto',
      'onDropLibraryEntry',
      'onEditEdgeLabel',
      'onEditThreatText',
      'onImageFiles',
      'onMoveEdgeLabel',
      'onMoveLane',
      'onNodesMoved',
      'onNoteMoved',
      'onReconnect',
      'onRenameNode',
      'onResize',
      'onRetitleThreat',
      'onSetEdgeSide',
      'onSetNodeRich',
      'onSetRole',
      'onSetTableColumns',
      'onSetThreatStatus',
      'onToggleNote',
      'quickAdd',
    ]);
    expect(result.current.edit.editLabelRequest).toEqual({ id: 'a', nonce: 1 });
  });

  it('places nodes on the plane and sheet on screen, under the drilled node, on the host’s date', () => {
    // Breaks if placement loses the plane, the pen, the drill, the Library tab or today.
    const opts = options();
    const { result } = renderHook(() => useCanvasEditing(opts));
    expect(calls.placement.at(-1)).toMatchObject({
      activePlane: 'p',
      activePlaneManual: true,
      penLayer: 'ink',
      notation: 'plan',
      drillRoot: 'sys',
      today: '2026-01-20',
      selectTab: opts.selectTab,
      selectNode: opts.selection.selectNode,
      selectNodeForRename: opts.selection.selectNodeForRename,
      requestLabelEdit: opts.selection.requestLabelEdit,
      reportIssues: opts.session.reportIssues,
    });
    expect(result.current.edit.onDropLibraryEntry).toBe(result.current.placement.dropLibraryEntry);
  });

  it('a double-click on the canvas answers with the id it created, an image drop with nothing', () => {
    // Breaks if onCreateAt stops returning the new id (the canvas opens it for
    // renaming), or onImageFiles hands the canvas the upload's promise.
    const { result } = renderHook(() => useCanvasEditing(options()));
    const created = result.current.edit.onCreateAt?.({ x: 1, y: 2 });
    expect(created).toBeTypeOf('string');
    expect(result.current.edit.onImageFiles?.([], { x: 0, y: 0 })).toBeUndefined();
  });

  it('offers the swatch row a target only while editing', () => {
    // Breaks if the toolbar's color target shows outside edit mode.
    const editing = renderHook(() => useCanvasEditing(options()));
    expect(editing.result.current.selectionColor).toMatchObject({ value: '' });
    const opts = options();
    const viewing = renderHook(() => useCanvasEditing({ ...opts, session: { ...opts.session, editing: false } }));
    expect(viewing.result.current.selectionColor).toBeNull();
  });
});
