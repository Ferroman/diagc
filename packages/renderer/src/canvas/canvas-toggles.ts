import type { Dispatch, SetStateAction } from 'react';
import type { CanvasKeyHint } from './view-types';

/** One of the canvas's on/off switches, as the corner button, the host's
 * command and the legend's drawings row all show and press it. */
export interface CanvasToggle {
  /** its name: the host's key hint for it, and its command */
  key: CanvasKeyHint;
  on: boolean;
  /** there is something for it to switch: no button, and the command reports false, otherwise */
  offered: boolean;
  flip: () => void;
  /** the corner button's class, with its off (or on) modifier */
  className: string;
  /** what pressing it does, before the host's key hint */
  title: string;
  label: string;
  glyph: string;
}

type Switch = [boolean, Dispatch<SetStateAction<boolean>>];

export interface CanvasToggleState {
  dim: Switch;
  laser: Switch;
  drawings: Switch;
  legend: Switch;
  loops: Switch;
  /** the plane has strokes and the view is not drilled in: drilled in, every stroke is hidden */
  drawingsOffered: boolean;
  legendOffered: boolean;
  /** a causal-loop diagram, which has loop badges */
  loopsOffered: boolean;
  /** drop the active loop highlight */
  clearLoopHighlight: () => void;
}

const flipOf =
  ([, set]: Switch) =>
  () =>
    set((v) => !v);

/** The five switches, in the corner cluster's order. */
export function canvasToggles(state: CanvasToggleState): CanvasToggle[] {
  const { dim, laser, drawings, legend, loops } = state;
  return [
    {
      key: 'dim',
      on: dim[0],
      offered: true,
      flip: flipOf(dim),
      className: `dg-focus-toggle${dim[0] ? '' : ' dg-focus-toggle-off'}`,
      title: dim[0] ? 'Stop dimming unconnected on select' : 'Dim unconnected on select',
      label: dim[0] ? 'Stop dimming unconnected on select' : 'Dim unconnected on select',
      glyph: '◎',
    },
    {
      key: 'laser',
      on: laser[0],
      offered: true,
      flip: flipOf(laser),
      className: `dg-laser-toggle${laser[0] ? ' dg-laser-toggle-on' : ''}`,
      title: laser[0] ? 'Laser pointer off' : 'Laser pointer',
      label: 'Laser pointer',
      glyph: '◉',
    },
    {
      key: 'drawings',
      on: drawings[0],
      offered: state.drawingsOffered,
      flip: flipOf(drawings),
      className: `dg-drawings-toggle${drawings[0] ? '' : ' dg-drawings-toggle-off'}`,
      title: drawings[0] ? 'Hide drawings' : 'Show drawings',
      label: drawings[0] ? 'Hide drawings' : 'Show drawings',
      glyph: '✎',
    },
    {
      key: 'legend',
      on: legend[0],
      offered: state.legendOffered,
      flip: flipOf(legend),
      className: `dg-legend-toggle-btn${legend[0] ? '' : ' dg-legend-toggle-btn-off'}`,
      title: legend[0] ? 'Hide legend' : 'Show legend',
      label: legend[0] ? 'Hide legend' : 'Show legend',
      glyph: '▤',
    },
    {
      key: 'loops',
      on: loops[0],
      offered: state.loopsOffered,
      flip: () => {
        // hiding removes the badges you'd click to un-highlight, so drop
        // any active loop highlight on the way out
        if (loops[0]) state.clearLoopHighlight();
        loops[1]((v) => !v);
      },
      className: `dg-loop-toggle${loops[0] ? '' : ' dg-loop-toggle-off'}`,
      title: loops[0] ? 'Hide loop badges' : 'Show loop badges',
      label: loops[0] ? 'Hide loop badges' : 'Show loop badges',
      glyph: '↻',
    },
  ];
}

/** the toggle named `key` (every name is in the table) */
export const toggleOf = (toggles: readonly CanvasToggle[], key: CanvasKeyHint): CanvasToggle =>
  toggles.find((t) => t.key === key)!;
