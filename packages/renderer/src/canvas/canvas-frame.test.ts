import { describe, expect, it } from 'vitest';
import { stylePreset } from '../sketch/stylePresets';
import { canvasClassName, canvasGrid, canvasStyle, type CanvasFrameState } from './canvas-frame';

const resting: CanvasFrameState = {
  chromeless: false,
  editing: false,
  altHeld: false,
  dragging: false,
  preset: stylePreset('clean'),
  notationClass: undefined,
  penActive: false,
  eraserActive: false,
  laserOn: false,
};

describe('canvasClassName', () => {
  it('is the bare canvas class for a resting view-mode canvas in the clean style', () => {
    expect(canvasClassName(resting)).toBe('dg-canvas');
  });

  it('names the mode, the gesture, the style, the notation and the tool, in that order', () => {
    const busy: CanvasFrameState = {
      chromeless: true,
      editing: true,
      altHeld: true,
      dragging: true,
      preset: stylePreset('hand-drawn'),
      notationClass: 'dg-notation-cld',
      penActive: true,
      eraserActive: true,
      laserOn: true,
    };
    expect(canvasClassName(busy)).toBe(
      'dg-canvas dg-no-chrome dg-mode-edit dg-dragging dg-style-hand-drawn dg-style-rough dg-style-font ' +
        'dg-notation-cld dg-tool-pen dg-tool-eraser dg-tool-laser',
    );
  });

  it('marks an Alt-held drag in view mode only', () => {
    expect(canvasClassName({ ...resting, altHeld: true })).toBe('dg-canvas dg-alt-move');
    expect(canvasClassName({ ...resting, altHeld: true, editing: true })).toBe('dg-canvas dg-mode-edit');
  });
});

describe('canvasStyle', () => {
  it("fills its host and carries the preset's font and variables", () => {
    const blueprint = stylePreset('blueprint');
    expect(canvasStyle(blueprint)).toEqual({
      width: '100%',
      height: '100%',
      '--dg-style-font': blueprint.fontFamily,
      ...blueprint.cssVars,
    });
  });

  it('sets no font for a preset without one', () => {
    expect(canvasStyle(stylePreset('clean'))).toEqual({ width: '100%', height: '100%', '--dg-style-font': undefined });
  });
});

describe('canvasGrid', () => {
  it('shows the snap grid while snapping, whatever the preset', () => {
    expect(canvasGrid({ id: 'x', label: 'X', grid: 'none' }, 16)).toEqual({ gap: 16, className: 'dg-grid-on' });
  });

  it("else draws the preset's grid: dots by default, lines, or none", () => {
    expect(canvasGrid(stylePreset('clean'), undefined)).toEqual({});
    expect(canvasGrid({ id: 'x', label: 'X', grid: 'lines' }, undefined)).toEqual({ variant: 'lines', gap: 32 });
    expect(canvasGrid({ id: 'x', label: 'X', grid: 'none' }, undefined)).toBeNull();
  });
});
