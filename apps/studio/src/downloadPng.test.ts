// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LayoutApi } from '@diagc/renderer';
import { defaultHost, setHost } from './host';
import { downloadPng, pngFileName } from './downloadPng';

describe('pngFileName', () => {
  it('uses the diagram name without its folder', () => {
    expect(pngFileName('docs/activity')).toBe('activity.png');
    expect(pngFileName('shop')).toBe('shop.png');
    expect(pngFileName('')).toBe('diagram.png');
  });
});

describe('downloadPng', () => {
  afterEach(() => {
    setHost(defaultHost);
    vi.restoreAllMocks();
  });

  it('downloads the canvas PNG under the diagram name', async () => {
    const blob = new Blob(['png'], { type: 'image/png' });
    const api = { exportPng: vi.fn(async () => blob) } as unknown as LayoutApi;
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('shop.png');
      expect(this.href).toBe('blob:x');
    });
    await downloadPng(api, 'shop');
    expect(click).toHaveBeenCalledOnce();
  });

  it('says so instead of downloading an empty file when nothing is laid out', async () => {
    const notify = vi.fn();
    setHost({ ...defaultHost, notify });
    await downloadPng({ exportPng: async () => null } as unknown as LayoutApi, 'shop');
    expect(notify).toHaveBeenCalled();
  });
});
