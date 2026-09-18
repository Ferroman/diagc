import { describe, expect, it } from 'vitest';
import type { NodeChange } from '@xyflow/react';
import { withoutMeasuredExpansion } from './expand-parent';

const measured: NodeChange = { id: 'kid', type: 'dimensions', dimensions: { width: 156, height: 50 } };
const pinned: NodeChange = { id: 'box', type: 'dimensions', setAttributes: true, dimensions: { width: 179, height: 176 } };
const parentMoved: NodeChange = { id: 'box', type: 'position', position: { x: -4, y: 12 } };
const siblingMoved: NodeChange = { id: 'other', type: 'position', position: { x: 20, y: 36 } };

describe('withoutMeasuredExpansion', () => {
  it('drops a measurement-time expansion whole: the pinned size and the moves that came with it', () => {
    const batch = [measured, parentMoved, siblingMoved, pinned];
    expect(withoutMeasuredExpansion(batch, false)).toEqual([measured]);
  });

  it('lets the same expansion through while a drag is in flight — that is the one we want', () => {
    const batch = [{ id: 'kid', type: 'position', position: { x: 0, y: 36 }, dragging: true } as NodeChange, parentMoved, pinned];
    expect(withoutMeasuredExpansion(batch, true)).toBe(batch);
  });

  it('passes every other batch through as the very same array', () => {
    const plain = [measured, siblingMoved];
    expect(withoutMeasuredExpansion(plain, false)).toBe(plain);
    // a resize also sets attributes, but says so
    const resize: NodeChange[] = [
      { id: 'img', type: 'dimensions', setAttributes: true, resizing: true, dimensions: { width: 90, height: 90 } },
      { id: 'img', type: 'position', position: { x: 5, y: 5 } },
    ];
    expect(withoutMeasuredExpansion(resize, false)).toBe(resize);
  });
});
