// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { SO_DECISION_TYPE, SO_LEADS_TO_KIND, consequenceTypeOf, model, type DiagramModel } from '@diagramming/core';

const NODES = [
  { id: 'd', position: { x: 200, y: 0 }, measured: { width: 180, height: 48 } },
  { id: 'a', position: { x: 0, y: 88 }, measured: { width: 180, height: 48 } },
  { id: 'b', position: { x: 0, y: 176 }, measured: { width: 180, height: 48 } },
];
vi.mock('@xyflow/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@xyflow/react')>()),
  useNodes: () => NODES,
  ViewportPortal: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
import { OrderBandsOverlay } from './OrderBandsOverlay';

describe('OrderBandsOverlay', () => {
  it('draws one striped band and one header per order', () => {
    const m = model('so');
    m.secondOrder().decision('d').then('a').then('b');
    const { container } = render(<OrderBandsOverlay model={m.toJSON()} direction="DOWN" />);
    expect(container.querySelectorAll('rect.dg-order-band')).toHaveLength(3);
    expect([...container.querySelectorAll('.dg-order-band-header')].map((t) => t.textContent)).toEqual(['Decision', '1st order', '2nd order']);
    expect(container.querySelectorAll('rect.dg-order-band-alt')).toHaveLength(1); // every other band
  });
  it('draws nothing for a graph it cannot number (a loop)', () => {
    // The builder's own toJSON() rejects a consequence loop at validation time
    // (see validate.ts's 'so-cycle' check), so an unnumberable graph has to be
    // built as a raw model here — the same idiom second-order.test.ts uses to
    // exercise consequenceOrders' cycle handling directly.
    const m: DiagramModel = {
      version: 1,
      id: 'loop',
      name: 'loop',
      nodes: [
        { id: 'd', name: 'd', type: SO_DECISION_TYPE },
        { id: 'a', name: 'a', type: consequenceTypeOf('0') },
        { id: 'b', name: 'b', type: consequenceTypeOf('0') },
      ],
      containment: [],
      relations: [
        { id: 'd->a', from: 'd', to: 'a', kind: SO_LEADS_TO_KIND },
        { id: 'a->b', from: 'a', to: 'b', kind: SO_LEADS_TO_KIND },
        { id: 'b->a', from: 'b', to: 'a', kind: SO_LEADS_TO_KIND },
      ],
      layers: [],
      planes: [],
    };
    const { container } = render(<OrderBandsOverlay model={m} direction="DOWN" />);
    expect(container.querySelector('.dg-order-band')).toBeNull();
  });
});
