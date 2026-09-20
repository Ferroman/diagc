// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DiagramPicker } from './DiagramPicker';

const NAMES = ['acme', 'docs/c4', 'docs/fishbone', 'team/roadmap', 'test'];
// Root diagrams lead, then folders — the order rows appear in, and the order
// the arrow keys walk.
const LISTED = ['acme', 'test', 'docs/c4', 'docs/fishbone', 'team/roadmap'];

const trigger = () => screen.getByRole('button', { name: /^Diagram:/ });
const search = () => screen.getByRole('combobox', { name: 'Search diagrams' });
const optionNames = () => screen.getAllByRole('option').map((o) => o.getAttribute('data-name'));

function open(selected = 'acme', onSelect = vi.fn()) {
  render(<DiagramPicker names={NAMES} selected={selected} onSelect={onSelect} />);
  fireEvent.click(trigger());
  return onSelect;
}

beforeEach(() => localStorage.clear());

describe('DiagramPicker', () => {
  it('names the current diagram on the trigger and stays closed until asked', () => {
    render(<DiagramPicker names={NAMES} selected="docs/c4" onSelect={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Diagram: docs/c4' })).not.toBeNull();
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('shows a placeholder while nothing is selected (empty workspace, pre-boot)', () => {
    render(<DiagramPicker names={[]} selected="" onSelect={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Diagram: none' }).textContent).toContain('No diagram');
  });

  it('opens with the search focused and every diagram listed under its folder', () => {
    open();
    expect(document.activeElement).toBe(search());
    expect(optionNames()).toEqual(LISTED);
    const docs = screen.getByRole('group', { name: 'docs' });
    expect(within(docs).getAllByRole('option')).toHaveLength(2);
  });

  it('narrows the list as the query is typed', () => {
    open();
    fireEvent.change(search(), { target: { value: 'docs fish' } });
    expect(optionNames()).toEqual(['docs/fishbone']);
    expect(screen.queryByRole('group', { name: 'team' })).toBeNull();
  });

  it('says so when nothing matches', () => {
    open();
    fireEvent.change(search(), { target: { value: 'zzz' } });
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByText('No diagrams match')).not.toBeNull();
  });

  it('picks a clicked diagram and closes', () => {
    const onSelect = open();
    fireEvent.click(screen.getByRole('option', { name: 'fishbone' }));
    expect(onSelect).toHaveBeenCalledWith('docs/fishbone');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('closes without reselecting when the current diagram is picked', () => {
    const onSelect = open('acme');
    fireEvent.click(screen.getByRole('option', { name: 'acme' }));
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('starts the keyboard cursor on the current diagram', () => {
    open('docs/fishbone');
    const active = search().getAttribute('aria-activedescendant');
    expect(document.getElementById(active!)?.getAttribute('data-name')).toBe('docs/fishbone');
  });

  it('walks rows with the arrows and picks with Enter', () => {
    const onSelect = open('acme');
    for (const key of ['ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowUp', 'Enter']) fireEvent.keyDown(search(), { key });
    expect(onSelect).toHaveBeenCalledWith('docs/c4');
  });

  it('stops at the ends instead of wrapping', () => {
    const onSelect = open('acme');
    fireEvent.keyDown(search(), { key: 'ArrowUp' });
    fireEvent.keyDown(search(), { key: 'Enter' });
    expect(onSelect).not.toHaveBeenCalled(); // still on acme, the current diagram
  });

  it('moves the cursor to the first match when the query changes', () => {
    const onSelect = open('test');
    fireEvent.change(search(), { target: { value: 'road' } });
    fireEvent.keyDown(search(), { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith('team/roadmap');
  });

  it('closes on Escape and hands focus back to the trigger', () => {
    open();
    fireEvent.keyDown(search(), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('closes on a press outside the picker', () => {
    open();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('toggles with Ctrl+K and Cmd+K when nothing in particular has focus', () => {
    render(<DiagramPicker names={NAMES} selected="acme" onSelect={vi.fn()} />);
    fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true });
    expect(screen.queryByRole('listbox')).not.toBeNull();
    // focus now sits in the search box, inside the picker
    fireEvent.keyDown(search(), { key: 'k', metaKey: true });
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('takes the chord from anywhere inside the studio shell', () => {
    render(
      <div className="app">
        <input aria-label="elsewhere in the studio" />
        <DiagramPicker names={NAMES} selected="acme" onSelect={vi.fn()} />
      </div>,
    );
    fireEvent.keyDown(screen.getByLabelText('elsewhere in the studio'), { key: 'k', ctrlKey: true });
    expect(screen.queryByRole('listbox')).not.toBeNull();
  });

  it('leaves the chord alone when it comes from outside the studio', () => {
    // The Obsidian host mounts the studio inside Obsidian's own window, where
    // Cmd+K in a note is "insert link" — typing there must not pop the picker.
    render(
      <>
        <textarea aria-label="a note in the host" />
        <div className="app">
          <DiagramPicker names={NAMES} selected="acme" onSelect={vi.fn()} />
        </div>
      </>,
    );
    const note = screen.getByLabelText('a note in the host');
    const notPrevented = fireEvent.keyDown(note, { key: 'k', metaKey: true });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(notPrevented).toBe(true);
  });

  it('leaves a bare K alone', () => {
    render(<DiagramPicker names={NAMES} selected="acme" onSelect={vi.fn()} />);
    fireEvent.keyDown(document.body, { key: 'k' });
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  describe('collapsing', () => {
    it('hides a folder behind its header and skips it with the arrows', () => {
      const onSelect = open('acme');
      fireEvent.click(screen.getByRole('button', { name: 'docs' }));
      expect(optionNames()).toEqual(['acme', 'test', 'team/roadmap']);
      expect(screen.getByRole('button', { name: 'docs' }).getAttribute('aria-expanded')).toBe('false');
      fireEvent.keyDown(search(), { key: 'ArrowDown' });
      fireEvent.keyDown(search(), { key: 'ArrowDown' });
      fireEvent.keyDown(search(), { key: 'Enter' });
      expect(onSelect).toHaveBeenCalledWith('team/roadmap');
    });

    it('remembers the collapsed folders across mounts', () => {
      const first = render(<DiagramPicker names={NAMES} selected="acme" onSelect={vi.fn()} />);
      fireEvent.click(trigger());
      fireEvent.click(screen.getByRole('button', { name: 'docs' }));
      first.unmount();

      open('acme');
      expect(optionNames()).toEqual(['acme', 'test', 'team/roadmap']);
    });

    it('ignores collapse while searching, so a match is never hidden', () => {
      open('acme');
      fireEvent.click(screen.getByRole('button', { name: 'docs' }));
      fireEvent.change(search(), { target: { value: 'c4' } });
      expect(optionNames()).toEqual(['docs/c4']);
    });

    it("re-opens the current diagram's folder so the cursor has somewhere to land", () => {
      localStorage.setItem('diagramming.pickerCollapsed', JSON.stringify(['docs']));
      open('docs/c4');
      expect(optionNames()).toContain('docs/c4');
    });

    it('survives a corrupt stored value', () => {
      localStorage.setItem('diagramming.pickerCollapsed', '{not json');
      open('acme');
      expect(optionNames()).toEqual(LISTED);
    });
  });
});
