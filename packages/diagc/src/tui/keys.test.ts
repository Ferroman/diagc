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
    expect(parseInput('\x1b[5;1tq')).toEqual([key('q')]);
  });
});

describe('the replies to the terminal query', () => {
  it('reads whether the terminal shows images', () => {
    expect(parseInput('\x1b_Gi=31;OK\x1b\\')).toEqual([{ kind: 'graphics', ok: true }]);
    expect(parseInput('\x1b_Gi=31;EINVAL:bad format\x1b\\')).toEqual([{ kind: 'graphics', ok: false }]);
  });

  it('reads the size of a cell in pixels', () => {
    expect(parseInput('\x1b[6;20;10t')).toEqual([{ kind: 'cell-size', width: 10, height: 20 }]);
  });

  it('reads the text colour, ended either way, at any number of digits', () => {
    expect(parseInput('\x1b]10;rgb:ffff/8080/0000\x1b\\')).toEqual([{ kind: 'text-color', rgb: [255, 128, 0] }]);
    expect(parseInput('\x1b]10;rgb:f/8/0\x07')).toEqual([{ kind: 'text-color', rgb: [255, 136, 0] }]);
  });

  it('reads replies that arrive together, between keys', () => {
    expect(parseInput('j\x1b[6;18;9t\x1b_Gi=31;OK\x1b\\q').map((e) => e.kind)).toEqual([
      'key',
      'cell-size',
      'graphics',
      'key',
    ]);
  });

  it('never reads a string it does not know, or one cut short, as keys', () => {
    expect(parseInput('\x1b]11;rgb:0000/0000/0000\x1b\\q')).toEqual([key('q')]);
    expect(parseInput('\x1b_Gi=1;OK')).toEqual([]);
  });
});
