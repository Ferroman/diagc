// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { model } from '@diagc/core';
import type { LoopEdgeInput } from '@diagc/renderer';
import { LeveragePanel } from './LeveragePanel';

// a->t(+), b->a(-), t->c(+), c->a(+), d->t(+). Loop t->c->a->t (R, len 3).
const edges: LoopEdgeInput[] = [
  { id: 'e1', from: 'a', to: 't', polarity: '+' },
  { id: 'e2', from: 'b', to: 'a', polarity: '-' },
  { id: 'e3', from: 't', to: 'c', polarity: '+' },
  { id: 'e4', from: 'c', to: 'a', polarity: '+' },
  { id: 'e5', from: 'd', to: 't', polarity: '+' },
];
const emptyModel = model('m').toJSON(); // names fall back to ids

function renderPanel(over: Partial<Parameters<typeof LeveragePanel>[0]> = {}) {
  const onFocus = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <LeveragePanel
      model={emptyModel}
      edges={edges}
      target="t"
      activeFocusKey={null}
      onFocus={onFocus}
      onClose={onClose}
      {...over}
    />,
  );
  return { ...utils, onFocus, onClose };
}

describe('LeveragePanel', () => {
  it('shows the feedback loop (R amplifier), the ranked drivers, and the hubs', () => {
    const { container, getByText } = renderPanel();
    expect(getByText(/Feedback loops \(1\)/)).toBeDefined();
    expect(container.querySelector('.lev-kind-R')?.textContent).toBe('R');

    // driver rows exist for a (direct, +) and b (2 hops, −)
    const a = container.querySelector('[data-focus="drv:a"]')!;
    expect(a.textContent).toContain('+');
    expect(a.textContent).toContain('direct');
    const b = container.querySelector('[data-focus="drv:b"]')!;
    expect(b.textContent).toContain('−'); // display minus
    expect(b.textContent).toContain('2 hops');

    // hubs a and c
    expect(container.querySelector('[data-focus="hub:a"]')).not.toBeNull();
    expect(container.querySelector('[data-focus="hub:c"]')).not.toBeNull();
  });

  it('focuses a driver path on click and toggles it off when clicked again', () => {
    const { container, onFocus, rerender } = renderPanel();
    fireEvent.click(container.querySelector('[data-focus="drv:a"]')!);
    expect(onFocus).toHaveBeenCalledWith({ key: 'drv:a', nodes: ['a', 't'], edges: ['e1'] });

    // re-render as active, then a second click clears it
    rerender(
      <LeveragePanel
        model={emptyModel}
        edges={edges}
        target="t"
        activeFocusKey="drv:a"
        onFocus={onFocus}
        onClose={() => undefined}
      />,
    );
    fireEvent.click(container.querySelector('[data-focus="drv:a"]')!);
    expect(onFocus).toHaveBeenLastCalledWith(null);
  });

  it('focuses a hub on the union of the target loops that contain it', () => {
    const { container, onFocus } = renderPanel();
    fireEvent.click(container.querySelector('[data-focus="hub:a"]')!);
    const arg = onFocus.mock.calls.at(-1)![0];
    expect(arg.key).toBe('hub:a');
    expect([...arg.nodes].sort()).toEqual(['a', 'c', 't']);
    expect([...arg.edges].sort()).toEqual(['e1', 'e3', 'e4']);
  });

  it('shows the "driver, not driven" empty state for a pure source', () => {
    const { getByText } = renderPanel({ edges: [{ id: 'o', from: 't', to: 'z', polarity: '+' }] });
    expect(getByText(/driver, not driven/)).toBeDefined();
  });

  it('shows a net-effect sign on each leverage-point (hub) row', () => {
    const { container } = renderPanel();
    // a and c both reinforce t (paths a→t, c→a→t are all +)
    expect(container.querySelector('[data-focus="hub:a"]')?.textContent).toContain('+');
    expect(container.querySelector('[data-focus="hub:c"]')?.textContent).toContain('+');
  });

  it('shows a Dependency section for a ctrl-clicked comparison variable', () => {
    // compare t with a: a→t is + direct; t→…→a is t→c→a (+), so both exist → R loop
    const { container, getByText } = renderPanel({ compareId: 'a' });
    expect(getByText('Dependency')).toBeDefined();
    const fwd = container.querySelector('[data-focus="dep:fwd"]');
    const bwd = container.querySelector('[data-focus="dep:bwd"]');
    expect(fwd).not.toBeNull();
    expect(bwd).not.toBeNull();
    expect(getByText(/reinforcing loop \(R\)/)).toBeDefined();
  });

  it('highlights a dependency direction path on click', () => {
    const { container, onFocus } = renderPanel({ compareId: 'a' });
    fireEvent.click(container.querySelector('[data-focus="dep:fwd"]')!);
    // forward = t → a, direct: t→a? there is no t→a edge; forward is t→…→a = t→c→a
    const arg = onFocus.mock.calls.at(-1)![0];
    expect(arg.key).toBe('dep:fwd');
    expect(arg.nodes[0]).toBe('t');
    expect(arg.nodes.at(-1)).toBe('a');
  });

  it('clears the comparison via the ✕ button', () => {
    const onClearCompare = vi.fn();
    const { getByLabelText } = renderPanel({ compareId: 'a', onClearCompare });
    fireEvent.click(getByLabelText('Clear comparison'));
    expect(onClearCompare).toHaveBeenCalled();
  });

  it('shows a balancing (B) loop verdict when the two half-paths carry an odd number of negatives', () => {
    // x→y (+) and y→x (−): forward + backward multiply to a single negative → B
    const { getByText } = renderPanel({
      edges: [
        { id: 'e1', from: 'x', to: 'y', polarity: '+' },
        { id: 'e2', from: 'y', to: 'x', polarity: '-' },
      ],
      target: 'x',
      compareId: 'y',
    });
    expect(getByText(/balancing loop \(B\)/)).toBeDefined();
  });

  it('shows "an unclear loop" (correct article) when a direction crosses an unpolarized edge', () => {
    // x→y has no polarity → forward sign is unknown → loop kind is unknown
    const { getByText } = renderPanel({
      edges: [
        { id: 'e1', from: 'x', to: 'y' },
        { id: 'e2', from: 'y', to: 'x', polarity: '+' },
      ],
      target: 'x',
      compareId: 'y',
    });
    expect(getByText(/an unclear loop/)).toBeDefined();
  });

  it('shows "no causal path" when the two are unconnected', () => {
    const { getByText } = renderPanel({
      edges: [{ id: 'x', from: 'a', to: 'b', polarity: '+' }],
      target: 'a',
      compareId: 'z',
    });
    expect(getByText(/No causal path/)).toBeDefined();
  });
});
