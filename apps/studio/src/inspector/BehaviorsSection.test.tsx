// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DiagramNode, StateBehavior } from '@diagc/core/internal';
import { BehaviorsSection } from './BehaviorsSection';

const state = (behaviors?: StateBehavior[]): DiagramNode => ({
  id: 's',
  name: 'S',
  type: 'sm-state',
  ...(behaviors !== undefined ? { behaviors } : {}),
});

const TWO: StateBehavior[] = [
  { trigger: 'entry', effect: 'reserveStock' },
  { trigger: 'exit', guard: 'ok', effect: 'release' },
];

describe('BehaviorsSection', () => {
  it('adds an entry behaviour as the whole list', () => {
    // Breaks if the add row sends only the new entry over the existing ones, or sends an empty effect.
    const onCommand = vi.fn();
    render(<BehaviorsSection node={state()} onCommand={onCommand} />);
    expect(screen.getByText('Add behaviour').hasAttribute('disabled')).toBe(true);
    fireEvent.change(screen.getByLabelText('New behaviour effect'), { target: { value: 'reserveStock' } });
    fireEvent.click(screen.getByText('Add behaviour'));
    expect(onCommand).toHaveBeenCalledWith({
      type: 'set-state-behaviors',
      id: 's',
      behaviors: [{ trigger: 'entry', effect: 'reserveStock' }],
    });
  });

  it('adds an event behaviour with a guard, appended after the existing ones', () => {
    // Breaks if a free event name or the guard is lost, or the new row replaces the list.
    const onCommand = vi.fn();
    render(<BehaviorsSection node={state(TWO)} onCommand={onCommand} />);
    fireEvent.change(screen.getByLabelText('New behaviour trigger'), { target: { value: 'event' } });
    fireEvent.change(screen.getByLabelText('New behaviour event'), { target: { value: 'tick' } });
    fireEvent.change(screen.getByLabelText('New behaviour guard'), { target: { value: 'n > 0' } });
    fireEvent.change(screen.getByLabelText('New behaviour effect'), { target: { value: 'count' } });
    fireEvent.click(screen.getByText('Add behaviour'));
    expect(onCommand).toHaveBeenCalledWith({
      type: 'set-state-behaviors',
      id: 's',
      behaviors: [...TWO, { trigger: 'tick', guard: 'n > 0', effect: 'count' }],
    });
  });

  it('moves the second row up, swapping the order', () => {
    // Breaks if a move drops a row or leaves the order alone.
    const onCommand = vi.fn();
    render(<BehaviorsSection node={state(TWO)} onCommand={onCommand} />);
    fireEvent.click(screen.getByLabelText('Move behaviour 2 up'));
    expect(onCommand).toHaveBeenCalledWith({
      type: 'set-state-behaviors',
      id: 's',
      behaviors: [TWO[1], TWO[0]],
    });
    expect(screen.getByLabelText('Move behaviour 1 up').hasAttribute('disabled')).toBe(true);
    expect(screen.getByLabelText('Move behaviour 2 down').hasAttribute('disabled')).toBe(true);
  });

  it('removes the last row with an empty list', () => {
    // Breaks if removing the last behaviour leaves it behind (an empty list removes the field).
    const onCommand = vi.fn();
    render(<BehaviorsSection node={state([TWO[0]!])} onCommand={onCommand} />);
    fireEvent.click(screen.getByLabelText('Remove behaviour 1'));
    expect(onCommand).toHaveBeenCalledWith({ type: 'set-state-behaviors', id: 's', behaviors: [] });
  });

  it('edits a row in place, and drops its guard when emptied', () => {
    // Breaks if an edit rewrites other rows or keeps a blank guard.
    const onCommand = vi.fn();
    render(<BehaviorsSection node={state(TWO)} onCommand={onCommand} />);
    const guard = screen.getByLabelText('Behaviour 2 guard');
    fireEvent.change(guard, { target: { value: '' } });
    fireEvent.blur(guard);
    expect(onCommand).toHaveBeenCalledWith({
      type: 'set-state-behaviors',
      id: 's',
      behaviors: [TWO[0], { trigger: 'exit', effect: 'release' }],
    });
  });

  it('snaps an emptied effect back and sends nothing', () => {
    // Breaks if an empty effect reaches core, which rejects it.
    const onCommand = vi.fn();
    render(<BehaviorsSection node={state(TWO)} onCommand={onCommand} />);
    const effect = screen.getByLabelText('Behaviour 1 effect');
    fireEvent.change(effect, { target: { value: ' ' } });
    fireEvent.blur(effect);
    expect(onCommand).not.toHaveBeenCalled();
    expect((effect as HTMLInputElement).value).toBe('reserveStock');
  });

  it('shows nothing for a node that is not a state', () => {
    // Breaks if the section appears on every node.
    render(<BehaviorsSection node={{ ...state(), type: 'sm-initial' }} onCommand={vi.fn()} />);
    expect(screen.queryByText('Behaviours')).toBeNull();
  });
});
