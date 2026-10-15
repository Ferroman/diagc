import { describe, expect, it } from 'vitest';
import { revealViewport } from './reveal';
import { MIN_ZOOM } from './useLayoutApi';

const frame = { width: 800, height: 600 };
const PAD = 24;

describe('revealViewport', () => {
  it('moves nothing for a box already in view, clear of the padding', () => {
    expect(revealViewport({ x: 0, y: 0, width: 100, height: 100 }, { x: 50, y: 50, zoom: 1 }, frame, PAD)).toBeNull();
  });

  it('pans the least that brings a box that fits at this zoom into view', () => {
    // off the right edge: the camera slides left until the box's right edge is one pad in
    expect(revealViewport({ x: 1000, y: 0, width: 100, height: 100 }, { x: 0, y: 50, zoom: 1 }, frame, PAD)).toEqual({
      x: -324,
      y: 50,
      zoom: 1,
    });
    // partly above the frame: the camera slides down until the top is one pad in
    expect(revealViewport({ x: 0, y: -200, width: 100, height: 100 }, { x: 50, y: 50, zoom: 1 }, frame, PAD)).toEqual({
      x: 50,
      y: 224,
      zoom: 1,
    });
    // a pan is measured on screen, so it scales with the zoom: the box spans 1000..1050
    expect(revealViewport({ x: 2000, y: 0, width: 100, height: 100 }, { x: 0, y: 50, zoom: 0.5 }, frame, PAD)).toEqual({
      x: -274,
      y: 50,
      zoom: 0.5,
    });
  });

  it('zooms out to fit a box larger than the frame, centred', () => {
    const next = revealViewport({ x: 0, y: 0, width: 2000, height: 100 }, { x: 0, y: 0, zoom: 1 }, frame, PAD);
    expect(next).not.toBeNull();
    expect(next!.zoom).toBeCloseTo(0.376);
    // the box spans the frame minus the padding, and sits in the middle vertically
    expect(next!.x).toBeCloseTo(24);
    expect(next!.y).toBeCloseTo((600 - 100 * 0.376) / 2);
  });

  it('never zooms out past the canvas floor', () => {
    const next = revealViewport({ x: 0, y: 0, width: 1e6, height: 1e6 }, { x: 0, y: 0, zoom: 1 }, frame, PAD);
    expect(next!.zoom).toBe(MIN_ZOOM);
  });

  it('never zooms in: a box that fits is panned, not enlarged', () => {
    const next = revealViewport({ x: 0, y: 0, width: 10, height: 10 }, { x: -100, y: 0, zoom: 1 }, frame, PAD);
    expect(next!.zoom).toBe(1);
  });
});
