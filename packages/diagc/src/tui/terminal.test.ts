import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { ENTER_SEQUENCE, LEAVE_SEQUENCE, processTerminal } from './terminal';

function fakes() {
  const stdin = Object.assign(new EventEmitter(), {
    isTTY: true,
    setRawMode: vi.fn(),
    setEncoding: vi.fn(),
    resume: vi.fn(),
    pause: vi.fn(),
  });
  const written: string[] = [];
  const stdout = Object.assign(new EventEmitter(), {
    columns: 100,
    rows: 30,
    write: vi.fn((text: string) => {
      written.push(text);
      return true;
    }),
  });
  const terminal = processTerminal(stdin as never, stdout as never);
  return { stdin, stdout, written, terminal };
}

describe('processTerminal', () => {
  it('takes the screen over on start and gives it back on stop, once', () => {
    const { stdin, written, terminal } = fakes();
    terminal.start();
    expect(stdin.setRawMode).toHaveBeenCalledWith(true);
    expect(stdin.resume).toHaveBeenCalled();
    expect(written).toEqual([ENTER_SEQUENCE]);
    terminal.stop();
    terminal.stop();
    expect(stdin.setRawMode).toHaveBeenLastCalledWith(false);
    expect(stdin.pause).toHaveBeenCalledTimes(1);
    expect(written).toEqual([ENTER_SEQUENCE, LEAVE_SEQUENCE]);
  });

  it('leaves the mouse, the cursor and the alternate screen as it found them', () => {
    expect(LEAVE_SEQUENCE).toContain('\x1b[?1000l');
    expect(LEAVE_SEQUENCE).toContain('\x1b[?25h');
    expect(LEAVE_SEQUENCE.endsWith('\x1b[?1049l')).toBe(true);
    expect(ENTER_SEQUENCE.startsWith('\x1b[?1049h')).toBe(true);
  });

  it('reports its size, input and resizes while started, and nothing after stop', () => {
    const { stdin, stdout, terminal } = fakes();
    const input = vi.fn();
    const resize = vi.fn();
    terminal.onInput(input);
    terminal.onResize(resize);
    terminal.start();
    expect([terminal.columns, terminal.rows]).toEqual([100, 30]);
    stdin.emit('data', 'q');
    stdout.emit('resize');
    terminal.stop();
    stdin.emit('data', 'x');
    stdout.emit('resize');
    expect(input.mock.calls).toEqual([['q']]);
    expect(resize).toHaveBeenCalledTimes(1);
  });
});
