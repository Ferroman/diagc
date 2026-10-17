import { describe, expect, it } from 'vitest';
import { legendPlace, onLegend } from './legend';

const view = { top: 1, width: 100, height: 30 };
const size = { width: 20, height: 6 };
// the overview's place with its border, in the canvas's bottom-right corner
const overview = { x: 70, y: 16, width: 30, height: 15 };

describe('legendPlace', () => {
  it('goes in the corner the diagram names', () => {
    expect(legendPlace(size, 'bottom-right', view)).toEqual({ x: 80, y: 25, width: 20, height: 6 });
    expect(legendPlace(size, 'bottom-left', view)).toEqual({ x: 0, y: 25, width: 20, height: 6 });
    expect(legendPlace(size, 'top-right', view)).toEqual({ x: 80, y: 1, width: 20, height: 6 });
    expect(legendPlace(size, 'top-left', view)).toEqual({ x: 0, y: 1, width: 20, height: 6 });
  });

  it('sits over the overview where the two would share columns, and beside it where not', () => {
    expect(legendPlace(size, 'bottom-right', view, overview)).toEqual({ x: 80, y: 10, width: 20, height: 6 });
    expect(legendPlace(size, 'bottom-left', view, overview)).toEqual({ x: 0, y: 25, width: 20, height: 6 });
    expect(legendPlace(size, 'top-right', view, overview)).toEqual({ x: 80, y: 1, width: 20, height: 6 });
  });

  it('is cut to the rows over the overview, and to the canvas', () => {
    const tall = { width: 20, height: 20 };
    expect(legendPlace(tall, 'bottom-right', view, overview)).toEqual({ x: 80, y: 1, width: 20, height: 15 });
    expect(legendPlace(tall, 'top-right', view, overview)).toEqual({ x: 80, y: 1, width: 20, height: 15 });
    expect(legendPlace({ width: 120, height: 40 }, 'bottom-right', view)).toEqual({
      x: 0,
      y: 1,
      width: 100,
      height: 30,
    });
  });

  it('goes nowhere without room for its title and two of its lines', () => {
    expect(legendPlace(size, 'top-left', { top: 1, width: 11, height: 30 })).toBeUndefined();
    expect(legendPlace(size, 'bottom-right', view, { ...overview, y: 4, height: 27 })).toBeUndefined();
    expect(legendPlace(size, 'bottom-right', view, { ...overview, y: 5, height: 26 })).toMatchObject({ height: 4 });
  });
});

describe('onLegend', () => {
  it('holds the cells of the legend, its border included', () => {
    const place = { x: 80, y: 25, width: 20, height: 6 };
    expect([onLegend(place, { x: 80, y: 25 }), onLegend(place, { x: 99, y: 30 })]).toEqual([true, true]);
    expect([onLegend(place, { x: 79, y: 25 }), onLegend(place, { x: 80, y: 31 })]).toEqual([false, false]);
  });
});
