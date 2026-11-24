import type { ReactElement } from 'react';
import { ControlButton, Controls } from '@xyflow/react';
import { PLAN_LAYOUT } from '../layout/plan-layout';
import type { CanvasToggle } from './canvas-toggles';
import type { CanvasKeyHint, DiagramViewProps } from './view-types';

export interface CanvasControlsProps {
  toggles: readonly CanvasToggle[];
  keyHints: DiagramViewProps['keyHints'];
  builtinKeys: DiagramViewProps['builtinKeys'];
  colorMode: DiagramViewProps['colorMode'];
  onToggleTheme: DiagramViewProps['onToggleTheme'];
  /** a notation that stretches time: px per day now, and a step wider or narrower */
  days?: { width: number; step: (dir: 1 | -1) => void };
}

/** The corner cluster: React Flow's zoom buttons, then a button per offered switch, then the host's theme switch. */
export function CanvasControls(props: CanvasControlsProps): ReactElement {
  const keyHint = (k: CanvasKeyHint): string => {
    const h = props.keyHints?.[k] ?? (k === 'laser' && props.builtinKeys !== false ? 'L' : undefined);
    return h !== undefined && h !== '' ? ` (${h})` : '';
  };
  // A switch with nothing to switch gets no button: drilled in, for one, every
  // stroke is hidden, so a drawings switch would flip an invisible layer.
  const days = props.days;
  return (
    <Controls>
      {/* by the zoom buttons: zoom scales everything, these widen the days alone */}
      {days !== undefined && (
        <>
          <ControlButton
            className="dg-days-narrower"
            title={`Narrower days (${String(days.width)} px per day)`}
            aria-label="Narrower days"
            disabled={days.width <= PLAN_LAYOUT.DAY_MIN}
            onClick={() => days.step(-1)}
          >
            ⇥⇤
          </ControlButton>
          <ControlButton
            className="dg-days-wider"
            title={`Wider days (${String(days.width)} px per day)`}
            aria-label="Wider days"
            disabled={days.width >= PLAN_LAYOUT.DAY_MAX}
            onClick={() => days.step(1)}
          >
            ⇤⇥
          </ControlButton>
        </>
      )}
      {props.toggles
        .filter((t) => t.offered)
        .map((t) => (
          <ControlButton
            key={t.key}
            className={t.className}
            title={`${t.title}${keyHint(t.key)}`}
            aria-label={t.label}
            aria-pressed={t.on}
            onClick={t.flip}
          >
            {t.glyph}
          </ControlButton>
        ))}
      {/* Last in the cluster: it is the host's switch, not a property of the drawing. */}
      {props.onToggleTheme !== undefined && (
        <ControlButton
          className="dg-theme-toggle"
          title={props.colorMode === 'dark' ? 'Light theme' : 'Dark theme'}
          aria-label={props.colorMode === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          onClick={props.onToggleTheme}
        >
          {props.colorMode === 'dark' ? '☀' : '☾'}
        </ControlButton>
      )}
    </Controls>
  );
}
