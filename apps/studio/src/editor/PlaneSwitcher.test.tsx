// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PlaneSwitcher } from './PlaneSwitcher';

const planes = [
  { id: 'arch', name: 'Architecture' },
  { id: 'flow', name: 'Flow' },
];

describe('PlaneSwitcher', () => {
  it('renders nothing when there are no planes', () => {
    const { container } = render(
      <PlaneSwitcher planes={[]} activePlane={undefined} onSelect={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('marks Default active when no plane is selected, and the plane when one is', () => {
    const { rerender } = render(
      <PlaneSwitcher planes={planes} activePlane={undefined} onSelect={() => {}} />,
    );
    expect(screen.getByRole('button', { name: 'Default' }).className).toContain('active');

    rerender(<PlaneSwitcher planes={planes} activePlane="flow" onSelect={() => {}} />);
    expect(screen.getByRole('button', { name: 'Flow' }).className).toContain('active');
    expect(screen.getByRole('button', { name: 'Default' }).className).not.toContain('active');
  });

  it('calls onSelect with undefined for Default and the id for a plane', () => {
    const onSelect = vi.fn();
    render(<PlaneSwitcher planes={planes} activePlane="arch" onSelect={onSelect} />);
    screen.getByRole('button', { name: 'Default' }).click();
    expect(onSelect).toHaveBeenCalledWith(undefined);
    screen.getByRole('button', { name: 'Architecture' }).click();
    expect(onSelect).toHaveBeenCalledWith('arch');
  });
});
