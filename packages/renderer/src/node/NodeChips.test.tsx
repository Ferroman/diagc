// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createIconRegistry } from '@diagc/icons';
import { createTypeRegistry } from '../registry';
import { FoldChip } from './NodeChips';
import type { DiagramNodeData } from './DiagramNode';

const node = (state: DiagramNodeData['state'], onToggleExpand = vi.fn()): DiagramNodeData => ({
  label: 'n',
  state,
  promoted: false,
  sharedMembers: [],
  hiddenCount: 0,
  typeRegistry: createTypeRegistry(),
  icons: createIconRegistry(),
  onToggleExpand,
});

describe('FoldChip', () => {
  it('shows an open box as open and asks to collapse it', () => {
    const data = node('expanded');
    render(<FoldChip id="a" data={data} />);
    const chip = screen.getByTestId('fold-chip');
    expect(chip.textContent).toBe('▾');
    expect(chip.className).toBe('dg-fold');
    expect(chip.getAttribute('aria-label')).toBe('Collapse');
    expect(chip.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(chip);
    expect(data.onToggleExpand).toHaveBeenCalledWith('a', 'collapsed');
  });

  it('shows a shut box as shut and asks to expand it, without the click reaching the node', () => {
    const data = node('collapsed');
    const onParent = vi.fn();
    render(
      <div onClick={onParent}>
        <FoldChip id="a" data={data} />
      </div>,
    );
    const chip = screen.getByRole('button', { name: 'Expand' });
    expect(chip.textContent).toBe('▸');
    expect(chip.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(chip);
    expect(data.onToggleExpand).toHaveBeenCalledWith('a', 'expanded');
    expect(onParent).not.toHaveBeenCalled();
  });

  it("is a causal-loop group's disclosure toggle, worded for a group", () => {
    const data = node('expanded');
    render(<FoldChip id="g" data={data} group />);
    const chip = screen.getByTestId('disclose-chip');
    expect(chip.className).toBe('dg-disclose');
    expect(chip.getAttribute('title')).toBe('Collapse group');
    expect(chip.hasAttribute('aria-expanded')).toBe(false);
    fireEvent.click(chip);
    expect(data.onToggleExpand).toHaveBeenCalledWith('g', 'collapsed');
  });
});
