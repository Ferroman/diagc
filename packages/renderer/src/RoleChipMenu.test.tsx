// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { NodeBadge } from './notations';
import { RoleChipMenu } from './RoleChipMenu';

const chip: NodeBadge = { key: 'executes:bob', text: 'E·Bob', title: 'Executor: Bob' };

const trigger = () => screen.getByRole('button', { name: 'E·Bob' });

function renderMenu(onSetRole = vi.fn()) {
  render(<RoleChipMenu chip={chip} className="dg-badge dg-role-chip" role="executes" actorId="bob" zoneId="build" onSetRole={onSetRole} />);
  return onSetRole;
}

describe('RoleChipMenu', () => {
  it('is closed by default', () => {
    renderMenu();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('opens on click, offering the roles the chip does not already hold, then Remove', () => {
    renderMenu();
    fireEvent.click(trigger());
    expect(screen.getAllByRole('menuitem').map((el) => el.textContent)).toEqual(['Owner', 'Checker', 'Remove']);
  });

  it('choosing Owner calls onSetRole(zone, actor, "owns") and closes', () => {
    const onSetRole = renderMenu();
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole('menuitem', { name: 'Owner' }));
    expect(onSetRole).toHaveBeenCalledWith('build', 'bob', 'owns');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('Remove calls onSetRole with null', () => {
    const onSetRole = renderMenu();
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove' }));
    expect(onSetRole).toHaveBeenCalledWith('build', 'bob', null);
  });

  it('Escape closes and refocuses the chip', () => {
    renderMenu();
    fireEvent.click(trigger());
    expect(fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })).toBe(false);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('the menu is portalled — not a DOM descendant of the chip\'s anchor', () => {
    renderMenu();
    fireEvent.click(trigger());
    const menu = screen.getByRole('menu');
    const anchor = trigger().closest('.dg-role-chip-anchor');
    expect(anchor?.contains(menu)).toBe(false);
    expect(menu.parentElement).toBe(document.body);
  });

  it('a mousedown outside closes it', () => {
    renderMenu();
    fireEvent.click(trigger());
    const elsewhere = document.createElement('div');
    document.body.appendChild(elsewhere);
    try {
      fireEvent.mouseDown(elsewhere);
      expect(screen.queryByRole('menu')).toBeNull();
    } finally {
      elsewhere.remove();
    }
  });

  it('walks the items with the arrows, wrapping at both ends', () => {
    renderMenu();
    fireEvent.click(trigger());
    const menu = screen.getByRole('menu');
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement?.textContent).toBe('Checker');
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(document.activeElement?.textContent).toBe('Remove');
  });

  it('the chip button carries nodrag and its click does not bubble', () => {
    const onParentClick = vi.fn();
    render(
      <div onClick={onParentClick}>
        <RoleChipMenu chip={chip} className="dg-badge dg-role-chip" role="executes" actorId="bob" zoneId="build" onSetRole={vi.fn()} />
      </div>,
    );
    const btn = trigger();
    expect(btn.tagName).toBe('BUTTON');
    expect(btn.classList.contains('nodrag')).toBe(true);
    expect(btn.classList.contains('dg-role-chip')).toBe(true);
    fireEvent.click(btn);
    expect(onParentClick).not.toHaveBeenCalled();
  });
});
