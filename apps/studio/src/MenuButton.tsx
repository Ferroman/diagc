import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';

export interface MenuItem {
  id: string;
  label: string;
  title?: string;
  onSelect: () => void;
}

/**
 * A topbar button that opens a short list of commands — the home of actions
 * that matter but not often enough to each hold a chip in a row that has to fit
 * a narrow pane (Rename / Duplicate / Eject).
 *
 * Deliberately small: no submenus, no typeahead, no disabled rows. The caller
 * passes only the items that apply right now, the way the chips these replace
 * were rendered conditionally — and with none to offer there is no button.
 */
export function MenuButton({
  label,
  items,
  children,
  className = 'chip icon',
  header,
}: {
  /** the trigger's accessible name; `children` is its glyph */
  label: string;
  items: readonly MenuItem[];
  children: ReactNode;
  /** the trigger's class: a glyph chip unless the trigger is a word (the read-only chip) */
  className?: string;
  /** a line above the items that is not one: what the menu is about, not a choice */
  header?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  // `refocus` is false when the user has already gone elsewhere (a press
  // outside, Tab): yanking focus back to the trigger would fight them.
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
    // lands, so one on the canvas — most of the window — never bubbles up here.
    document.addEventListener('mousedown', onDown, true);
    return () => document.removeEventListener('mousedown', onDown, true);
  }, [open]);

  if (items.length === 0) return null;

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      // Claimed, so the studio's key dispatcher (which skips a prevented event)
      // does not also read this Escape as "back to the Select tool".
      e.preventDefault();
      close(true);
    } else if (e.key === 'Tab') {
      close(false); // not prevented: the browser still moves focus on
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const rows = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
      const at = rows.indexOf(document.activeElement as HTMLElement);
      // Wrapped, unlike the diagram picker's clamped list: a menu this short has
      // no far end to be thrown to, and wrapping is what a menu is expected to do.
      rows[(at + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length]?.focus();
    }
  };

  return (
    <div className="menu-button" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={className}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? close(true) : setOpen(true))}
      >
        {children}
      </button>
      {open && (
        <div id={menuId} ref={menuRef} className="menu-button-pop" role="menu" aria-label={label} onKeyDown={onKeyDown}>
          {header !== undefined && <div className="menu-button-header">{header}</div>}
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              className="menu-button-item"
              title={item.title}
              onClick={() => {
                close(true);
                item.onSelect();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
