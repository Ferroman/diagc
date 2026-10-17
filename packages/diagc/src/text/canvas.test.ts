import { describe, expect, it } from 'vitest';
import { serialize } from './ansi';
import { Canvas } from './canvas';
import { ASCII, DOWN, LEFT, RIGHT, UNICODE } from './glyphs';

const picture = (c: Canvas, glyphs = UNICODE): string[] => serialize(c.cells(glyphs), 'none');

describe('Canvas', () => {
  it('merges crossing and touching lines into junctions', () => {
    const c = new Canvas(5, 3);
    c.rect({ x: 0, y: 0, width: 5, height: 3 }, 'light');
    c.segment({ x: 2, y: 0 }, { x: 2, y: 2 }, 'light');
    expect(picture(c)).toEqual(['┌─┬─┐', '│ │ │', '└─┴─┘']);
    expect(picture(c, ASCII)).toEqual(['+-+-+', '| | |', '+-+-+']);
  });

  it('draws a crossing as a cross', () => {
    const c = new Canvas(3, 3);
    c.segment({ x: 0, y: 1 }, { x: 2, y: 1 }, 'light');
    c.segment({ x: 1, y: 0 }, { x: 1, y: 2 }, 'light');
    expect(picture(c)).toEqual([' │', '─┼─', ' │']);
  });

  it('keeps a rounded corner only while nothing joins it', () => {
    const r = new Canvas(4, 2);
    r.rect({ x: 0, y: 0, width: 4, height: 2 }, 'light', undefined, 'round');
    expect(picture(r)).toEqual(['╭──╮', '╰──╯']);
    r.stroke({ x: 0, y: 0 }, DOWN | RIGHT | LEFT, 'light');
    expect(picture(r)[0]).toBe('┬──╮');
  });

  it('draws heavy and dashed lines, a heavy one winning a shared cell', () => {
    const c = new Canvas(3, 1);
    c.segment({ x: 0, y: 0 }, { x: 2, y: 0 }, 'dashed');
    expect(picture(c)).toEqual(['╌╌╌']);
    c.segment({ x: 0, y: 0 }, { x: 1, y: 0 }, 'heavy');
    expect(picture(c)).toEqual(['━━╌']);
    expect(picture(c, ASCII)).toEqual(['==.']);
  });

  it('refuses a diagonal segment', () => {
    expect(() => new Canvas(3, 3).segment({ x: 0, y: 0 }, { x: 1, y: 1 }, 'light')).toThrow();
  });

  it('writes wide characters over two cells', () => {
    const w = new Canvas(6, 1);
    expect(w.text({ x: 0, y: 0 }, '数据库')).toBe(6);
    expect(w.cells(UNICODE)[0]!.map((cell) => cell.ch)).toEqual(['数', '', '据', '', '库', '']);
  });

  it('clips text at its limit and at the edge, never splitting a wide character', () => {
    const w = new Canvas(5, 1);
    expect(w.text({ x: 0, y: 0 }, '数据库')).toBe(4);
    expect(picture(w)).toEqual(['数据']);
    const n = new Canvas(10, 1);
    expect(n.text({ x: 1, y: 0 }, 'abcdef', undefined, 4)).toBe(3);
    expect(picture(n)).toEqual([' abc']);
  });

  it('attaches a combining mark to the character before it', () => {
    const c = new Canvas(3, 1);
    expect(c.text({ x: 0, y: 0 }, 'éx')).toBe(2);
    expect(c.cells(UNICODE)[0]!.map((cell) => cell.ch)).toEqual(['é', 'x', ' ']);
  });

  it('drops control characters, which would move the cursor instead of drawing', () => {
    const c = new Canvas(4, 1);
    expect(c.text({ x: 0, y: 0 }, 'a\nb\x1b')).toBe(2);
    expect(picture(c)).toEqual(['ab']);
  });

  it('blanks the other half of a wide character it overwrites', () => {
    const c = new Canvas(4, 1);
    c.text({ x: 0, y: 0 }, '数据');
    c.put({ x: 1, y: 0 }, 'x');
    expect(picture(c)).toEqual([' x据']);
  });

  it('ignores writes outside itself', () => {
    const c = new Canvas(2, 2);
    c.put({ x: -1, y: 0 }, 'x');
    c.put({ x: 5, y: 5 }, 'x');
    c.segment({ x: -3, y: 1 }, { x: 4, y: 1 }, 'light');
    expect(picture(c)).toEqual(['', '──']);
  });

  it('clears a rectangle of lines and text', () => {
    const c = new Canvas(3, 3);
    c.segment({ x: 0, y: 1 }, { x: 2, y: 1 }, 'light');
    c.clear({ x: 0, y: 0, width: 3, height: 3 });
    expect(picture(c)).toEqual(['', '', '']);
  });

  it('restyles a rectangle, keeping what each cell holds', () => {
    const c = new Canvas(2, 1);
    c.text({ x: 0, y: 0 }, 'ab', { dim: true });
    c.restyle({ x: 1, y: 0, width: 1, height: 1 }, { bold: true });
    const cells = c.cells(UNICODE)[0]!;
    expect(cells[0]!.style).toEqual({ dim: true });
    expect(cells[1]!.style).toEqual({ dim: true, bold: true });
  });
});
