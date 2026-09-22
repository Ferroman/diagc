// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { model } from '@diagc/core';
import { PlanPanel } from './PlanPanel';

function plan() {
  const m = model('p');
  const p = m.plan();
  const alice = p.person('alice', 'Alice');
  const q1 = p.zone('q1', { name: 'Q1', start: '2026-01-05', end: '2026-03-27' }).owner(alice);
  q1.zone('build', { name: 'Build', start: '2026-02-02', end: '2026-03-27' }).event('m1', { name: 'M1', at: '2026-03-02' });
  p.event('kickoff', { name: 'Kickoff', at: '2026-01-05' });
  return m.toJSON();
}
const setup = (selection: { kind: 'node' | 'edge'; id: string } | null = null, m = plan()) => {
  const onCommand = vi.fn();
  const onSelect = vi.fn();
  render(<PlanPanel model={m} plane="plan" selection={selection} onCommand={onCommand} onSelect={onSelect} today="2026-05-04" />);
  return { onCommand, onSelect };
};

describe('PlanPanel', () => {
  it('lists zones indented by nesting with their dates and roles, and events with their date', () => {
    setup();
    const q1 = screen.getByLabelText('Start Q1') as HTMLInputElement;
    expect(q1.value).toBe('2026-01-05');
    expect((screen.getByLabelText('End Build') as HTMLInputElement).value).toBe('2026-03-27');
    expect((screen.getByLabelText('Owner Q1') as HTMLSelectElement).value).toBe('alice');
    expect((screen.getByLabelText('Executor Q1') as HTMLSelectElement).value).toBe('');
    expect(screen.getByLabelText('Start Build').closest('li')?.style.paddingLeft).toBe('12px');
    expect(screen.getByLabelText('Start Q1').closest('li')?.style.paddingLeft).toBe('0px');
    expect((screen.getByLabelText('At M1') as HTMLInputElement).value).toBe('2026-03-02');
    expect((screen.getByLabelText('At Kickoff') as HTMLInputElement).value).toBe('2026-01-05');
  });
  it('a date change dispatches set-plan-dates; a role change replaces the relation; the name selects', () => {
    const { onCommand, onSelect } = setup();
    fireEvent.change(screen.getByLabelText('End Q1'), { target: { value: '2026-04-03' } });
    expect(onCommand).toHaveBeenCalledWith({ type: 'set-plan-dates', id: 'q1', dates: { end: '2026-04-03' } });
    fireEvent.change(screen.getByLabelText('Checker Build'), { target: { value: 'alice' } });
    expect(onCommand).toHaveBeenLastCalledWith({ type: 'batch', commands: [{ type: 'add-relation', from: 'alice', to: 'build', opts: { kind: 'checks' } }] });
    fireEvent.change(screen.getByLabelText('Owner Q1'), { target: { value: '' } });
    expect(onCommand).toHaveBeenLastCalledWith({ type: 'batch', commands: [{ type: 'delete-relation', id: 'alice->q1#0' }] });
    fireEvent.click(screen.getByLabelText('Select Build'));
    expect(onSelect).toHaveBeenCalledWith('build');
  });
  it('role pickers list people first, then other nodes, never zones or events', () => {
    setup();
    const opts = [...(screen.getByLabelText('Owner Q1') as HTMLSelectElement).options].map((o) => o.value);
    expect(opts).toEqual(['', 'alice']);
  });
  it('quick-adds nest under the selected zone and select what they made', () => {
    const { onCommand, onSelect } = setup({ kind: 'node', id: 'build' });
    fireEvent.click(screen.getByRole('button', { name: 'Add zone' }));
    expect(onCommand).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'add-node', parent: { id: 'build', plane: 'plan' } }));
    expect(onSelect).toHaveBeenLastCalledWith('zone');
    fireEvent.click(screen.getByRole('button', { name: 'Add event' }));
    expect(onCommand).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'add-node', node: expect.objectContaining({ type: 'plan-event', metadata: { at: '2026-03-27' } }) }));
    const name = screen.getByLabelText('New person name');
    expect((screen.getByRole('button', { name: 'Add person' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(name, { target: { value: 'Bob Lee' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add person' }));
    expect(onCommand).toHaveBeenLastCalledWith({ type: 'add-node', node: { id: 'bob-lee', name: 'Bob Lee', type: 'person', plane: 'plan' } });
    expect((name as HTMLInputElement).value).toBe('');
  });
});
