import { describe, expect, it } from 'vitest';
import { badgeCenter, estimateNoteHeight, lineObstacles, NOTE_GAP, obstaclesOf, placeNote, type Rect } from './note-place';

const W = 220;
// the element: a 120×60 box at (300, 300), badge at its top-left corner
const box: Rect = { x: 300, y: 300, width: 120, height: 60 };
const badge = badgeCenter(box, 'box');

describe('badgeCenter', () => {
  it('mirrors the stylesheet: a box wears it over the top-left corner, an ellipse tucked in, a group in the header band at the right', () => {
    expect(badgeCenter(box, 'box')).toEqual({ x: 303, y: 303 });
    expect(badgeCenter(box, 'ellipse')).toEqual({ x: 325, y: 317 });
    expect(badgeCenter({ x: 0, y: 0, width: 400, height: 200 }, 'group')).toEqual({ x: 343, y: 13 });
  });
});

describe('placeNote', () => {
  it('opens above and to the left of the badge when that is free, clear of the element by NOTE_GAP', () => {
    const at = placeNote(badge, box, { width: W, height: 80 }, obstaclesOf([{ rect: box, kind: 'box' }]));
    expect(at.y + 80).toBe(box.y - NOTE_GAP);
    // the bubble's right edge reaches just past the badge, so the tail is short
    expect(at.x + W).toBeGreaterThan(badge.x);
    expect(at.x + W).toBeLessThan(badge.x + 40);
  });

  it('takes the next candidate when the first would cover a neighbour', () => {
    // a wide bar right above the element: everything "above" is taken
    const bar: Rect = { x: 0, y: 200, width: 1000, height: 90 };
    const obstacles = obstaclesOf([{ rect: box, kind: 'box' }, { rect: bar, kind: 'box' }]);
    const at = placeNote(badge, box, { width: W, height: 80 }, obstacles);
    expect(overlap(at, W, 80, bar)).toBe(0);
    expect(overlap(at, W, 80, box)).toBe(0);
  });

  it('slides a spot outward, in steps, until it clears — before covering anything', () => {
    // above, below and right are walled off; to the left a post stands where
    // the bubble's near end would first land, and one slide further out clears it
    const obstacles = obstaclesOf([
      { rect: box, kind: 'box' },
      { rect: { x: -1000, y: -1000, width: 3000, height: 1270 }, kind: 'box' }, // above, down to y=270
      { rect: { x: -1000, y: 370, width: 3000, height: 1000 }, kind: 'box' }, // below
      { rect: { x: 480, y: 270, width: 1000, height: 100 }, kind: 'box' }, // right
      { rect: { x: 270, y: 270, width: 20, height: 100 }, kind: 'box' }, // the post, in the first spot's last 16px
    ]);
    const at = placeNote(badge, box, { width: W, height: 80 }, obstacles);
    expect(at.x).toBe(box.x - NOTE_GAP - W - 20);
    expect(at.y).toBe(badge.y - 24);
  });

  it('when nothing near is free, covers as little as it can rather than going far', () => {
    // hemmed in on every side, deeper than a slide can reach — the
    // least-covering candidate wins, and the bubble still sits next to its
    // element
    const obstacles = obstaclesOf([
      { rect: box, kind: 'box' },
      { rect: { x: -1000, y: -1000, width: 3000, height: 1200 }, kind: 'box' }, // above, down to y=200
      { rect: { x: -1000, y: 370, width: 3000, height: 1000 }, kind: 'box' }, // below
      { rect: { x: -1000, y: 0, width: 1290, height: 1000 }, kind: 'box' }, // left, ends 10px short of the element
      { rect: { x: 480, y: 0, width: 2000, height: 1000 }, kind: 'box' }, // right, wide clearance
    ]);
    const at = placeNote(badge, box, { width: W, height: 80 }, obstacles);
    // above-right of the badge clips both side walls by a sliver, the least of
    // any spot — and it is right next to the badge, not off in the clear
    expect(at).toEqual({ x: badge.x - 24, y: box.y - NOTE_GAP - 80 });
  });

  it('a container blocks only its header band and border — a bubble inside it is free', () => {
    const group: Rect = { x: 100, y: 100, width: 600, height: 500 };
    const inner: Rect = { x: 400, y: 300, width: 120, height: 60 };
    const obstacles = obstaclesOf([{ rect: group, kind: 'group' }, { rect: inner, kind: 'box' }]);
    const at = placeNote(badgeCenter(inner, 'box'), inner, { width: W, height: 80 }, obstacles);
    // above-left of the badge, well inside the group
    expect(at.x).toBeGreaterThan(group.x);
    expect(at.y).toBeGreaterThan(group.y + 28);
    expect(at.y + 80).toBe(inner.y - NOTE_GAP);
  });

  it('a flow chip has no box: the bubble hangs off the chip itself', () => {
    const chip = { x: 500, y: 500 };
    const at = placeNote(chip, null, { width: W, height: 60 }, []);
    // above the chip's pill, right edge just past it
    expect(at.y + 60).toBe(chip.y - 9 - NOTE_GAP);
    expect(at.x + W).toBeGreaterThan(chip.x);
  });

  it('a flow’s bubble prefers the side its chip is on — away from the line, where the labels are', () => {
    const chip = { x: 500, y: 500 };
    const span = Array.from({ length: 25 }, (_, k) => k * (1000 / 24));
    // a vertical flow at x=490, chip offset to the right of it
    const vertical = lineObstacles(span.map((y) => ({ x: 490, y })));
    const right = placeNote(chip, null, { width: W, height: 60 }, vertical, { x: 1, y: 0 });
    expect(right.x).toBe(chip.x + 9 + NOTE_GAP);
    // a horizontal flow at y=490, chip below it
    const horizontal = lineObstacles(span.map((x) => ({ x, y: 490 })));
    const below = placeNote(chip, null, { width: W, height: 60 }, horizontal, { x: 0, y: 1 });
    expect(below.y).toBe(chip.y + 9 + NOTE_GAP);
  });

  it('a flow’s line, sampled into dots, is an obstacle like any box — the bubble lands beside it, not across it', () => {
    // a vertical flow at x=490 from y=0 to 1000, chip pushed right of it; a
    // wall fills the right side from just past where a bubble above the chip
    // would end (chip.x + 24), so "above" is clear of the wall — and across
    // the line. With the line in the way the bubble goes wholly left of it.
    const chip = { x: 500, y: 500 };
    const line = Array.from({ length: 25 }, (_, k) => ({ x: 490, y: k * (1000 / 24) }));
    const wall: Rect = { x: 530, y: 0, width: 2000, height: 2000 };
    const at = placeNote(chip, null, { width: W, height: 60 }, [wall, ...lineObstacles(line)], { x: 1, y: 0 });
    expect(at.x + W).toBeLessThanOrEqual(490 - 4);
  });

  it('other open bubbles are obstacles too: two elements stacked do not share a spot', () => {
    const other: Rect = { x: 300, y: 300 - NOTE_GAP - 80, width: W, height: 80 };
    const obstacles = [...obstaclesOf([{ rect: box, kind: 'box' }]), other];
    const at = placeNote(badge, box, { width: W, height: 80 }, obstacles);
    expect(overlap(at, W, 80, other)).toBe(0);
  });
});

describe('estimateNoteHeight', () => {
  it('grows with rows and with titles that wrap, and is taller in edit mode (the + row)', () => {
    const one = estimateNoteHeight('Web app', [{ title: 'Short' }], false);
    const two = estimateNoteHeight('Web app', [{ title: 'Short' }, { title: 'Short' }], false);
    const wrapped = estimateNoteHeight('Web app', [{ title: 'A title long enough to need a second line' }], false);
    expect(two).toBeGreaterThan(one);
    expect(wrapped).toBeGreaterThan(one);
    expect(estimateNoteHeight('Web app', [{ title: 'Short' }], true)).toBeGreaterThan(one);
  });

  it('a long status word and a details button narrow the title column, so the same title wraps more', () => {
    // "Card details logged by the CDN": two lines beside `open`, three beside
    // `mitigated` with the ▸ that details bring — what the bubble really drew
    const title = 'Card details logged by the CDN';
    const open = estimateNoteHeight('Web app', [{ title }], false);
    const handled = estimateNoteHeight('Web app', [{ title, status: 'mitigated', description: 'x' }], false);
    expect(handled - open).toBe(16);
  });
});

/** overlapping area of a bubble at `at` with a rect */
function overlap(at: { x: number; y: number }, w: number, h: number, r: Rect): number {
  const x = Math.max(0, Math.min(at.x + w, r.x + r.width) - Math.max(at.x, r.x));
  const y = Math.max(0, Math.min(at.y + h, r.y + r.height) - Math.max(at.y, r.y));
  return x * y;
}
