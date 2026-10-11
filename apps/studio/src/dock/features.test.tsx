// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { model } from '@diagc/core/internal';
import type { DockEntry, NotationDockContext } from '../notations/types';
import { dockPanels } from './features';

/** one activity frame, so the Activity panel has a frame to work on with nothing selected */
const framed = (() => {
  const m = model('d');
  m.activity('flow').lane('ops', { name: 'Ops' });
  return m.toJSON();
})();

const ctx = (editing: boolean): NotationDockContext => ({
  model: framed,
  editing,
  viewPlane: undefined,
  scopePlane: undefined,
  selection: null,
  today: '2026-01-20',
  onCommand: vi.fn(),
  select: vi.fn(),
  requestLabelEdit: vi.fn(),
});
const entry = (modes: DockEntry['modes']): DockEntry => ({
  modes,
  render: () => <section aria-label="Notation panel" />,
});
const landmarks = () => screen.queryAllByRole('region').map((r) => r.getAttribute('aria-label') ?? '');
const panels = () => [
  ...landmarks(),
  ...screen.queryAllByRole('complementary').map((r) => r.getAttribute('aria-label') ?? ''),
];

describe('dockPanels', () => {
  it("shows the notation's panel first, then Activity, while editing", () => {
    render(<>{dockPanels(entry('edit'), ctx(true))}</>);
    expect(panels()).toEqual(['Notation panel', 'Activity diagram']);
  });

  it('in view mode shows only a panel offered in both modes', () => {
    const { unmount } = render(<>{dockPanels(entry('edit'), ctx(false))}</>);
    expect(panels()).toEqual([]);
    unmount();
    render(<>{dockPanels(entry('both'), ctx(false))}</>);
    expect(panels()).toEqual(['Notation panel']);
  });

  it('shows the features on a notation with no panel of its own', () => {
    render(<>{dockPanels(undefined, ctx(true))}</>);
    expect(panels()).toEqual(['Activity diagram']);
  });
});
