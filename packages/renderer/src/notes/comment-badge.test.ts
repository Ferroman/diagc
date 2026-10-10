import { describe, expect, it } from 'vitest';
import { commentBadgeProps } from './comment-badge';

describe('commentBadgeProps', () => {
  it('is nothing when there is nothing to show', () => {
    expect(commentBadgeProps({ comments: 0, links: 0 })).toBeUndefined();
  });
  it('counts comments, and says links too', () => {
    expect(commentBadgeProps({ comments: 1, links: 0 })).toEqual({ text: '1', title: '1 comment' });
    expect(commentBadgeProps({ comments: 3, links: 2 })).toEqual({ text: '3', title: '3 comments, 2 links' });
  });
  it('shows the link glyph when there are only links', () => {
    expect(commentBadgeProps({ comments: 0, links: 1 })).toEqual({ text: '↗', title: '1 link' });
  });
});
