// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DiagramRelation } from '@diagc/core/internal';
import { TransitionFields } from './TransitionFields';

const relation = (rest: Partial<DiagramRelation> = {}): DiagramRelation => ({
  id: 't1',
  from: 'a',
  to: 'b',
  kind: 'transition',
  ...rest,
});

describe('TransitionFields', () => {
  it('commits a typed guard on blur', () => {
    // Breaks if a part is not written back, or is written untrimmed.
    const onCommand = vi.fn();
    render(<TransitionFields relation={relation()} onCommand={onCommand} />);
    const guard = screen.getByLabelText('Guard');
    fireEvent.change(guard, { target: { value: ' total > 0 ' } });
    fireEvent.blur(guard);
    expect(onCommand).toHaveBeenCalledWith({ type: 'update-relation', id: 't1', patch: { guard: 'total > 0' } });
  });

  it('clears a part with null when its box is emptied, on Enter', () => {
    // Breaks if an emptied box leaves the old guard or stores an empty string.
    const onCommand = vi.fn();
    render(<TransitionFields relation={relation({ guard: 'ok' })} onCommand={onCommand} />);
    const guard = screen.getByLabelText('Guard');
    fireEvent.change(guard, { target: { value: '' } });
    fireEvent.keyDown(guard, { key: 'Enter' });
    expect(onCommand).toHaveBeenCalledWith({ type: 'update-relation', id: 't1', patch: { guard: null } });
  });

  it('commits nothing for an unchanged box', () => {
    // Breaks if every blur writes, filling the undo history.
    const onCommand = vi.fn();
    render(<TransitionFields relation={relation({ trigger: 'pay' })} onCommand={onCommand} />);
    fireEvent.blur(screen.getByLabelText('Trigger'));
    expect(onCommand).not.toHaveBeenCalled();
  });

  it('shows nothing for another kind', () => {
    // Breaks if the fields appear on every relation.
    render(<TransitionFields relation={relation({ kind: 'sync' })} onCommand={vi.fn()} />);
    expect(screen.queryByLabelText('Trigger')).toBeNull();
  });
});
