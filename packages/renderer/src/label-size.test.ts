import { describe, expect, it } from 'vitest';
import { EDGE_LABEL_MAX_CHARS, estimateLabelSize, MAX_LABEL_WIDTH, MIN_LABEL_WIDTH, truncateEdgeLabel } from './label-size';

describe('estimateLabelSize', () => {
  it('short text gets the minimum width', () => {
    expect(estimateLabelSize('Hi').width).toBe(MIN_LABEL_WIDTH);
  });
  it('a second hard line makes it taller', () => {
    const one = estimateLabelSize('a');
    const two = estimateLabelSize('a\nb');
    expect(two.height).toBeGreaterThan(one.height);
  });
  it('a very long line clamps to the max width and wraps taller', () => {
    const s = estimateLabelSize('x'.repeat(200));
    expect(s.width).toBe(MAX_LABEL_WIDTH);
    expect(s.height).toBeGreaterThan(estimateLabelSize('x').height);
  });
  it('larger font scale yields a taller box', () => {
    expect(estimateLabelSize('a\nb\nc', 'lg').height).toBeGreaterThan(estimateLabelSize('a\nb\nc', 'sm').height);
  });
});

/**
 * The chip on an EDGE is drawn by React Flow as SVG <text>, where CSS
 * `text-overflow` does nothing — so a long one has to be shortened in the string.
 * (The positioned HTML labels of a sole-relation edge get the CSS ellipsis
 * instead; see `.dg-edge-label` in styles.css.)
 */
describe('truncateEdgeLabel', () => {
  it('leaves a label that fits completely alone', () => {
    expect(truncateEdgeLabel('reads / writes')).toBe('reads / writes');
    const exact = 'x'.repeat(EDGE_LABEL_MAX_CHARS);
    expect(truncateEdgeLabel(exact)).toBe(exact); // the bound is inclusive
  });
  it('ellipsises a longer one, and the result never exceeds the budget', () => {
    const out = truncateEdgeLabel('publishes employee.tenure.recalculated to the mesh');
    expect(out.endsWith('…')).toBe(true);
    expect([...out]).toHaveLength(EDGE_LABEL_MAX_CHARS);
  });
  it('does not leave a dangling separator or space before the ellipsis', () => {
    // Cutting mid-'/' reads as a broken label rather than a shortened one.
    expect(truncateEdgeLabel('aaaaaaaaaaaaaaaaaaaaaaa / bbbbbbbbbbbb')).toBe('aaaaaaaaaaaaaaaaaaaaaaa…');
  });
  it('counts characters, not UTF-16 units, so an emoji label is not cut in half', () => {
    const out = truncateEdgeLabel('🚀'.repeat(40));
    expect([...out]).toHaveLength(EDGE_LABEL_MAX_CHARS);
    expect(out.endsWith('…')).toBe(true);
  });
});
