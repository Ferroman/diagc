// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

// What a returning user's browser already holds: every key the studio persists,
// seeded in its stored format before mount, comes back as the same choice and is
// written back in that format. A renamed key or a changed format would lose
// everyone's docks, hotkeys and style on the next upgrade, with no error anywhere.

const model = (name: string) => ({
  version: 1,
  id: name,
  name,
  nodes: [{ id: 'a', name: 'a', type: 'service' }],
  containment: [],
  relations: [],
  layers: [],
  planes: [],
});
const NAMES = ['one', 'docs/two', 'misc/three'];

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  localStorage.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/diagrams')
        return new Response(
          JSON.stringify({ diagrams: NAMES.map((n) => ({ name: n, model: model(n), issues: [], editable: true })) }),
        );
      if (url === '/api/layouts') return new Response(JSON.stringify({ layouts: {} }));
      if (url === '/api/drawings') return new Response(JSON.stringify({ drawings: {} }));
      return new Response(JSON.stringify({ ok: true }));
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const seed = (entries: Record<string, string>) => {
  for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
};
const dock = (side: 'left' | 'right') => document.querySelector<HTMLElement>(`.dock-${side}`)!;
const dockWidth = (side: 'left' | 'right') =>
  document.querySelector<HTMLElement>(`.dock-${side} .dock-body`)?.style.width;
const snapChip = () => screen.getByRole('button', { name: 'Snap to grid' });
const mount = async () => {
  render(<App />);
  await screen.findByRole('button', { name: 'Diagram: docs/two' });
};

describe('persisted viewer state', () => {
  // Breaks if a key is renamed, a reader stops accepting the stored format
  // ('true', 'collapsed', a plain number, a JSON object), or the dock widths stop
  // being clamped on the way in.
  it('reads every key from its stored format', async () => {
    seed({
      'diagc.selected': 'docs/two',
      'diagc.style': 'blueprint',
      'diagc.snap': 'true',
      'diagc.hotkeys': JSON.stringify({ 'window.snap': ['Q'] }),
      'diagc.leftDock': 'collapsed',
      'diagc.rightDock': 'expanded',
      'diagc.rightDockWidth': '999',
      'diagc.pickerCollapsed': JSON.stringify(['misc']),
    });
    await mount();
    expect(snapChip().getAttribute('aria-pressed')).toBe('true');
    expect(snapChip().title.endsWith(' (Q)')).toBe(true);
    expect(dock('left').classList.contains('collapsed')).toBe(true);
    expect(dock('right').classList.contains('collapsed')).toBe(false);
    expect(dockWidth('right')).toBe('560px');
    expect((screen.getByRole('combobox', { name: 'Style' }) as HTMLSelectElement).value).toBe('blueprint');
    fireEvent.click(screen.getByRole('button', { name: 'Diagram: docs/two' }));
    const list = within(screen.getByRole('listbox', { name: 'Diagrams' }));
    const listed = list.getAllByRole('option').map((o) => o.getAttribute('data-name'));
    expect(listed).toEqual(['one', 'docs/two']);
  });

  // Breaks if the left dock's width is read from the right dock's key (or the
  // reverse), or the collapse flags swap sides.
  it('keeps the two docks apart', async () => {
    seed({
      'diagc.selected': 'docs/two',
      'diagc.leftDock': 'expanded',
      'diagc.leftDockWidth': '250',
      'diagc.rightDock': 'collapsed',
      'diagc.rightDockWidth': '400',
    });
    await mount();
    expect(dock('left').classList.contains('collapsed')).toBe(false);
    expect(dockWidth('left')).toBe('250px');
    expect(dock('right').classList.contains('collapsed')).toBe(true);
  });

  // Breaks if a garbage value stops falling back to the default (a NaN width, a
  // blank style select, a crash on unparseable JSON).
  it('falls back to the defaults on values it cannot read', async () => {
    seed({
      'diagc.selected': 'docs/two',
      'diagc.style': 'retired-style',
      'diagc.snap': 'yes',
      'diagc.hotkeys': '{not json',
      'diagc.leftDock': 'sideways',
      'diagc.leftDockWidth': 'wide',
      'diagc.rightDockWidth': 'narrow',
    });
    await mount();
    expect(snapChip().getAttribute('aria-pressed')).toBe('false');
    expect(dock('left').classList.contains('collapsed')).toBe(false);
    expect(dockWidth('left')).toBe('300px');
    expect(dockWidth('right')).toBe('320px');
    expect((screen.getByRole('combobox', { name: 'Style' }) as HTMLSelectElement).value).toBe('clean');
  });

  // Breaks if a writer changes format: the docks back to booleans, widths to
  // anything but a plain number, the hotkeys to anything but the overrides JSON.
  it('writes each key back in the format it reads', async () => {
    seed({
      'diagc.selected': 'docs/two',
      'diagc.style': 'blueprint',
      'diagc.hotkeys': JSON.stringify({ 'window.snap': ['Q'] }),
      'diagc.rightDockWidth': '999',
    });
    await mount();
    await waitFor(() => expect(localStorage.getItem('diagc.leftDock')).toBe('expanded'));
    expect(localStorage.getItem('diagc.rightDock')).toBe('expanded');
    expect(localStorage.getItem('diagc.leftDockWidth')).toBe('300');
    expect(localStorage.getItem('diagc.rightDockWidth')).toBe('560');
    expect(localStorage.getItem('diagc.snap')).toBe('false');
    expect(localStorage.getItem('diagc.style')).toBe('blueprint');
    expect(localStorage.getItem('diagc.hotkeys')).toBe(JSON.stringify({ 'window.snap': ['Q'] }));
    expect(localStorage.getItem('diagc.selected')).toBe('docs/two');

    act(() => fireEvent.click(dock('left').querySelector('.dock-toggle')!));
    act(() => fireEvent.click(snapChip()));
    expect(localStorage.getItem('diagc.leftDock')).toBe('collapsed');
    expect(localStorage.getItem('diagc.snap')).toBe('true');
  });

  // Breaks if the theme starts persisting: a host seeds it (Obsidian passes the
  // vault's) and a stored copy would fight that seed on the next mount.
  it('does not persist the theme', async () => {
    seed({ 'diagc.selected': 'docs/two' });
    await mount();
    const before = Object.keys(localStorage).sort();
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Switch to light theme' })));
    expect(screen.getByRole('button', { name: 'Switch to dark theme' })).not.toBeNull();
    expect(Object.keys(localStorage).sort()).toEqual(before);
    expect(before.filter((k) => k.includes('theme'))).toEqual([]);
  });
});
