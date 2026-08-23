import { describe, expect, it } from 'vitest';
import { addStroke, deleteStroke, emptyDrawings, pruneDrawingsPlane, uniqueStrokeId } from './drawings';
import { CommandError } from './mutate';
import type { Drawings } from './types';

const k1 = { id: 'k1', points: [0, 0, 10, 10] };
const k2 = { id: 'k2', points: [5, 5] };

describe('drawings helpers', () => {
  it('emptyDrawings is a version-1 overlay with no buckets', () => {
    expect(emptyDrawings()).toEqual({ version: 1, planes: {} });
  });

  it('uniqueStrokeId counts up from k1 and skips taken ids in that bucket only', () => {
    expect(uniqueStrokeId(emptyDrawings(), 'default')).toBe('k1');
    const d: Drawings = { version: 1, planes: { default: [k1, k2], arch: [k1] } };
    expect(uniqueStrokeId(d, 'default')).toBe('k3');
    expect(uniqueStrokeId(d, 'arch')).toBe('k2');
  });

  it('addStroke appends to the bucket, creating it, and shares untouched buckets', () => {
    const before: Drawings = { version: 1, planes: { arch: [k1] } };
    const after = addStroke(before, 'default', k2);
    expect(after.planes['default']).toEqual([k2]);
    expect(after.planes['arch']).toBe(before.planes['arch']);
    expect(before.planes['default']).toBeUndefined();
  });

  it('addStroke rejects a duplicate id in the same bucket', () => {
    const d: Drawings = { version: 1, planes: { default: [k1] } };
    expect(() => addStroke(d, 'default', { ...k1 })).toThrow(CommandError);
  });

  it('deleteStroke removes the stroke and drops an emptied bucket', () => {
    const d: Drawings = { version: 1, planes: { default: [k1, k2] } };
    const one = deleteStroke(d, 'default', 'k1');
    expect(one.planes['default']).toEqual([k2]);
    const none = deleteStroke(one, 'default', 'k2');
    expect(none.planes['default']).toBeUndefined();
    expect(none.planes).toEqual({});
  });

  it('deleteStroke rejects an unknown id', () => {
    const d: Drawings = { version: 1, planes: { default: [k1] } };
    expect(() => deleteStroke(d, 'default', 'nope')).toThrow(CommandError);
    expect(() => deleteStroke(d, 'arch', 'k1')).toThrow(CommandError);
  });

  it('pruneDrawingsPlane drops the bucket and returns the same object when there is none', () => {
    const d: Drawings = { version: 1, planes: { default: [k1], arch: [k2] } };
    expect(pruneDrawingsPlane(d, 'arch').planes).toEqual({ default: [k1] });
    expect(pruneDrawingsPlane(d, 'ghost')).toBe(d);
  });
});
