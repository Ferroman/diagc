import { describe, expect, it } from 'vitest';
import type { DiagramModel } from '@diagc/core';
import { ACTIVITY_LAYOUT } from '@diagc/renderer';
import { activityDropPosition, homeActivityParent } from './activityDrop';

const model = (): DiagramModel => ({
  version: 1,
  id: 'd',
  name: 'd',
  nodes: [
    { id: 'f', name: 'F', type: 'activity-frame' },
    { id: 'l1', name: 'L1', type: 'activity-lane' },
    { id: 'l2', name: 'L2', type: 'activity-lane' },
    { id: 'r', name: 'R', type: 'activity-region' },
    { id: 'act', name: 'Act', type: 'activity-action' },
    { id: 'inR', name: 'In R', type: 'activity-action' },
    { id: 'empty', name: 'Empty', type: 'activity-frame' },
    { id: 'box', name: 'Box' },
    { id: 'stray', name: 'Stray', type: 'activity-action' },
  ],
  containment: [
    { parent: 'f', child: 'l1' },
    { parent: 'f', child: 'l2' },
    { parent: 'l1', child: 'act' },
    { parent: 'l2', child: 'r' },
    { parent: 'r', child: 'inR' },
  ],
  relations: [],
  layers: [],
  planes: [],
});

// frame at (100,100); lanes banded 120 tall from its top, past the title strip
const bounds: Record<string, { x: number; y: number; width: number; height: number }> = {
  l1: { x: 128, y: 100, width: 320, height: 120 },
  l2: { x: 128, y: 220, width: 320, height: 200 },
  r: { x: 200, y: 260, width: 150, height: 100 },
};
const boundsOf = (id: string) => bounds[id];

describe('homeActivityParent', () => {
  it('passes a missing or non-activity target straight through', () => {
    expect(homeActivityParent(model(), undefined, undefined)).toBeUndefined();
    expect(homeActivityParent(model(), undefined, 'box')).toBe('box');
  });

  it('sends a frame drop to the lane whose band holds the pointer', () => {
    const m = model();
    expect(homeActivityParent(m, undefined, 'f', { x: 110, y: 150 }, boundsOf)).toBe('l1');
    expect(homeActivityParent(m, undefined, 'f', { x: 110, y: 300 }, boundsOf)).toBe('l2');
  });

  it('clamps a frame drop outside every band to the nearest end lane', () => {
    const m = model();
    expect(homeActivityParent(m, undefined, 'f', { x: 110, y: 50 }, boundsOf)).toBe('l1');
    expect(homeActivityParent(m, undefined, 'f', { x: 110, y: 999 }, boundsOf)).toBe('l2');
  });

  it('sends a pointless frame placement (click-to-place) to the first lane', () => {
    expect(homeActivityParent(model(), undefined, 'f')).toBe('l1');
  });

  it('puts a node aimed at a lane-less frame at top level rather than inside it', () => {
    expect(homeActivityParent(model(), undefined, 'empty', { x: 0, y: 0 }, boundsOf)).toBeUndefined();
  });

  it('keeps lanes and regions as their own homes', () => {
    expect(homeActivityParent(model(), undefined, 'l2')).toBe('l2');
    expect(homeActivityParent(model(), undefined, 'r')).toBe('r');
  });

  it('climbs from a glyph to the lane or region holding it', () => {
    expect(homeActivityParent(model(), undefined, 'act')).toBe('l1');
    expect(homeActivityParent(model(), undefined, 'inR')).toBe('r');
  });

  it('leaves a glyph that sits in no lane as the target', () => {
    expect(homeActivityParent(model(), undefined, 'stray')).toBe('stray');
  });

  it('reads lanes from the active plane only', () => {
    const m: DiagramModel = {
      ...model(),
      planes: [
        { id: 'base', name: 'Base' },
        { id: 'p', name: 'P' },
      ],
      containment: [...model().containment, { parent: 'empty', child: 'l1', plane: 'p' }],
    };
    expect(homeActivityParent(m, 'p', 'empty')).toBe('l1');
    expect(homeActivityParent(m, 'p', 'f')).toBeUndefined();
  });
});

describe('activityDropPosition', () => {
  const size = { width: 24, height: 24 };

  it('centers the node on the drop point, relative to the lane', () => {
    expect(activityDropPosition(model(), 'l2', { x: 300, y: 300 }, size, boundsOf)).toEqual({ x: 160, y: 68 });
  });

  it('keeps a lane drop clear of the lane label strip and the top edge', () => {
    expect(activityDropPosition(model(), 'l1', { x: 130, y: 95 }, size, boundsOf)).toEqual({
      x: ACTIVITY_LAYOUT.LANE_STRIP_W,
      y: 0,
    });
  });

  it('positions inside a region too, with no label strip to avoid', () => {
    expect(activityDropPosition(model(), 'r', { x: 205, y: 300 }, size, boundsOf)).toEqual({ x: 0, y: 28 });
  });

  it('declines a non-activity parent, a missing parent, or one not on the canvas', () => {
    expect(activityDropPosition(model(), 'box', { x: 0, y: 0 }, size, boundsOf)).toBeUndefined();
    expect(activityDropPosition(model(), undefined, { x: 0, y: 0 }, size, boundsOf)).toBeUndefined();
    expect(activityDropPosition(model(), 'l1', { x: 0, y: 0 }, size, () => undefined)).toBeUndefined();
  });
});
