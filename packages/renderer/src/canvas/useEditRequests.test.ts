// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Node } from '@xyflow/react';
import { useEditRequests, type EditRequestsInput } from './useEditRequests';
import type { EditingApi } from './view-types';

const box = (id: string): Node => ({ id, position: { x: 0, y: 0 }, data: {} });

function setup() {
  const spies = { setLabelEdit: vi.fn(), setNoteEdit: vi.fn(), setRfNodes: vi.fn() };
  const selectOnAppearRef = { current: null as string | null };
  const view = renderHook(
    ({ editing, edit }: { editing: boolean; edit: EditingApi | undefined }) =>
      useEditRequests({ editing, edit, derivedNodes: [box('a')], selectOnAppearRef, ...spies } as EditRequestsInput),
    { initialProps: { editing: true, edit: {} as EditingApi | undefined } },
  );
  return { ...spies, selectOnAppearRef, rerender: view.rerender };
}

describe('useEditRequests', () => {
  it("opens a threat's title once per nonce, and never replays it on the way back into edit mode", () => {
    const { setNoteEdit, rerender } = setup();
    const request = (nonce: number) => ({ editThreatRequest: { target: { node: 'a' }, id: 't1', nonce } });
    rerender({ editing: true, edit: request(1) });
    expect(setNoteEdit).toHaveBeenCalledTimes(1);
    expect(setNoteEdit).toHaveBeenLastCalledWith({ key: 'node:a', id: 't1' });
    rerender({ editing: true, edit: request(1) });
    rerender({ editing: false, edit: undefined });
    rerender({ editing: true, edit: request(1) });
    expect(setNoteEdit).toHaveBeenCalledTimes(1);
    rerender({ editing: true, edit: request(2) });
    expect(setNoteEdit).toHaveBeenCalledTimes(2);
  });

  it('acts on no request while viewing', () => {
    const { setNoteEdit, setLabelEdit, rerender } = setup();
    rerender({
      editing: false,
      edit: {
        editThreatRequest: { target: { node: 'a' }, id: 't1', nonce: 1 },
        editLabelRequest: { id: 'a', nonce: 1 },
      },
    });
    expect(setNoteEdit).not.toHaveBeenCalled();
    expect(setLabelEdit).not.toHaveBeenCalled();
  });

  it('opens a laid-out node for its name and selects it, once per nonce', () => {
    const { setLabelEdit, setRfNodes, selectOnAppearRef, rerender } = setup();
    rerender({ editing: true, edit: { editLabelRequest: { id: 'a', nonce: 1 } } });
    rerender({ editing: true, edit: { editLabelRequest: { id: 'a', nonce: 1 } } });
    expect(setLabelEdit).toHaveBeenCalledTimes(1);
    expect(setLabelEdit).toHaveBeenLastCalledWith({ kind: 'node', id: 'a' });
    expect(setRfNodes).toHaveBeenCalledTimes(1);
    expect(selectOnAppearRef.current).toBeNull();
  });

  it('leaves a claim for a node the layout has not placed yet', () => {
    const { setLabelEdit, setRfNodes, selectOnAppearRef, rerender } = setup();
    rerender({ editing: true, edit: { editLabelRequest: { id: 'fresh', nonce: 1 } } });
    expect(setLabelEdit).toHaveBeenLastCalledWith({ kind: 'node', id: 'fresh' });
    expect(setRfNodes).not.toHaveBeenCalled();
    expect(selectOnAppearRef.current).toBe('fresh');
  });
});
