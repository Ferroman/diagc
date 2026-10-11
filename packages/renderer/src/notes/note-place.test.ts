import { describe, expect, it } from 'vitest';
import {
  badgeCenter,
  estimateNoteHeight,
  lineObstacles,
  NOTE_GAP,
  obstaclesOf,
  placeNote,
  type Rect,
} from './note-place';

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
    const at = placeNote(
      { badge, element: box, size: { width: W, height: 80 } },
      obstaclesOf([{ rect: box, kind: 'box' }]),
    );
    expect(at.y + 80).toBe(box.y - NOTE_GAP);
    // the note's right edge reaches just past the badge, so the tail is short
    expect(at.x + W).toBeGreaterThan(badge.x);
    expect(at.x + W).toBeLessThan(badge.x + 40);
  });

  it('takes the next candidate when the first would cover a neighbour', () => {
    // a wide bar right above the element: everything "above" is taken
    const bar: Rect = { x: 0, y: 200, width: 1000, height: 90 };
    const obstacles = obstaclesOf([
      { rect: box, kind: 'box' },
      { rect: bar, kind: 'box' },
    ]);
    const at = placeNote({ badge, element: box, size: { width: W, height: 80 } }, obstacles);
    expect(overlap(at, W, 80, bar)).toBe(0);
    expect(overlap(at, W, 80, box)).toBe(0);
  });

  it('slides a spot outward, in steps, until it clears — before covering anything', () => {
    // above, below and right are walled off; to the left a post stands where
    // the note's near end would first land, and one slide further out clears it
    const obstacles = obstaclesOf([
      { rect: box, kind: 'box' },
      { rect: { x: -1000, y: -1000, width: 3000, height: 1270 }, kind: 'box' }, // above, down to y=270
      { rect: { x: -1000, y: 370, width: 3000, height: 1000 }, kind: 'box' }, // below
      { rect: { x: 480, y: 270, width: 1000, height: 100 }, kind: 'box' }, // right
      { rect: { x: 270, y: 270, width: 20, height: 100 }, kind: 'box' }, // the post, in the first spot's last 16px
    ]);
    const at = placeNote({ badge, element: box, size: { width: W, height: 80 } }, obstacles);
    expect(at.x).toBe(box.x - NOTE_GAP - W - 20);
    expect(at.y).toBe(badge.y - 24);
  });

  it('when nothing near is free, covers as little as it can rather than going far', () => {
    // hemmed in on every side, deeper than a slide can reach — the
    // least-covering candidate wins, and the note still sits next to its
    // element
    const obstacles = obstaclesOf([
      { rect: box, kind: 'box' },
      { rect: { x: -1000, y: -1000, width: 3000, height: 1200 }, kind: 'box' }, // above, down to y=200
      { rect: { x: -1000, y: 370, width: 3000, height: 1000 }, kind: 'box' }, // below
      { rect: { x: -1000, y: 0, width: 1290, height: 1000 }, kind: 'box' }, // left, ends 10px short of the element
      { rect: { x: 480, y: 0, width: 2000, height: 1000 }, kind: 'box' }, // right, wide clearance
    ]);
    const at = placeNote({ badge, element: box, size: { width: W, height: 80 } }, obstacles);
    // above-right of the badge clips both side walls by a sliver, the least of
    // any spot — and it is right next to the badge, not off in the clear
    expect(at).toEqual({ x: badge.x - 24, y: box.y - NOTE_GAP - 80 });
  });

  it('a container blocks only its header band and border — a note inside it is free', () => {
    const group: Rect = { x: 100, y: 100, width: 600, height: 500 };
    const inner: Rect = { x: 400, y: 300, width: 120, height: 60 };
    const obstacles = obstaclesOf([
      { rect: group, kind: 'group' },
      { rect: inner, kind: 'box' },
    ]);
    const at = placeNote(
      { badge: badgeCenter(inner, 'box'), element: inner, size: { width: W, height: 80 } },
      obstacles,
    );
    // above-left of the badge, well inside the group
    expect(at.x).toBeGreaterThan(group.x);
    expect(at.y).toBeGreaterThan(group.y + 28);
    expect(at.y + 80).toBe(inner.y - NOTE_GAP);
  });

  it('a flow badge has no box: the note hangs off the badge itself', () => {
    const badge = { x: 500, y: 500 };
    const at = placeNote({ badge, element: null, size: { width: W, height: 60 } }, []);
    // above the badge's pill, right edge just past it
    expect(at.y + 60).toBe(badge.y - 9 - NOTE_GAP);
    expect(at.x + W).toBeGreaterThan(badge.x);
  });

  it('a flow’s note prefers the side its badge is on — away from the line, where the labels are', () => {
    const badge = { x: 500, y: 500 };
    const span = Array.from({ length: 25 }, (_, k) => k * (1000 / 24));
    // a vertical flow at x=490, badge offset to the right of it
    const vertical = lineObstacles(span.map((y) => ({ x: 490, y })));
    const right = placeNote({ badge, element: null, size: { width: W, height: 60 }, away: { x: 1, y: 0 } }, vertical);
    expect(right.x).toBe(badge.x + 9 + NOTE_GAP);
    // a horizontal flow at y=490, badge below it
    const horizontal = lineObstacles(span.map((x) => ({ x, y: 490 })));
    const below = placeNote({ badge, element: null, size: { width: W, height: 60 }, away: { x: 0, y: 1 } }, horizontal);
    expect(below.y).toBe(badge.y + 9 + NOTE_GAP);
  });

  it('a flow’s line, sampled into dots, is an obstacle like any box — the note lands beside it, not across it', () => {
    // a vertical flow at x=490 from y=0 to 1000, badge pushed right of it; a
    // wall fills the right side from just past where a note above the badge
    // would end (badge.x + 24), so "above" is clear of the wall — and across
    // the line. With the line in the way the note goes wholly left of it.
    const badge = { x: 500, y: 500 };
    const line = Array.from({ length: 25 }, (_, k) => ({ x: 490, y: k * (1000 / 24) }));
    const wall: Rect = { x: 530, y: 0, width: 2000, height: 2000 };
    const at = placeNote({ badge, element: null, size: { width: W, height: 60 }, away: { x: 1, y: 0 } }, [
      wall,
      ...lineObstacles(line),
    ]);
    expect(at.x + W).toBeLessThanOrEqual(490 - 4);
  });

  it('other open notes are obstacles too: two elements stacked do not share a spot', () => {
    const other: Rect = { x: 300, y: 300 - NOTE_GAP - 80, width: W, height: 80 };
    const obstacles = [...obstaclesOf([{ rect: box, kind: 'box' }]), other];
    const at = placeNote({ badge, element: box, size: { width: W, height: 80 } }, obstacles);
    expect(overlap(at, W, 80, other)).toBe(0);
  });
});

describe('estimateNoteHeight', () => {
  it('grows with rows and with titles that wrap, and is taller in edit mode (the + row)', () => {
    const one = estimateNoteHeight({ name: 'Web app', threats: [{ title: 'Short' }] }, false);
    const two = estimateNoteHeight({ name: 'Web app', threats: [{ title: 'Short' }, { title: 'Short' }] }, false);
    const wrapped = estimateNoteHeight(
      { name: 'Web app', threats: [{ title: 'A title long enough to need a second line' }] },
      false,
    );
    expect(two).toBeGreaterThan(one);
    expect(wrapped).toBeGreaterThan(one);
    expect(estimateNoteHeight({ name: 'Web app', threats: [{ title: 'Short' }] }, true)).toBeGreaterThan(one);
  });

  it('a long status word and a details button narrow the title column, so the same title wraps more', () => {
    // "Card details logged by the CDN": two lines beside `open`, three beside
    // `mitigated` with the ▸ that details bring — what the note really drew
    const title = 'Card details logged by the CDN';
    const open = estimateNoteHeight({ name: 'Web app', threats: [{ title }] }, false);
    const handled = estimateNoteHeight(
      { name: 'Web app', threats: [{ title, status: 'mitigated', description: 'x' }] },
      false,
    );
    expect(handled - open).toBe(16);
  });
});

describe('estimateNoteHeight with comments and links', () => {
  it('grows by a section title plus one line per short comment / link, and a meta line per attributed comment', () => {
    const bare = estimateNoteHeight({ name: 'A', threats: [] }, false);
    const one = estimateNoteHeight({ name: 'A', threats: [], comments: [{ text: 'short' }], links: [] }, false);
    const attributed = estimateNoteHeight(
      { name: 'A', threats: [], comments: [{ text: 'short', by: 'Ann' }], links: [] },
      false,
    );
    const linked = estimateNoteHeight({ name: 'A', threats: [], comments: [], links: [{ label: 'L' }] }, false);
    expect(one).toBeGreaterThan(bare);
    expect(attributed).toBeGreaterThan(one);
    expect(linked).toBeGreaterThan(bare);
    expect(estimateNoteHeight({ name: 'A', threats: [], comments: [], links: [] }, false)).toBe(bare);
  });
});

describe('estimateNoteHeight, line by line', () => {
  // A one-line name is the 16px padding, a 16px line and the 6px gap under it:
  // 38px before anything else.
  it("wraps a comment across the note's inner width, under a section title", () => {
    // 30 glyphs at 6.2px = 186px: one line in the 200px between the side paddings
    expect(estimateNoteHeight({ name: 'A', threats: [], comments: [{ text: 'x'.repeat(30) }], links: [] }, false)).toBe(
      38 + 26 + 16 + 5,
    );
  });

  it('gives each link a line and its row padding, under a section title', () => {
    expect(
      estimateNoteHeight({ name: 'A', threats: [], comments: [], links: [{ label: 'L' }, { label: 'M' }] }, false),
    ).toBe(38 + 26 + 2 * (16 + 5));
  });

  it("narrows a row's title column for the details button in edit mode, and for mitigation text alone", () => {
    // 20 glyphs at 6.2px = 124px: one line beside `open` (138.6px), two once the
    // button takes its 22px (116.6px)
    const title = 't'.repeat(20);
    expect(estimateNoteHeight({ name: 'A', threats: [{ title }] }, true)).toBe(38 + 2 * 16 + 5 + 24);
    expect(estimateNoteHeight({ name: 'A', threats: [{ title, mitigation: 'm' }] }, false)).toBe(38 + 2 * 16 + 5);
    expect(estimateNoteHeight({ name: 'A', threats: [{ title }] }, false)).toBe(38 + 16 + 5);
  });
});

describe('placeNote, the edge cases', () => {
  it('keeps to near spots: a covered one beside the badge beats a free one far across a big element', () => {
    const big: Rect = { x: 0, y: 0, width: 600, height: 400 };
    const at = badgeCenter(big, 'box');
    // everything above and left of the element is taken; the spot right of it,
    // 600px from the badge, is free
    const taken: Rect = { x: -1000, y: -1000, width: 1000, height: 1000 };
    // above-right of the badge covers the least of it: a 21px strip
    expect(placeNote({ badge: at, element: big, size: { width: W, height: 80 } }, [taken])).toEqual({
      x: at.x - 24,
      y: -NOTE_GAP - 80,
    });
  });

  it('takes the first spot when every near spot is covered alike', () => {
    const everything: Rect = { x: -2000, y: -2000, width: 4000, height: 4000 };
    expect(placeNote({ badge, element: box, size: { width: W, height: 80 } }, [everything])).toEqual({
      x: badge.x + 24 - W,
      y: box.y - NOTE_GAP - 80,
    });
  });

  it('falls back to the first spot when no spot is near the badge at all', () => {
    const huge: Rect = { x: 0, y: 0, width: 2000, height: 2000 };
    const middle = { x: 1000, y: 1000 };
    expect(placeNote({ badge: middle, element: huge, size: { width: W, height: 80 } }, [])).toEqual({
      x: 1000 + 24 - W,
      y: -NOTE_GAP - 80,
    });
  });

  it("counts a spot centred on the badge's line as the far side", () => {
    // a 48px note: the two spots above the badge are centred on it, along `away`
    // neither ahead nor behind, so the free spot right of the pill comes first
    const at = { x: 100, y: 100 };
    expect(placeNote({ badge: at, element: null, size: { width: 48, height: 30 }, away: { x: 1, y: 0 } }, [])).toEqual({
      x: 123,
      y: 76,
    });
  });
});

/** overlapping area of a note at `at` with a rect */
function overlap(at: { x: number; y: number }, w: number, h: number, r: Rect): number {
  const x = Math.max(0, Math.min(at.x + w, r.x + r.width) - Math.max(at.x, r.x));
  const y = Math.max(0, Math.min(at.y + h, r.y + r.height) - Math.max(at.y, r.y));
  return x * y;
}
