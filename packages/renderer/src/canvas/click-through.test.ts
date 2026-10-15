// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { controlUnderEdge } from './click-through';

/** an edge's hit path over a group whose header holds a fold chip */
function scene() {
  document.body.innerHTML = `
    <div class="dg-canvas">
      <div class="react-flow__node" data-id="box"><div class="dg-group-header">Box <span class="dg-badges"><button class="dg-fold">▾</button></span></div></div>
      <svg class="react-flow__edge"><g><path class="react-flow__edge-interaction"></path></g></svg>
      <div class="react-flow__pane"></div>
    </div>`;
  const path = document.querySelector('.react-flow__edge-interaction')!;
  const chip = document.querySelector('.dg-fold') as HTMLButtonElement;
  const header = document.querySelector('.dg-group-header')!;
  const pane = document.querySelector('.react-flow__pane')!;
  return { path, chip, header, pane };
}

const click = (target: Element) => ({ target, clientX: 10, clientY: 10 });

describe('controlUnderEdge', () => {
  it('finds the node control an edge click landed over', () => {
    const { path, chip, header } = scene();
    // what the browser would report at the point, topmost first: the edge's hit
    // path, then the chip and its header beneath it
    const under = () => [path, chip, header];
    expect(controlUnderEdge(click(path), under)).toBe(chip);
  });

  it('leaves a click to the edge when nothing of a node’s is under it, or only a node’s plain body', () => {
    const { path, header } = scene();
    expect(controlUnderEdge(click(path), () => [path])).toBeNull();
    expect(controlUnderEdge(click(path), () => [path, header])).toBeNull();
  });

  it('is not about clicks that did not land on an edge', () => {
    const { chip, pane } = scene();
    expect(controlUnderEdge(click(pane), () => [pane, chip])).toBeNull();
    expect(controlUnderEdge(click(chip), () => [chip])).toBeNull();
  });

  it('does without a browser that cannot say what lies under a point', () => {
    const { path } = scene();
    expect(controlUnderEdge(click(path), undefined)).toBeNull();
  });
});
