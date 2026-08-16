// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LayoutControls } from './LayoutControls';

describe('LayoutControls', () => {
  it('patches the algorithm, and clears it when the default is chosen again', () => {
    const onChange = vi.fn();
    const { rerender } = render(<LayoutControls settings={{}} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/layout algorithm/i), { target: { value: 'force' } });
    expect(onChange).toHaveBeenCalledWith({ algorithm: 'force' });

    rerender(<LayoutControls settings={{ algorithm: 'force' }} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/layout algorithm/i), { target: { value: 'layered' } });
    expect(onChange).toHaveBeenCalledWith({ algorithm: undefined });
  });

  it('shows the direction picker for layered only', () => {
    const { rerender } = render(<LayoutControls settings={{}} onChange={vi.fn()} />);
    expect(screen.queryByLabelText(/layout direction/i)).not.toBeNull();
    rerender(<LayoutControls settings={{ algorithm: 'force' }} onChange={vi.fn()} />);
    expect(screen.queryByLabelText(/layout direction/i)).toBeNull();
  });

  it('patches spacing as a number and clears it when emptied', () => {
    const onChange = vi.fn();
    const { rerender } = render(<LayoutControls settings={{}} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/node spacing/i), { target: { value: '24' } });
    expect(onChange).toHaveBeenCalledWith({ spacing: 24 });

    rerender(<LayoutControls settings={{ spacing: 24 }} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/node spacing/i), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith({ spacing: undefined });
  });

  it('patches edge routing', () => {
    const onChange = vi.fn();
    render(<LayoutControls settings={{}} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/edge routing/i), { target: { value: 'orthogonal' } });
    expect(onChange).toHaveBeenCalledWith({ edgeRouting: 'orthogonal' });
  });
});
