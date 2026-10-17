import { describe, expect, it } from 'vitest';
import { cellWidth, fitCells, printable, wrapCells } from './width';

describe('cellWidth', () => {
  it('counts a cell per narrow character', () => {
    expect(cellWidth('abc')).toBe(3);
    expect(cellWidth('')).toBe(0);
  });

  it('counts two cells for wide characters and emoji', () => {
    expect(cellWidth('数据库')).toBe(6);
    expect(cellWidth('🙂')).toBe(2);
    expect(cellWidth('ｆｕｌｌ')).toBe(8);
  });

  it('counts nothing for combining marks, joiners and variation selectors', () => {
    expect(cellWidth('é')).toBe(1);
    expect(cellWidth('👩‍💻')).toBe(4);
    expect(cellWidth('✔︎')).toBe(1);
  });
});

describe('fitCells', () => {
  it('leaves text that fits alone', () => {
    expect(fitCells('Web', 3)).toBe('Web');
  });

  it('cuts text that does not, ending in an ellipsis', () => {
    expect(fitCells('Payment Adapter', 8)).toBe('Payment…');
    expect(fitCells('数据库', 5)).toBe('数据…');
    expect(fitCells('数据库', 4)).toBe('数…');
  });

  it('ends in the ellipsis it is given', () => {
    expect(fitCells('Payment Adapter', 8, '~')).toBe('Payment~');
  });

  it('gives nothing for no room', () => {
    expect(fitCells('abc', 0)).toBe('');
  });
});

describe('printable', () => {
  it('turns control characters into spaces and leaves the rest', () => {
    expect(printable('a\tb\x1b[31mc\x7f\u0085d')).toBe('a b [31mc  d');
    expect(printable('数据 e\u0301')).toBe('数据 e\u0301');
  });
});

describe('wrapCells', () => {
  it('wraps at spaces', () => {
    expect(wrapCells('Royal Mail Click & Drop', 12)).toEqual(['Royal Mail', 'Click & Drop']);
    expect(wrapCells('Web', 12)).toEqual(['Web']);
  });

  it('splits a word wider than the line', () => {
    expect(wrapCells('Supercalifragilistic', 8)).toEqual(['Supercal', 'ifragili', 'stic']);
  });

  it('measures wide characters in cells', () => {
    expect(wrapCells('数据库 服务', 6)).toEqual(['数据库', '服务']);
  });

  it('gives one empty line for empty text', () => {
    expect(wrapCells('', 10)).toEqual(['']);
  });
});
