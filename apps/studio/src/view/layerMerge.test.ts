import { describe, expect, it } from 'vitest';
import { remapVisibleLayers } from './layerMerge';

describe('remapVisibleLayers', () => {
  it('replaces a visible source with the target', () => {
    expect(remapVisibleLayers(['ops'], ['ops'], 'flow')).toEqual(['flow']);
  });

  it('dedupes when both a source and the target were visible', () => {
    expect(remapVisibleLayers(['flow', 'ops'], ['ops'], 'flow')).toEqual(['flow']);
  });

  it('returns the same array reference when no source is visible', () => {
    const v = ['x', 'y'];
    expect(remapVisibleLayers(v, ['ops'], 'flow')).toBe(v);
  });

  it('drops the sources when merging to the base sheet (no target)', () => {
    expect(remapVisibleLayers(['ops', 'x'], ['ops'], undefined)).toEqual(['x']);
  });
});
