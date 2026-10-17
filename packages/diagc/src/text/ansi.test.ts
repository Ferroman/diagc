import { describe, expect, it } from 'vitest';
import { colorModeFor, parseColor, screenColorMode, serialize } from './ansi';
import type { Cell } from './canvas';

const row = (text: string, style = {}): Cell[] => [...text].map((ch) => ({ ch, style }));

describe('parseColor', () => {
  it('reads hex and rgb() colours', () => {
    expect(parseColor('#1168bd')).toEqual([17, 104, 189]);
    expect(parseColor('#fff')).toEqual([255, 255, 255]);
    expect(parseColor('rgb(1, 2, 3)')).toEqual([1, 2, 3]);
    expect(parseColor(' #ABCDEF ')).toEqual([171, 205, 239]);
  });

  it('gives nothing for what a terminal cannot resolve', () => {
    expect(parseColor('var(--dg-text)')).toBeUndefined();
    expect(parseColor('tomato')).toBeUndefined();
    expect(parseColor('#12')).toBeUndefined();
  });
});

describe('colorModeFor', () => {
  it('colours a terminal and not a pipe', () => {
    expect(colorModeFor({}, false)).toBe('none');
    expect(colorModeFor({}, true)).toBe('ansi256');
    expect(colorModeFor({ COLORTERM: 'truecolor' }, true)).toBe('truecolor');
    expect(colorModeFor({ COLORTERM: '24bit' }, true)).toBe('truecolor');
  });

  it('follows NO_COLOR, TERM=dumb and FORCE_COLOR', () => {
    expect(colorModeFor({ NO_COLOR: '1' }, true)).toBe('none');
    expect(colorModeFor({ NO_COLOR: '' }, true)).toBe('ansi256');
    expect(colorModeFor({ TERM: 'dumb' }, true)).toBe('none');
    expect(colorModeFor({ FORCE_COLOR: '1' }, false)).toBe('ansi256');
    expect(colorModeFor({ FORCE_COLOR: '0' }, false)).toBe('none');
  });

  it('lets a flag override the environment', () => {
    expect(colorModeFor({ NO_COLOR: '1' }, false, 'color')).toBe('ansi256');
    expect(colorModeFor({ FORCE_COLOR: '1' }, true, 'no-color')).toBe('none');
  });
});

describe('screenColorMode', () => {
  it('colours a screen as show colours a terminal, but never drops its attributes', () => {
    expect(screenColorMode({})).toBe('ansi256');
    expect(screenColorMode({ COLORTERM: 'truecolor' })).toBe('truecolor');
    expect(screenColorMode({ NO_COLOR: '1' })).toBe('mono');
    expect(screenColorMode({ TERM: 'dumb' })).toBe('mono');
  });
});

describe('serialize', () => {
  it('trims trailing blanks', () => {
    expect(serialize([row('ab  '), row('    ')], 'none')).toEqual(['ab', '']);
  });

  it('pads instead when asked to keep the width', () => {
    expect(serialize([row('ab  ')], 'none', false)).toEqual(['ab  ']);
  });

  it('writes no escape at all without colour', () => {
    expect(serialize([row('ab', { bold: true, fg: { rgb: [1, 2, 3] } })], 'none').join('')).not.toContain('\x1b');
  });

  it('sets and resets styles in colour', () => {
    const [line] = serialize(
      [[...row('a'), ...row('b', { bold: true, fg: { rgb: [17, 104, 189] } }), ...row('c')]],
      'truecolor',
    );
    expect(line).toBe('a\x1b[1;38;2;17;104;189mb\x1b[0mc');
    const [end] = serialize([row('x', { dim: true })], 'ansi256');
    expect(end).toBe('\x1b[2mx\x1b[0m');
  });

  it('maps a colour onto the 256-colour palette', () => {
    expect(serialize([row('x', { fg: { rgb: [255, 0, 0] } })], 'ansi256')).toEqual(['\x1b[38;5;196mx\x1b[0m']);
    expect(serialize([row('x', { fg: { rgb: [128, 128, 128] } })], 'ansi256')).toEqual(['\x1b[38;5;244mx\x1b[0m']);
    expect(serialize([row('x', { fg: { ansi: 9 } })], 'ansi256')).toEqual(['\x1b[91mx\x1b[0m']);
  });

  it('keeps bold, dim and inverse but no colour in mono', () => {
    const [line] = serialize([row('x', { bold: true, inverse: true, fg: { rgb: [255, 0, 0] } })], 'mono');
    expect(line).toBe('\x1b[1;7mx\x1b[0m');
  });

  it('keeps an inverse blank, which shows', () => {
    expect(serialize([row('a  ', { inverse: true })], 'none')).toEqual(['a  ']);
  });

  it('sets a background colour in each depth', () => {
    expect(serialize([row('x', { bg: { rgb: [0, 0, 170] } })], 'truecolor')).toEqual(['\x1b[48;2;0;0;170mx\x1b[0m']);
    expect(serialize([row('x', { bg: { rgb: [0, 0, 170] } })], 'ansi256')).toEqual(['\x1b[48;5;19mx\x1b[0m']);
    expect(serialize([row('x', { bg: { ansi: 4 } })], 'ansi256')).toEqual(['\x1b[44mx\x1b[0m']);
    expect(serialize([row('x', { bg: { ansi: 12 } })], 'ansi256')).toEqual(['\x1b[104mx\x1b[0m']);
    const [both] = serialize([row('x', { fg: { rgb: [0, 0, 0] }, bg: { rgb: [170, 170, 170] } })], 'truecolor');
    expect(both).toBe('\x1b[38;2;0;0;0;48;2;170;170;170mx\x1b[0m');
  });

  it('drops a background in mono, as it drops a colour', () => {
    expect(serialize([row('x', { inverse: true, bg: { rgb: [0, 0, 170] } })], 'mono')).toEqual(['\x1b[7mx\x1b[0m']);
  });

  it('keeps a blank with a background, which shows', () => {
    const [line] = serialize([row('a  ', { bg: { ansi: 4 } })], 'ansi256');
    expect(line).toBe('\x1b[44ma  \x1b[0m');
  });

  it('skips the second half of a wide character', () => {
    expect(
      serialize(
        [
          [
            { ch: '数', style: {} },
            { ch: '', style: {} },
            { ch: 'x', style: {} },
          ],
        ],
        'none',
      ),
    ).toEqual(['数x']);
  });
});
