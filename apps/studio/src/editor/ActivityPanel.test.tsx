// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { applyCommand, emptyDrawings, emptyLayout, model, type DiagramModel } from '@diagc/core/internal';
import { ActivityPanel, activityContext, moveLaneCommand, reorderLanesCommand } from './ActivityPanel';

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

/** frame f ⊃ lanes a, b, c */
function threeLanes(): DiagramModel {
  const m = model('a');
  const frame = m.activity('f', { name: 'Fulfillment' });
  for (const id of ['a', 'b', 'c']) frame.lane(id, { name: id.toUpperCase() });
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

  it("on a lane: Add lane adds a sibling band to the lane's frame", () => {
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

  it('on a region: Add lane still adds a band to the frame', () => {
    const { onCommand } = setup({ kind: 'node', id: 'r' }, frameLaneRegionModel());
    fireEvent.change(screen.getByLabelText('New lane name'), { target: { value: 'Ops' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add lane' }));
    expect(onCommand.mock.calls[0]![0].commands[0]).toMatchObject({ type: 'add-node', parent: { id: 'f' } });
  });

  it('on a lane: Add action creates the node inside the lane at the cascade spot', () => {
    const { onCommand, onSelect } = setup({ kind: 'node', id: 'l' }, frameLaneModel());
    fireEvent.change(screen.getByLabelText('Element name'), { target: { value: 'Fill order' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add action' }));
    expect(onCommand).toHaveBeenCalledWith({
      type: 'batch',
      commands: [
        {
          type: 'add-node',
          node: { id: 'fill-order', name: 'Fill order', type: 'activity-action' },
          parent: { id: 'l' },
        },
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
        {
          type: 'add-node',
          node: { id: 'ship-order', name: 'Ship order', type: 'activity-action' },
          parent: { id: 'l' },
        },
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

  it('on an element: keeps the lanes listed and adds beside it, into its lane', () => {
    const { onCommand } = setup({ kind: 'node', id: 'ship' }, frameLaneActionModel());
    expect(screen.getByRole('list', { name: 'Lanes' }).textContent).toContain('Warehouse');
    expect(screen.getByText('Adding to Warehouse')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Add action' }));
    expect(onCommand.mock.calls[0]![0].commands[0]).toMatchObject({ type: 'add-node', parent: { id: 'l' } });
  });

  it('with nothing selected, works on the only frame and asks for a lane before steps', () => {
    setup(null, frameLaneModel());
    expect(screen.getByRole('heading', { name: 'Lanes in Fulfillment' })).toBeDefined();
    expect(screen.getByText('Select a lane to add steps to it.')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Add action' })).toBeNull();
  });

  it('says so when the frame has no lanes yet', () => {
    setup({ kind: 'node', id: 'f' }, frameOnlyModel());
    expect(screen.getByText('No lanes yet. Add the first one below.')).toBeDefined();
  });

  it('adds a lane on Enter', () => {
    const { onCommand } = setup(null, frameOnlyModel());
    fireEvent.change(screen.getByLabelText('New lane name'), { target: { value: 'Ops' } });
    fireEvent.submit(screen.getByLabelText('New lane name'));
    expect(onCommand.mock.calls[0]![0].commands[0]).toMatchObject({
      node: { id: 'ops', type: 'activity-lane' },
      parent: { id: 'f' },
    });
  });

  it('selects a lane from the list', () => {
    const { onSelect } = setup(null, threeLanes());
    fireEvent.click(screen.getByRole('button', { name: 'B' }));
    expect(onSelect).toHaveBeenCalledWith('b');
  });

  it('mounts nothing for a diagram with no activity frame', () => {
    const m = model('x');
    m.node('svc', { name: 'Svc', type: 'service' });
    const { container } = render(
      <ActivityPanel
        model={m.toJSON()}
        plane={undefined}
        selection={{ kind: 'node', id: 'svc' }}
        onCommand={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  describe('lane order', () => {
    it('moves any listed lane up or down one band', () => {
      const { onCommand } = setup({ kind: 'node', id: 'f' }, threeLanes());
      fireEvent.click(screen.getByRole('button', { name: 'Move B up' }));
      expect(onCommand).toHaveBeenLastCalledWith({ type: 'move-child', parent: 'f', child: 'b', offset: -1 });
      fireEvent.click(screen.getByRole('button', { name: 'Move B down' }));
      expect(onCommand).toHaveBeenLastCalledWith({ type: 'move-child', parent: 'f', child: 'b', offset: 1 });
    });

    it('disables the moves that would leave the frame', () => {
      setup({ kind: 'node', id: 'a' }, threeLanes());
      expect((screen.getByRole('button', { name: 'Move A up' }) as HTMLButtonElement).disabled).toBe(true);
      expect((screen.getByRole('button', { name: 'Move A down' }) as HTMLButtonElement).disabled).toBe(false);
      expect((screen.getByRole('button', { name: 'Move C down' }) as HTMLButtonElement).disabled).toBe(true);
    });

    it('marks the selected lane in the list', () => {
      setup({ kind: 'node', id: 'b' }, threeLanes());
      const current = screen.getByRole('list', { name: 'Lanes' }).querySelector('[aria-current="true"]');
      expect(current?.textContent).toContain('B');
    });
  });
});

describe('Tidy lane order', () => {
  /** a talks to c across b: the best order puts b at an end */
  function apart(): DiagramModel {
    const m = model('t');
    const act = m.activity('f');
    const ids = ['a', 'b', 'c'].map((id) => act.lane(id, { name: id.toUpperCase() }).action(`${id}-x`, id));
    act.flow(ids[0]!, ids[2]!);
    return m.toJSON();
  }
  const order = (m: DiagramModel) => m.containment.filter((e) => e.parent === 'f').map((e) => e.child);

  it('restacks the lanes so the linked ones sit together, in one command', () => {
    const { onCommand } = setup({ kind: 'node', id: 'f' }, apart());
    fireEvent.click(screen.getByRole('button', { name: 'Tidy lane order' }));
    const command = onCommand.mock.calls[0]![0];
    const after = order(
      applyCommand({ model: apart(), layout: emptyLayout(), drawings: emptyDrawings() }, command).state.model,
    );
    expect(Math.abs(after.indexOf('a') - after.indexOf('c'))).toBe(1);
  });

  it('is disabled when the order is already the best', () => {
    setup({ kind: 'node', id: 'a' }, threeLanes());
    expect((screen.getByRole('button', { name: 'Tidy lane order' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('reorderLanesCommand', () => {
  it('walks each lane up into its slot', () => {
    const step = (child: string) => ({ type: 'move-child', parent: 'f', child, offset: -1 });
    expect(reorderLanesCommand('f', ['a', 'b', 'c'], ['c', 'a', 'b'], undefined)).toEqual({
      type: 'batch',
      commands: [step('c'), step('c')],
    });
    expect(reorderLanesCommand('f', ['a', 'b'], ['b', 'a'], undefined)).toEqual(step('b'));
    expect(reorderLanesCommand('f', ['a', 'b'], ['a', 'b'], undefined)).toBeNull();
  });
});

describe('moveLaneCommand', () => {
  const order = (m: DiagramModel) => m.containment.filter((e) => e.parent === 'f').map((e) => e.child);
  const run = (offset: number) => {
    const command = moveLaneCommand('f', 'a', offset, undefined);
    if (command === null) return null;
    return order(
      applyCommand({ model: threeLanes(), layout: emptyLayout(), drawings: emptyDrawings() }, command).state.model,
    );
  };

  it('moves a lane several slots as one command, either way', () => {
    expect(run(2)).toEqual(['b', 'c', 'a']);
    expect(run(1)).toEqual(['b', 'a', 'c']);
    const up = moveLaneCommand('f', 'c', -2, 'p');
    expect(up).toEqual({
      type: 'batch',
      commands: [0, 1].map(() => ({ type: 'move-child', parent: 'f', child: 'c', offset: -1, plane: 'p' })),
    });
  });

  it('is null when the lane did not move', () => {
    expect(run(0)).toBeNull();
  });
});

describe('activityContext', () => {
  it('finds the frame above any selection, and the nearest lane or region as the target', () => {
    const m = frameLaneRegionModel();
    expect(activityContext(m, { kind: 'node', id: 'r' }, undefined)).toMatchObject({
      frame: { id: 'f' },
      target: { id: 'r' },
    });
    expect(activityContext(m, { kind: 'node', id: 'l' }, undefined)).toMatchObject({
      frame: { id: 'f' },
      target: { id: 'l' },
    });
    expect(activityContext(m, { kind: 'node', id: 'f' }, undefined)?.target).toBeUndefined();
  });

  it('needs a selection to pick between frames', () => {
    const m = model('two');
    m.activity('f1');
    m.activity('f2');
    expect(activityContext(m.toJSON(), null, undefined)).toBeUndefined();
    expect(activityContext(m.toJSON(), { kind: 'node', id: 'f2' }, undefined)?.frame.id).toBe('f2');
  });
});
