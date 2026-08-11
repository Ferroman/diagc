// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readImageSize, uploadAsset } from './images';

describe('image helpers', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uploads raw bytes with the file content type and returns the asset name', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ name: 'abc123def456.png' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const file = new File(['bytes'], 'logo.png', { type: 'image/png' });
    expect(await uploadAsset(file)).toBe('abc123def456.png');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/assets');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['content-type']).toBe('image/png');
  });

  it('throws the server issue message on a failed upload', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ issues: [{ message: 'too big' }] }), { status: 400 })),
    );
    await expect(uploadAsset(new File(['x'], 'x.png', { type: 'image/png' }))).rejects.toThrow('too big');
  });

  it('resolves null under jsdom (no image decoding) so callers fall back to the default size', async () => {
    expect(await readImageSize(new File(['x'], 'x.png', { type: 'image/png' }))).toBeNull();
  });
});
