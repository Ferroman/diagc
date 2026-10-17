import { describe, expect, it } from 'vitest';
import { parseInput } from './keys';

const key = (name: string, extra = {}) => ({ kind: 'key', name, ...extra });

describe('parseInput', () => {
  it('reads arrows in both cursor modes, with their modifiers', () => {
    expect(parseInput('\x1b[A')).toEqual([key('up')]);
    expect(parseInput('\x1bOB')).toEqual([key('down')]);
    expect(parseInput('\x1b[1;2C')).toEqual([key('right', { shift: true })]);
    expect(parseInput('\x1b[1;5D')).toEqual([key('left', { ctrl: true })]);
  });

  it('reads the paging keys', () => {
    expect(parseInput('\x1b[5~\x1b[6~')).toEqual([key('pageup'), key('pagedown')]);
    expect(parseInput('\x1b[H\x1b[F\x1b[1~\x1b[4~\x1bOH')).toEqual([
      key('home'),
      key('end'),
      key('home'),
      key('end'),
      key('home'),
    ]);
  });

  it('reads enter, tab, backspace, space and escape', () => {
    expect(parseInput('\r')).toEqual([key('enter')]);
    expect(parseInput('\n')).toEqual([key('enter')]);
    expect(parseInput('\t')).toEqual([key('tab')]);
    expect(parseInput('\x1b[Z')).toEqual([key('tab', { shift: true })]);
    expect(parseInput('\x7f')).toEqual([key('backspace')]);
    expect(parseInput(' ')).toEqual([key('space')]);
    expect(parseInput('\x1b')).toEqual([key('escape')]);
  });

  it('reads control keys by their letter', () => {
    expect(parseInput('\x03')).toEqual([key('c', { ctrl: true })]);
  });

  it('reads several printable characters, wide ones included', () => {
    expect(parseInput('q/')).toEqual([key('q'), key('/')]);
    expect(parseInput('数')).toEqual([key('数')]);
  });

  it('reads SGR mouse reports, in cells from 0', () => {
    expect(parseInput('\x1b[<0;5;3M')).toEqual([{ kind: 'mouse', action: 'press', x: 4, y: 2, shift: false }]);
    expect(parseInput('\x1b[<0;5;3m')).toEqual([{ kind: 'mouse', action: 'release', x: 4, y: 2, shift: false }]);
    expect(parseInput('\x1b[<32;9;9M')[0]).toMatchObject({ action: 'drag', x: 8, y: 8 });
    expect(parseInput('\x1b[<64;1;1M')[0]).toMatchObject({ action: 'wheel-up' });
    expect(parseInput('\x1b[<65;1;1M')[0]).toMatchObject({ action: 'wheel-down' });
    expect(parseInput('\x1b[<68;1;1M')[0]).toMatchObject({ action: 'wheel-up', shift: true });
  });

  it('skips sequences it does not know, and keeps what follows', () => {
    expect(parseInput('\x1b[200~q')).toEqual([key('q')]);
    expect(parseInput('\x1b[?1;2cq')).toEqual([key('q')]);
  });
});
