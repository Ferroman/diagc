// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';
import { CanvasControls } from './CanvasControls';

const base = {
  toggles: [],
  keyHints: undefined,
  builtinKeys: undefined,
  colorMode: undefined,
  onToggleTheme: undefined,
};

describe('CanvasControls', () => {
  it('the day buttons are disabled at 20 and at 80, and say the width', () => {
    const at = (width: number) =>
      render(
        <ReactFlowProvider>
          <CanvasControls {...base} days={{ width, step: vi.fn() }} />
        </ReactFlowProvider>,
      );
    const low = at(20);
    expect(screen.getByRole('button', { name: 'Narrower days' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Wider days' })).toHaveProperty('disabled', false);
    expect(screen.getByRole('button', { name: 'Wider days' }).title).toContain('20 px per day');
    low.unmount();
    at(80);
    expect(screen.getByRole('button', { name: 'Wider days' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Narrower days' })).toHaveProperty('disabled', false);
  });

  it('no day buttons without days', () => {
    render(
      <ReactFlowProvider>
        <CanvasControls {...base} />
      </ReactFlowProvider>,
    );
    expect(screen.queryByRole('button', { name: 'Wider days' })).toBeNull();
  });
});
