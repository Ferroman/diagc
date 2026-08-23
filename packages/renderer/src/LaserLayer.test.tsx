// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { LaserLayer } from './LaserLayer';

const mount = (ui: ReactElement) => render(<ReactFlowProvider>{ui}</ReactFlowProvider>);

describe('LaserLayer', () => {
  it('draws every finished trail as a fading halo + core pair in flow space', () => {
    const { container } = mount(
      <LaserLayer trails={[{ id: 0, points: [0, 0, 10, 10] }, { id: 1, points: [5, 5, 6, 6] }]} live={null} />,
    );
    const groups = container.querySelectorAll('g.dg-laser-trail');
    expect(groups).toHaveLength(2);
    expect(groups[0]?.classList.contains('dg-laser-fade')).toBe(true);
    const halo = groups[0]?.querySelector('path.dg-laser-halo');
    const core = groups[0]?.querySelector('path.dg-laser-core');
    expect(halo?.getAttribute('d')).toBe('M 0 0 L 10 10');
    expect(core?.getAttribute('d')).toBe('M 0 0 L 10 10');
    // the stroke keeps its screen width at any zoom
    expect(halo?.getAttribute('vector-effect')).toBe('non-scaling-stroke');
    expect(core?.getAttribute('vector-effect')).toBe('non-scaling-stroke');
    // the viewport transform (identity in a bare provider)
    expect(container.querySelector('svg.dg-laser > g')?.getAttribute('transform')).toBe('translate(0 0) scale(1)');
  });

  it('draws the live gesture solid, without the fade', () => {
    const { container } = mount(<LaserLayer trails={[]} live={[1, 1, 2, 2]} />);
    const group = container.querySelector('g.dg-laser-trail');
    expect(group?.classList.contains('dg-laser-live')).toBe(true);
    expect(group?.classList.contains('dg-laser-fade')).toBe(false);
    expect(group?.querySelector('path.dg-laser-core')?.getAttribute('d')).toBe('M 1 1 L 2 2');
  });

  it('is an empty, pointer-transparent overlay when idle', () => {
    const { container } = mount(<LaserLayer trails={[]} live={null} />);
    const svg = container.querySelector('svg.dg-laser');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelectorAll('g.dg-laser-trail')).toHaveLength(0);
  });
});
