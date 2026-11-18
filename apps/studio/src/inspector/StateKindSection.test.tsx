// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { STATE_KINDS, type DiagramNode, type StateKind } from '@diagc/core/internal';
import { StateKindSection } from './StateKindSection';

const state = (stateKind?: StateKind): DiagramNode => ({
  id: 's',
  name: 'S',
  type: 'sm-state',
  ...(stateKind !== undefined ? { stateKind } : {}),
});

describe('StateKindSection', () => {
  it('offers no kind and every kind, and shows the one the state has', () => {
    const { unmount } = render(<StateKindSection node={state()} onCommand={vi.fn()} />);
    const select = screen.getByLabelText<HTMLSelectElement>('State kind');
    expect([...select.options].map((o) => o.value)).toEqual(['', ...STATE_KINDS]);
    expect(select.value).toBe('');
    unmount();
    render(<StateKindSection node={state('failed')} onCommand={vi.fn()} />);
    expect(screen.getByLabelText<HTMLSelectElement>('State kind').value).toBe('failed');
  });

  it('sets the kind picked, and clears it on None', () => {
    const onCommand = vi.fn();
    render(<StateKindSection node={state('failed')} onCommand={onCommand} />);
    fireEvent.change(screen.getByLabelText('State kind'), { target: { value: 'waiting' } });
    fireEvent.change(screen.getByLabelText('State kind'), { target: { value: '' } });
    expect(onCommand.mock.calls.map(([c]) => c)).toEqual([
      { type: 'set-node-details', id: 's', details: { stateKind: 'waiting' } },
      { type: 'set-node-details', id: 's', details: { stateKind: null } },
    ]);
  });

  it('is offered on a state only', () => {
    const { container } = render(
      <StateKindSection node={{ id: 'z', name: 'Z', type: 'sm-zone' }} onCommand={vi.fn()} />,
    );
    expect(container.innerHTML).toBe('');
  });
});
