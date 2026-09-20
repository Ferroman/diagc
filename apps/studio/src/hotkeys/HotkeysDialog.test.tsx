// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HotkeysDialog } from './HotkeysDialog';
import type { Overrides } from './keymap';

function Harness({ initial = {}, onClose = () => {} }: { initial?: Overrides; onClose?: () => void }) {
  const [o, setO] = useState<Overrides>(initial);
  return (
    <>
      <output data-testid="state">{JSON.stringify(o)}</output>
      <HotkeysDialog overrides={o} onChange={setO} onClose={onClose} mac={false} />
    </>
  );
}
const state = () => JSON.parse(screen.getByTestId('state').textContent ?? '{}') as Overrides;
const btn = (name: string) => screen.getByRole('button', { name });
const record = (chipName: string, init: KeyboardEventInit) => {
  fireEvent.click(btn(chipName));
  fireEvent.keyDown(btn(chipName), init);
};

afterEach(() => vi.restoreAllMocks());

describe('HotkeysDialog', () => {
  it('records a new key over an existing one', () => {
    render(<Harness />);
    fireEvent.click(btn('Change N for Add node'));
    expect(btn('Change N for Add node').textContent).toBe('Press a key…');
    fireEvent.keyDown(btn('Change N for Add node'), { key: 'a' });
    expect(state()).toEqual({ 'edit.add-node': ['A'] });
    expect(btn('Change A for Add node').textContent).toBe('A');
  });

  it('waits through a bare modifier', () => {
    render(<Harness />);
    fireEvent.click(btn('Change N for Add node'));
    fireEvent.keyDown(btn('Change N for Add node'), { key: 'Shift', shiftKey: true });
    expect(btn('Change N for Add node').textContent).toBe('Press a key…');
    fireEvent.keyDown(btn('Change N for Add node'), { key: 'A', shiftKey: true });
    expect(state()).toEqual({ 'edit.add-node': ['Shift+A'] });
  });

  it('Escape cancels a recording first, and only then closes', () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    fireEvent.click(btn('Change N for Add node'));
    fireEvent.keyDown(btn('Change N for Add node'), { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    expect(btn('Change N for Add node').textContent).toBe('N');
    expect(state()).toEqual({});
    fireEvent.keyDown(btn('Change N for Add node'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('refuses a reserved key and says why', () => {
    render(<Harness />);
    record('Change N for Add node', { key: 'Delete' });
    expect(screen.getByRole('alert').textContent).toContain('This key has a fixed meaning in the studio.');
    expect(state()).toEqual({});
  });

  it('names a clash and reassigns on request', () => {
    render(<Harness />);
    record('Change N for Add node', { key: 'p' });
    expect(screen.getByRole('alert').textContent).toContain('P is already Pen.');
    expect(state()).toEqual({}); // nothing changes until you choose
    fireEvent.click(btn('Reassign'));
    expect(state()).toEqual({ 'tool.pen': [], 'edit.add-node': ['P'] });
  });

  it('cancelling a clash changes nothing', () => {
    render(<Harness />);
    record('Change N for Add node', { key: 'p' });
    fireEvent.click(btn('Cancel'));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(state()).toEqual({});
  });

  it('lets a view-only and an edit-only action share a key without a fuss', () => {
    render(<Harness />);
    record('Change N for Add node', { key: 'F2' }); // F2 = Rename diagram, view mode only
    expect(screen.queryByRole('alert')).toBeNull();
    expect(state()).toEqual({ 'edit.add-node': ['F2'] });
  });

  it('adds an alternate key', () => {
    render(<Harness />);
    fireEvent.click(btn('Add a key for Undo'));
    fireEvent.keyDown(btn('Add a key for Undo'), { key: 'u' });
    expect(state()).toEqual({ 'edit.undo': ['Mod+Z', 'U'] });
  });

  it('removes one key of several', () => {
    render(<Harness />);
    fireEvent.click(btn('Remove Ctrl+Y from Redo'));
    expect(state()).toEqual({ 'edit.redo': ['Mod+Shift+Z'] });
  });

  it('resets one row, offering that only on a row that was changed', () => {
    render(<Harness initial={{ 'edit.add-node': ['A'] }} />);
    expect(screen.queryByRole('button', { name: 'Reset Undo' })).toBeNull();
    fireEvent.click(btn('Reset Add node'));
    expect(state()).toEqual({});
  });

  it('resets everything after a confirm', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<Harness initial={{ 'edit.add-node': ['A'], 'tool.pen': [] }} />);
    fireEvent.click(btn('Reset all to defaults'));
    await waitFor(() => expect(state()).toEqual({}));
  });

  it('keeps everything when the reset is declined', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<Harness initial={{ 'edit.add-node': ['A'] }} />);
    fireEvent.click(btn('Reset all to defaults'));
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(state()).toEqual({ 'edit.add-node': ['A'] });
  });

  it('filters by action name, group or key', () => {
    render(<Harness />);
    const search = screen.getByLabelText('Search shortcuts');
    fireEvent.change(search, { target: { value: 'laser' } });
    expect(screen.queryByText('Laser pointer')).not.toBeNull();
    expect(screen.queryByText('Add node')).toBeNull();
    fireEvent.change(search, { target: { value: 'ctrl+z' } });
    expect(screen.queryByText('Undo')).not.toBeNull();
    expect(screen.queryByText('Laser pointer')).toBeNull();
  });

  it('flags a clash that is already stored (a later default, a hand-edited value)', () => {
    render(<Harness initial={{ 'edit.add-node': ['P'] }} />);
    expect(btn('Change P for Add node').getAttribute('title')).toBe('Also bound to Pen');
    expect(btn('Change P for Pen').getAttribute('title')).toBe('Also bound to Add node');
  });

  it('lists the fixed keys, which offer nothing to change', () => {
    render(<Harness />);
    expect(screen.queryByText('Delete / Backspace')).not.toBeNull();
    expect(screen.queryByRole('button', { name: /Delete \/ Backspace/ })).toBeNull();
  });

  it('closes on a press of the backdrop, not of the dialog', () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    fireEvent.mouseDown(screen.getByRole('dialog', { name: 'Keyboard shortcuts' }));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(screen.getByTestId('hotkeys-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
