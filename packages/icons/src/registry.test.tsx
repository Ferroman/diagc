// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createIconRegistry } from './registry';

describe('icon registry', () => {
  it('resolves built-in ids to renderable components', () => {
    const icons = createIconRegistry();
    const Database = icons.resolve('database');
    expect(Database).toBeDefined();
    if (Database === undefined) throw new Error('unreachable');
    const { container } = render(<Database size={16} />);
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('returns undefined for unknown ids', () => {
    expect(createIconRegistry().resolve('nope')).toBeUndefined();
  });

  it('accepts custom icons at creation and via register', () => {
    const Custom = () => <svg data-testid="custom" />;
    const icons = createIconRegistry({ mine: Custom });
    expect(icons.resolve('mine')).toBe(Custom);
    icons.register('postgres', Custom);
    expect(icons.resolve('postgres')).toBe(Custom);
  });
});
