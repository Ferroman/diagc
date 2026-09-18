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

  it('does not offer the algorithms that cannot arrange a real diagram', () => {
    // radial needs a TREE, so on any diagram with a cycle it fails outright and
    // the engine degrades to layered — the picker would have been offering a
    // no-op. stress treats nodes as dimensionless points and piles them on top
    // of each other (146 overlapping pairs on platform-c4). See DEFERRALS.md.
    render(<LayoutControls settings={{}} onChange={vi.fn()} />);
    const offered = [...(screen.getByLabelText(/layout algorithm/i) as HTMLSelectElement).options].map((o) => o.value);
    expect(offered).toEqual(['layered', 'force', 'mrtree', 'rectpacking']);
  });

  it('still shows an algorithm a diagram already names, so it can be changed away from', () => {
    // A sidecar written before those entries were withdrawn still says `radial`.
    // Dropping it silently would leave the picker blank and misreport what is
    // actually laying the diagram out.
    render(<LayoutControls settings={{ algorithm: 'radial' }} onChange={vi.fn()} />);
    const select = screen.getByLabelText(/layout algorithm/i) as HTMLSelectElement;
    expect(select.value).toBe('radial');
    expect([...select.options].map((o) => o.value)).toContain('radial');
  });

  it('patches edge routing', () => {
    const onChange = vi.fn();
    render(<LayoutControls settings={{}} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/edge routing/i), { target: { value: 'orthogonal' } });
    expect(onChange).toHaveBeenCalledWith({ edgeRouting: 'orthogonal' });
  });

  it('patches the wrap aspect ratio from a preset and clears it on off', () => {
    const onChange = vi.fn();
    const { rerender } = render(<LayoutControls settings={{}} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Wrap'), { target: { value: '1.6' } });
    expect(onChange).toHaveBeenCalledWith({ aspectRatio: 1.6 });

    rerender(<LayoutControls settings={{ aspectRatio: 1.6 }} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Wrap'), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith({ aspectRatio: undefined });
  });

  it('shows the wrap picker for layered only, and lists a custom sidecar ratio', () => {
    const { rerender } = render(<LayoutControls settings={{ algorithm: 'force', aspectRatio: 1.6 }} onChange={vi.fn()} />);
    expect(screen.queryByLabelText('Wrap')).toBeNull();
    // A hand-written sidecar may name a ratio the presets don't; the select
    // must still show it rather than render blank (same rule as algorithms).
    rerender(<LayoutControls settings={{ aspectRatio: 1.4 }} onChange={vi.fn()} />);
    const select = screen.getByLabelText('Wrap') as HTMLSelectElement;
    expect(select.value).toBe('1.4');
    expect([...select.options].map((o) => o.value)).toContain('1.4');
  });

  it('hides the algorithm picker — and nothing else — when the notation owns the algorithm', () => {
    render(<LayoutControls settings={{}} onChange={() => {}} algorithmLocked />);
    expect(screen.queryByLabelText('Layout algorithm')).toBeNull();
    expect(screen.getByLabelText('Layout direction')).toBeDefined();
  });

  it('still runs layered-only controls when the locked notation\'s sidecar names a different algorithm', () => {
    // Second-order pins the run to layered regardless of what a stale/foreign
    // sidecar says (elk partitions are layered-only) — the direction/wrap
    // controls must reflect that forced algorithm, not the unused setting.
    render(<LayoutControls settings={{ algorithm: 'force' }} onChange={() => {}} algorithmLocked />);
    expect(screen.queryByLabelText('Layout algorithm')).toBeNull();
    expect(screen.getByLabelText('Layout direction')).toBeDefined();
  });
});
