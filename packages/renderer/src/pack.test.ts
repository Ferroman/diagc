import { describe, expect, it } from 'vitest';
import { packBoxes, type PackedBox } from './pack';

const box = (width: number, height: number) => ({ width, height });
const overlaps = (a: PackedBox, b: PackedBox, gap: number) =>
  a.x < b.x + b.width + gap && b.x < a.x + a.width + gap && a.y < b.y + b.height + gap && b.y < a.y + a.height + gap;

describe('packBoxes', () => {
  it('returns nothing for nothing and the box itself for one', () => {
    expect(packBoxes([], { gap: 40 })).toEqual({ boxes: [], width: 0, height: 0 });
    expect(packBoxes([box(142, 34)], { gap: 40 })).toEqual({
      boxes: [{ x: 0, y: 0, width: 142, height: 34 }],
      width: 142,
      height: 34,
    });
  });

  it('keeps every pair of boxes at least `gap` apart, in input order of the result', () => {
    const input = [box(300, 200), box(142, 34), box(142, 50), box(160, 120), box(142, 34), box(500, 80)];
    const { boxes, width, height } = packBoxes(input, { gap: 40 });
    expect(boxes).toHaveLength(input.length);
    boxes.forEach((b, i) => {
      // result[i] is input[i], wherever it was placed
      expect({ width: b.width, height: b.height }).toEqual(input[i]);
      expect(b.x + b.width).toBeLessThanOrEqual(width);
      expect(b.y + b.height).toBeLessThanOrEqual(height);
      for (let j = i + 1; j < boxes.length; j++) expect(overlaps(b, boxes[j]!, 40 - 0.001)).toBe(false);
    });
  });

  it('turns a long run of equal boxes into a grid near the target aspect, not a column', () => {
    // the default target is a portrait page: a dozen boxes make two columns of six
    const { boxes, width, height } = packBoxes(Array.from({ length: 12 }, () => box(142, 34)), { gap: 40 });
    expect(new Set(boxes.map((b) => b.x)).size).toBe(2);
    expect(width / height).toBeGreaterThan(0.5);
    expect(width / height).toBeLessThan(1.2);
    // asked for a screen's shape instead, the same boxes spread wider than tall
    const wide = packBoxes(Array.from({ length: 12 }, () => box(142, 34)), { gap: 40, aspect: 1.6 });
    expect(wide.width / wide.height).toBeGreaterThan(1.2);
  });

  it('keeps a short run of equal boxes as one column rather than a ragged grid', () => {
    const { boxes } = packBoxes([box(142, 34), box(142, 34), box(142, 34)], { gap: 40 });
    expect(new Set(boxes.map((b) => b.x)).size).toBe(1);
    expect(boxes.map((b) => b.y)).toEqual([0, 74, 148]); // input order, top to bottom
  });

  it('fills an equal-box grid row by row in input order', () => {
    const { boxes } = packBoxes(Array.from({ length: 4 }, () => box(142, 34)), { gap: 40, aspect: 1.6 });
    expect(boxes.map((b) => [b.x, b.y])).toEqual([[0, 0], [182, 0], [0, 74], [182, 74]]);
  });

  it('lines look-alike boxes of different widths up as a true grid, centred in their columns', () => {
    // four captioned icons: same height, widths set by their captions
    const { boxes } = packBoxes([box(134, 84), box(88, 84), box(104, 84), box(124, 84)], { gap: 70 });
    const centre = (b: PackedBox) => b.x + b.width / 2;
    // 2x2, not a ragged 3+1 — and in input order, row by row
    expect(boxes.map((b) => b.y)).toEqual([0, 0, 154, 154]);
    expect(centre(boxes[0]!)).toBe(centre(boxes[2]!));
    expect(centre(boxes[1]!)).toBe(centre(boxes[3]!));
    // columns are as wide as their widest member, a gap apart
    expect(centre(boxes[1]!) - centre(boxes[0]!)).toBe(134 / 2 + 70 + 124 / 2);
  });

  it('keeps look-alike boxes in input order even when their heights differ slightly', () => {
    const { boxes } = packBoxes([box(142, 34), box(142, 40), box(142, 34)], { gap: 40 });
    expect(boxes.map((b) => b.y)).toEqual([0, 74, 154]);
  });

  it('puts the big component first and the loose boxes beside or under it, never above', () => {
    const { boxes } = packBoxes([box(142, 34), box(1500, 360), box(142, 34)], { gap: 48 });
    expect(boxes[1]).toMatchObject({ x: 0, y: 0 });
  });

  it('stacks short boxes in the column beside a tall one instead of opening a new row each', () => {
    // a tall-ish main box and four small ones: the target aspect wants them beside
    // it, and beside it they must share columns rather than string out in a line
    const { boxes, height } = packBoxes([box(400, 400), box(142, 34), box(142, 34), box(142, 34), box(142, 34)], {
      gap: 40,
      aspect: 1.6,
    });
    expect(height).toBe(400);
    expect(new Set(boxes.slice(1).map((b) => b.x)).size).toBeLessThan(4);
  });

  it('honours a custom target aspect', () => {
    const many = Array.from({ length: 12 }, () => box(142, 34));
    const wide = packBoxes(many, { gap: 40, aspect: 4 });
    const tall = packBoxes(many, { gap: 40, aspect: 0.5 });
    expect(wide.width / wide.height).toBeGreaterThan(tall.width / tall.height);
  });
});
