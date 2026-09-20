import { describe, expect, it } from 'vitest';
import { buildGallery } from './gallery';

describe('buildGallery', () => {
  it('links every diagram page and adds a thumbnail only when an image exists', () => {
    const html = buildGallery([
      { name: 'platform-c4', hasImage: true },
      { name: 'delivery', hasImage: false },
    ]);
    expect(html).toContain('href="platform-c4.html"');
    expect(html).toContain('../static/platform-c4.png');
    expect(html).toContain('href="delivery.html"');
    expect(html).not.toContain('../static/delivery.png');
    expect(html).toMatch(/<!doctype html>/i);
  });
});
