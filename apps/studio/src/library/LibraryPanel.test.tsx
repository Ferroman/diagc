// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LIBRARY_ENTRY_DND_TYPE } from '@diagramming/renderer';
import { defaultHost, setHost } from '../host';
import { LibraryPanel } from './LibraryPanel';
import type { Library } from './types';

const library: Library = {
  categories: [{ id: 'c4', name: 'C4', builtin: true }, { id: 'aws', name: 'AWS', builtin: true }],
  entries: [
    { id: 'c4-person', category: 'c4', name: 'Person', keywords: ['actor'], template: { type: 'person', color: '#08427b' } },
    { id: 'aws-lambda', category: 'aws', name: 'Lambda', keywords: ['faas'], template: { type: 'image', image: '/library/aws/lambda.svg' } },
  ],
};

describe('LibraryPanel', () => {
  afterEach(() => setHost(defaultHost));

  it('lists category sections and entries', () => {
    render(<LibraryPanel library={library} onPlace={() => {}} />);
    expect(screen.getByText('C4')).toBeDefined();
    expect(screen.getByText('AWS')).toBeDefined();
    expect(screen.getByText('Person')).toBeDefined();
    expect(screen.getByText('Lambda')).toBeDefined();
  });

  it('filters entries by the search box (name/keyword/category)', () => {
    render(<LibraryPanel library={library} onPlace={() => {}} />);
    fireEvent.change(screen.getByLabelText('Search library'), { target: { value: 'faas' } });
    expect(screen.queryByText('Person')).toBeNull();
    expect(screen.getByText('Lambda')).toBeDefined();
  });

  it('places an entry on click', () => {
    const onPlace = vi.fn();
    render(<LibraryPanel library={library} onPlace={onPlace} />);
    fireEvent.click(screen.getByRole('button', { name: /place Lambda/i }));
    expect(onPlace).toHaveBeenCalledWith(library.entries[1]);
  });

  it('makes entries draggable and stashes the entry id on dragstart', () => {
    render(<LibraryPanel library={library} onPlace={() => {}} />);
    const lambda = screen.getByRole('button', { name: /place Lambda/i });
    expect(lambda.getAttribute('draggable')).toBe('true');
    const setData = vi.fn();
    fireEvent.dragStart(lambda, { dataTransfer: { setData, effectAllowed: '' } });
    expect(setData).toHaveBeenCalledWith(LIBRARY_ENTRY_DND_TYPE, 'aws-lambda');
  });

  it('renders an icon thumbnail for image entries and a swatch for shape entries', () => {
    render(<LibraryPanel library={library} onPlace={() => {}} />);
    const lambda = screen.getByRole('button', { name: /place Lambda/i });
    expect(within(lambda).getByRole('img').getAttribute('src')).toBe('/library/aws/lambda.svg');
    const person = screen.getByRole('button', { name: /place Person/i });
    expect(person.querySelector('.lib-swatch')).not.toBeNull();
    expect(within(person).queryByRole('img')).toBeNull();
  });

  it('renders a masked silhouette thumbnail for shape entries', () => {
    const withShape: Library = {
      ...library,
      entries: [...library.entries, { id: 'sh', category: 'aws', name: 'Diamond', template: { shape: '/library/shapes/person.svg', color: '#08427b' } }],
    };
    render(<LibraryPanel library={withShape} onPlace={() => {}} assetBase="/api/assets/" />);
    const btn = screen.getByRole('button', { name: /place Diamond/i });
    const thumb = btn.querySelector('.lib-shape-thumb') as HTMLElement;
    expect(thumb).not.toBeNull();
    const mask = thumb.style.maskImage || thumb.style.getPropertyValue('-webkit-mask-image');
    expect(mask).toContain('/library/shapes/person.svg');
    expect(btn.querySelector('img')).toBeNull(); // not the icon path
    expect(btn.querySelector('.lib-swatch')).toBeNull(); // not a swatch
  });

  it('substitutes the /library/ prefix in a shape thumbnail too, same as an image one', () => {
    setHost({ ...defaultHost, libraryBase: 'app://vault/plugins/diagramming-studio/library/' });
    const withShape: Library = {
      ...library,
      entries: [...library.entries, { id: 'sh', category: 'aws', name: 'Diamond', template: { shape: '/library/shapes/person.svg', color: '#08427b' } }],
    };
    render(<LibraryPanel library={withShape} onPlace={() => {}} assetBase="/api/assets/" />);
    const btn = screen.getByRole('button', { name: /place Diamond/i });
    const thumb = btn.querySelector('.lib-shape-thumb') as HTMLElement;
    const mask = thumb.style.maskImage || thumb.style.getPropertyValue('-webkit-mask-image');
    expect(mask).toContain('app://vault/plugins/diagramming-studio/library/shapes/person.svg');
  });

  it('substitutes the /library/ prefix with the host libraryBase when the host declares one', () => {
    // The Obsidian host has no static server behind '/library/…' — <img src>
    // there must be an app://... resource URL, so a host with libraryBase set
    // overrides the prefix (mirrors the renderer's own assetUrl).
    setHost({ ...defaultHost, libraryBase: 'app://vault/plugins/diagramming-studio/library/' });
    render(<LibraryPanel library={library} onPlace={() => {}} />);
    const lambda = screen.getByRole('button', { name: /place Lambda/i });
    expect(within(lambda).getByRole('img').getAttribute('src')).toBe(
      'app://vault/plugins/diagramming-studio/library/aws/lambda.svg',
    );
  });

  it('keeps /library/ refs as-is under the default host (no libraryBase)', () => {
    render(<LibraryPanel library={library} onPlace={() => {}} />);
    const lambda = screen.getByRole('button', { name: /place Lambda/i });
    expect(within(lambda).getByRole('img').getAttribute('src')).toBe('/library/aws/lambda.svg');
  });

  it('prefixes a bare (imported) icon ref with assetBase in the thumbnail', () => {
    const withImport: Library = { ...library, entries: [...library.entries, { id: 'imp-1', category: 'aws', name: 'Imported', template: { type: 'image', image: 'abc123.svg' } }] };
    render(<LibraryPanel library={withImport} onPlace={() => {}} assetBase="/api/assets/" />);
    const btn = screen.getByRole('button', { name: /place Imported/i });
    expect(within(btn).getByRole('img').getAttribute('src')).toBe('/api/assets/abc123.svg');
  });

  it('renders an Add node / Add image action row and fires them', () => {
    const onAddNode = vi.fn();
    const onAddImages = vi.fn();
    render(
      <LibraryPanel
        library={library}
        onPlace={() => {}}
        onAddNode={onAddNode}
        onAddImages={onAddImages}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add node' }));
    expect(onAddNode).toHaveBeenCalled();

    const file = new File(['x'], 'pic.png', { type: 'image/png' });
    const input = screen.getByLabelText('Add image') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    expect(onAddImages).toHaveBeenCalledWith([file]);
  });
});

describe('LibraryPanel category collapsing', () => {
  // Big enough to trip the auto-collapse threshold the AWS pack exists to exercise.
  const big: Library = {
    categories: [{ id: 'c4', name: 'C4', builtin: true }, { id: 'aws', name: 'AWS', builtin: true }],
    entries: [
      library.entries[0]!,
      ...Array.from({ length: 40 }, (_, i) => ({
        id: `aws-${i}`,
        category: 'aws',
        name: `Svc ${i}`,
        keywords: i === 7 ? ['needle'] : [],
        template: { type: 'image', image: `/library/aws/svc-${i}.svg` },
      })),
    ],
  };

  const toggle = (name: string) => screen.getByRole('button', { name });

  it('keeps a small section open and starts a large one collapsed, with a count', () => {
    render(<LibraryPanel library={big} onPlace={() => {}} />);
    expect(screen.getByText('Person')).toBeDefined();
    expect(screen.queryByText('Svc 0')).toBeNull();
    expect(toggle('C4').getAttribute('aria-expanded')).toBe('true');
    const aws = toggle('AWS');
    expect(aws.getAttribute('aria-expanded')).toBe('false');
    expect(within(aws).getByText('40')).toBeDefined();
  });

  it('expands a collapsed section on click and collapses it again', () => {
    render(<LibraryPanel library={big} onPlace={() => {}} />);
    fireEvent.click(toggle('AWS'));
    expect(screen.getByText('Svc 0')).toBeDefined();
    fireEvent.click(toggle('AWS'));
    expect(screen.queryByText('Svc 0')).toBeNull();
  });

  it('reveals matches in a collapsed section while searching', () => {
    render(<LibraryPanel library={big} onPlace={() => {}} />);
    expect(screen.queryByText('Svc 7')).toBeNull();
    fireEvent.change(screen.getByLabelText('Search library'), { target: { value: 'needle' } });
    expect(screen.getByText('Svc 7')).toBeDefined();
    expect(screen.queryByText('Svc 8')).toBeNull();
  });
});

describe('LibraryPanel apply-to-selection', () => {
  it('shows no apply toggle when no node is selected', () => {
    render(<LibraryPanel library={library} onPlace={() => {}} onApply={() => {}} />);
    expect(screen.queryByRole('button', { name: /apply to/i })).toBeNull();
  });

  it('clicking a card places (not applies) while in the default Place mode', () => {
    const onPlace = vi.fn();
    const onApply = vi.fn();
    render(<LibraryPanel library={library} onPlace={onPlace} onApply={onApply} applyTarget={{ id: 'x', name: 'ER Staff' }} />);
    fireEvent.click(screen.getByRole('button', { name: /place Lambda/i }));
    expect(onPlace).toHaveBeenCalledWith(library.entries[1]);
    expect(onApply).not.toHaveBeenCalled();
  });

  it('after switching to Apply mode, clicking a card applies it to the selection', () => {
    const onPlace = vi.fn();
    const onApply = vi.fn();
    render(<LibraryPanel library={library} onPlace={onPlace} onApply={onApply} applyTarget={{ id: 'x', name: 'ER Staff' }} />);
    fireEvent.click(screen.getByRole('button', { name: /apply to ER Staff/i }));
    fireEvent.click(screen.getByRole('button', { name: /apply Lambda/i }));
    expect(onApply).toHaveBeenCalledWith(library.entries[1]);
    expect(onPlace).not.toHaveBeenCalled();
  });
});

describe('LibraryPanel authoring', () => {
  const cbs = () => ({ onAddCategory: vi.fn(), onDeleteCategory: vi.fn(), onImportIcon: vi.fn() });

  it('adds a category via the New category control', () => {
    const c = cbs();
    render(<LibraryPanel library={library} onPlace={() => {}} {...c} />);
    fireEvent.change(screen.getByLabelText('New category name'), { target: { value: 'GCP' } });
    fireEvent.click(screen.getByRole('button', { name: /add category/i }));
    expect(c.onAddCategory).toHaveBeenCalledWith('GCP');
  });

  it('does not offer delete/import on a builtin category', () => {
    const c = cbs();
    render(<LibraryPanel library={library} onPlace={() => {}} {...c} />);
    // C4 is builtin → no delete-category button in its header
    expect(screen.queryByRole('button', { name: /delete category C4/i })).toBeNull();
  });

  it('imports an icon into a user category', () => {
    const c = cbs();
    const withGcp: Library = { categories: [...library.categories, { id: 'gcp', name: 'GCP' }], entries: library.entries };
    render(<LibraryPanel library={withGcp} onPlace={() => {}} {...c} />);
    const file = new File(['<svg/>'], 'bigquery.svg', { type: 'image/svg+xml' });
    const input = screen.getByLabelText('Import icon into GCP') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    expect(c.onImportIcon).toHaveBeenCalledWith('gcp', file);
  });

  it('deletes a user category', async () => {
    const c = cbs();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const withGcp: Library = { categories: [...library.categories, { id: 'gcp', name: 'GCP' }], entries: library.entries };
    render(<LibraryPanel library={withGcp} onPlace={() => {}} {...c} />);
    fireEvent.click(screen.getByRole('button', { name: /delete category GCP/i }));
    await waitFor(() => expect(c.onDeleteCategory).toHaveBeenCalledWith('gcp'));
  });

  it('imports an SVG as a shape into a user category', () => {
    const onImportShape = vi.fn();
    const withGcp: Library = { categories: [...library.categories, { id: 'gcp', name: 'GCP' }], entries: library.entries };
    render(<LibraryPanel library={withGcp} onPlace={() => {}} onAddCategory={vi.fn()} onDeleteCategory={vi.fn()} onImportIcon={vi.fn()} onImportShape={onImportShape} />);
    const file = new File(['<svg/>'], 'diamond.svg', { type: 'image/svg+xml' });
    fireEvent.change(screen.getByLabelText('Import shape into GCP'), { target: { files: [file] } });
    expect(onImportShape).toHaveBeenCalledWith('gcp', file);
  });
});

describe('LibraryPanel grouping', () => {
  // Mirrors the bundled shape: a small grouped pack (C4), a big grouped pack
  // (AWS, over the group auto-collapse threshold), and an ungrouped category.
  const grouped: Library = {
    categories: [
      { id: 'ctx', name: 'Context', group: 'C4 model', builtin: true },
      { id: 'cmp', name: 'Compute', group: 'AWS', builtin: true },
      { id: 'db', name: 'Database', group: 'AWS', builtin: true },
      { id: 'tech', name: 'Tech', builtin: true },
    ],
    entries: [
      { id: 'ctx-person', category: 'ctx', name: 'Person', template: { type: 'person' } },
      { id: 'tech-git', category: 'tech', name: 'Git', template: { type: 'service' } },
      ...Array.from({ length: 70 }, (_, i) => ({
        id: `aws-${i}`,
        category: i % 2 === 0 ? 'cmp' : 'db',
        name: `Svc ${i}`,
        keywords: i === 7 ? ['needle'] : [],
        template: { type: 'image', image: `/library/aws/svc-${i}.svg` },
      })),
    ],
  };

  const toggle = (name: string) => screen.getByRole('button', { name });

  it('opens a small group with its member categories, collapses a big one to a counted header', () => {
    render(<LibraryPanel library={grouped} onPlace={() => {}} />);
    // small group: header open, member category and its entries visible
    expect(toggle('C4 model').getAttribute('aria-expanded')).toBe('true');
    expect(toggle('Context')).toBeDefined();
    expect(screen.getByText('Person')).toBeDefined();
    // big group: one header, total count, no member category headers
    const aws = toggle('AWS');
    expect(aws.getAttribute('aria-expanded')).toBe('false');
    expect(within(aws).getByText('70')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Compute' })).toBeNull();
    expect(screen.queryByText('Svc 0')).toBeNull();
    // ungrouped category renders top-level, untouched
    expect(toggle('Tech')).toBeDefined();
    expect(screen.getByText('Git')).toBeDefined();
  });

  it('expands a collapsed group to its member sections and collapses it again', () => {
    render(<LibraryPanel library={grouped} onPlace={() => {}} />);
    fireEvent.click(toggle('AWS'));
    // members are visible; the big ones follow their own size-based default
    expect(toggle('Compute')).toBeDefined();
    expect(toggle('Database')).toBeDefined();
    fireEvent.click(toggle('AWS'));
    expect(screen.queryByRole('button', { name: 'Compute' })).toBeNull();
  });

  it('search reveals a hit inside a collapsed group and hides groups without hits', () => {
    render(<LibraryPanel library={grouped} onPlace={() => {}} />);
    fireEvent.change(screen.getByLabelText('Search library'), { target: { value: 'needle' } });
    expect(screen.getByText('Svc 7')).toBeDefined();
    expect(screen.queryByText('Svc 8')).toBeNull();
    // the C4 group has no hit — its header vanishes with its sections
    expect(screen.queryByRole('button', { name: 'C4 model' })).toBeNull();
  });
});
