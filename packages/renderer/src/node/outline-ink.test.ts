import { describe, expect, it } from 'vitest';
import { outlineInk } from './outline-ink';

describe('outlineInk', () => {
  it('mixes a written colour toward the text colour, by the share the theme keeps', () => {
    expect(outlineInk('#242f3e')).toBe('color-mix(in srgb, #242f3e var(--dg-outline-ink, 100%), var(--dg-text))');
  });

  it("leaves a theme token alone: it is already the theme's colour", () => {
    expect(outlineInk('var(--dg-deploy-region)')).toBe('var(--dg-deploy-region)');
  });
});
