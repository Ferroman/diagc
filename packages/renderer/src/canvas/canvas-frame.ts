import type { CSSProperties } from 'react';
import type { StylePreset } from '../sketch/stylePresets';

export interface CanvasFrameState {
  /** the PNG export: no controls, no one at the keyboard */
  chromeless: boolean;
  editing: boolean;
  /** view mode with Alt held: nodes drag */
  altHeld: boolean;
  /** a node drag is under way */
  dragging: boolean;
  preset: StylePreset;
  /** the notation's own class, if it has one */
  notationClass: string | undefined;
  penActive: boolean;
  eraserActive: boolean;
  laserOn: boolean;
}

/** The canvas wrapper's classes: the mode, the gesture under way, the style and the notation. */
export function canvasClassName(s: CanvasFrameState): string {
  return [
    'dg-canvas',
    s.chromeless && 'dg-no-chrome',
    s.editing && 'dg-mode-edit',
    !s.editing && s.altHeld && 'dg-alt-move',
    s.dragging && 'dg-dragging',
    s.preset.id !== 'clean' && `dg-style-${s.preset.id}`,
    s.preset.rough !== undefined && 'dg-style-rough',
    s.preset.fontFamily !== undefined && 'dg-style-font',
    s.notationClass,
    s.penActive && 'dg-tool-pen',
    s.eraserActive && 'dg-tool-eraser',
    s.laserOn && 'dg-tool-laser',
  ]
    .filter((c) => typeof c === 'string')
    .join(' ');
}

/** The canvas wrapper's style: the full size of its host, and the preset's font and colour variables. */
export function canvasStyle(preset: StylePreset): CSSProperties {
  return {
    width: '100%',
    height: '100%',
    '--dg-style-font': preset.fontFamily,
    ...(preset.cssVars ?? {}),
  } as CSSProperties;
}
