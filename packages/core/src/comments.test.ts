import { describe, expect, it } from 'vitest';
import { commentsOf, nextCommentId } from './comments';
import type { DiagramModel } from './types';

const m: DiagramModel = {
  version: 1, id: 'd', name: 'd', layers: [], planes: [], containment: [],
  nodes: [{ id: 'a', name: 'A', comments: [{ id: 'c1', text: 'hi' }] }, { id: 'b', name: 'B' }],
  relations: [{ id: 'r', from: 'a', to: 'b', kind: 'sync' }],
};

describe('commentsOf', () => {
  it('returns the list, [] for an element without one, undefined for no such element', () => {
    expect(commentsOf(m, { node: 'a' })).toEqual([{ id: 'c1', text: 'hi' }]);
    expect(commentsOf(m, { node: 'b' })).toEqual([]);
    expect(commentsOf(m, { relation: 'r' })).toEqual([]);
    expect(commentsOf(m, { node: 'zz' })).toBeUndefined();
    expect(commentsOf(m, { relation: 'zz' })).toBeUndefined();
  });
});

describe('nextCommentId', () => {
  it('hands out the first free c<n>', () => {
    expect(nextCommentId([])).toBe('c1');
    expect(nextCommentId([{ id: 'c1', text: 'x' }, { id: 'c3', text: 'y' }])).toBe('c2');
  });
});
