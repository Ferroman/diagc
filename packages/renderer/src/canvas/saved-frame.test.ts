import { describe, expect, it, vi } from 'vitest';
import { savedEdit, savedResize, toSaved } from './saved-frame';

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

describe('at 80 px a day: saved in 20 px-a-day units', () => {
  // a plan stretched four times: every saved x is a quarter of the drawn one,
  // so a box saved there keeps its day at any width
  const stretched = { ...frames, scaleRef: { current: 4 } };
  it('a position, after the drill frame', () => {
    expect(toSaved(stretched, 'row', { x: 500, y: 50 })).toEqual({ x: 100, y: 100 });
  });
  it("a resize: the position, and a bar's width (its dates), but not a box's", () => {
    const onResize = vi.fn();
    const edit = savedEdit({ onResize }, stretched, (id) => id === 'row')!;
    edit.onResize!('row', 320, 40, { x: 500, y: 50 });
    expect(onResize).toHaveBeenLastCalledWith('row', 80, 40, { x: 100, y: 100 });
    edit.onResize!('box', 320, 40, { x: 800, y: 50 });
    expect(onResize).toHaveBeenLastCalledWith('box', 320, 40, { x: 200, y: 50 });
  });
  it('a double-click create, a library or image drop, and a drop into a box', () => {
    const onCreateAt = vi.fn();
    const onDropLibraryEntry = vi.fn();
    const onImageFiles = vi.fn();
    const onDropInto = vi.fn();
    const edit = savedEdit({ onCreateAt, onDropLibraryEntry, onImageFiles, onDropInto }, stretched, () => false)!;
    edit.onCreateAt!({ x: 800, y: 5 });
    edit.onDropLibraryEntry!('e', { x: 800, y: 5 }, 't');
    edit.onImageFiles!([], { x: 800, y: 5 });
    edit.onDropInto!('a', 't', { x: 160, y: 60 });
    expect(onCreateAt).toHaveBeenCalledWith({ x: 200, y: 5 });
    expect(onDropLibraryEntry).toHaveBeenCalledWith('e', { x: 200, y: 5 }, 't');
    expect(onImageFiles).toHaveBeenCalledWith([], { x: 200, y: 5 });
    expect(onDropInto).toHaveBeenCalledWith('a', 't', { x: 40, y: 60 });
  });
});
