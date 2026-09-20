// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { LayoutPanel } from './LayoutPanel';

const styleControl = (
  <select aria-label="Style" defaultValue="clean">
    <option value="clean">Clean</option>
  </select>
);

beforeEach(() => localStorage.clear());

describe('LayoutPanel', () => {
  it('is a dock section holding the layout rows, the style row and the mode’s commands', () => {
    const onChange = vi.fn();
    render(
      <LayoutPanel controls={{ settings: {}, onChange }} styleControl={styleControl}>
        <button type="button">Freeze layout</button>
      </LayoutPanel>,
    );
    const panel = screen.getByRole('complementary', { name: 'Layout & style' });
    fireEvent.change(within(panel).getByLabelText('Edge routing'), { target: { value: 'orthogonal' } });
    expect(onChange).toHaveBeenCalledWith({ edgeRouting: 'orthogonal' });
    // Style sits in a row like the others, under its own visible name
    expect(within(panel).getByText('Style', { selector: '.layout-row > span' })).toBeDefined();
    expect(within(panel).getByLabelText('Style')).toBeDefined();
    expect(within(panel).getByRole('button', { name: 'Freeze layout' })).toBeDefined();
  });

  it('drops the layout rows — and only those — when the notation arranges the plane itself', () => {
    render(
      <LayoutPanel controls={null} styleControl={styleControl}>
        <button type="button">Auto-layout</button>
      </LayoutPanel>,
    );
    expect(screen.queryByLabelText('Layout algorithm')).toBeNull();
    expect(screen.queryByLabelText('Node spacing')).toBeNull();
    expect(screen.getByLabelText('Style')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Auto-layout' })).toBeDefined();
  });

  it('passes the algorithm lock through: that picker goes, the rest stay', () => {
    render(<LayoutPanel controls={{ settings: {}, onChange: () => {}, algorithmLocked: true }} styleControl={styleControl} />);
    expect(screen.queryByLabelText('Layout algorithm')).toBeNull();
    expect(screen.getByLabelText('Layout direction')).toBeDefined();
  });

  it('renders no empty command row when the mode has no commands to offer', () => {
    const { container } = render(<LayoutPanel controls={null} styleControl={styleControl} />);
    expect(container.querySelector('.layout-actions')).toBeNull();
  });

  it('folds like any other dock section, and remembers it', () => {
    render(<LayoutPanel controls={{ settings: {}, onChange: () => {} }} styleControl={styleControl} />);
    fireEvent.click(screen.getByRole('button', { name: 'Layout & style' }));
    expect(screen.queryByLabelText('Style')).toBeNull();
    expect(localStorage.getItem('diagc.dockSection.layout')).toBe('collapsed');
  });
});
