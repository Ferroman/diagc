import { describe, expect, it } from 'vitest';
import { isSafeName } from './names';

describe('isSafeName', () => {
  it('takes lowercase letters, digits and -, with / for a folder', () => {
    expect(isSafeName('shop')).toBe(true);
    expect(isSafeName('team-a/app-2')).toBe(true);
    expect(isSafeName('Shop')).toBe(false);
    expect(isSafeName('../escape')).toBe(false);
    expect(isSafeName('/abs')).toBe(false);
    expect(isSafeName('a//b')).toBe(false);
  });

  it('refuses a folder with no name in it', () => {
    expect(isSafeName('a/')).toBe(false);
    expect(isSafeName('team/a/')).toBe(false);
  });

  it('refuses a last segment that a route takes for itself', () => {
    expect(isSafeName('team/rename')).toBe(false);
    expect(isSafeName('x/eject')).toBe(false);
    expect(isSafeName('a/b/composed')).toBe(false);
  });

  it('takes those words where no route mistakes them: alone, or as a folder', () => {
    // `/api/diagrams/rename` is the plain route's; the action routes need a name before the word.
    expect(isSafeName('rename')).toBe(true);
    expect(isSafeName('eject')).toBe(true);
    expect(isSafeName('composed')).toBe(true);
    expect(isSafeName('rename/x')).toBe(true);
    expect(isSafeName('team/renamed')).toBe(true);
  });
});
