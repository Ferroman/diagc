// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DrawingsLayer } from './DrawingsLayer';

const strokes = [
  { id: 'k1', points: [0, 0, 10, 10] },
  { id: 'k2', points: [5, 5, 6, 6], color: '#d9a520', width: 6 },
];

const mount = (ui: ReactElement) => render(<ReactFlowProvider>{ui}</ReactFlowProvider>);

describe('DrawingsLayer', () => {
  it('draws one path per stroke with the theme ink and default width unless the stroke says otherwise', () => {
    const { container } = mount(<DrawingsLayer strokes={strokes} visible erasing={false} />);
    const paths = container.querySelectorAll('path.dg-stroke');
    expect(paths).toHaveLength(2);
    expect(paths[0]?.getAttribute('stroke')).toBe('var(--dg-ink)');
    expect(paths[0]?.getAttribute('stroke-width')).toBe('3');
    expect(paths[1]?.getAttribute('stroke')).toBe('#d9a520');
    expect(paths[1]?.getAttribute('stroke-width')).toBe('6');
    expect(paths[0]?.getAttribute('d')).toBe('M 0 0 L 10 10');
  });

  it('hides with display:none when not visible, keeping the paths mounted', () => {
    const { container } = mount(<DrawingsLayer strokes={strokes} visible={false} erasing={false} />);
    const svg = container.querySelector('svg.dg-drawings') as SVGElement;
    expect(svg.style.display).toBe('none');
    expect(container.querySelectorAll('path.dg-stroke')).toHaveLength(2);
  });

  it('renders the live stroke while drawing', () => {
    const { container } = mount(
      <DrawingsLayer strokes={[]} visible erasing={false} live={{ points: [1, 1, 2, 2], width: 2 }} />,
    );
    expect(container.querySelector('path.dg-stroke-live')?.getAttribute('stroke-width')).toBe('2');
  });

  it('adds clickable hit paths only while erasing, and reports the stroke id', () => {
    const onErase = vi.fn();
    const { container, rerender } = mount(<DrawingsLayer strokes={strokes} visible erasing={false} onErase={onErase} />);
    expect(container.querySelectorAll('path.dg-stroke-hit')).toHaveLength(0);
    rerender(
      <ReactFlowProvider>
        <DrawingsLayer strokes={strokes} visible erasing onErase={onErase} />
      </ReactFlowProvider>,
    );
    const hits = container.querySelectorAll('path.dg-stroke-hit');
    expect(hits).toHaveLength(2);
    // hit width is max(width, 12 / zoom); zoom is 1 in a bare provider
    expect(hits[0]?.getAttribute('stroke-width')).toBe('12');
    expect(hits[1]?.getAttribute('stroke-width')).toBe('12');
    fireEvent.click(hits[1] as Element);
    expect(onErase).toHaveBeenCalledWith('k2');
  });
});
