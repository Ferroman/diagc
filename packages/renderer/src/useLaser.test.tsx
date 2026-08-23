// @vitest-environment jsdom
import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LASER_FADE_MS, useLaser } from './useLaser';

function Host({ enabled }: { enabled: boolean }) {
  const laser = useLaser({ enabled, toFlow: (p) => ({ x: p.x / 2, y: p.y / 2 }) });
  return (
    <div data-testid="wrapper" {...laser.handlers}>
      <div data-testid="pane" />
      <span data-testid="live">{laser.live === null ? 'idle' : laser.live.join(',')}</span>
      <ul data-testid="trails">
        {laser.trails.map((t) => (
          <li key={t.id}>{t.points.join(',')}</li>
        ))}
      </ul>
    </div>
  );
}

const drag = (pane: HTMLElement, pointerId: number, x1: number) => {
  fireEvent.pointerDown(pane, { button: 0, pointerId, clientX: 0, clientY: 0 });
  fireEvent.pointerMove(pane, { pointerId, clientX: x1 / 2, clientY: 0 });
  fireEvent.pointerMove(pane, { pointerId, clientX: x1, clientY: 0 });
  fireEvent.pointerUp(pane, { pointerId, clientX: x1, clientY: 0 });
};

describe('useLaser', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows the gesture live, then keeps it as a trail that is dropped after the fade', () => {
    const { getByTestId } = render(<Host enabled />);
    const pane = getByTestId('pane');
    fireEvent.pointerDown(pane, { button: 0, pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(pane, { pointerId: 1, clientX: 40, clientY: 0 });
    expect(getByTestId('live').textContent).toBe('0,0,20,0');
    fireEvent.pointerUp(pane, { pointerId: 1, clientX: 40, clientY: 0 });
    expect(getByTestId('live').textContent).toBe('idle');
    expect(getByTestId('trails').children).toHaveLength(1);
    expect(getByTestId('trails').children[0]?.textContent).toBe('0,0,20,0');
    act(() => vi.advanceTimersByTime(LASER_FADE_MS - 1));
    expect(getByTestId('trails').children).toHaveLength(1);
    act(() => vi.advanceTimersByTime(1));
    expect(getByTestId('trails').children).toHaveLength(0);
  });

  it('each trail fades on its own clock', () => {
    const { getByTestId } = render(<Host enabled />);
    const pane = getByTestId('pane');
    drag(pane, 1, 40);
    act(() => vi.advanceTimersByTime(LASER_FADE_MS / 2));
    drag(pane, 2, 80);
    expect(getByTestId('trails').children).toHaveLength(2);
    act(() => vi.advanceTimersByTime(LASER_FADE_MS / 2));
    expect(getByTestId('trails').children).toHaveLength(1);
    expect(getByTestId('trails').children[0]?.textContent).toBe('0,0,40,0');
    act(() => vi.advanceTimersByTime(LASER_FADE_MS / 2));
    expect(getByTestId('trails').children).toHaveLength(0);
  });

  it('unmounting cancels the pending fades', () => {
    const { getByTestId, unmount } = render(<Host enabled />);
    drag(getByTestId('pane'), 1, 40);
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('captures nothing while disabled', () => {
    const { getByTestId } = render(<Host enabled={false} />);
    drag(getByTestId('pane'), 1, 40);
    expect(getByTestId('trails').children).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
