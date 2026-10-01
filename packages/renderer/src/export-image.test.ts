// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { exportFrame, keepInExport, MAX_EXPORT_SIDE } from './export-image';

describe('exportFrame', () => {
  it('cuts the frame to the content plus padding and moves the content into it at 1:1', () => {
    expect(exportFrame({ x: -100, y: 50, width: 400, height: 200 }, { padding: 20 })).toEqual({
      width: 440,
      height: 240,
      viewport: { x: 120, y: -30, zoom: 1 },
      pixelRatio: 2,
    });
  });

  it('lowers the pixel ratio for a diagram too big to draw at full resolution', () => {
    const f = exportFrame({ x: 0, y: 0, width: 20_000, height: 1_000 }, { padding: 0 });
    expect(f.pixelRatio).toBeCloseTo(MAX_EXPORT_SIDE / 20_000);
    expect(f.width * f.pixelRatio).toBeLessThanOrEqual(MAX_EXPORT_SIDE);
  });
});

describe('keepInExport', () => {
  it('drops the canvas furniture and keeps the diagram', () => {
    const el = (cls: string) => {
      const d = document.createElement('div');
      d.className = cls;
      return d;
    };
    expect(keepInExport(el('react-flow__panel react-flow__controls'))).toBe(false);
    expect(keepInExport(el('react-flow__handle'))).toBe(false);
    expect(keepInExport(el('react-flow__background'))).toBe(false);
    expect(keepInExport(el('dg-no-export'))).toBe(false);
    expect(keepInExport(el('react-flow__node'))).toBe(true);
    expect(keepInExport(document.createTextNode('label'))).toBe(true);
  });
});
