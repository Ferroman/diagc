// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultHost, setHost } from '../host';
import { downloadPage } from './downloadPage';

/** A host whose API answers `status` with `body`, recording what was asked. */
function hostAnswering(status: number, body: unknown) {
  const apiFetch = vi.fn(async (_url: string) => new Response(JSON.stringify(body), { status }));
  const notify = vi.fn();
  setHost({ ...defaultHost, apiFetch, notify });
  return { apiFetch, notify };
}

describe('downloadPage', () => {
  let saved: { name: string; blob: Blob }[];
  beforeEach(() => {
    saved = [];
    URL.createObjectURL = vi.fn((blob: Blob) => {
      saved.push({ name: '', blob });
      return 'blob:x';
    });
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      saved.at(-1)!.name = this.download;
    });
  });
  afterEach(() => {
    setHost(defaultHost);
    vi.restoreAllMocks();
  });

  it('downloads the page the server built, named for the diagram', async () => {
    const { apiFetch, notify } = hostAnswering(200, { html: '<!doctype html><p>shop</p>', warnings: [] });
    await downloadPage('team/shop');
    expect(apiFetch).toHaveBeenCalledWith('/api/pages/team/shop');
    expect(saved.map((s) => s.name)).toEqual(['shop.html']);
    expect(saved[0]!.blob.type).toBe('text/html');
    expect(await saved[0]!.blob.text()).toBe('<!doctype html><p>shop</p>');
    expect(notify).not.toHaveBeenCalled();
  });

  it('asks for a compiled diagram by a name a URL cannot misread', async () => {
    const { apiFetch } = hostAnswering(200, { html: '', warnings: [] });
    await downloadPage('Odd #1/a?b');
    expect(apiFetch).toHaveBeenCalledWith('/api/pages/Odd%20%231/a%3Fb');
  });

  it('saves the page and says what could not be packed in', async () => {
    const { notify } = hostAnswering(200, { html: '<p/>', warnings: ['publish: could not read asset "a.png"'] });
    await downloadPage('shop');
    expect(saved.map((s) => s.name)).toEqual(['shop.html']);
    expect(notify).toHaveBeenCalledWith(
      'Saved shop.html, but some of it could not be packed in:\npublish: could not read asset "a.png"',
    );
  });

  it('downloads nothing and passes the reason on when the server refuses', async () => {
    const { notify } = hostAnswering(500, { issues: [{ message: 'No viewer page at /x/index.html' }] });
    await downloadPage('shop');
    expect(saved).toEqual([]);
    expect(notify).toHaveBeenCalledWith("Could not export 'shop' as a web page:\nNo viewer page at /x/index.html");
  });

  it('downloads nothing when the answer is not the JSON it expects', async () => {
    const apiFetch = vi.fn(async () => new Response('Not found', { status: 404 }));
    const notify = vi.fn();
    setHost({ ...defaultHost, apiFetch, notify });
    await downloadPage('shop');
    expect(saved).toEqual([]);
    expect(notify).toHaveBeenCalledWith("Could not export 'shop' as a web page.");
  });
});
