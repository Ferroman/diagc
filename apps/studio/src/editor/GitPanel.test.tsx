// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { applyCommand, emptyDrawings, emptyLayout, model, type DiagramModel, type EditorCommand, type EditorState } from '@diagramming/core';
import { GitPanel } from './GitPanel';

/** master: 1.0; nightly: n1 (from 1.0) */
function gitModel(): DiagramModel {
  const m = model('g');
  const g = m.gitGraph();
  const master = g.branch('master', { name: 'Master' });
  const nightly = g.branch('nightly', { name: 'Nightly' });
  const v10 = master.commit('1.0');
  nightly.commit({ from: v10 });
  return m.toJSON();
}

const setup = (selection: { kind: 'node' | 'edge'; id: string } | null = null, m = gitModel()) => {
  const onCommand = vi.fn();
  const onSelect = vi.fn();
  render(<GitPanel model={m} plane="git-graph" selection={selection} onCommand={onCommand} onSelect={onSelect} />);
  return { onCommand, onSelect };
};

describe('GitPanel', () => {
  it('lists the lanes in order and adds a lane with a slug id', () => {
    const { onCommand } = setup();
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Master', 'Nightly']);
    fireEvent.change(screen.getByLabelText('New lane name'), { target: { value: 'Feature team 1' } });
    fireEvent.click(screen.getByRole('button', { name: /add lane/i }));
    expect(onCommand).toHaveBeenCalledWith({
      type: 'add-node',
      node: { id: 'feature-team-1', name: 'Feature team 1', type: 'branch' },
    });
  });

  it('adds a commit to a lane, chained from its latest, as one batch, and selects it', () => {
    const { onCommand, onSelect } = setup();
    fireEvent.change(screen.getByLabelText('Lane'), { target: { value: 'nightly' } });
    fireEvent.change(screen.getByLabelText('Tag'), { target: { value: 'RC1' } });
    fireEvent.change(screen.getByLabelText('Gap'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: /add commit/i }));
    expect(onCommand).toHaveBeenCalledWith({
      type: 'batch',
      commands: [
        { type: 'add-node', node: { id: 'nightly-2', name: 'RC1', type: 'commit', metadata: { gap: 2 } }, parent: { id: 'nightly', plane: 'git-graph' } },
        { type: 'add-relation', from: 'nightly-1', to: 'nightly-2', opts: { kind: 'commit' } },
      ],
    });
    expect(onSelect).toHaveBeenCalledWith('nightly-2');
  });

  it('a first commit on an empty lane has no commit link', () => {
    const m = gitModel();
    m.nodes.push({ id: 'dev', name: 'Development', type: 'branch' });
    const { onCommand } = setup(null, m);
    fireEvent.change(screen.getByLabelText('Lane'), { target: { value: 'dev' } });
    fireEvent.click(screen.getByRole('button', { name: /add commit/i }));
    expect(onCommand).toHaveBeenCalledWith({
      type: 'batch',
      commands: [{ type: 'add-node', node: { id: 'dev-1', name: '', type: 'commit' }, parent: { id: 'dev', plane: 'git-graph' } }],
    });
  });

  it('branches the selected commit into another lane', () => {
    const { onCommand } = setup({ kind: 'node', id: 'master-1' });
    fireEvent.change(screen.getByLabelText('Branch into lane'), { target: { value: 'nightly' } });
    fireEvent.click(screen.getByRole('button', { name: /^branch$/i }));
    expect(onCommand).toHaveBeenCalledWith({
      type: 'batch',
      commands: [
        { type: 'add-node', node: { id: 'nightly-2', name: '', type: 'commit' }, parent: { id: 'nightly', plane: 'git-graph' } },
        { type: 'add-relation', from: 'master-1', to: 'nightly-2', opts: { kind: 'branch' } },
      ],
    });
  });

  it('merges the selected commit into another lane, chained from that lane\'s latest', () => {
    const { onCommand } = setup({ kind: 'node', id: 'nightly-1' });
    fireEvent.change(screen.getByLabelText('Merge into lane'), { target: { value: 'master' } });
    fireEvent.change(screen.getByLabelText('Merge tag'), { target: { value: '2.0' } });
    fireEvent.click(screen.getByRole('button', { name: /^merge$/i }));
    expect(onCommand).toHaveBeenCalledWith({
      type: 'batch',
      commands: [
        { type: 'add-node', node: { id: 'master-2', name: '2.0', type: 'commit' }, parent: { id: 'master', plane: 'git-graph' } },
        { type: 'add-relation', from: 'nightly-1', to: 'master-2', opts: { kind: 'merge' } },
        { type: 'add-relation', from: 'master-1', to: 'master-2', opts: { kind: 'commit' } },
      ],
    });
  });

  it('edits the selected commit\'s gap through set-node-details, dropping the key at 0', () => {
    const { onCommand } = setup({ kind: 'node', id: 'master-1' });
    fireEvent.change(screen.getByLabelText('Commit gap'), { target: { value: '3' } });
    expect(onCommand).toHaveBeenCalledWith({ type: 'set-node-details', id: 'master-1', details: { metadata: { gap: 3 } } });
    fireEvent.change(screen.getByLabelText('Commit gap'), { target: { value: '0' } });
    expect(onCommand).toHaveBeenLastCalledWith({ type: 'set-node-details', id: 'master-1', details: { metadata: null } });
  });

  it('offers no commit actions when the selection is not a commit', () => {
    setup({ kind: 'node', id: 'master' });
    expect(screen.queryByLabelText('Branch into lane')).toBeNull();
  });

  it('resets the branch-lane choice after a successful branch, so a repeat click never targets the new selection\'s own lane', () => {
    const m = gitModel();
    m.nodes.push({ id: 'qa', name: 'QA', type: 'branch' });
    let state: EditorState = { model: m, layout: emptyLayout(), drawings: emptyDrawings() };
    const onCommand = vi.fn((cmd: EditorCommand) => {
      state = applyCommand(state, cmd);
    });
    const onSelect = vi.fn();
    const { rerender } = render(
      <GitPanel model={state.model} plane="git-graph" selection={{ kind: 'node', id: 'master-1' }} onCommand={onCommand} onSelect={onSelect} />,
    );
    // pick a lane other than the visible default (nightly) — qa
    fireEvent.change(screen.getByLabelText('Branch into lane'), { target: { value: 'qa' } });
    fireEvent.click(screen.getByRole('button', { name: /^branch$/i }));
    expect(onSelect).toHaveBeenCalledWith('qa-1');

    // the app would now re-render with the just-created commit selected
    onCommand.mockClear();
    rerender(
      <GitPanel model={state.model} plane="git-graph" selection={{ kind: 'node', id: 'qa-1' }} onCommand={onCommand} onSelect={onSelect} />,
    );
    // click Branch again WITHOUT touching the select
    fireEvent.click(screen.getByRole('button', { name: /^branch$/i }));
    expect(onCommand).toHaveBeenCalledWith({
      type: 'batch',
      commands: [
        { type: 'add-node', node: { id: 'master-2', name: '', type: 'commit' }, parent: { id: 'master', plane: 'git-graph' } },
        { type: 'add-relation', from: 'qa-1', to: 'master-2', opts: { kind: 'branch' } },
      ],
    });
  });

  it('shows the newly selected commit\'s own gap, not the previous selection\'s', () => {
    const m = gitModel();
    const master1 = m.nodes.find((n) => n.id === 'master-1')!;
    master1.metadata = { gap: 3 };
    const { rerender } = render(
      <GitPanel model={m} plane="git-graph" selection={{ kind: 'node', id: 'master-1' }} onCommand={vi.fn()} onSelect={vi.fn()} />,
    );
    expect((screen.getByLabelText('Commit gap') as HTMLInputElement).value).toBe('3');
    rerender(
      <GitPanel model={m} plane="git-graph" selection={{ kind: 'node', id: 'nightly-1' }} onCommand={vi.fn()} onSelect={vi.fn()} />,
    );
    expect((screen.getByLabelText('Commit gap') as HTMLInputElement).value).toBe('0');
  });
});
