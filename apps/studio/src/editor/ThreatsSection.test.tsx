// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { EditorCommand, StrideCategory, Threat } from '@diagramming/core';
import { ThreatsSection } from './ThreatsSection';

const threat = (id: string, over: Partial<Threat> = {}): Threat => ({ id, category: 'S', title: `Threat ${id}`, ...over });

function setup(
  threats: readonly Threat[],
  applicable: readonly StrideCategory[] = ['S', 'R'],
  crossing?: { fromName?: string; toName?: string },
) {
  const onCommand = vi.fn<(c: EditorCommand) => void>();
  const ui = (list: readonly Threat[]) => (
    <ThreatsSection
      target={{ node: 'a' }}
      threats={list}
      applicable={applicable}
      {...(crossing !== undefined ? { crossing } : {})}
      onCommand={onCommand}
    />
  );
  const { rerender } = render(ui(threats));
  return { onCommand, rerender: (list: readonly Threat[]) => rerender(ui(list)) };
}

// No @testing-library/jest-dom in this repo (see FishbonePanel.test.tsx), so
// disabled/value/textContent are read off the elements directly.
const options = (select: HTMLElement) => within(select).getAllByRole('option') as HTMLOptionElement[];

describe('ThreatsSection', () => {
  it('counts the open threats against the total in the heading', () => {
    setup([threat('t1'), threat('t2', { status: 'mitigated' })]);
    expect(screen.getByRole('heading', { name: 'Threats 1 / 2' })).toBeTruthy();
  });

  it('offers the categories that apply to this element first, the rest behind a separator', () => {
    setup([]);
    const opts = options(screen.getByLabelText('New threat category'));
    expect(opts.map((o) => o.textContent)).toEqual([
      'S · Spoofing',
      'R · Repudiation',
      '──',
      'T · Tampering',
      'I · Information disclosure',
      'D · Denial of service',
      'E · Elevation of privilege',
    ]);
    expect(opts[2]?.disabled).toBe(true); // the separator is not a choice
    expect(opts[0]?.disabled).toBe(false);
  });

  it('drops the separator when every category applies', () => {
    setup([], ['S', 'T', 'R', 'I', 'D', 'E']);
    const opts = options(screen.getByLabelText('New threat category'));
    expect(opts.length).toBe(6);
    expect(opts.some((o) => o.disabled)).toBe(false);
  });

  it('adds a threat on Enter under the first free id, then clears the add row', () => {
    const { onCommand } = setup([threat('t1'), threat('t2')]);
    const add = screen.getByRole('button', { name: 'Add threat' }) as HTMLButtonElement;
    expect(add.disabled).toBe(true); // nothing to add while the title is blank

    const title = screen.getByLabelText('New threat') as HTMLInputElement;
    fireEvent.change(title, { target: { value: 'Credential stuffing' } });
    expect(add.disabled).toBe(false);
    fireEvent.keyDown(title, { key: 'Enter' });

    expect(onCommand).toHaveBeenCalledWith({
      type: 'add-threat',
      target: { node: 'a' },
      threat: { id: 't3', category: 'S', title: 'Credential stuffing' },
    });
    expect(title.value).toBe('');
    expect((screen.getByRole('button', { name: 'Add threat' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('adds under the chosen category from the Add button', () => {
    const { onCommand } = setup([]);
    fireEvent.change(screen.getByLabelText('New threat category'), { target: { value: 'R' } });
    fireEvent.change(screen.getByLabelText('New threat'), { target: { value: '  Log tampering  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add threat' }));
    expect(onCommand).toHaveBeenCalledWith({
      type: 'add-threat',
      target: { node: 'a' },
      threat: { id: 't1', category: 'R', title: 'Log tampering' },
    });
  });

  it('patches status and category from the row selects', () => {
    const { onCommand } = setup([threat('t1')]);
    const status = screen.getByLabelText('Threat t1 status') as HTMLSelectElement;
    expect(status.value).toBe('open'); // unset status reads as open
    fireEvent.change(status, { target: { value: 'mitigated' } });
    expect(onCommand).toHaveBeenCalledWith({
      type: 'update-threat',
      target: { node: 'a' },
      id: 't1',
      patch: { status: 'mitigated' },
    });

    fireEvent.change(screen.getByLabelText('Threat t1 category'), { target: { value: 'I' } });
    expect(onCommand).toHaveBeenLastCalledWith({
      type: 'update-threat',
      target: { node: 'a' },
      id: 't1',
      patch: { category: 'I' },
    });
  });

  it('clears the severity through the — option', () => {
    const { onCommand } = setup([threat('t1', { severity: 'high' })]);
    const severity = screen.getByLabelText('Threat t1 severity') as HTMLSelectElement;
    expect(severity.value).toBe('high');
    fireEvent.change(severity, { target: { value: '' } });
    expect(onCommand).toHaveBeenCalledWith({
      type: 'update-threat',
      target: { node: 'a' },
      id: 't1',
      patch: { severity: null },
    });
  });

  it('commits a row title on blur only when it changed', () => {
    const { onCommand } = setup([threat('t1', { title: 'Old' })]);
    const title = screen.getByLabelText('Threat t1 title') as HTMLInputElement;
    expect(title.value).toBe('Old');

    fireEvent.blur(title);
    expect(onCommand).not.toHaveBeenCalled();

    fireEvent.change(title, { target: { value: 'New' } });
    fireEvent.blur(title);
    expect(onCommand).toHaveBeenCalledWith({
      type: 'update-threat',
      target: { node: 'a' },
      id: 't1',
      patch: { title: 'New' },
    });
  });

  it('refreshes a row title changed underneath the panel, and then commits nothing', () => {
    // The Undo case: the model moved while the box was on screen. Controlled
    // with resync (EdgePanel's LabelRow) means the box follows it — and the
    // blur that comes after diffs the model's value against the model's value,
    // so no undo step of its own lands on top of the Undo.
    const { onCommand, rerender } = setup([threat('t1', { title: 'Old' })]);
    const title = screen.getByLabelText('Threat t1 title') as HTMLInputElement;
    expect(title.value).toBe('Old');

    rerender([threat('t1', { title: 'Undone' })]);
    expect((screen.getByLabelText('Threat t1 title') as HTMLInputElement).value).toBe('Undone');

    fireEvent.blur(screen.getByLabelText('Threat t1 title'));
    expect(onCommand).not.toHaveBeenCalled();
  });

  it('snaps a blanked row title back to the stored one without committing', () => {
    // A threat without a title is not a threat (validation rejects it).
    const { onCommand } = setup([threat('t1', { title: 'Old' })]);
    const title = screen.getByLabelText('Threat t1 title') as HTMLInputElement;
    fireEvent.change(title, { target: { value: '   ' } });
    fireEvent.blur(title);
    expect((screen.getByLabelText('Threat t1 title') as HTMLInputElement).value).toBe('Old');
    expect(onCommand).not.toHaveBeenCalled();
  });

  it('commits the description on blur, and clears it to null', () => {
    const { onCommand, rerender } = setup([threat('t1')]);
    fireEvent.click(screen.getByLabelText('Threat t1 details'));
    const description = () => screen.getByLabelText('Threat t1 description') as HTMLTextAreaElement;

    fireEvent.change(description(), { target: { value: 'Session id in the URL' } });
    fireEvent.blur(description());
    expect(onCommand).toHaveBeenCalledWith({
      type: 'update-threat',
      target: { node: 'a' },
      id: 't1',
      patch: { description: 'Session id in the URL' },
    });

    // the round trip the dispatch would make through the model, so the clear
    // below diffs against what is now stored rather than against the old blank
    rerender([threat('t1', { description: 'Session id in the URL' })]);
    expect(description().value).toBe('Session id in the URL');

    // an emptied box means "no prose", which is `null` (the patch's erase), not ''
    fireEvent.change(description(), { target: { value: '' } });
    fireEvent.blur(description());
    expect(onCommand).toHaveBeenLastCalledWith({
      type: 'update-threat',
      target: { node: 'a' },
      id: 't1',
      patch: { description: null },
    });
  });

  it('hides description and mitigation behind the details disclosure', () => {
    const { onCommand } = setup([threat('t1', { mitigation: 'Rate limit' })]);
    expect(screen.queryByLabelText('Threat t1 mitigation')).toBeNull();

    const toggle = screen.getByLabelText('Threat t1 details');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByLabelText('Threat t1 description')).toBeTruthy();

    const mitigation = screen.getByLabelText('Threat t1 mitigation') as HTMLTextAreaElement;
    fireEvent.change(mitigation, { target: { value: 'Rate limit + MFA' } });
    fireEvent.blur(mitigation);
    expect(onCommand).toHaveBeenCalledWith({
      type: 'update-threat',
      target: { node: 'a' },
      id: 't1',
      patch: { mitigation: 'Rate limit + MFA' },
    });

    fireEvent.change(mitigation, { target: { value: '' } });
    fireEvent.blur(mitigation);
    expect(onCommand).toHaveBeenLastCalledWith({
      type: 'update-threat',
      target: { node: 'a' },
      id: 't1',
      patch: { mitigation: null },
    });
  });

  it('marks a folded row whose prose is already written', () => {
    setup([threat('t1'), threat('t2', { description: 'Weak session binding' })]);
    expect(screen.getByLabelText('Threat t1 details').textContent).toBe('▸ details');
    expect(screen.getByLabelText('Threat t2 details').textContent).toBe('▸ details •');
  });

  it('removes a threat', () => {
    const { onCommand } = setup([threat('t1')]);
    fireEvent.click(screen.getByRole('button', { name: 'Remove threat t1' }));
    expect(onCommand).toHaveBeenCalledWith({ type: 'remove-threat', target: { node: 'a' }, id: 't1' });
  });

  it('names the boundaries a flow crosses, "outside" for an end in none', () => {
    setup([], ['T', 'I', 'D'], { toName: 'DMZ' });
    expect(screen.getByText('Crosses: outside → DMZ')).toBeTruthy();
  });

  it('says nothing about crossings for an element that does not cross one', () => {
    setup([]);
    expect(screen.queryByText(/^Crosses:/)).toBeNull();
  });
});
