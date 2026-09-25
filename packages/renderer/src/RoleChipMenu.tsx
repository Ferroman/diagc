import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { PLAN_ROLES, type PlanRole } from '@diagc/core';
import { ROLE_LABEL, type NodeBadge } from './notations';
import type { EditingApi } from './view-types';

/**
 * A plan role chip, in edit mode: the same pill DiagramNode always drew, now a
 * button that opens a short menu — the other two roles, then Remove — and
 * turns the choice into one EditingApi.onSetRole call. `className` is handed
 * in whole (DiagramNode computes the base classes plus the reciprocal
 * `dg-role-chip-active` modifier the same way for both the span and this), so
 * the button inherits the exact look the span had; only `nodrag` is added
 * here, for the reason below.
 */
export function RoleChipMenu({
  chip,
  className,
  role,
  actorId,
  zoneId,
  onSetRole,
}: {
  chip: NodeBadge;
  className: string;
  role: PlanRole;
  actorId: string;
  zoneId: string;
  onSetRole: EditingApi['onSetRole'] & {};
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  // `refocus` is false when the user pressed outside: yanking focus back to
  // the chip would fight them (same rule as the studio's MenuButton).
  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close(false);
    };
    // Capture phase: React Flow's pane (d3-zoom) stops a mousedown where it
    // lands, so one on the canvas — most of the window a plan diagram fills —
    // never bubbles up to a listener registered the normal way (see the
    // studio's MenuButton, which hits the same issue for its topbar menus).
    document.addEventListener('mousedown', onDown, true);
    return () => document.removeEventListener('mousedown', onDown, true);
  }, [open]);

  // Every role but this chip's own, in PLAN_ROLES order, then Remove last.
  const items: { id: string; label: string; next: PlanRole | null }[] = [
    ...PLAN_ROLES.filter((r) => r !== role).map((r) => ({ id: r, label: ROLE_LABEL[r].title, next: r })),
    { id: 'remove', label: 'Remove', next: null },
  ];

  const choose = (next: PlanRole | null) => {
    onSetRole(zoneId, actorId, next);
    close(true);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      // Claimed, so the studio's key dispatcher (which skips a prevented
      // event) does not also read this Escape as "back to the Select tool".
      e.preventDefault();
      close(true);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const rows = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
      const at = rows.indexOf(document.activeElement as HTMLElement);
      // Wrapped: a menu this short has no far end to be thrown to.
      rows[(at + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length]?.focus();
    }
  };

  return (
    <span className="dg-role-chip-anchor" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        // nodrag: React Flow starts a node drag from a mousedown anywhere on
        // the node unless the target (or an ancestor) carries this class —
        // without it, opening the menu would also drag the zone.
        className={`${className} nodrag`}
        title={chip.title}
        aria-haspopup="menu"
        aria-expanded={open}
        {...(open ? { 'aria-controls': menuId } : {})}
        {...(chip.color !== undefined ? { style: { '--dg-chip': chip.color } as CSSProperties } : {})}
        // Stops the mousedown/click from reaching the canvas underneath (which
        // would select/deselect the zone the chip sits on) — the same
        // stopPropagation pair QuickAddButton uses for the same reason.
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        {chip.text}
      </button>
      {open && (
        <div id={menuId} ref={menuRef} className="dg-role-chip-menu" role="menu" aria-label={chip.title} onKeyDown={onKeyDown}>
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              className="dg-role-chip-menu-item"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                choose(item.next);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
