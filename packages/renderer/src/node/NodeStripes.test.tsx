// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NodeStripes } from './NodeStripes';

describe('NodeStripes', () => {
  it('a period stripe draws hatched', () => {
    const { container } = render(<NodeStripes stripes={[{ x: 20, width: 40, title: 'Freeze' }]} />);
    const s = container.querySelector('.dg-stripe') as HTMLElement;
    expect(s.title).toBe('Freeze');
    expect(s.style.left).toBe('20px');
    expect(s.classList.contains('dg-stripe-tint')).toBe(false);
  });

  it('a tint stripe draws as a wash, not a hatch', () => {
    const { container } = render(
      <NodeStripes stripes={[{ x: 0, width: 80, title: 'Payments', color: '#f00', variant: 'tint' }]} />,
    );
    const s = container.querySelector('.dg-stripe') as HTMLElement;
    expect(s.classList.contains('dg-stripe-tint')).toBe(true);
    expect(s.style.getPropertyValue('--dg-stripe')).toBe('#f00');
    expect(s.style.width).toBe('80px');
  });
});
