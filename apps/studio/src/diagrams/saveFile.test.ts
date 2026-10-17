// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { exportFileName, saveFile } from './saveFile';

describe('exportFileName', () => {
  it('uses the diagram name without its folder', () => {
    expect(exportFileName('docs/activity', 'png')).toBe('activity.png');
    expect(exportFileName('shop', 'html')).toBe('shop.html');
    expect(exportFileName('', 'png')).toBe('diagram.png');
  });
});

describe('saveFile', () => {
  afterEach(() => vi.restoreAllMocks());

  it('downloads the blob under the name, then lets its object URL go', async () => {
    const blob = new Blob(['x']);
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('shop.html');
      expect(this.href).toBe('blob:x');
    });
    saveFile(blob, 'shop.html');
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    expect(click).toHaveBeenCalledOnce();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:x');
  });
});
