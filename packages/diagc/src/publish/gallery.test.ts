import { describe, expect, it } from 'vitest';
import { buildGallery } from './gallery';

describe('buildGallery', () => {
  it('links every diagram page and adds a thumbnail only when an image exists', () => {
    const html = buildGallery([
      { name: 'platform-c4', title: 'Platform', hasImage: true },
      { name: 'delivery', title: 'Delivery', hasImage: false },
    ]);
    expect(html).toContain('href="platform-c4.html"');
    expect(html).toContain('../static/platform-c4.png');
    expect(html).toContain('href="delivery.html"');
    expect(html).not.toContain('../static/delivery.png');
    expect(html).toMatch(/<!doctype html>/i);
  });

  it('groups cards by folder — root diagrams first — and titles each with the model name', () => {
    const html = buildGallery([
      { name: 'examples/c4/starter', title: 'Bookstore context', hasImage: true },
      { name: 'overview', title: 'Platform overview', hasImage: false },
      { name: 'docs/c4', title: 'C4 example', hasImage: true },
    ]);
    const headings = [...html.matchAll(/<h2>([^<]+)<\/h2>/g)].map((m) => m[1]);
    expect(headings).toEqual(['docs', 'examples/c4']);
    // a diagram at the root of src/ sits above the first folder heading
    expect(html.indexOf('href="overview.html"')).toBeLessThan(html.indexOf('<h2>docs</h2>'));
    expect(html).toContain('>Bookstore context<');
    // the path stays on the card: it is what `diagc publish <name>` and the URL use
    expect(html).toContain('>examples/c4/starter<');
    expect(html).toContain('../static/examples/c4/starter.png');
  });

  it('shows the path once when the model has no name of its own', () => {
    const html = buildGallery([{ name: 'overview', title: 'overview', hasImage: false }]);
    expect(html.match(/>overview</g)).toHaveLength(1);
  });

  it('escapes a model name', () => {
    expect(buildGallery([{ name: 'a', title: '<b>&', hasImage: false }])).toContain('&lt;b>&amp;');
  });
});
