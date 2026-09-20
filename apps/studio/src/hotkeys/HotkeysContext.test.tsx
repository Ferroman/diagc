// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HotkeysContext, keyHint, keyName, useKeyHint } from './HotkeysContext';
import { resolveKeymap } from './keymap';

function Probe() {
  const hint = useKeyHint();
  return <button title={`Draw freehand${hint('tool.pen')}`}>Pen</button>;
}

describe('key hints', () => {
  it('names the first key of a bound action, and nothing for an unbound one', () => {
    const k = resolveKeymap({});
    expect(keyHint(k, 'tool.pen', false)).toBe(' (P)');
    expect(keyHint(k, 'edit.redo', false)).toBe(' (Ctrl+Shift+Z)');
    expect(keyHint(k, 'edit.redo', true)).toBe(' (⇧⌘Z)');
    expect(keyHint(k, 'arrange.align-left', false)).toBe('');
    expect(keyName(k, 'canvas.laser', false)).toBe('L');
    expect(keyName(k, 'canvas.dim', false)).toBe('');
  });

  it('falls back to the default keymap with no provider, so a lone component still reads right', () => {
    render(<Probe />);
    expect(screen.getByRole('button').getAttribute('title')).toBe('Draw freehand (P)');
  });

  it('follows the provided keymap', () => {
    render(
      <HotkeysContext.Provider value={{ keymap: resolveKeymap({ 'tool.pen': ['D'] }), mac: false }}>
        <Probe />
      </HotkeysContext.Provider>,
    );
    expect(screen.getByRole('button').getAttribute('title')).toBe('Draw freehand (D)');
  });
});
