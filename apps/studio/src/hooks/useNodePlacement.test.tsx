// @vitest-environment jsdom
import { useRef } from 'react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DiagramModel, EditorCommand } from '@diagc/core';
import type { LayoutApi } from '@diagc/renderer';
import type { EditorApi } from '../editor/useEditor';
import type { LibraryEntry } from '../library/types';
import type { UseLibrary } from '../library/useLibrary';
import { useNodePlacement } from './useNodePlacement';

function noop() {
  /* intentionally empty */
}

// applyFromLibrary only ever calls editor.dispatch — session/peek/undo/etc.
// are unused by the path under test, so a minimal stub (not the real
// useEditor hook) is enough and keeps the fixture honest about what this
// specific command path touches.
function stubEditor(dispatch: (c: EditorCommand) => void): EditorApi {
  return {
    session: null,
    peek: () => null,
    start: noop,
    stop: noop,
    dispatch,
    undo: noop,
    redo: noop,
    canUndo: false,
    canRedo: false,
    dirty: false,
    save: async () => ({ ok: true }),
  };
}

const emptyLib: UseLibrary = {
  library: { categories: [], entries: [] },
  addCategory: noop,
  deleteCategory: noop,
  addEntry: noop,
};

// design (Jan 5 – Jan 30, a plan-zone) contains `target`, an untyped node —
// the selection applyFromLibrary restyles.
function fixture(): DiagramModel {
  return {
    version: 1,
    id: 'draft',
    name: 'draft',
    nodes: [
      { id: 'design', name: 'Design', type: 'plan-zone', metadata: { start: '2026-01-05', end: '2026-01-30' } },
      { id: 'target', name: 'Target' },
    ],
    containment: [{ parent: 'design', child: 'target', plane: 'plan' }],
    relations: [],
    layers: [],
    planes: [{ id: 'plan', name: 'Plan', notation: 'plan' }],
  };
}

/**
 * applyFromLibrary has no test file of its own to extend (useNodePlacement's
 * first) — this covers just the one path Fix B touches, the same way
 * useEditor.test.tsx / useEditSession.test.tsx exercise their hooks via
 * renderHook rather than mounting the whole App.
 */
describe('useNodePlacement.applyFromLibrary', () => {
  it('restyling the selection into a plan-zone card batches the retype with seeded, parent-clamped dates', () => {
    const dispatch = vi.fn<(c: EditorCommand) => void>();
    const zoneCard: LibraryEntry = { id: 'plan-zone', category: 'plan', name: 'Zone', template: { type: 'plan-zone' } };

    const { result } = renderHook(() =>
      useNodePlacement({
        editor: stubEditor(dispatch),
        layoutApiRef: useRef<LayoutApi | null>(null),
        setSelection: noop,
        setRenameId: noop,
        setLeftTab: noop,
        requestLabelEdit: noop,
        setSaveIssues: noop,
        activePlane: 'plan',
        activePlaneBorrowsContainment: false,
        activePlaneManual: false,
        penLayer: null,
        selection: { kind: 'node', id: 'target' },
        drillRoot: undefined,
        model: fixture(),
        lib: emptyLib,
        notation: 'plan',
        today: '2026-05-04',
      }),
    );

    act(() => result.current.applyFromLibrary(zoneCard));

    expect(dispatch).toHaveBeenCalledWith({
      type: 'batch',
      commands: [
        { type: 'set-node-details', id: 'target', details: { type: 'plan-zone', color: null, image: null, shape: null } },
        // target is nested under design (Jan 5 – Jan 30): seeded at the
        // parent's start, clamped to 14 days inside it — same numbers
        // planActions.test.ts's seedDates/seedOnRetype cases use for `design`.
        { type: 'set-plan-dates', id: 'target', dates: { start: '2026-01-05', end: '2026-01-18' } },
      ],
    });
  });

  it('a card that is not a plan type sends the plain restyle, unbatched', () => {
    const dispatch = vi.fn<(c: EditorCommand) => void>();
    const tableCard: LibraryEntry = { id: 'service', category: 'general', name: 'Service', template: { type: 'service' } };

    const { result } = renderHook(() =>
      useNodePlacement({
        editor: stubEditor(dispatch),
        layoutApiRef: useRef<LayoutApi | null>(null),
        setSelection: noop,
        setRenameId: noop,
        setLeftTab: noop,
        requestLabelEdit: noop,
        setSaveIssues: noop,
        activePlane: 'plan',
        activePlaneBorrowsContainment: false,
        activePlaneManual: false,
        penLayer: null,
        selection: { kind: 'node', id: 'target' },
        drillRoot: undefined,
        model: fixture(),
        lib: emptyLib,
        notation: 'plan',
        today: '2026-05-04',
      }),
    );

    act(() => result.current.applyFromLibrary(tableCard));

    expect(dispatch).toHaveBeenCalledWith({
      type: 'set-node-details',
      id: 'target',
      details: { type: 'service', color: null, image: null, shape: null },
    });
  });
});
