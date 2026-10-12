import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultHost, setHost } from '../host';
import { libraryImports } from './libraryImports';
import type { Library } from './types';

/** an assets endpoint that answers `respond` */
const assets = (respond: () => Response) =>
  setHost({ ...defaultHost, apiFetch: vi.fn(async () => respond()) as typeof defaultHost.apiFetch });

afterEach(() => setHost(defaultHost));

const library: Library = {
  categories: [{ id: 'mine', name: 'Mine' }],
  entries: [{ id: 'logo-png', category: 'mine', name: 'logo', template: { type: 'image' } }],
};
const setup = () => {
  const lib = { library, addEntry: vi.fn() };
  const reportIssues = vi.fn();
  return { lib, reportIssues, imports: libraryImports(lib, reportIssues) };
};
const png = (name: string) => new File(['x'], name, { type: 'image/png' });

describe('libraryImports', () => {
  it('adds an uploaded icon as a 64px image entry under a fresh id, named after the file', async () => {
    // Breaks if an icon's id can collide with an entry already there, or it
    // loses the fixed footprint an icon places with.
    assets(() => new Response(JSON.stringify({ name: 'abc.png' })));
    const { lib, imports } = setup();
    await imports.importLibraryIcon('mine', png('logo.png'));
    expect(lib.addEntry).toHaveBeenCalledWith({
      id: expect.stringMatching(/^logo-png.+/),
      category: 'mine',
      name: 'logo',
      template: { type: 'image', image: 'abc.png', width: 64, height: 64 },
    });
  });

  it('adds an uploaded shape with no size of its own', async () => {
    // Breaks if a shape is given an icon's fixed footprint.
    assets(() => new Response(JSON.stringify({ name: 'blob.svg' })));
    const { lib, imports } = setup();
    await imports.importLibraryShape('mine', new File(['<svg/>'], 'blob.svg', { type: 'image/svg+xml' }));
    expect(lib.addEntry).toHaveBeenCalledWith({
      id: 'blob-svg',
      category: 'mine',
      name: 'blob',
      template: { shape: 'blob.svg' },
    });
  });

  it('puts a failed upload in the banner and adds nothing', async () => {
    // Breaks if an upload failure escapes as an unhandled rejection.
    assets(() => new Response(JSON.stringify({ issues: [{ message: 'too big' }] }), { status: 413 }));
    const { lib, reportIssues, imports } = setup();
    await imports.importLibraryIcon('mine', png('huge.png'));
    await imports.importLibraryShape('mine', png('huge.png'));
    expect(lib.addEntry).not.toHaveBeenCalled();
    expect(reportIssues).toHaveBeenCalledTimes(2);
    expect(reportIssues).toHaveBeenLastCalledWith([{ message: 'too big' }]);
  });
});
