import { describe, expect, it } from 'vitest';
import { exportUrl } from './snapshot';

describe('exportUrl', () => {
  it("opens the page's export render, on the first plane when none is named", () => {
    expect(exportUrl('/out/html/a b.html')).toBe('file:///out/html/a%20b.html?export=1');
  });

  it('names the plane to draw, encoded', () => {
    expect(exportUrl('/out/html/a.html', { plane: 'Target VPC/2' })).toBe(
      'file:///out/html/a.html?export=1&plane=Target+VPC%2F2',
    );
  });

  it('names the style and the theme the picture is taken in, when the publisher chose them', () => {
    expect(exportUrl('/out/html/a.html', { style: 'sketch', theme: 'dark' })).toBe(
      'file:///out/html/a.html?export=1&style=sketch&theme=dark',
    );
    expect(exportUrl('/out/html/a.html', { plane: 'p', theme: 'light' })).toBe(
      'file:///out/html/a.html?export=1&plane=p&theme=light',
    );
  });
});
