// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SM_REGION_TYPE, model, type DiagramModel } from '@diagc/core/internal';
import { INDENT, StateMachinePanel } from './StateMachinePanel';

/** a machine with an initial, two states (b unreachable), and a final */
function machine(): DiagramModel {
  const m = model('sm');
  const sm = m.stateMachine('m', { name: 'Door' });
  const start = sm.initial('i');
  const a = sm.state('a', 'Open');
  sm.state('b', 'Locked');
  sm.final('f');
  start.to(a);
  return m.toJSON();
}

function setup(over: { m?: DiagramModel; selected?: string; editing?: boolean; scopePlane?: string } = {}) {
  const onCommand = vi.fn();
  const onSelect = vi.fn();
  const onCreated = vi.fn();
  render(
    <StateMachinePanel
      model={over.m ?? machine()}
      viewPlane={undefined}
      scopePlane={over.scopePlane}
      selection={over.selected !== undefined ? { kind: 'node', id: over.selected } : null}
      editing={over.editing ?? true}
      onCommand={onCommand}
      onSelect={onSelect}
      onCreated={onCreated}
    />,
  );
  return { onCommand, onSelect, onCreated };
}

describe('StateMachinePanel', () => {
  it('lists the machine and its children in containment order, glyphs by legend label', () => {
    setup();
    const rows = screen.getAllByRole('listitem').filter((li) => li.style.paddingLeft !== '');
    expect(rows.map((li) => li.textContent)).toEqual(['Door', 'Initial state', 'Open', 'Locked', 'Final state']);
    expect(rows.map((li) => li.style.paddingLeft)).toEqual(['0px', ...Array(4).fill(`${INDENT}px`)]);
  });

  it('selects a row', () => {
    const { onSelect } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Select Open' }));
    expect(onSelect).toHaveBeenCalledWith('a');
  });

  it('lists an unreachable state first and selects it', () => {
    const { onSelect } = setup();
    const issues = screen.getByRole('list', { name: 'Issues' });
    const first = issues.querySelector('button')!;
    expect(first.textContent).toContain("'b'");
    fireEvent.click(first);
    expect(onSelect).toHaveBeenCalledWith('b');
  });

  it('shows no add buttons in view mode', () => {
    setup({ editing: false });
    expect(screen.queryByRole('button', { name: /^Add / })).toBeNull();
  });

  it('adds a region inside the selected state', () => {
    const { onCommand, onSelect, onCreated } = setup({ selected: 'a' });
    fireEvent.click(screen.getByRole('button', { name: 'Add region' }));
    expect(onCommand).toHaveBeenCalledWith({
      type: 'add-node',
      node: { id: 'sm-region-1', name: '', type: SM_REGION_TYPE },
      parent: { id: 'a' },
    });
    expect(onSelect).toHaveBeenCalledWith('sm-region-1');
    expect(onCreated).toHaveBeenCalledWith('sm-region-1');
  });

  it('adds at top level, with only State and Machine on, when nothing is selected', () => {
    const { onCommand } = setup();
    expect(screen.getByRole('button', { name: 'Add region' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Add choice' })).toHaveProperty('disabled', true);
    fireEvent.click(screen.getByRole('button', { name: 'Add state' }));
    expect(onCommand).toHaveBeenCalledWith({
      type: 'add-node',
      node: { id: 'sm-state-1', name: 'State', type: 'sm-state' },
    });
  });

  it('takes a region only on a state or a machine, and a pseudo-state on any container', () => {
    setup({ selected: 'sm-region-x', m: regioned() });
    expect(screen.getByRole('button', { name: 'Add region' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Add choice' })).toHaveProperty('disabled', false);
  });

  it('tags a new node with the scope plane', () => {
    const { onCommand } = setup({ selected: 'a', scopePlane: 'p' });
    fireEvent.click(screen.getByRole('button', { name: 'Add state' }));
    expect(onCommand).toHaveBeenCalledWith(
      expect.objectContaining({ node: expect.objectContaining({ plane: 'p' }), parent: { id: 'a', plane: 'p' } }),
    );
  });

  it('shows only the viewed plane issues on a model with planes', () => {
    const m = model('sm');
    const one = m.stateMachine('m1', { plane: 'one' });
    one.initial('i1');
    one.state('x', 'X');
    const two = m.stateMachine('m2', { plane: 'two' });
    two.initial('i2');
    two.state('y', 'Y');
    const json = m.toJSON();
    const onSelect = vi.fn();
    render(
      <StateMachinePanel
        model={json}
        viewPlane="two"
        scopePlane="two"
        selection={null}
        editing={false}
        onCommand={vi.fn()}
        onSelect={onSelect}
        onCreated={vi.fn()}
      />,
    );
    const issues = screen.getAllByRole('list', { name: 'Issues' })[0]!;
    expect(issues.textContent).toContain("on plane 'two'");
    expect(issues.textContent).not.toContain("on plane 'one'");
    expect(screen.getByRole('button', { name: 'Select Y' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Select X' })).toBeNull();
  });
});

function regioned(): DiagramModel {
  const m = model('sm');
  const sm = m.stateMachine('m');
  sm.state('s').region('sm-region-x');
  return m.toJSON();
}
