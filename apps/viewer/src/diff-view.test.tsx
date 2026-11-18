// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DiagramModel, DiffMarks } from '@diagc/core/internal';
import {
  DiffSwitches,
  hostClass,
  isDiffFocus,
  openingDiffPlane,
  planeCounts,
  planFocus,
  SHOW_ALL,
  shownMarks,
  statusCounts,
} from './diff-view';
import { Viewer } from './Viewer';

/** Two planes over the same three boxes: `all` draws the base relation, `run` the layered ones. */
const planed = (): DiagramModel => ({
  version: 1,
  id: 'd',
  name: 'd',
  nodes: [
    { id: 'a', name: 'Alpha', type: 'service' },
    { id: 'b', name: 'Beta', type: 'service' },
    { id: 'c', name: 'Gamma', type: 'service' },
  ],
  containment: [],
  relations: [
    { id: 'base', from: 'a', to: 'b', kind: 'sync' },
    { id: 'step', from: 'b', to: 'c', kind: 'sync', layer: 'steps' },
    { id: 'old', from: 'a', to: 'c', kind: 'sync', layer: 'steps' },
  ],
  layers: [{ id: 'steps', name: 'Steps' }],
  planes: [
    { id: 'all', name: 'All' },
    { id: 'run', name: 'Run', containmentOf: 'all', layers: ['steps'], baseRelations: false },
  ],
});
const marks = (): DiffMarks => ({ nodes: { c: 'changed' }, relations: { step: 'added', old: 'removed' } });

describe('shownMarks', () => {
  it('keeps every mark while every switch is on', () => {
    expect(shownMarks(marks(), SHOW_ALL)).toEqual(marks());
  });

  it('drops a switched-off kind, but never the removed: that one is hidden, not unmarked', () => {
    const off = { ...SHOW_ALL, added: false, changed: false, removed: false };
    expect(shownMarks(marks(), off)).toEqual({ nodes: {}, relations: { old: 'removed' } });
  });
});

describe('hostClass', () => {
  it('is nothing at rest, and names the switches that change the picture by class', () => {
    expect(hostClass(SHOW_ALL)).toBeUndefined();
    expect(hostClass({ ...SHOW_ALL, removed: false })).toBe('dg-diff-hide-removed');
    expect(hostClass({ ...SHOW_ALL, removed: false, dim: true })).toBe('dg-diff-hide-removed dg-diff-dim');
    // added and changed act on the marks, not on a class
    expect(hostClass({ ...SHOW_ALL, added: false, changed: false })).toBeUndefined();
  });
});

describe('the counts', () => {
  it('counts each plane by what its opening view shows', () => {
    expect(planeCounts(planed(), marks())).toEqual({ all: 1, run: 3 });
    expect(statusCounts(planed(), marks(), 'all')).toEqual({ added: 0, removed: 0, changed: 1 });
    expect(statusCounts(planed(), marks(), 'run')).toEqual({ added: 1, removed: 1, changed: 1 });
  });

  it('opens on the first plane that shows a change', () => {
    expect(openingDiffPlane(planed(), marks())).toBe('all');
    expect(openingDiffPlane(planed(), { nodes: {}, relations: { step: 'added' } })).toBe('run');
    expect(openingDiffPlane({ ...planed(), planes: [] }, marks())).toBeUndefined();
  });
});

describe('planFocus', () => {
  const focus = (target: object) => ({ type: 'diagc-diff-focus' as const, ...target });

  it('stays on the plane that already shows the element', () => {
    expect(planFocus(planed(), marks(), focus({ node: 'c' }), 'all')).toEqual({ nodes: ['c'], status: 'changed' });
  });

  it('moves to the first plane that shows a relation, and aims at both its ends', () => {
    expect(planFocus(planed(), marks(), focus({ relation: 'step' }), 'all')).toEqual({
      nodes: ['b', 'c'],
      status: 'added',
      plane: 'run',
    });
  });

  it('switches to a plane asked for by id, and ignores one the model lacks', () => {
    expect(planFocus(planed(), marks(), focus({ plane: 'run' }), 'all')).toEqual({ plane: 'run', nodes: [] });
    expect(planFocus(planed(), marks(), focus({ plane: 'nope' }), 'all')).toEqual({ nodes: [] });
  });

  it('aims at nothing for a relation the model does not have', () => {
    expect(planFocus(planed(), marks(), focus({ relation: 'nope' }), 'all')).toEqual({ nodes: [] });
  });

  it('knows its message from any other', () => {
    expect(isDiffFocus({ type: 'diagc-diff-focus', node: 'a' })).toBe(true);
    expect(isDiffFocus({ type: 'other' })).toBe(false);
    expect(isDiffFocus(null)).toBe(false);
    expect(isDiffFocus('diagc-diff-focus')).toBe(false);
  });
});

describe('DiffSwitches', () => {
  it('shows each kind with its count, pressed while on, and reports the one clicked', () => {
    const onToggle = vi.fn();
    render(
      <DiffSwitches
        show={{ ...SHOW_ALL, removed: false }}
        counts={{ added: 2, removed: 1, changed: 0 }}
        onToggle={onToggle}
        first
      />,
    );
    const group = within(screen.getByRole('group', { name: 'Changes' }));
    expect(group.getByRole('button', { name: 'Added 2' }).getAttribute('aria-pressed')).toBe('true');
    expect(group.getByRole('button', { name: 'Removed 1' }).getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(group.getByRole('button', { name: 'Changed 0' }));
    fireEvent.click(group.getByRole('button', { name: 'Dim the rest' }));
    expect(onToggle.mock.calls).toEqual([['changed'], ['dim']]);
  });
});

describe('a combined diff page', () => {
  const page = (m = planed(), ms = marks()) => (
    <Viewer data={{ model: m, diff: { marks: ms, combined: { planes: { run: 'added' } } } }} />
  );
  const node = (container: HTMLElement, id: string) => container.querySelector(`.react-flow__node[data-id="${id}"]`);

  it('shows the switches and each plane with its number of changes', async () => {
    render(page());
    const planes = within(await screen.findByRole('group', { name: 'Plane' }));
    expect(planes.getByRole('button', { name: 'All 1' }).getAttribute('aria-pressed')).toBe('true');
    expect(planes.getByRole('button', { name: 'Run 3' }).getAttribute('title')).toBe('Run (added)');
    expect(screen.getByRole('button', { name: 'Changed 1' })).toBeDefined();
  });

  it('opens on the first plane with a change, not on the first plane', async () => {
    render(page(planed(), { nodes: {}, relations: { step: 'added' } }));
    const planes = within(await screen.findByRole('group', { name: 'Plane' }));
    expect(planes.getByRole('button', { name: 'Run 1' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('takes the outline off a kind switched off, and hides the removed by class', async () => {
    const { container } = render(page());
    await waitFor(() => expect(node(container, 'c')?.classList.contains('dg-diff-changed')).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: 'Changed 1' }));
    await waitFor(() => expect(node(container, 'c')?.classList.contains('dg-diff-changed')).toBe(false));
    expect(container.querySelector('.dg-diff-hide-removed')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Removed 0' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dim the rest' }));
    expect(container.querySelector('.dg-diff-hide-removed.dg-diff-dim')).not.toBeNull();
  });

  it('switches to the plane that shows the relation the overview asks for', async () => {
    render(page());
    await screen.findByRole('group', { name: 'Plane' });
    act(() => {
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'diagc-diff-focus', relation: 'step' } }));
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Run 3' }).getAttribute('aria-pressed')).toBe('true'),
    );
    // the plane's own counts follow
    expect(screen.getByRole('button', { name: 'Added 1' })).toBeDefined();
  });

  it('has no switches on a single side, nor in its own export render', async () => {
    const { unmount } = render(<Viewer data={{ model: planed(), diff: { marks: marks() } }} />);
    await screen.findByRole('group', { name: 'Plane' });
    expect(screen.queryByRole('group', { name: 'Changes' })).toBeNull();
    unmount();
    render(<Viewer data={{ model: planed(), diff: { marks: marks(), combined: { planes: {} } } }} expandAll />);
    expect(screen.queryByRole('group', { name: 'Changes' })).toBeNull();
  });
});
