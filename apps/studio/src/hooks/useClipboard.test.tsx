// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyDrawings, emptyLayout, type DiagramModel, type EditorCommand } from '@diagc/core';
import type { DiagramSelection } from '@diagc/renderer';
import type { EditorApi } from '../editor/useEditor';
import { CLIPBOARD_FORMAT, PASTE_STEP } from '../editor/clipboard';
import { useClipboard, type UseClipboardOptions } from './useClipboard';

const diagram = (): DiagramModel => ({
  version: 1,
  id: 'd',
  name: 'd',
  nodes: [
    { id: 'a', name: 'A' },
    { id: 'b', name: 'B' },
  ],
  containment: [],
  relations: [{ id: 'a->b#0', from: 'a', to: 'b', kind: 'uses' }],
  layers: [],
  planes: [],
});

/** a copy/paste event with a working clipboardData, as the browser hands it over */
function clipboardEvent(type: 'copy' | 'paste', text = '') {
  const store = new Map<string, string>([['text/plain', text]]);
  const e = new Event(type, { bubbles: true, cancelable: true }) as ClipboardEvent;
  Object.defineProperty(e, 'clipboardData', {
    value: { setData: (k: string, v: string) => store.set(k, v), getData: (k: string) => store.get(k) ?? '' },
  });
  return { e, text: () => store.get('text/plain') ?? '' };
}

function setup(over: Partial<UseClipboardOptions> = {}) {
  const dispatched: EditorCommand[] = [];
  const layout = { ...emptyLayout(), planes: { default: { a: { x: 10, y: 20 } } } };
  const session = { state: { model: diagram(), layout, drawings: emptyDrawings() } };
  const editor = { peek: () => session, dispatch: (c: EditorCommand) => dispatched.push(c) } as unknown as EditorApi;
  const select = vi.fn<(s: DiagramSelection | null) => void>();
  const opts: UseClipboardOptions = {
    editing: true,
    editor,
    layoutApiRef: { current: null },
    activePlane: undefined,
    activePlaneBorrowsContainment: false,
    activePlaneManual: false,
    penLayer: null,
    selection: { kind: 'node', id: 'a' },
    multiSelection: [],
    select,
    ...over,
  };
  const hook = renderHook((p: UseClipboardOptions) => useClipboard(p), { initialProps: opts });
  return { dispatched, select, hook, opts };
}

const positionOf = (c: EditorCommand | undefined) =>
  (c?.type === 'batch' ? c.commands : []).find((x) => x.type === 'set-position');

afterEach(() => {
  document.body.innerHTML = '';
});

describe('useClipboard', () => {
  it('copies the selection to the clipboard as our format, claiming the event', () => {
    setup();
    const { e, text } = clipboardEvent('copy');
    document.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(JSON.parse(text())).toMatchObject({ format: CLIPBOARD_FORMAT, nodes: [{ id: 'a' }] });
  });

  it('copies the multi-selection, with the relation between them', () => {
    setup({ multiSelection: ['a', 'b'] });
    const { e, text } = clipboardEvent('copy');
    document.dispatchEvent(e);
    const p = JSON.parse(text());
    expect(p.nodes.map((n: { id: string }) => n.id)).toEqual(['a', 'b']);
    expect(p.relations).toHaveLength(1);
  });

  it('pastes as one batch, selects the copy, and steps each repeat further', () => {
    const { dispatched, select } = setup();
    const copy = clipboardEvent('copy');
    document.dispatchEvent(copy.e);
    const first = clipboardEvent('paste', copy.text());
    document.dispatchEvent(first.e);
    expect(first.e.defaultPrevented).toBe(true);
    expect(dispatched).toHaveLength(1);
    expect(positionOf(dispatched[0])).toMatchObject({ x: 10 + PASTE_STEP, y: 20 + PASTE_STEP });
    expect(select).toHaveBeenCalledWith({ kind: 'node', id: 'a-2' });
    document.dispatchEvent(clipboardEvent('paste', copy.text()).e);
    expect(positionOf(dispatched[1])).toMatchObject({ x: 10 + 2 * PASTE_STEP, y: 20 + 2 * PASTE_STEP });
  });

  it('leaves fields, highlighted text and foreign clipboard text to the browser', () => {
    const { dispatched } = setup();
    const input = document.createElement('input');
    document.body.append(input);
    const inField = clipboardEvent('copy');
    input.dispatchEvent(inField.e);
    expect(inField.e.defaultPrevented).toBe(false);
    const foreign = clipboardEvent('paste', 'just some text');
    document.dispatchEvent(foreign.e);
    expect(foreign.e.defaultPrevented).toBe(false);
    expect(dispatched).toEqual([]);
  });

  it('does nothing with nothing selected, and nothing at all outside edit mode', () => {
    const none = setup({ selection: null });
    const empty = clipboardEvent('copy');
    document.dispatchEvent(empty.e);
    expect(empty.e.defaultPrevented).toBe(false);
    none.hook.unmount();
    setup({ editing: false });
    const viewing = clipboardEvent('copy');
    document.dispatchEvent(viewing.e);
    expect(viewing.e.defaultPrevented).toBe(false);
  });
});
