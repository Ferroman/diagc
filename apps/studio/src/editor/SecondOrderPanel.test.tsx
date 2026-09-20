// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { model } from '@diagc/core';
import { SecondOrderPanel } from './SecondOrderPanel';

const tree = () => {
  const m = model('so');
  m.secondOrder().decision('d', 'Decide').then('a', 'A');
  return m.toJSON();
};
const setup = (selection: { kind: 'node'; id: string } | null, json = tree()) => {
  const onCommand = vi.fn();
  const onSelect = vi.fn();
  const onCreated = vi.fn();
  render(<SecondOrderPanel model={json} selection={selection} onCommand={onCommand} onSelect={onSelect} onCreated={onCreated} />);
  return { onCommand, onSelect, onCreated };
};

describe('SecondOrderPanel', () => {
  it('asks "and then what?" of the selected node, selects the answer and opens its name', () => {
    const { onCommand, onSelect, onCreated } = setup({ kind: 'node', id: 'a' });
    fireEvent.click(screen.getByRole('button', { name: 'Bad consequence' }));
    expect(onCommand).toHaveBeenCalledWith(expect.objectContaining({ type: 'batch' }));
    expect(onCommand.mock.calls[0]![0].commands[1]).toMatchObject({ from: 'a', opts: { kind: 'leads-to' } });
    expect(onSelect).toHaveBeenCalledWith('consequence');
    expect(onCreated).toHaveBeenCalledWith('consequence');
  });
  it('disables the three answers until a decision or consequence is selected', () => {
    setup(null);
    for (const name of ['Good consequence', 'Bad consequence', 'Neutral consequence']) {
      expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true);
    }
  });
  it('offers a decision, always', () => {
    const { onCommand } = setup(null);
    fireEvent.click(screen.getByRole('button', { name: 'Add a decision' }));
    expect(onCommand).toHaveBeenCalledWith({ type: 'add-node', node: { id: 'decision', name: '', type: 'so-decision' } });
  });
  it('lists what validation objects to, each a way to the node', () => {
    const json = tree();
    json.nodes.push({ id: 'lost', name: 'Lost', type: 'so-consequence-neutral' });
    const { onSelect } = setup(null, json);
    fireEvent.click(screen.getByRole('button', { name: /'lost' follows from no decision/ }));
    expect(onSelect).toHaveBeenCalledWith('lost');
  });
  it('renders so-no-decision as text, not a dead button, since its ref is the model, not a node', () => {
    // m.toJSON() validates and would throw on a decision-less model, so this
    // model is assembled by hand rather than through the builder.
    const json = tree();
    json.nodes = json.nodes.filter((n) => n.id !== 'd');
    json.relations = json.relations.filter((r) => r.from !== 'd' && r.to !== 'd');
    setup(null, json);
    const text = screen.getByText(/needs at least one decision/);
    expect(text.tagName).not.toBe('BUTTON');
    expect(screen.queryByRole('button', { name: /needs at least one decision/ })).toBeNull();
    // 'a' is a real node, so its own issue is still a button
    expect(screen.getByRole('button', { name: /'a' follows from no decision/ })).toBeInstanceOf(HTMLButtonElement);
  });
  it('tags a decision added from a plane-scoped panel with that plane', () => {
    const onCommand = vi.fn();
    render(
      <SecondOrderPanel model={tree()} selection={null} plane="p" onCommand={onCommand} onSelect={vi.fn()} onCreated={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add a decision' }));
    expect(onCommand).toHaveBeenCalledWith({
      type: 'add-node',
      node: { id: 'decision', name: '', type: 'so-decision', plane: 'p' },
    });
  });
});
