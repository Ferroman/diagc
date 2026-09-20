import type { ReactNode } from 'react';
import { DockSection } from './DockSection';
import { LayoutControls, type LayoutControlsProps } from './LayoutControls';

/**
 * The right dock's Layout & style section: how the active plane is arranged and
 * drawn, and the commands that act on that arrangement.
 *
 * All of it used to ride in the topbar (view mode) and the editor toolbar (edit
 * mode), which is what pushed both rows past the window's edge. It belongs here
 * on its own merits too: the settings are per plane, so they sit beside the
 * plane switcher, and a layout is tuned by changing a value and LOOKING — a
 * section that stays open suits that better than a menu that closes.
 *
 * A layout shell, deliberately: what the settings mean, where they are stored
 * and which commands a mode offers stay with the host (App), as they did when
 * these were topbar chips.
 */
export function LayoutPanel({
  controls,
  styleControl,
  children,
}: {
  /** null when the notation arranges the plane itself — no picker would do anything */
  controls: LayoutControlsProps | null;
  styleControl: ReactNode;
  /** the mode's layout commands: Freeze / Auto-arrange in view, Re-layout / Auto-layout in edit */
  children?: ReactNode;
}) {
  return (
    <DockSection id="layout" title="Layout & style" className="sidebar layout-panel">
      {controls !== null && <LayoutControls {...controls} />}
      <label className="layout-row">
        <span>Style</span>
        {styleControl}
      </label>
      {/* `false`/`null` children (every command conditional and none applying)
          must not leave an empty, padded row behind */}
      {hasContent(children) && <div className="layout-actions">{children}</div>}
    </DockSection>
  );
}

const hasContent = (node: ReactNode): boolean =>
  Array.isArray(node) ? node.some(hasContent) : node !== undefined && node !== null && node !== false && node !== '';
