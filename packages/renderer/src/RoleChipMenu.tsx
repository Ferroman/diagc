import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
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
 *
 * The menu itself is portalled to `document.body`, the same move
 * `RichLabelEditor.tsx`'s toolbar already makes and for the same two
 * reasons: a zone WITH children sits in its own stacking context
 * (DiagramView's derivedNodes gives an expanded node `zIndex: -1`), so a menu
 * painted inside the node would draw underneath that zone's own nested bars
 * rather than over them; and React Flow's XYDrag starts a node drag from a
 * mousedown anywhere on the node that lacks `.nodrag` on itself or an
 * ancestor — the trigger carries it, but the menu's ITEMS, rendered inside
 * the node, would not, so a mousedown that moved even a pixel before mouseup
 * would drag the zone and swallow the click. Portalling to the body escapes
 * both: it is no longer inside the node's stacking context, and `nodrag
 * nopan` on the portalled container covers every item under it.
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
      const target = e.target as Node;
      // The menu is portalled to <body> below, so it is no longer a DOM
      // descendant of `rootRef` — react's tree says it is a child, the DOM's
      // does not. Without also checking `menuRef` here, a mousedown on any
      // item would read as "outside" and close the menu (see close(false)
      // below) before the item's own click/mousedown handler ever ran.
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      close(false);
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

  // The portal's position: fixed coordinates from the trigger's own rect,
  // read directly off the ref rather than through state/effect — `triggerRef`
  // was already attached by an earlier render (the button is always mounted,
  // open or not), so this reads correctly the instant `open` flips true, with
  // no one-render lag before the menu has somewhere to draw. Deliberately NOT
  // re-read on scroll or on a wheel zoom while the menu is open: the
  // outside-mousedown close above already covers the common case (panning is
  // itself a mousedown drag on the canvas), and a zoom that leaves the menu
  // detached from a chip that moved under it is accepted as a rare, low-cost
  // rough edge rather than chased with a scroll/zoom listener.
  const anchorRect = open ? triggerRef.current?.getBoundingClientRect() : undefined;

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
      {open &&
        anchorRect !== undefined &&
        createPortal(
          <div
            id={menuId}
            ref={menuRef}
            // nodrag nopan: portalled out of the node, so these no longer
            // ride along on an ancestor the way the trigger's do — every item
            // below needs both, or the same drag-starts-instead-of-a-click
            // failure the class doc comment above describes.
            className="dg-role-chip-menu nodrag nopan"
            style={{ position: 'fixed', top: anchorRect.bottom, left: anchorRect.left }}
            role="menu"
            aria-label={chip.title}
            onKeyDown={onKeyDown}
          >
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
          </div>,
          document.body,
        )}
    </span>
  );
}
