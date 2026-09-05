// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultHost, getHost, setHost } from './host';

describe('host adapter', () => {
  afterEach(() => {
    setHost(defaultHost); // restore in case a test forgot
    vi.restoreAllMocks();
  });

  it('default apiFetch delegates to window.fetch so test mocks keep working', async () => {
    const spy = vi.spyOn(window, 'fetch').mockResolvedValue(new Response('{}'));
    await getHost().apiFetch('/api/diagrams');
    expect(spy).toHaveBeenCalledWith('/api/diagrams', undefined);
  });

  it('setHost swaps the adapter and can be restored', async () => {
    const calls: string[] = [];
    setHost({ ...defaultHost, apiFetch: async (u) => { calls.push(u); return new Response('{}'); } });
    await getHost().apiFetch('/x');
    setHost(defaultHost);
    expect(calls).toEqual(['/x']);
  });
});
