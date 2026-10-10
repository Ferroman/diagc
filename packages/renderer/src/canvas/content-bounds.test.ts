// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { overhangBounds, unionBounds } from './content-bounds';

describe('unionBounds', () => {
  it('is undefined for nothing and skips the undefined members', () => {
    expect(unionBounds([])).toBeUndefined();
    expect(unionBounds([undefined, { x: 1, y: 2, width: 3, height: 4 }])).toEqual({ x: 1, y: 2, width: 3, height: 4 });
  });
  it('covers every member', () => {
    expect(
      unionBounds([
        { x: 0, y: 0, width: 100, height: 50 },
        { x: -20, y: 30, width: 40, height: 100 },
      ]),
    ).toEqual({ x: -20, y: 0, width: 120, height: 130 });
  });
});

describe('overhangBounds', () => {
  const rectOf = (x: number, y: number, w: number, h: number) =>
    ({ left: x, top: y, right: x + w, bottom: y + h, width: w, height: h, x, y, toJSON: () => ({}) }) as DOMRect;
  // screen → flow for a viewport panned to (100, 50) at zoom 2
  const toFlow = (p: { x: number; y: number }) => ({ x: (p.x - 100) / 2, y: (p.y - 50) / 2 });

  it('measures what is drawn outside the node boxes, in flow coordinates', () => {
    const root = document.createElement('div');
    root.innerHTML =
      '<svg><g class="react-flow__edge" id="bow"></g></svg><div class="dg-loop-badge" id="badge"></div><div class="dg-image-caption" id="unmeasured"></div>';
    root.querySelector<SVGGElement>('#bow')!.getBoundingClientRect = () => rectOf(100, 50, 400, 20);
    root.querySelector<HTMLElement>('#badge')!.getBoundingClientRect = () => rectOf(700, 10, 40, 40);
    // #unmeasured keeps jsdom's all-zero rect: nothing drawn, nothing to cover
    expect(overhangBounds(root, toFlow)).toEqual({ x: 0, y: -20, width: 320, height: 30 });
  });

  it('is undefined when nothing is measurable (jsdom, or a node-only canvas)', () => {
    const root = document.createElement('div');
    root.innerHTML = '<div class="dg-loop-badge"></div>';
    expect(overhangBounds(root, toFlow)).toBeUndefined();
    expect(overhangBounds(null, toFlow)).toBeUndefined();
  });
});
