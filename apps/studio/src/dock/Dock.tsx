import { useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { clampDockWidth } from './dockWidth';

/**
 * A collapsible, resizable side rail. `side` decides which edge the panel hugs: the
 * toggle and drag handle sit on the inner (canvas-facing) edge. Collapsing reclaims
 * the width for the canvas. Dragging the handle live-resizes the panel via a direct
 * DOM write (so the canvas doesn't re-render mid-drag) and commits the final width on
 * release via `onWidthChange`.
 */
export function Dock({
  side,
  collapsed,
  onToggle,
  hasContent,
  width,
  minWidth = 200,
  maxWidth = 560,
  onWidthChange,
  children,
}: {
  side: 'left' | 'right';
  collapsed: boolean;
  onToggle: () => void;
  hasContent: boolean;
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  onWidthChange?: (px: number) => void;
  children: ReactNode;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const lastWidth = useRef<number>(width ?? minWidth);

  const startResize = (e: ReactPointerEvent) => {
    if (width === undefined || onWidthChange === undefined) return;
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    const prevUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = 'none';
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      // Left dock grows to the right; right dock grows to the left.
      const raw = side === 'left' ? startW + dx : startW - dx;
      const w = clampDockWidth(raw, minWidth, maxWidth);
      lastWidth.current = w;
      if (bodyRef.current) bodyRef.current.style.width = `${w}px`;
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.body.style.userSelect = prevUserSelect;
      onWidthChange(lastWidth.current);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // Chevron points toward where the panel goes when collapsed.
  const glyph = collapsed ? (side === 'right' ? '⟨' : '⟩') : side === 'right' ? '⟩' : '⟨';
  const toggle = (
    <button
      type="button"
      className="dock-toggle"
      aria-label={collapsed ? 'Expand panel' : 'Collapse panel'}
      aria-expanded={!collapsed}
      title={collapsed ? 'Expand panel' : 'Collapse panel'}
      onClick={onToggle}
    >
      <span aria-hidden="true">{glyph}</span>
      {collapsed && hasContent && <span className="dock-dot" aria-hidden="true" />}
    </button>
  );
  const handle =
    !collapsed && width !== undefined && onWidthChange !== undefined ? (
      <div
        className="dock-resize"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panel"
        onPointerDown={startResize}
      />
    ) : null;
  const body = !collapsed && (
    <div className="dock-body" ref={bodyRef} style={width !== undefined ? { width } : undefined}>
      {children}
    </div>
  );
  return (
    <div className={`dock dock-${side}${collapsed ? ' collapsed' : ''}`}>
      {side === 'left' && body}
      {side === 'right' && handle}
      {toggle}
      {side === 'left' && handle}
      {side === 'right' && body}
    </div>
  );
}
