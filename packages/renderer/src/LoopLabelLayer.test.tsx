// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { model, type DiagramModel } from '@diagramming/core';
import { DiagramView } from './DiagramView';

/** 3-node cyclic model: a->b->c->a, all relations '+' by default (flip via polarity) */
function cldTriangle(thirdPolarity: '+' | '-' = '+'): DiagramModel {
  const m = model('t-cld');
  const a = m.node('a');
  const b = m.node('b');
  const c = m.node('c');
  m.relate(a, b, { kind: 'influences', polarity: '+' });
  m.relate(b, c, { kind: 'influences', polarity: '+' });
  m.relate(c, a, { kind: 'influences', polarity: thirdPolarity });
  return m.toJSON();
}

/** two disjoint '+' triangles → two independent loops (a,b,c) and (d,e,f). */
function cldTwoLoops(): DiagramModel {
  const m = model('t-cld2');
  const a = m.node('a');
  const b = m.node('b');
  const c = m.node('c');
  const d = m.node('d');
  const e = m.node('e');
  const f = m.node('f');
  const link = (from: typeof a, to: typeof a) => m.relate(from, to, { kind: 'influences', polarity: '+' });
  link(a, b);
  link(b, c);
  link(c, a);
  link(d, e);
  link(e, f);
  link(f, d);
  return m.toJSON();
}

describe('LoopLabelLayer (via DiagramView)', () => {
  it('renders an R badge for an all-+ cyclic causal-loop model', async () => {
    const { container } = render(<DiagramView model={cldTriangle('+')} notation="causal-loop" />);
    await waitFor(() => expect(container.querySelector('.dg-loop-badge')).not.toBeNull());
    const badge = container.querySelector('.dg-loop-badge') as HTMLElement;
    expect(badge.getAttribute('data-kind')).toBe('R');
    expect(badge.textContent).toContain('R');
  });

  it('renders a B badge when one relation flips to "-"', async () => {
    const { container } = render(<DiagramView model={cldTriangle('-')} notation="causal-loop" />);
    await waitFor(() => expect(container.querySelector('.dg-loop-badge')).not.toBeNull());
    const badge = container.querySelector('.dg-loop-badge') as HTMLElement;
    expect(badge.getAttribute('data-kind')).toBe('B');
    expect(badge.textContent).toContain('B');
  });

  it('renders no loop badges outside causal-loop notation', async () => {
    const { container } = render(<DiagramView model={cldTriangle('+')} />);
    await screen.findByText('a');
    expect(container.querySelector('.dg-loop-badge')).toBeNull();
  });
});

describe('loop-badge show/hide toggle', () => {
  it('offers the toggle control only in causal-loop notation', async () => {
    const { container } = render(<DiagramView model={cldTriangle('+')} notation="causal-loop" />);
    await waitFor(() => expect(container.querySelector('.dg-loop-badge')).not.toBeNull());
    expect(container.querySelector('.dg-loop-toggle')).not.toBeNull();

    const plain = render(<DiagramView model={cldTriangle('+')} />);
    await plain.findByText('a');
    expect(plain.container.querySelector('.dg-loop-toggle')).toBeNull();
  });

  it('hides every badge when toggled off and restores them when toggled on', async () => {
    const { container } = render(<DiagramView model={cldTriangle('+')} notation="causal-loop" />);
    await waitFor(() => expect(container.querySelector('.dg-loop-badge')).not.toBeNull());
    const toggle = container.querySelector('.dg-loop-toggle') as HTMLButtonElement;
    expect(toggle.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(toggle);
    await waitFor(() => expect(container.querySelector('.dg-loop-badge')).toBeNull());
    expect(toggle.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(toggle);
    await waitFor(() => expect(container.querySelector('.dg-loop-badge')).not.toBeNull());
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
  });
});

describe('active-loop badge focus', () => {
  it('dims the other badges when one badge is activated, and keeps the active one lit', async () => {
    const { container } = render(<DiagramView model={cldTwoLoops()} notation="causal-loop" />);
    await waitFor(() => expect(container.querySelectorAll('.dg-loop-badge')).toHaveLength(2));
    // nothing dimmed until a loop is active
    expect(container.querySelectorAll('.dg-loop-badge.dimmed')).toHaveLength(0);

    fireEvent.click(container.querySelectorAll('.dg-loop-badge')[0] as HTMLElement);
    await waitFor(() => expect(container.querySelector('.dg-loop-badge.active')).not.toBeNull());
    expect(container.querySelectorAll('.dg-loop-badge.active')).toHaveLength(1);
    expect(container.querySelectorAll('.dg-loop-badge.dimmed')).toHaveLength(1);
    // the active badge is not itself dimmed
    const active = container.querySelector('.dg-loop-badge.active') as HTMLElement;
    expect(active.classList.contains('dimmed')).toBe(false);
  });
});

describe('onCldEdges', () => {
  it('surfaces the compiled signed loop-graph for a causal-loop diagram', async () => {
    const onCldEdges = vi.fn();
    render(<DiagramView model={cldTriangle('-')} notation="causal-loop" onCldEdges={onCldEdges} />);
    await waitFor(() => expect(onCldEdges).toHaveBeenCalled());
    const edges = onCldEdges.mock.calls.at(-1)![0] as { from: string; to: string; polarity?: string }[];
    expect(edges).toHaveLength(3);
    expect(edges.every((e) => 'from' in e && 'to' in e)).toBe(true);
    // c->a carries the flipped polarity
    expect(edges.some((e) => e.polarity === '-')).toBe(true);
  });

  it('does not surface a loop-graph outside causal-loop notation', async () => {
    const onCldEdges = vi.fn();
    render(<DiagramView model={cldTriangle('+')} onCldEdges={onCldEdges} />);
    await screen.findByText('a');
    // called (with an empty graph) but never with edges — non-CLD has no overlay
    for (const call of onCldEdges.mock.calls) expect(call[0]).toHaveLength(0);
  });
});

describe('view-mode node filter', () => {
  it('shows only the badges for loops the selected node belongs to, and restores on deselect', async () => {
    const { container, getByText } = render(<DiagramView model={cldTwoLoops()} notation="causal-loop" />);
    await waitFor(() => expect(container.querySelectorAll('.dg-loop-badge')).toHaveLength(2));

    // 'a' is only in the (a,b,c) loop → one badge
    fireEvent.click(getByText('a'));
    await waitFor(() => expect(container.querySelectorAll('.dg-loop-badge')).toHaveLength(1));

    // clicking empty canvas clears the filter → both badges again
    fireEvent.click(container.querySelector('.react-flow__pane') as HTMLElement);
    await waitFor(() => expect(container.querySelectorAll('.dg-loop-badge')).toHaveLength(2));
  });

  it('does not filter in edit mode (node selection there opens the node panel instead)', async () => {
    const { container, getByText } = render(<DiagramView model={cldTwoLoops()} notation="causal-loop" mode="edit" />);
    await waitFor(() => expect(container.querySelectorAll('.dg-loop-badge')).toHaveLength(2));
    fireEvent.click(getByText('a'));
    // still both badges — edit mode ignores the node filter
    await new Promise((r) => setTimeout(r, 50));
    expect(container.querySelectorAll('.dg-loop-badge')).toHaveLength(2);
  });
});

describe('loop-badge fill under rough presets', () => {
  it('solid fill (sketch preset) still renders the badge backing as a rough path', async () => {
    const { container } = render(<DiagramView model={cldTriangle('+')} notation="causal-loop" styleId="sketch" />);
    await waitFor(() => expect(container.querySelector('.dg-loop-badge')).not.toBeNull());
    expect(container.querySelector('path.dg-loop-badge-fill')).not.toBeNull();
    expect(container.querySelector('circle.dg-loop-badge-fill')).toBeNull();
  });

  it('hachure fill (hand-drawn preset) still gets an opaque circle backing, not the unreadable hatch texture', async () => {
    // hand-drawn's rough config is a hachure fillStyle, whose sketchCircle output
    // puts all geometry in `hatch` (stroked lines) and leaves `fill` empty — the
    // badge must still get a plain circle backing so crossing edges don't show
    // through the R/B letter.
    const { container } = render(<DiagramView model={cldTriangle('+')} notation="causal-loop" styleId="hand-drawn" />);
    await waitFor(() => expect(container.querySelector('.dg-loop-badge')).not.toBeNull());
    expect(container.querySelector('circle.dg-loop-badge-fill')).not.toBeNull();
    expect(container.querySelector('path.dg-loop-badge-fill')).toBeNull();
  });
});
