// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { model, type DiagramModel } from '@diagc/core';
import { ActivityPanel } from './ActivityPanel';

/** frame f, no lanes */
function frameOnlyModel(): DiagramModel {
  const m = model('a');
  m.activity('f', { name: 'Fulfillment' });
  return m.toJSON();
}

/** frame f ⊃ lane l, no children */
function frameLaneModel(): DiagramModel {
  const m = model('a');
  const frame = m.activity('f', { name: 'Fulfillment' });
  frame.lane('l', { name: 'Warehouse' });
  return m.toJSON();
}

/** frame f ⊃ lane l ⊃ n actions */
function laneWithChildren(n: number): DiagramModel {
  const m = model('a');
  const frame = m.activity('f', { name: 'Fulfillment' });
  const lane = frame.lane('l', { name: 'Warehouse' });
  for (let i = 0; i < n; i++) lane.action(`step-${i}`, `Step ${i}`);
  return m.toJSON();
}

/** frame f ⊃ lane l ⊃ region r */
function frameLaneRegionModel(): DiagramModel {
  const m = model('a');
  const frame = m.activity('f', { name: 'Fulfillment' });
  const lane = frame.lane('l', { name: 'Warehouse' });
  lane.region('r', 'Retry region');
  return m.toJSON();
}

/** frame f ⊃ lane l ⊃ action ship */
function frameLaneActionModel(): DiagramModel {
  const m = model('a');
  const frame = m.activity('f', { name: 'Fulfillment' });
  const lane = frame.lane('l', { name: 'Warehouse' });
  lane.action('ship', 'Ship');
  return m.toJSON();
}

const setup = (selection: { kind: 'node' | 'edge'; id: string } | null, m: DiagramModel) => {
  const onCommand = vi.fn();
  const onSelect = vi.fn();
  render(<ActivityPanel model={m} plane={undefined} selection={selection} onCommand={onCommand} onSelect={onSelect} />);
  return { onCommand, onSelect };
};

describe('ActivityPanel', () => {
  it('on a frame: Add lane batches an add-node with the frame as parent', () => {
    const { onCommand, onSelect } = setup({ kind: 'node', id: 'f' }, frameOnlyModel());
    expect(screen.getByRole('complementary', { name: 'Activity diagram' })).toBeDefined();
    fireEvent.change(screen.getByLabelText('New lane name'), { target: { value: 'Ops' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add lane' }));
    expect(onCommand).toHaveBeenCalledWith({
      type: 'batch',
      commands: [
        { type: 'add-node', node: { id: 'ops', name: 'Ops', type: 'activity-lane' }, parent: { id: 'f' } },
        { type: 'set-position', nodeId: 'ops', x: 52, y: 24 },
      ],
    });
    expect(onSelect).toHaveBeenCalledWith('ops');
    expect((screen.getByLabelText('New lane name') as HTMLInputElement).value).toBe('');
  });

  it('on a lane: Add lane adds a sibling band to the lane\'s frame', () => {
    const { onCommand, onSelect } = setup({ kind: 'node', id: 'l' }, frameLaneModel());
    fireEvent.change(screen.getByLabelText('New lane name'), { target: { value: 'Ops' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add lane' }));
    expect(onCommand).toHaveBeenCalledWith({
      type: 'batch',
      commands: [
        { type: 'add-node', node: { id: 'ops', name: 'Ops', type: 'activity-lane' }, parent: { id: 'f' } },
        // the frame already holds one lane: its cascade, not the selected lane's
        { type: 'set-position', nodeId: 'ops', x: 28 + 24 + 24, y: 24 + 16 },
      ],
    });
    expect(onSelect).toHaveBeenCalledWith('ops');
    // …and the element quick-adds stay on offer alongside
    expect(screen.getByRole('button', { name: 'Add action' })).toBeDefined();
  });

  it('on a region: no Add lane (a region is not a band)', () => {
    setup({ kind: 'node', id: 'r' }, frameLaneRegionModel());
    expect(screen.queryByRole('button', { name: 'Add lane' })).toBeNull();
  });

  it('on a lane: Add action creates the node inside the lane at the cascade spot', () => {
    const { onCommand, onSelect } = setup({ kind: 'node', id: 'l' }, frameLaneModel());
    fireEvent.change(screen.getByLabelText('Element name'), { target: { value: 'Fill order' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add action' }));
    expect(onCommand).toHaveBeenCalledWith({
      type: 'batch',
      commands: [
        { type: 'add-node', node: { id: 'fill-order', name: 'Fill order', type: 'activity-action' }, parent: { id: 'l' } },
        { type: 'set-position', nodeId: 'fill-order', x: 28 + 24 + 0, y: 24 + 0 },
      ],
    });
    expect(onSelect).toHaveBeenCalledWith('fill-order');
    expect((screen.getByLabelText('Element name') as HTMLInputElement).value).toBe('');
  });

  it('cascade advances with existing children', () => {
    const { onCommand } = setup({ kind: 'node', id: 'l' }, laneWithChildren(2));
    fireEvent.change(screen.getByLabelText('Element name'), { target: { value: 'Ship order' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add action' }));
    expect(onCommand).toHaveBeenCalledWith({
      type: 'batch',
      commands: [
        { type: 'add-node', node: { id: 'ship-order', name: 'Ship order', type: 'activity-action' }, parent: { id: 'l' } },
        { type: 'set-position', nodeId: 'ship-order', x: 28 + 24 + 48, y: 24 + 32 },
      ],
    });
  });

  it('quick-adds without a name use the per-type default (decision → empty name, action → "Action")', () => {
    const { onCommand } = setup({ kind: 'node', id: 'l' }, frameLaneModel());
    fireEvent.click(screen.getByRole('button', { name: 'Add decision' }));
    expect(onCommand).toHaveBeenCalledWith({
      type: 'batch',
      commands: [
        { type: 'add-node', node: { id: 'decision', name: '', type: 'activity-decision' }, parent: { id: 'l' } },
        { type: 'set-position', nodeId: 'decision', x: 52, y: 24 },
      ],
    });
    onCommand.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Add action' }));
    expect(onCommand).toHaveBeenCalledWith({
      type: 'batch',
      commands: [
        { type: 'add-node', node: { id: 'action', name: 'Action', type: 'activity-action' }, parent: { id: 'l' } },
        { type: 'set-position', nodeId: 'action', x: 52, y: 24 },
      ],
    });
  });

  it('on a lane: Add region creates an activity-region child', () => {
    const { onCommand, onSelect } = setup({ kind: 'node', id: 'l' }, frameLaneModel());
    fireEvent.click(screen.getByRole('button', { name: 'Add region' }));
    expect(onCommand).toHaveBeenCalledWith({
      type: 'batch',
      commands: [
        { type: 'add-node', node: { id: 'region', name: 'Region', type: 'activity-region' }, parent: { id: 'l' } },
        { type: 'set-position', nodeId: 'region', x: 52, y: 24 },
      ],
    });
    expect(onSelect).toHaveBeenCalledWith('region');
  });

  it('a region selection offers the element buttons but not Add region', () => {
    setup({ kind: 'node', id: 'r' }, frameLaneRegionModel());
    expect(screen.getByRole('button', { name: 'Add action' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Add region' })).toBeNull();
  });

  it('mounts nothing for a non-activity selection', () => {
    const { container } = render(
      <ActivityPanel
        model={frameLaneActionModel()}
        plane={undefined}
        selection={{ kind: 'node', id: 'ship' }}
        onCommand={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});
