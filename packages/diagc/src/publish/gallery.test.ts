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

  describe('header link', () => {
    const entries = [{ name: 'a', title: 'A', hasImage: false }];

    it('is absent unless asked for: the index belongs to whoever published it', () => {
      expect(buildGallery(entries)).not.toContain('class="link"');
    });

    it('links out from the header, shown as the address it goes to', () => {
      const html = buildGallery(entries, { link: 'https://github.com/Ferroman/diagc' });
      expect(html).toContain('<a class="link" href="https://github.com/Ferroman/diagc"');
      expect(html).toContain('>github.com/Ferroman/diagc');
      // ahead of the cards, and never one of them: a deploy check counts `class="card"`
      expect(html.indexOf('class="link"')).toBeLessThan(html.indexOf('class="card"'));
      expect(html.match(/class="card"/g)).toHaveLength(1);
    });

    it('escapes the address', () => {
      const html = buildGallery(entries, { link: 'https://example.com/?a=1&b=2' });
      expect(html).toContain('href="https://example.com/?a=1&amp;b=2"');
    });

    it('refuses anything but http(s): the address lands in an href', () => {
      expect(() => buildGallery(entries, { link: 'javascript:alert(1)' })).toThrow(/http/);
      expect(() => buildGallery(entries, { link: 'not a url' })).toThrow(/http/);
    });
  });
});
