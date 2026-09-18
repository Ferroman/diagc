// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { model, type DiagramModel, type EditorCommand } from '@diagramming/core';
import { FishbonePanel } from './FishbonePanel';

function fish(): DiagramModel {
  const m = model('f');
  const fb = m.fishbone('e', 'Effect');
  fb.category('c', 'Code').cause('a', 'A').cause('a1', 'A1');
  return m.toJSON();
}
const empty = (): DiagramModel => ({ version: 1, id: 'f', name: 'f', notation: 'fishbone', nodes: [], containment: [], relations: [], layers: [], planes: [] });

function setup(m: DiagramModel, selection: { kind: 'node'; id: string } | null = null, plane?: string) {
  const onCommand = vi.fn<(c: EditorCommand) => void>();
  const onSelect = vi.fn();
  const onCreated = vi.fn();
  render(<FishbonePanel model={m} selection={selection} {...(plane !== undefined ? { plane } : {})} onCommand={onCommand} onSelect={onSelect} onCreated={onCreated} />);
  return { onCommand, onSelect, onCreated };
}

describe('FishbonePanel', () => {
  it('offers an effect first, then the presets, then children', () => {
    setup(empty());
    // No @testing-library/jest-dom in this repo (see SecondOrderPanel.test.tsx),
    // so "enabled"/"disabled" are read off the element directly.
    expect((screen.getByRole('button', { name: 'Add an effect' }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole('button', { name: 'Software' })).toBeNull();
  });

  it('adds an effect on the panel plane, selecting and opening it for typing', () => {
    const { onCommand, onSelect, onCreated } = setup(empty(), null, 'p');
    fireEvent.click(screen.getByRole('button', { name: 'Add an effect' }));
    expect(onCommand.mock.calls[0]?.[0]).toMatchObject({ type: 'add-node', node: { type: 'fb-effect', plane: 'p' } });
    expect(onSelect).toHaveBeenCalledWith('effect');
    expect(onCreated).toHaveBeenCalledWith('effect');
  });

  it('seeds a preset while the effect has no categories, selecting and naming nothing', () => {
    const m = model('f');
    m.fishbone('e', 'Effect');
    const { onCommand, onCreated } = setup(m.toJSON());
    expect(screen.queryByRole('button', { name: 'Add an effect' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '6M' }));
    expect(onCommand).toHaveBeenCalledWith(expect.objectContaining({ type: 'batch' }));
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('adds a category to the effect with nothing selected, hiding the presets once the fish has bones', () => {
    const m = fish();
    const s1 = setup(m);
    expect(screen.queryByRole('button', { name: 'Software' })).toBeNull(); // the fish already has bones
    // Nothing selected: the button still targets the effect, and the copy says
    // so rather than implying a selection is required (both button and Tab).
    expect(screen.getByText('Adds a category to the effect.')).toBeTruthy();
    expect(screen.getByText(/Select a bone or a cause, and the button \(or Tab\) hangs something on it instead\./)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add a category' }));
    expect(s1.onCommand.mock.calls[0]?.[0]).toMatchObject({ commands: [{ node: { type: 'fb-category' } }, { to: 'e' }] });
    expect(s1.onSelect).toHaveBeenCalledWith('category');
    expect(s1.onCreated).toHaveBeenCalledWith('category');
  });

  it('labels the child by the selection and disables it on a sub-cause with the limit as the hint', () => {
    const m = fish();
    const { unmount } = render(<FishbonePanel model={m} selection={{ kind: 'node', id: 'c' }} onCommand={vi.fn()} onSelect={vi.fn()} onCreated={vi.fn()} />);
    expect((screen.getByRole('button', { name: 'Add a cause' }) as HTMLButtonElement).disabled).toBe(false);
    unmount();
    render(<FishbonePanel model={m} selection={{ kind: 'node', id: 'a1' }} onCommand={vi.fn()} onSelect={vi.fn()} onCreated={vi.fn()} />);
    expect((screen.getByRole('button', { name: 'Add a cause' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/three levels below the effect is the limit/)).toBeTruthy();
  });

  it('lists the notation issues, node ones as buttons that select', () => {
    const m = fish();
    const stray: DiagramModel = { ...m, nodes: [...m.nodes, { id: 'loose', name: 'Loose', type: 'fb-cause' }] };
    const { onSelect } = setup(stray);
    fireEvent.click(screen.getByRole('button', { name: /'loose' does not reach the effect/ }));
    expect(onSelect).toHaveBeenCalledWith('loose');
  });
});
