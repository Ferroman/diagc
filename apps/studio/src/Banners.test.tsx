// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Banners, type BannersProps } from './Banners';

const props = (over: Partial<BannersProps> = {}): BannersProps => ({
  names: ['a'],
  canDesign: true,
  editing: false,
  current: { name: 'a', issues: [] },
  saveIssues: null,
  ...over,
});

describe('Banners', () => {
  it('says how to get a first diagram: New where the design API is up, compile otherwise', () => {
    // Breaks if an empty workspace with the API up is sent to a build step it does not need.
    const { rerender } = render(<Banners {...props({ names: [] })} />);
    expect(screen.getByText(/No diagrams yet/)).toBeDefined();
    rerender(<Banners {...props({ names: [], canDesign: false })} />);
    expect(screen.getByText(/No artifacts found/)).toBeDefined();
  });

  it("shows the open diagram's validation issues and a failed save in view mode only", () => {
    // Breaks if view mode loses its banner, or edit mode shows one beside the toolbar's.
    const failing = props({
      current: { name: 'a', issues: [{ message: 'bad ref' }] },
      saveIssues: [{ message: 'Could not save layout' }],
    });
    const { container, rerender } = render(<Banners {...failing} />);
    expect(screen.getByText('bad ref')).toBeDefined();
    expect(screen.getByText('Could not save layout')).toBeDefined();
    rerender(<Banners {...failing} editing />);
    expect(container.innerHTML).toBe('');
  });

  it('draws nothing with nothing to say', () => {
    // Breaks if an empty issue list still draws a banner.
    const { container } = render(<Banners {...props({ saveIssues: [] })} />);
    expect(container.innerHTML).toBe('');
  });
});
