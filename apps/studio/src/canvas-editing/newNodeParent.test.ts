import { describe, expect, it } from 'vitest';
import { defaultParentId } from './newNodeParent';

describe('defaultParentId', () => {
  it('prefers a selected node over the drill root', () => {
    expect(defaultParentId({ kind: 'node', id: 'sel' }, 'X')).toBe('sel');
  });
  it('falls back to the drill root when nothing is selected', () => {
    expect(defaultParentId(null, 'X')).toBe('X');
  });
  it('falls back to the drill root when an edge is selected', () => {
    expect(defaultParentId({ kind: 'edge', id: 'e1' }, 'X')).toBe('X');
  });
  it('returns undefined at the top level with no selection', () => {
    expect(defaultParentId(null, undefined)).toBeUndefined();
  });
});
