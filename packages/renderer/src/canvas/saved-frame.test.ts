import { describe, expect, it, vi } from 'vitest';
import { savedResize, toSaved } from './saved-frame';

const frames = {
  savedFrameRef: { current: new Map([['row', { x: 100, y: -40 }]]) },
  viewShiftRef: { current: new Map([['row', -10]]) },
};

describe('toSaved', () => {
  it('takes the drill frame and the fold shift back off an on-screen position', () => {
    expect(toSaved(frames, 'row', { x: 150, y: 50 })).toEqual({ x: 50, y: 100 });
  });
  it('leaves a node with neither as it is', () => {
    expect(toSaved(frames, 'other', { x: 1, y: 2 })).toEqual({ x: 1, y: 2 });
  });
});

describe('savedResize', () => {
  it("reports a resize at the node's saved position", () => {
    const onResize = vi.fn();
    savedResize({ onResize }, frames)!.onResize!('row', 80, 40, { x: 150, y: 50 });
    expect(onResize).toHaveBeenCalledWith('row', 80, 40, { x: 50, y: 100 });
  });
  it('hands back the same edit when there is no resize to convert', () => {
    const edit = { onNodesMoved: vi.fn() };
    expect(savedResize(edit, frames)).toBe(edit);
    expect(savedResize(undefined, frames)).toBeUndefined();
  });
});
