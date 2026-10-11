import { describe, expect, it, vi } from 'vitest';
import { canvasToggles, toggleOf, type CanvasToggleState } from './canvas-toggles';

/** every switch on, every one offered; each setter a spy that applies its updater to `on` */
function state(on: boolean, over: Partial<CanvasToggleState> = {}) {
  const set = () => vi.fn((u: boolean | ((v: boolean) => boolean)) => (typeof u === 'function' ? u(on) : u));
  const s: CanvasToggleState = {
    dim: [on, set()],
    laser: [on, set()],
    drawings: [on, set()],
    legend: [on, set()],
    loops: [on, set()],
    drawingsOffered: true,
    legendOffered: true,
    loopsOffered: true,
    clearLoopHighlight: vi.fn(),
    ...over,
  };
  return s;
}

describe('canvasToggles', () => {
  it('lists the five switches in the corner cluster order', () => {
    expect(canvasToggles(state(true)).map((t) => t.key)).toEqual(['dim', 'laser', 'drawings', 'legend', 'loops']);
  });

  it('marks a switch that is off on its button, and says what pressing it does', () => {
    const off = canvasToggles(state(false));
    expect(off.map((t) => t.className)).toEqual([
      'dg-focus-toggle dg-focus-toggle-off',
      'dg-laser-toggle',
      'dg-drawings-toggle dg-drawings-toggle-off',
      'dg-legend-toggle-btn dg-legend-toggle-btn-off',
      'dg-loop-toggle dg-loop-toggle-off',
    ]);
    expect(off.map((t) => t.title)).toEqual([
      'Dim unconnected on select',
      'Laser pointer',
      'Show drawings',
      'Show legend',
      'Show loop badges',
    ]);
    const on = canvasToggles(state(true));
    expect(toggleOf(on, 'laser').className).toBe('dg-laser-toggle dg-laser-toggle-on');
    expect(on.map((t) => t.title)).toEqual([
      'Stop dimming unconnected on select',
      'Laser pointer off',
      'Hide drawings',
      'Hide legend',
      'Hide loop badges',
    ]);
  });

  it("labels each button as its title says, except the laser's, which keeps one name", () => {
    for (const on of [true, false]) {
      for (const t of canvasToggles(state(on))) expect(t.label).toBe(t.key === 'laser' ? 'Laser pointer' : t.title);
    }
  });

  it('offers the dim and the laser always, and the others only when there is something to switch', () => {
    const toggles = canvasToggles(state(true, { drawingsOffered: false, legendOffered: false, loopsOffered: false }));
    expect(toggles.filter((t) => t.offered).map((t) => t.key)).toEqual(['dim', 'laser']);
  });

  it('flips its own switch', () => {
    const s = state(true);
    for (const t of canvasToggles(s)) t.flip();
    for (const key of ['dim', 'laser', 'drawings', 'legend', 'loops'] as const) {
      const set = s[key][1] as ReturnType<typeof vi.fn>;
      expect(set).toHaveBeenCalledTimes(1);
      expect(set.mock.results[0]!.value).toBe(false);
    }
  });

  it('drops the loop highlight when it hides the loop badges, and only then', () => {
    const shown = state(true);
    toggleOf(canvasToggles(shown), 'loops').flip();
    expect(shown.clearLoopHighlight).toHaveBeenCalledTimes(1);
    const hidden = state(false);
    toggleOf(canvasToggles(hidden), 'loops').flip();
    expect(hidden.clearLoopHighlight).not.toHaveBeenCalled();
  });
});
