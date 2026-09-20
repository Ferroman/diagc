// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { model } from '@diagc/core';
import { DiagramView } from './DiagramView';

// a -> b -> c chain: a's only neighbor is b; c is not connected to a.
function chain() {
  const m = model('chain');
  const a = m.node('a', { type: 'service' });
  const b = m.node('b', { type: 'service' });
  const c = m.node('c', { type: 'service' });
  m.relate(a, b, { kind: 'sync' });
  m.relate(b, c, { kind: 'sync' });
  return m.toJSON();
}

const nodeDimmed = (container: HTMLElement, id: string): boolean =>
  container.querySelector(`.react-flow__node[data-id="${id}"] .dg-focus-node-dim`) !== null;

describe('connected-neighborhood focus dim', () => {
  it('dims only the nodes not connected to the selected node', async () => {
    const { container } = render(<DiagramView model={chain()} />);
    await screen.findByText('a');
    expect(container.querySelectorAll('.dg-focus-node-dim')).toHaveLength(0); // nothing until selected

    fireEvent.click(screen.getByText('a'));
    await waitFor(() => expect(container.querySelector('.dg-focus-node-dim')).not.toBeNull());
    // only 'c' (unconnected) dims; 'a' (selected) and 'b' (neighbor) stay full
    expect(container.querySelectorAll('.dg-focus-node-dim')).toHaveLength(1);
    expect(nodeDimmed(container, 'c')).toBe(true);
    expect(nodeDimmed(container, 'a')).toBe(false);
    expect(nodeDimmed(container, 'b')).toBe(false);
  });

  it('the Controls toggle (default on) turns the dimming off', async () => {
    const { container, getByLabelText } = render(<DiagramView model={chain()} />);
    await screen.findByText('a');
    fireEvent.click(screen.getByText('a'));
    await waitFor(() => expect(container.querySelectorAll('.dg-focus-node-dim')).toHaveLength(1));

    fireEvent.click(getByLabelText('Stop dimming unconnected on select'));
    await waitFor(() => expect(container.querySelectorAll('.dg-focus-node-dim')).toHaveLength(0));
  });

  it('clears the dim when the selection is dropped (pane click)', async () => {
    const { container } = render(<DiagramView model={chain()} />);
    await screen.findByText('a');
    fireEvent.click(screen.getByText('a'));
    await waitFor(() => expect(container.querySelectorAll('.dg-focus-node-dim')).toHaveLength(1));

    fireEvent.click(container.querySelector('.react-flow__pane') as HTMLElement);
    await waitFor(() => expect(container.querySelectorAll('.dg-focus-node-dim')).toHaveLength(0));
  });
});
