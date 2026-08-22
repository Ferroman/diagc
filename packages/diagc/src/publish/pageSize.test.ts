import { describe, expect, it } from 'vitest';
import { pageSize } from './pageSize';

describe('pageSize', () => {
  it('pads the content and caps width, preserving aspect', () => {
    expect(pageSize({ width: 800, height: 400 }, { maxWidth: 1600, padding: 24 }))
      .toEqual({ width: 848, height: 448 }); // 800+48, 400+48, under cap
  });
  it('scales down when content exceeds maxWidth', () => {
    const s = pageSize({ width: 3200, height: 1600 }, { maxWidth: 1600, padding: 0 });
    expect(s.width).toBe(1600);
    expect(s.height).toBe(800); // aspect preserved
  });
  it('never returns zero dimensions', () => {
    expect(pageSize({ width: 0, height: 0 }, { maxWidth: 1600, padding: 0 }))
      .toEqual({ width: 1, height: 1 });
  });
  it('caps height when maxHeight is given, preserving aspect', () => {
    const s = pageSize({ width: 1000, height: 4000 }, { maxWidth: 2000, maxHeight: 1400, padding: 0 });
    expect(s.height).toBe(1400);
    expect(s.width).toBe(350); // 1000 * (1400/4000)
  });

  // `reserve` is the legend's height in SCREEN px. It must not be folded into
  // the content bounds: the content gets scaled to fit the frame and the legend
  // does not, so a reserve added to `bounds.height` shrinks by the same factor
  // as the graph and the frame ends up too short by (reserve - reserve*scale).
  // Measured on the EngageRocket platform-infra page: a 459px legend on a
  // 24922x10717 graph left the graph half its intended size and half the frame
  // width empty.
  describe('legend reserve', () => {
    it('adds the reserve to the frame at full size, unscaled', () => {
      // content 4000x1000 scales by 0.5 to reach maxWidth; the graph then needs
      // 500px and the legend its full 400, so the frame is 900 tall — not
      // (1000+400)*0.5 = 700, which is what folding it into bounds would give.
      const s = pageSize({ width: 4000, height: 1000 }, { maxWidth: 2000, maxHeight: 1400, padding: 0, reserve: 400 });
      expect(s).toEqual({ width: 2000, height: 900 });
      expect(s.height - 400).toBe(500); // the graph's own share, at scale 0.5
    });
    it('lets the reserve constrain the scale when height is the binding limit', () => {
      // Width alone would allow scale 1 (1000 < 2000); the legend takes 400 of
      // the 1000 available height, so the graph is drawn at 0.6.
      const s = pageSize({ width: 1000, height: 1000 }, { maxWidth: 2000, maxHeight: 1000, padding: 0, reserve: 400 });
      expect(s).toEqual({ width: 600, height: 1000 });
    });
    it('never lets the reserve claim more than half the frame', () => {
      // Mirrors legendPadding's cap in the viewer: a legend taller than the
      // frame would otherwise leave the graph nothing at all.
      const s = pageSize({ width: 1000, height: 1000 }, { maxWidth: 2000, maxHeight: 1400, padding: 0, reserve: 5000 });
      expect(s.height).toBeLessThanOrEqual(1400);
      expect(s.height - 700).toBeGreaterThan(0); // the graph kept its half
    });
    it('is a no-op when absent, so an unlegended diagram is framed as before', () => {
      expect(pageSize({ width: 800, height: 400 }, { maxWidth: 1600, padding: 24 }))
        .toEqual(pageSize({ width: 800, height: 400 }, { maxWidth: 1600, padding: 24, reserve: 0 }));
    });
  });
});
