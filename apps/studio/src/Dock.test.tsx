// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Dock } from './Dock';

describe('Dock', () => {
  it('renders children on the right dock and toggles', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <Dock side="right" collapsed={false} onToggle={onToggle} hasContent={false}>
        <div>body</div>
      </Dock>,
    );
    expect(container.querySelector('.dock.dock-right')).not.toBeNull();
    expect(screen.getByText('body')).toBeDefined();
    screen.getByRole('button', { name: /collapse panel/i }).click();
    expect(onToggle).toHaveBeenCalled();
  });

  it('hides children when collapsed and shows the expand rail', () => {
    render(
      <Dock side="left" collapsed onToggle={() => {}} hasContent={false}>
        <div>body</div>
      </Dock>,
    );
    expect(screen.queryByText('body')).toBeNull();
    expect(screen.getByRole('button', { name: /expand panel/i })).toBeDefined();
  });

  it('shows a hint dot when collapsed with content', () => {
    const { container } = render(
      <Dock side="left" collapsed onToggle={() => {}} hasContent>
        <div>body</div>
      </Dock>,
    );
    expect(container.querySelector('.dock-left .dock-dot')).not.toBeNull();
  });

  it('renders a resize handle when width + onWidthChange are provided, not when collapsed', () => {
    const { container, rerender } = render(
      <Dock
        side="right"
        collapsed={false}
        onToggle={() => {}}
        hasContent={false}
        width={320}
        minWidth={240}
        maxWidth={560}
        onWidthChange={() => {}}
      >
        <div>body</div>
      </Dock>,
    );
    expect(container.querySelector('.dock-resize')).not.toBeNull();
    expect((container.querySelector('.dock-body') as HTMLElement).style.width).toBe('320px');

    rerender(
      <Dock
        side="right"
        collapsed
        onToggle={() => {}}
        hasContent={false}
        width={320}
        minWidth={240}
        maxWidth={560}
        onWidthChange={() => {}}
      >
        <div>body</div>
      </Dock>,
    );
    expect(container.querySelector('.dock-resize')).toBeNull();
  });

  it('places the resize handle on the canvas-facing edge of each dock', () => {
    const common = {
      collapsed: false,
      onToggle: () => {},
      hasContent: false,
      width: 300,
      minWidth: 220,
      maxWidth: 560,
      onWidthChange: () => {},
    };
    const right = render(
      <Dock side="right" {...common}>
        <div>b</div>
      </Dock>,
    );
    const rKids = [...right.container.querySelector('.dock-right')!.children].map(
      (c) => c.className.split(' ')[0],
    );
    // Right dock: canvas is on the left, so the handle precedes the toggle.
    expect(rKids.indexOf('dock-resize')).toBeLessThan(rKids.indexOf('dock-toggle'));

    const left = render(
      <Dock side="left" {...common}>
        <div>b</div>
      </Dock>,
    );
    const lKids = [...left.container.querySelector('.dock-left')!.children].map(
      (c) => c.className.split(' ')[0],
    );
    // Left dock: canvas is on the right, so the handle follows the toggle.
    expect(lKids.indexOf('dock-resize')).toBeGreaterThan(lKids.indexOf('dock-toggle'));
  });
});
