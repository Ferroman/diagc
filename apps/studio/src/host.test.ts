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

  it('default promptText delegates to window.prompt, passing the initial value', async () => {
    const spy = vi.spyOn(window, 'prompt').mockReturnValue('picked');
    await expect(getHost().promptText('Name?', 'seed')).resolves.toBe('picked');
    expect(spy).toHaveBeenCalledWith('Name?', 'seed');
  });

  it('default promptText resolves null on cancel, like window.prompt', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue(null);
    await expect(getHost().promptText('Name?')).resolves.toBeNull();
  });

  it('default confirmDialog delegates to window.confirm', async () => {
    const spy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await expect(getHost().confirmDialog('Sure?')).resolves.toBe(true);
    expect(spy).toHaveBeenCalledWith('Sure?');
  });

  it('default notify delegates to window.alert', () => {
    const spy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    getHost().notify('saved');
    expect(spy).toHaveBeenCalledWith('saved');
  });
});
