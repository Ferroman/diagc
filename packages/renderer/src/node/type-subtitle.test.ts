import { describe, expect, it } from 'vitest';
import { typeSubtitle } from './type-subtitle';

describe('typeSubtitle', () => {
  it('inserts the technology before the closing bracket', () => {
    expect(typeSubtitle('[Container]', 'Java/Spring')).toBe('[Container: Java/Spring]');
  });
  it('appends with a colon when the label has no brackets', () => {
    expect(typeSubtitle('service', 'Go')).toBe('service: Go');
  });
  it('passes the label through untouched without technology', () => {
    expect(typeSubtitle('[Container]')).toBe('[Container]');
  });
  it('keeps an empty label empty — glyph types stay subtitle-less', () => {
    expect(typeSubtitle('', 'Go')).toBe('');
  });
});
