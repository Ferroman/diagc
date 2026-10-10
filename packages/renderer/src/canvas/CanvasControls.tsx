import type { ReactElement } from 'react';
import { ControlButton, Controls } from '@xyflow/react';
import type { CanvasToggle } from './canvas-toggles';
import type { CanvasKeyHint, DiagramViewProps } from './view-types';

export interface CanvasControlsProps {
  toggles: readonly CanvasToggle[];
  keyHints: DiagramViewProps['keyHints'];
  builtinKeys: DiagramViewProps['builtinKeys'];
  colorMode: DiagramViewProps['colorMode'];
  onToggleTheme: DiagramViewProps['onToggleTheme'];
}

/** The corner cluster: React Flow's zoom buttons, then a button per offered switch, then the host's theme switch. */
export function CanvasControls(props: CanvasControlsProps): ReactElement {
  const keyHint = (k: CanvasKeyHint): string => {
    const h = props.keyHints?.[k] ?? (k === 'laser' && props.builtinKeys !== false ? 'L' : undefined);
    return h !== undefined && h !== '' ? ` (${h})` : '';
  };
  // A switch with nothing to switch gets no button: drilled in, for one, every
  // stroke is hidden, so a drawings switch would flip an invisible layer.
  return (
    <Controls>
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
