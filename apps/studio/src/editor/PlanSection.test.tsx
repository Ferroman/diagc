// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { model } from '@diagc/core';
import { PlanSection } from './PlanSection';

function plan() {
  const m = model('p');
  const p = m.plan();
  const alice = p.person('alice', 'Alice');
  p.zone('q1', { name: 'Q1', start: '2026-01-05', end: '2026-03-27' }).executor(alice);
  p.event('kickoff', { name: 'Kickoff', at: '2026-01-05' });
  return m.toJSON();
}

describe('PlanSection', () => {
  it('a zone: start, end and the role pickers; changes dispatch', () => {
    const m = plan();
    const onCommand = vi.fn();
    render(<PlanSection model={m} node={m.nodes.find((n) => n.id === 'q1')!} onCommand={onCommand} />);
    expect((screen.getByLabelText('Start') as HTMLInputElement).value).toBe('2026-01-05');
    expect((screen.getByLabelText('Executor') as HTMLSelectElement).value).toBe('alice');
    fireEvent.change(screen.getByLabelText('Start'), { target: { value: '2026-01-06' } });
    expect(onCommand).toHaveBeenCalledWith({ type: 'set-plan-dates', id: 'q1', dates: { start: '2026-01-06' } });
    fireEvent.change(screen.getByLabelText('Owner'), { target: { value: 'alice' } });
    expect(onCommand).toHaveBeenLastCalledWith({ type: 'batch', commands: [{ type: 'add-relation', from: 'alice', to: 'q1', opts: { kind: 'owns' } }] });
  });
  it('an event: at only', () => {
    const m = plan();
    render(<PlanSection model={m} node={m.nodes.find((n) => n.id === 'kickoff')!} onCommand={vi.fn()} />);
    expect((screen.getByLabelText('At') as HTMLInputElement).value).toBe('2026-01-05');
    expect(screen.queryByLabelText('Start')).toBeNull();
    expect(screen.queryByLabelText('Owner')).toBeNull();
  });
});
