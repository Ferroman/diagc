// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReactFlow, ReactFlowProvider, type Node } from '@xyflow/react';
import { SelectionToolbar } from './SelectionToolbar';

// `Panel` renders inside React Flow's own DOM tree, so the component needs a
// real <ReactFlow> around it — the nodes only have to exist, not render.
const nodes: Node[] = [
  { id: 'a', position: { x: 0, y: 0 }, data: {} },
  { id: 'b', position: { x: 200, y: 0 }, data: {} },
  { id: 'c', position: { x: 400, y: 0 }, data: {} },
];

const mount = (ids: string[], onAlign = vi.fn(), onDistribute = vi.fn()) => {
  render(
    <ReactFlowProvider>
      <ReactFlow nodes={nodes} edges={[]}>
        <SelectionToolbar ids={ids} onAlign={onAlign} onDistribute={onDistribute} />
      </ReactFlow>
    </ReactFlowProvider>,
  );
  return { onAlign, onDistribute };
};

describe('SelectionToolbar', () => {
  it('renders nothing below two nodes', () => {
    mount(['a']);
    expect(screen.queryByRole('button', { name: 'Align left' })).toBeNull();
  });

  it('offers the six align buttons at two nodes, with distribute disabled', async () => {
    const { onAlign } = mount(['a', 'b']);
    fireEvent.click(await screen.findByRole('button', { name: 'Align left' }));
    expect(onAlign).toHaveBeenCalledWith('left');
    for (const name of ['Align centre', 'Align right', 'Align top', 'Align middle', 'Align bottom']) {
      expect(screen.getByRole('button', { name })).toBeDefined();
    }
    expect((screen.getByRole('button', { name: 'Distribute horizontally' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('is anchored to the canvas top-centre, not the selection, so it can never sit off-canvas', async () => {
    mount(['a', 'b']);
    const toolbar = await screen.findByLabelText('Arrange selection');
    // React Flow's `Panel` renders `top`/`center` position classes alongside
    // its own `react-flow__panel` marker — proof this rides the canvas-anchored
    // Panel and not a selection-attached NodeToolbar.
    expect(toolbar.classList.contains('react-flow__panel')).toBe(true);
    expect(toolbar.classList.contains('top')).toBe(true);
    expect(toolbar.classList.contains('center')).toBe(true);
  });

  it('enables distribute at three nodes', async () => {
    const { onDistribute } = mount(['a', 'b', 'c']);
    fireEvent.click(await screen.findByRole('button', { name: 'Distribute vertically' }));
    expect(onDistribute).toHaveBeenCalledWith('y');
  });
});
