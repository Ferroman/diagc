// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MenuButton, type MenuItem } from './MenuButton';

const items = (over: Partial<Record<'rename' | 'duplicate' | 'eject', () => void>> = {}): MenuItem[] => [
  { id: 'rename', label: 'Rename', title: 'Rename this diagram', onSelect: over.rename ?? (() => {}) },
  { id: 'duplicate', label: 'Duplicate', onSelect: over.duplicate ?? (() => {}) },
  { id: 'eject', label: 'Eject', onSelect: over.eject ?? (() => {}) },
];

const trigger = () => screen.getByRole('button', { name: 'Diagram actions' });

describe('MenuButton', () => {
  it('shows nothing until opened, then lists the items with focus on the first', () => {
    render(<MenuButton label="Diagram actions" items={items()}>⋯</MenuButton>);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(trigger());
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    expect(screen.getAllByRole('menuitem').map((el) => el.textContent)).toEqual(['Rename', 'Duplicate', 'Eject']);
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Rename' }));
    expect(screen.getByRole('menuitem', { name: 'Rename' }).getAttribute('title')).toBe('Rename this diagram');
  });

  it('runs the chosen item, closes, and hands focus back to the trigger', () => {
    const duplicate = vi.fn();
    render(<MenuButton label="Diagram actions" items={items({ duplicate })}>⋯</MenuButton>);
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole('menuitem', { name: 'Duplicate' }));
    expect(duplicate).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('walks the items with the arrows, wrapping at both ends', () => {
    render(<MenuButton label="Diagram actions" items={items()}>⋯</MenuButton>);
    fireEvent.click(trigger());
    const menu = screen.getByRole('menu');
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement?.textContent).toBe('Duplicate');
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(document.activeElement?.textContent).toBe('Eject');
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement?.textContent).toBe('Rename');
  });

  it('closes on Escape, claiming the key and returning focus', () => {
    render(<MenuButton label="Diagram actions" items={items()}>⋯</MenuButton>);
    fireEvent.click(trigger());
    // fireEvent returns false when the handler called preventDefault — which is
    // what keeps the studio's key dispatcher from also acting on this Escape
    expect(fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })).toBe(false);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('closes on a press outside without pulling focus back', () => {
    render(
      <>
        <MenuButton label="Diagram actions" items={items()}>⋯</MenuButton>
        <button type="button">elsewhere</button>
      </>,
    );
    fireEvent.click(trigger());
    const elsewhere = screen.getByRole('button', { name: 'elsewhere' });
    elsewhere.focus();
    fireEvent.mouseDown(elsewhere);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(elsewhere);
  });

  it('closes on a press its target swallows — the canvas never lets a mousedown bubble', () => {
    // React Flow's pane (d3-zoom) stops mousedown where it lands; see the same
    // case in DiagramPicker.test.tsx
    render(<MenuButton label="Diagram actions" items={items()}>⋯</MenuButton>);
    fireEvent.click(trigger());
    const canvas = document.createElement('div');
    canvas.addEventListener('mousedown', (e) => e.stopImmediatePropagation());
    document.body.appendChild(canvas);
    try {
      fireEvent.mouseDown(canvas);
      expect(screen.queryByRole('menu')).toBeNull();
    } finally {
      canvas.remove();
    }
  });

  it('closes when Tab moves on, leaving the key to the browser', () => {
    render(<MenuButton label="Diagram actions" items={items()}>⋯</MenuButton>);
    fireEvent.click(trigger());
    expect(fireEvent.keyDown(screen.getByRole('menu'), { key: 'Tab' })).toBe(true);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('a second click on the trigger closes it', () => {
    render(<MenuButton label="Diagram actions" items={items()}>⋯</MenuButton>);
    fireEvent.click(trigger());
    fireEvent.click(trigger());
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('renders nothing at all when there is nothing to offer', () => {
    const { container } = render(<MenuButton label="Diagram actions" items={[]}>⋯</MenuButton>);
    expect(container.innerHTML).toBe('');
  });
});
