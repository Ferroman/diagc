// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePen } from './usePen';

function Host({ enabled, onStroke, onPaneDown }: { enabled: boolean; onStroke: (p: number[]) => void; onPaneDown: () => void }) {
  // toFlow halves screen coordinates so the test can see the conversion happen
  const pen = usePen({ enabled, toFlow: (p) => ({ x: p.x / 2, y: p.y / 2 }), onStroke });
  return (
    <div data-testid="wrapper" {...pen.handlers}>
      <div data-testid="pane" onPointerDown={onPaneDown} />
      <span data-testid="live">{pen.live === null ? 'idle' : pen.live.join(',')}</span>
    </div>
  );
}

describe('usePen', () => {
  it('turns a down/move/up gesture into one rounded, simplified stroke and keeps the pane from seeing it', () => {
    const onStroke = vi.fn();
    const onPaneDown = vi.fn();
    const { getByTestId } = render(<Host enabled onStroke={onStroke} onPaneDown={onPaneDown} />);
    const pane = getByTestId('pane');
    fireEvent.pointerDown(pane, { button: 0, pointerId: 1, clientX: 0, clientY: 0 });
    expect(getByTestId('live').textContent).toBe('0,0');
    fireEvent.pointerMove(pane, { pointerId: 1, clientX: 10, clientY: 0 });
    fireEvent.pointerMove(pane, { pointerId: 1, clientX: 20, clientY: 0 }); // collinear → simplified away
    fireEvent.pointerMove(pane, { pointerId: 1, clientX: 41, clientY: 0 });
    fireEvent.pointerUp(pane, { pointerId: 1, clientX: 41, clientY: 0 });
    expect(onStroke).toHaveBeenCalledTimes(1);
    expect(onStroke).toHaveBeenCalledWith([0, 0, 21, 0]); // 41/2 = 20.5 → rounds to 21
    expect(getByTestId('live').textContent).toBe('idle');
    expect(onPaneDown).not.toHaveBeenCalled();
  });

  it('ignores non-primary buttons and does nothing when disabled', () => {
    const onStroke = vi.fn();
    const onPaneDown = vi.fn();
    const { getByTestId, rerender } = render(<Host enabled onStroke={onStroke} onPaneDown={onPaneDown} />);
    const pane = getByTestId('pane');
    fireEvent.pointerDown(pane, { button: 2, pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerUp(pane, { pointerId: 1 });
    expect(onPaneDown).toHaveBeenCalledTimes(1);
    rerender(<Host enabled={false} onStroke={onStroke} onPaneDown={onPaneDown} />);
    fireEvent.pointerDown(pane, { button: 0, pointerId: 2, clientX: 0, clientY: 0 });
    fireEvent.pointerUp(pane, { pointerId: 2 });
    expect(onPaneDown).toHaveBeenCalledTimes(2);
    expect(onStroke).not.toHaveBeenCalled();
  });

  it('a cancel drops the stroke without reporting it', () => {
    const onStroke = vi.fn();
    const { getByTestId } = render(<Host enabled onStroke={onStroke} onPaneDown={() => {}} />);
    const pane = getByTestId('pane');
    fireEvent.pointerDown(pane, { button: 0, pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerCancel(pane, { pointerId: 1 });
    expect(onStroke).not.toHaveBeenCalled();
    expect(getByTestId('live').textContent).toBe('idle');
  });

  it('swallows a second primary-button pointer while a stroke is in progress', () => {
    const onStroke = vi.fn();
    const onPaneDown = vi.fn();
    const { getByTestId } = render(<Host enabled onStroke={onStroke} onPaneDown={onPaneDown} />);
    const pane = getByTestId('pane');
    fireEvent.pointerDown(pane, { button: 0, pointerId: 1, clientX: 0, clientY: 0 });
    // A palm or a second finger touches down mid-stroke — it must not hijack
    // the active gesture or reach the pane.
    fireEvent.pointerDown(pane, { button: 0, pointerId: 2, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(pane, { pointerId: 2, clientX: 200, clientY: 200 });
    fireEvent.pointerMove(pane, { pointerId: 1, clientX: 41, clientY: 0 });
    fireEvent.pointerUp(pane, { pointerId: 1, clientX: 41, clientY: 0 });
    expect(onPaneDown).not.toHaveBeenCalled();
    expect(onStroke).toHaveBeenCalledTimes(1);
    expect(onStroke).toHaveBeenCalledWith([0, 0, 21, 0]); // pointer 1's points only
    expect(getByTestId('live').textContent).toBe('idle');
  });
});
