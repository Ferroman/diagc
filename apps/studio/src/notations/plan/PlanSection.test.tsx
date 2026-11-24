// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { model } from '@diagc/core/internal';
import { PlanSection, roleCandidates } from './PlanSection';

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
    expect(onCommand).toHaveBeenLastCalledWith({
      type: 'batch',
      commands: [{ type: 'add-relation', from: 'alice', to: 'q1', opts: { kind: 'owns' } }],
    });
  });
  it('a period: start and end, no role pickers', () => {
    const m = model('p');
    m.plan().period('freeze', { name: 'Freeze', start: '2026-12-21', end: '2027-01-03' });
    const json = m.toJSON();
    const onCommand = vi.fn();
    render(<PlanSection model={json} node={json.nodes.find((n) => n.id === 'freeze')!} onCommand={onCommand} />);
    expect((screen.getByLabelText('End') as HTMLInputElement).value).toBe('2027-01-03');
    expect(screen.queryByLabelText('Owner')).toBeNull();
    fireEvent.change(screen.getByLabelText('Start'), { target: { value: '2026-12-20' } });
    expect(onCommand).toHaveBeenCalledWith({ type: 'set-plan-dates', id: 'freeze', dates: { start: '2026-12-20' } });
  });
  it('an event: at only', () => {
    const m = plan();
    render(<PlanSection model={m} node={m.nodes.find((n) => n.id === 'kickoff')!} onCommand={vi.fn()} />);
    expect((screen.getByLabelText('At') as HTMLInputElement).value).toBe('2026-01-05');
    expect(screen.queryByLabelText('Start')).toBeNull();
    expect(screen.queryByLabelText('Owner')).toBeNull();
  });
});

describe('a person', () => {
  it("a person's teams are listed and can be removed", () => {
    const m = model('p');
    const p = m.plan();
    const alice = p.person('alice', 'Alice');
    p.team('pay', 'Payments').member(alice);
    p.team('plat', 'Platform').member(alice);
    const json = m.toJSON();
    const onCommand = vi.fn();
    render(<PlanSection model={json} node={json.nodes.find((n) => n.id === 'alice')!} onCommand={onCommand} />);
    expect(screen.getByText('Payments')).toBeTruthy();
    expect(screen.getByText('Platform')).toBeTruthy();
    expect(screen.queryByLabelText('Start')).toBeNull();
    const id = json.relations.find((r) => r.from === 'alice' && r.to === 'plat')!.id;
    fireEvent.click(screen.getByRole('button', { name: 'Remove from Platform' }));
    expect(onCommand).toHaveBeenCalledWith({ type: 'delete-relation', id });
  });
  it('says so when the person is in no team', () => {
    const m = model('p');
    m.plan().person('bob', 'Bob');
    const json = m.toJSON();
    render(<PlanSection model={json} node={json.nodes[0]!} onCommand={vi.fn()} />);
    expect(screen.getByText(/Not in a team/)).toBeTruthy();
  });
});

describe('roleCandidates', () => {
  it('lists actors — people and teams — first, then other nodes, never zones or events', () => {
    const m = model('c');
    const p = m.plan();
    p.person('alice', 'Alice');
    p.team('platform', 'Platform');
    m.node('svc', { name: 'Service' });
    p.zone('q1', { name: 'Q1', start: '2026-01-05', end: '2026-01-09' });
    p.event('kickoff', { name: 'Kickoff', at: '2026-01-05' });
    const ids = roleCandidates(m.toJSON()).map((n) => n.id);
    expect(ids).toEqual(['alice', 'platform', 'svc']);
  });
});
