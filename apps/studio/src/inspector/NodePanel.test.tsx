// @vitest-environment jsdom
import { Profiler, type ComponentProps } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DiagramModel, DiagramNode } from '@diagc/core/internal';
import { NodePanel } from './NodePanel';

function testModel(): DiagramModel {
  return {
    version: 1,
    id: 'draft',
    name: 'draft',
    nodes: [
      { id: 'a', name: 'a', type: 'service' },
      { id: 'sys', name: 'System', type: 'system' },
    ],
    containment: [{ parent: 'sys', child: 'a', plane: 'flow' }],
    relations: [],
    layers: [],
    planes: [
      { id: 'arch', name: 'Architecture' },
      { id: 'flow', name: 'Flow' },
    ],
  };
}

function noop() {
  /* intentionally empty */
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('NodePanel', () => {
  it('offers only lanes and regions as parents of an activity element', () => {
    const model: DiagramModel = {
      ...testModel(),
      nodes: [
        { id: 'frame', name: 'Frame', type: 'activity-frame' },
        { id: 'sales', name: 'Sales', type: 'activity-lane' },
        { id: 'stock', name: 'Stock', type: 'activity-lane' },
        { id: 'hold', name: 'Hold', type: 'activity-region' },
        { id: 'take', name: 'Take', type: 'activity-action' },
        { id: 'check', name: 'Check', type: 'activity-decision' },
      ],
      containment: [],
      planes: [],
    };
    const options = (nodeId: string) => {
      const { unmount } = render(
        <NodePanel
          model={model}
          nodeId={nodeId}
          activePlane={undefined}
          onCommand={noop}
          onClose={noop}
          onDeleted={noop}
        />,
      );
      const names = within(screen.getByLabelText('Add parent'))
        .getAllByRole('option')
        .slice(1)
        .map((o) => o.textContent);
      unmount();
      return names;
    };
    expect(options('take')).toEqual(['Sales', 'Stock', 'Hold']);
    expect(options('sales')).toEqual(['Frame']);
    expect(options('hold')).toEqual(['Sales', 'Stock']);
  });

  it('commits a rename on blur (Name is a multiline textarea; Enter adds a line)', () => {
    const onCommand = vi.fn();
    render(
      <NodePanel
        model={testModel()}
        nodeId="a"
        activePlane="flow"
        onCommand={onCommand}
        onClose={noop}
        onDeleted={noop}
      />,
    );
    const name = screen.getByLabelText('Name');
    fireEvent.change(name, { target: { value: 'Alpha' } });
    fireEvent.blur(name);
    expect(onCommand).toHaveBeenCalledWith({ type: 'rename-node', id: 'a', name: 'Alpha' });
  });

  it('keeps a multiline name (newlines) when committed', () => {
    const onCommand = vi.fn();
    render(
      <NodePanel
        model={testModel()}
        nodeId="a"
        activePlane="flow"
        onCommand={onCommand}
        onClose={noop}
        onDeleted={noop}
      />,
    );
    const name = screen.getByLabelText('Name');
    fireEvent.change(name, { target: { value: 'Line one\nLine two' } });
    fireEvent.blur(name);
    expect(onCommand).toHaveBeenCalledWith({ type: 'rename-node', id: 'a', name: 'Line one\nLine two' });
  });

  it('commits a shape ref on blur', () => {
    const onCommand = vi.fn();
    render(
      <NodePanel
        model={testModel()}
        nodeId="a"
        activePlane="flow"
        onCommand={onCommand}
        onClose={noop}
        onDeleted={noop}
      />,
    );
    const shape = screen.getByLabelText('Shape');
    fireEvent.change(shape, { target: { value: '/library/shapes/person.svg' } });
    fireEvent.blur(shape);
    expect(onCommand).toHaveBeenCalledWith({
      type: 'set-node-details',
      id: 'a',
      details: { shape: '/library/shapes/person.svg' },
    });
  });

  it('clears the shape when the field is emptied', () => {
    const onCommand = vi.fn();
    const model = testModel();
    model.nodes = model.nodes.map((n) => (n.id === 'a' ? { ...n, shape: '/library/shapes/person.svg' } : n));
    render(
      <NodePanel model={model} nodeId="a" activePlane="flow" onCommand={onCommand} onClose={noop} onDeleted={noop} />,
    );
    const shape = screen.getByLabelText('Shape') as HTMLInputElement;
    expect(shape.value).toBe('/library/shapes/person.svg');
    fireEvent.change(shape, { target: { value: '' } });
    fireEvent.blur(shape);
    expect(onCommand).toHaveBeenCalledWith({ type: 'set-node-details', id: 'a', details: { shape: null } });
  });

  it('reverts an invalid shape ref on blur without dispatching', () => {
    const onCommand = vi.fn();
    render(
      <NodePanel
        model={testModel()}
        nodeId="a"
        activePlane="flow"
        onCommand={onCommand}
        onClose={noop}
        onDeleted={noop}
      />,
    );
    const shape = screen.getByLabelText('Shape') as HTMLInputElement;
    fireEvent.change(shape, { target: { value: 'not a valid ref' } });
    fireEvent.blur(shape);
    expect(onCommand).not.toHaveBeenCalled();
    expect(shape.value).toBe('');
  });

  it('the Technology field commits through node details on blur', () => {
    const onCommand = vi.fn();
    render(
      <NodePanel
        model={testModel()}
        nodeId="a"
        activePlane="flow"
        onCommand={onCommand}
        onClose={noop}
        onDeleted={noop}
      />,
    );
    const technology = screen.getByLabelText('Technology') as HTMLInputElement;
    fireEvent.change(technology, { target: { value: 'Go' } });
    fireEvent.blur(technology);
    expect(onCommand).toHaveBeenCalledWith({
      type: 'set-node-details',
      id: 'a',
      details: { technology: 'Go' },
    });
  });

  it('clears the technology when the field is emptied', () => {
    const onCommand = vi.fn();
    const withTechnology = testModel();
    withTechnology.nodes = withTechnology.nodes.map((n) => (n.id === 'a' ? { ...n, technology: 'Go' } : n));
    render(
      <NodePanel
        model={withTechnology}
        nodeId="a"
        activePlane="flow"
        onCommand={onCommand}
        onClose={noop}
        onDeleted={noop}
      />,
    );
    const technology = screen.getByLabelText('Technology') as HTMLInputElement;
    expect(technology.value).toBe('Go');
    fireEvent.change(technology, { target: { value: '' } });
    fireEvent.blur(technology);
    expect(onCommand).toHaveBeenCalledWith({ type: 'set-node-details', id: 'a', details: { technology: null } });
  });

  it('the Link field shows the node link, clears it, then commits a new value', () => {
    const onCommand = vi.fn();
    const withLink = testModel();
    withLink.nodes = withLink.nodes.map((n) => (n.id === 'a' ? { ...n, link: '[[Runbook]]' } : n));
    render(
      <NodePanel
        model={withLink}
        nodeId="a"
        activePlane="flow"
        onCommand={onCommand}
        onClose={noop}
        onDeleted={noop}
      />,
    );
    const link = screen.getByLabelText('Link') as HTMLInputElement;
    expect(link.value).toBe('[[Runbook]]');

    fireEvent.change(link, { target: { value: '' } });
    fireEvent.blur(link);
    expect(onCommand).toHaveBeenCalledWith({ type: 'set-node-details', id: 'a', details: { link: null } });

    fireEvent.change(link, { target: { value: '[[Other]]' } });
    fireEvent.blur(link);
    expect(onCommand).toHaveBeenCalledWith({
      type: 'set-node-details',
      id: 'a',
      details: { link: '[[Other]]' },
    });
  });

  it('sets and clears the node color from the swatch row', () => {
    const onCommand = vi.fn();
    render(
      <NodePanel
        model={testModel()}
        nodeId="a"
        activePlane="flow"
        onCommand={onCommand}
        onClose={noop}
        onDeleted={noop}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Color palette' }));
    fireEvent.click(screen.getByRole('button', { name: 'Color #42a5f5' }));
    expect(onCommand).toHaveBeenCalledWith({ type: 'set-node-details', id: 'a', details: { color: '#42a5f5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Auto color' }));
    expect(onCommand).toHaveBeenCalledWith({ type: 'set-node-details', id: 'a', details: { color: null } });
  });

  it('sets and clears the node text color from its own swatch row', () => {
    const onCommand = vi.fn();
    render(
      <NodePanel
        model={testModel()}
        nodeId="a"
        activePlane="flow"
        onCommand={onCommand}
        onClose={noop}
        onDeleted={noop}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Text color palette' }));
    fireEvent.click(screen.getByRole('button', { name: 'Text color #42a5f5' }));
    expect(onCommand).toHaveBeenCalledWith({ type: 'set-node-details', id: 'a', details: { textColor: '#42a5f5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Auto text color' }));
    expect(onCommand).toHaveBeenCalledWith({ type: 'set-node-details', id: 'a', details: { textColor: null } });
  });

  it('adds a metadata entry as one set-node-details with the new key', () => {
    const onCommand = vi.fn();
    render(
      <NodePanel
        model={testModel()}
        nodeId="a"
        activePlane="flow"
        onCommand={onCommand}
        onClose={noop}
        onDeleted={noop}
      />,
    );
    fireEvent.change(screen.getByLabelText('New metadata key'), { target: { value: 'owner' } });
    fireEvent.change(screen.getByLabelText('New metadata value'), { target: { value: 'platform-team' } });
    fireEvent.click(screen.getByRole('button', { name: /add metadata/i }));
    expect(onCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'set-node-details',
        id: 'a',
        details: expect.objectContaining({ metadata: expect.objectContaining({ owner: 'platform-team' }) }),
      }),
    );
  });

  it('removes a membership with that edge exact plane', () => {
    const onCommand = vi.fn();
    render(
      <NodePanel
        model={testModel()}
        nodeId="a"
        activePlane="flow"
        onCommand={onCommand}
        onClose={noop}
        onDeleted={noop}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /remove from system/i }));
    expect(onCommand).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'remove-containment', parent: 'sys', child: 'a', plane: 'flow' }),
    );
  });

  it('resyncs an untouched field when the model changes externally (undo)', () => {
    const onCommand = vi.fn();
    const { rerender } = render(
      <NodePanel
        model={testModel()}
        nodeId="a"
        activePlane="flow"
        onCommand={onCommand}
        onClose={noop}
        onDeleted={noop}
      />,
    );
    // The model changes underneath the open panel (e.g. an undo lands here),
    // renaming node 'a'. The untouched local input must follow the model.
    const base = testModel();
    const renamed: DiagramModel = {
      ...base,
      nodes: base.nodes.map((n) => (n.id === 'a' ? { ...n, name: 'Renamed' } : n)),
    };
    rerender(
      <NodePanel model={renamed} nodeId="a" activePlane="flow" onCommand={onCommand} onClose={noop} onDeleted={noop} />,
    );
    const name = screen.getByLabelText<HTMLTextAreaElement>('Name');
    expect(name.value).toBe('Renamed');
    // Blurring the (now-resynced) input must not re-apply the stale old value.
    fireEvent.blur(name);
    expect(onCommand).not.toHaveBeenCalled();
  });

  it('does not commit an emptied name and restores the model value', () => {
    const onCommand = vi.fn();
    render(
      <NodePanel
        model={testModel()}
        nodeId="a"
        activePlane="flow"
        onCommand={onCommand}
        onClose={noop}
        onDeleted={noop}
      />,
    );
    const name = screen.getByLabelText<HTMLTextAreaElement>('Name');
    fireEvent.change(name, { target: { value: '' } });
    fireEvent.blur(name);
    expect(onCommand).not.toHaveBeenCalled();
    expect(name.value).toBe('a');
  });

  it('does not commit while a metadata key is transiently empty and keeps the row value', () => {
    const onCommand = vi.fn();
    const base = testModel();
    const model: DiagramModel = {
      ...base,
      nodes: base.nodes.map((n) => (n.id === 'a' ? { ...n, metadata: { owner: 'platform-team' } } : n)),
    };
    render(
      <NodePanel model={model} nodeId="a" activePlane="flow" onCommand={onCommand} onClose={noop} onDeleted={noop} />,
    );
    const key = screen.getByLabelText<HTMLInputElement>('Metadata key 1');
    fireEvent.change(key, { target: { value: '' } });
    fireEvent.blur(key);
    // Mid-edit: no dispatch, and the value input still holds its value.
    expect(onCommand).not.toHaveBeenCalled();
    expect(screen.getByLabelText<HTMLInputElement>('Metadata value 1').value).toBe('platform-team');
  });

  it('commits a sibling ✕-delete while another key is blank, preserving the blank row original', () => {
    const onCommand = vi.fn();
    const base = testModel();
    const model: DiagramModel = {
      ...base,
      nodes: base.nodes.map((n) => (n.id === 'a' ? { ...n, metadata: { owner: 'platform-team', tier: 'gold' } } : n)),
    };
    render(
      <NodePanel model={model} nodeId="a" activePlane="flow" onCommand={onCommand} onClose={noop} onDeleted={noop} />,
    );
    // Blank row A's (owner) key mid-rename, then ✕-delete the sibling row B (tier).
    fireEvent.change(screen.getByLabelText('Metadata key 1'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /remove metadata tier/i }));
    // The delete commits once; the blanked row keeps its ORIGINAL owner entry,
    // and the removed tier entry is gone.
    expect(onCommand).toHaveBeenCalledTimes(1);
    expect(onCommand).toHaveBeenCalledWith({
      type: 'set-node-details',
      id: 'a',
      details: { metadata: { owner: 'platform-team' } },
    });
  });

  it('commits a metadata key rename with the new key and drops the old one', () => {
    const onCommand = vi.fn();
    const base = testModel();
    const model: DiagramModel = {
      ...base,
      nodes: base.nodes.map((n) => (n.id === 'a' ? { ...n, metadata: { owner: 'platform-team' } } : n)),
    };
    render(
      <NodePanel model={model} nodeId="a" activePlane="flow" onCommand={onCommand} onClose={noop} onDeleted={noop} />,
    );
    const key = screen.getByLabelText<HTMLInputElement>('Metadata key 1');
    fireEvent.change(key, { target: { value: '' } });
    fireEvent.change(key, { target: { value: 'maintainer' } });
    fireEvent.blur(key);
    // Exact object match: the new key is present and the old owner key is absent.
    expect(onCommand).toHaveBeenCalledWith({
      type: 'set-node-details',
      id: 'a',
      details: { metadata: { maintainer: 'platform-team' } },
    });
  });

  it('does not commit when a metadata value is blurred unchanged (no-op guard)', () => {
    const onCommand = vi.fn();
    const base = testModel();
    const model: DiagramModel = {
      ...base,
      nodes: base.nodes.map((n) => (n.id === 'a' ? { ...n, metadata: { owner: 'platform-team' } } : n)),
    };
    render(
      <NodePanel model={model} nodeId="a" activePlane="flow" onCommand={onCommand} onClose={noop} onDeleted={noop} />,
    );
    fireEvent.blur(screen.getByLabelText('Metadata value 1'));
    expect(onCommand).not.toHaveBeenCalled();
  });

  it('clears the saved position for the active plane when there is one', () => {
    const onCommand = vi.fn();
    render(
      <NodePanel
        model={testModel()}
        nodeId="a"
        activePlane="flow"
        hasSavedPosition
        onCommand={onCommand}
        onClose={noop}
        onDeleted={noop}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /clear pinned position/i }));
    expect(onCommand).toHaveBeenCalledWith({ type: 'clear-position', nodeId: 'a', plane: 'flow' });
  });

  it('hides the clear button when the node has no saved position', () => {
    render(
      <NodePanel
        model={testModel()}
        nodeId="a"
        activePlane="flow"
        onCommand={vi.fn()}
        onClose={noop}
        onDeleted={noop}
      />,
    );
    expect(screen.queryByRole('button', { name: /clear pinned position/i })).toBeNull();
  });

  it('deletes the node immediately (no confirm) and notifies onDeleted', () => {
    const onCommand = vi.fn();
    const onDeleted = vi.fn();
    render(
      <NodePanel
        model={testModel()}
        nodeId="a"
        activePlane="flow"
        onCommand={onCommand}
        onClose={noop}
        onDeleted={onDeleted}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /delete node/i }));
    expect(onCommand).toHaveBeenCalledWith({ type: 'delete-node', id: 'a' });
    expect(onDeleted).toHaveBeenCalled();
  });

  it('scopes a node to a borrowed-containment plane, but offers no Hidden-here there', () => {
    // A node scoped to a borrowing plane shows there; a `hides` list written on
    // that plane would replace the one it borrows from its donor, so hiding stays
    // the donor's.
    const base = testModel();
    const model: DiagramModel = {
      ...base,
      planes: [...base.planes, { id: 'borrow', name: 'Borrow', containmentOf: 'arch' }],
    };
    const onCommand = vi.fn();
    render(
      <NodePanel model={model} nodeId="a" activePlane="borrow" onCommand={onCommand} onClose={noop} onDeleted={noop} />,
    );
    fireEvent.change(screen.getByLabelText('Scope'), { target: { value: 'local' } });
    expect(onCommand).toHaveBeenLastCalledWith({ type: 'set-node-details', id: 'a', details: { plane: 'borrow' } });
    expect(screen.queryByLabelText('Hidden here')).toBeNull();
  });

  it('names the donor plane of a node it borrows, rather than calling it shared', () => {
    const base = testModel();
    const model: DiagramModel = {
      ...base,
      planes: [...base.planes, { id: 'borrow', name: 'Borrow', containmentOf: 'arch' }],
      nodes: base.nodes.map((n) => (n.id === 'a' ? { ...n, plane: 'arch' } : n)),
    };
    render(
      <NodePanel model={model} nodeId="a" activePlane="borrow" onCommand={vi.fn()} onClose={noop} onDeleted={noop} />,
    );
    const scope = screen.getByLabelText('Scope') as HTMLSelectElement;
    expect(scope.selectedOptions[0]?.textContent).toBe(`${model.planes.find((p) => p.id === 'arch')!.name} only`);
  });

  it('clears the type to typeless when the Type field is emptied', () => {
    const onCommand = vi.fn();
    render(
      <NodePanel
        model={testModel()}
        nodeId="a"
        activePlane="flow"
        onCommand={onCommand}
        onClose={noop}
        onDeleted={noop}
      />,
    );
    const typeInput = screen.getByLabelText('Type') as HTMLInputElement;
    expect(typeInput.value).toBe('service');
    fireEvent.change(typeInput, { target: { value: '' } });
    fireEvent.blur(typeInput);
    expect(onCommand).toHaveBeenCalledWith({ type: 'set-node-details', id: 'a', details: { type: null } });
  });

  it('assigns the node to a layer (sheet) and clears it back to base', () => {
    const onCommand = vi.fn();
    const m = testModel();
    m.layers = [{ id: 'ops', name: 'Ops' }];
    m.nodes[0] = { ...m.nodes[0]!, layer: 'ops' };
    render(<NodePanel model={m} nodeId="a" activePlane="flow" onCommand={onCommand} onClose={noop} onDeleted={noop} />);
    const layer = screen.getByLabelText<HTMLSelectElement>('Layer');
    expect(layer.value).toBe('ops'); // seeded from the node
    fireEvent.change(layer, { target: { value: '' } });
    expect(onCommand).toHaveBeenCalledWith({ type: 'set-node-details', id: 'a', details: { layer: null } });
  });

  it('hides the Layer dropdown when the model declares no layers', () => {
    render(
      <NodePanel model={testModel()} nodeId="a" activePlane="flow" onCommand={noop} onClose={noop} onDeleted={noop} />,
    );
    expect(screen.queryByLabelText('Layer')).toBeNull();
  });

  it('sets and clears text alignment', () => {
    const onCommand = vi.fn();
    render(
      <NodePanel
        model={testModel()}
        nodeId="a"
        activePlane="flow"
        onCommand={onCommand}
        onClose={noop}
        onDeleted={noop}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Center' }));
    expect(onCommand).toHaveBeenCalledWith({ type: 'set-node-details', id: 'a', details: { textAlign: 'center' } });
  });
  it('sets font size to large', () => {
    const onCommand = vi.fn();
    render(
      <NodePanel
        model={testModel()}
        nodeId="a"
        activePlane="flow"
        onCommand={onCommand}
        onClose={noop}
        onDeleted={noop}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Large' }));
    expect(onCommand).toHaveBeenCalledWith({ type: 'set-node-details', id: 'a', details: { fontScale: 'lg' } });
  });

  it('shows the saved position and commits an edited coordinate as set-position', () => {
    const onCommand = vi.fn();
    render(
      <NodePanel
        model={testModel()}
        nodeId="a"
        activePlane="flow"
        hasSavedPosition
        savedPosition={{ x: 40, y: 60 }}
        onCommand={onCommand}
        onClose={noop}
        onDeleted={noop}
      />,
    );
    const x = screen.getByLabelText('X') as HTMLInputElement;
    expect(x.value).toBe('40');
    expect((screen.getByLabelText('Y') as HTMLInputElement).value).toBe('60');
    fireEvent.change(x, { target: { value: '100' } });
    fireEvent.keyDown(x, { key: 'Enter' });
    expect(onCommand).toHaveBeenCalledWith({ type: 'set-position', nodeId: 'a', x: 100, y: 60, plane: 'flow' });
  });

  it('a node with no saved position shows the live one as a placeholder and saves on commit', () => {
    const onCommand = vi.fn();
    render(
      <NodePanel
        model={testModel()}
        nodeId="a"
        activePlane="flow"
        live={{ x: 12.6, y: 7 }}
        onCommand={onCommand}
        onClose={noop}
        onDeleted={noop}
      />,
    );
    const x = screen.getByLabelText('X') as HTMLInputElement;
    const y = screen.getByLabelText('Y') as HTMLInputElement;
    expect(x.value).toBe('');
    expect(x.placeholder).toBe('13');
    expect(y.placeholder).toBe('7');
    expect(screen.queryByRole('button', { name: /clear pinned position/i })).toBeNull();
    fireEvent.change(x, { target: { value: '20' } });
    fireEvent.change(y, { target: { value: '30' } });
    fireEvent.blur(y);
    expect(onCommand).toHaveBeenCalledWith({ type: 'set-position', nodeId: 'a', x: 20, y: 30, plane: 'flow' });
  });

  it('does not commit a half-filled position', () => {
    const onCommand = vi.fn();
    render(
      <NodePanel
        model={testModel()}
        nodeId="a"
        activePlane="flow"
        onCommand={onCommand}
        onClose={noop}
        onDeleted={noop}
      />,
    );
    const x = screen.getByLabelText('X');
    fireEvent.change(x, { target: { value: '20' } });
    fireEvent.blur(x);
    expect(onCommand).not.toHaveBeenCalled();
  });

  describe('delete', () => {
    function frameModel(): DiagramModel {
      return {
        version: 1,
        id: 'draft',
        name: 'draft',
        nodes: [
          { id: 'frame', name: 'Frame', type: 'activity-frame' },
          { id: 'lane', name: 'Lane', type: 'activity-lane' },
        ],
        containment: [{ parent: 'frame', child: 'lane' }],
        relations: [],
        layers: [],
        planes: [],
      };
    }

    it('plain-deletes an ordinary node (no cascade key)', () => {
      const onCommand = vi.fn();
      render(
        <NodePanel
          model={testModel()}
          nodeId="a"
          activePlane="flow"
          onCommand={onCommand}
          onClose={noop}
          onDeleted={noop}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Delete node' }));
      expect(onCommand).toHaveBeenCalledWith({ type: 'delete-node', id: 'a' });
    });

    it('cascade-deletes a notation container whose children cannot be re-homed', () => {
      const onCommand = vi.fn();
      render(
        <NodePanel
          model={frameModel()}
          nodeId="frame"
          activePlane={undefined}
          onCommand={onCommand}
          onClose={noop}
          onDeleted={noop}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Delete node' }));
      expect(onCommand).toHaveBeenCalledWith({ type: 'delete-node', id: 'frame', cascade: true });
    });

    it('Ungroup severs only, even on a notation container', () => {
      const onCommand = vi.fn();
      render(
        <NodePanel
          model={frameModel()}
          nodeId="frame"
          activePlane={undefined}
          onCommand={onCommand}
          onClose={noop}
          onDeleted={noop}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Ungroup' }));
      expect(onCommand).toHaveBeenCalledWith({ type: 'delete-node', id: 'frame' });
    });
  });

  describe('threats', () => {
    function tmModel(threats?: DiagramModel['nodes'][number]['threats']): DiagramModel {
      return {
        version: 1,
        id: 'draft',
        name: 'draft',
        nodes: [{ id: 'p', name: 'API', type: 'tm-process', ...(threats !== undefined ? { threats } : {}) }],
        containment: [],
        relations: [],
        layers: [],
        planes: [],
      };
    }

    it('offers the section on a threat-model plane, categories led by the ones the type invites', () => {
      render(
        <NodePanel
          model={tmModel()}
          nodeId="p"
          activePlane={undefined}
          notation="threat-model"
          onCommand={vi.fn()}
          onClose={noop}
          onDeleted={noop}
        />,
      );
      const first = (screen.getByLabelText('New threat category') as HTMLSelectElement).options[0];
      expect(first?.textContent).toBe('S · Spoofing'); // a process takes all six, S first
    });

    it('threat-models a node of any type, not only a DFD one', () => {
      const m = tmModel();
      m.nodes[0] = { id: 'p', name: 'API', type: 'service' };
      render(
        <NodePanel
          model={m}
          nodeId="p"
          activePlane={undefined}
          notation="threat-model"
          onCommand={vi.fn()}
          onClose={noop}
          onDeleted={noop}
        />,
      );
      expect(screen.getByRole('region', { name: 'Threats' })).toBeTruthy();
    });

    it('stays out of the way off the notation, unless the node already carries threats', () => {
      const { unmount } = render(
        <NodePanel
          model={tmModel()}
          nodeId="p"
          activePlane={undefined}
          onCommand={vi.fn()}
          onClose={noop}
          onDeleted={noop}
        />,
      );
      expect(screen.queryByRole('region', { name: 'Threats' })).toBeNull();
      unmount();

      // switching the notation off must not strand threats that are already
      // authored — they stay editable (and removable) where they live
      render(
        <NodePanel
          model={tmModel([{ id: 't1', category: 'S', title: 'Spoofed caller' }])}
          nodeId="p"
          activePlane={undefined}
          onCommand={vi.fn()}
          onClose={noop}
          onDeleted={noop}
        />,
      );
      expect(screen.getByRole('region', { name: 'Threats' })).toBeTruthy();
      expect(screen.getByLabelText('Threat t1 title')).toBeTruthy();
    });

    it('targets the node it is editing', () => {
      const onCommand = vi.fn();
      render(
        <NodePanel
          model={tmModel()}
          nodeId="p"
          activePlane={undefined}
          notation="threat-model"
          onCommand={onCommand}
          onClose={noop}
          onDeleted={noop}
        />,
      );
      fireEvent.change(screen.getByLabelText('New threat'), { target: { value: 'Spoofed caller' } });
      // the accessible name names what is being added — Memberships has an Add
      // of its own, and the scoping below is the belt to that braces
      fireEvent.click(
        within(screen.getByRole('region', { name: 'Threats' })).getByRole('button', { name: 'Add threat' }),
      );
      expect(onCommand).toHaveBeenCalledWith({
        type: 'add-threat',
        target: { node: 'p' },
        threat: { id: 't1', category: 'S', title: 'Spoofed caller' },
      });
    });
  });

  describe('plan', () => {
    function planModel(type: string, metadata?: DiagramModel['nodes'][number]['metadata']): DiagramModel {
      return {
        version: 1,
        id: 'draft',
        name: 'draft',
        nodes: [{ id: 'z', name: 'Q1', type, ...(metadata !== undefined ? { metadata } : {}) }],
        containment: [],
        relations: [],
        layers: [],
        planes: [],
      };
    }

    it('offers the Plan section on the plan notation, and on a node that already carries dates', () => {
      const zone = planModel('plan-zone', { start: '2026-01-05', end: '2026-03-27' });

      const { unmount: unmount1 } = render(
        <NodePanel
          model={zone}
          nodeId="z"
          activePlane={undefined}
          notation="plan"
          onCommand={vi.fn()}
          onClose={noop}
          onDeleted={noop}
        />,
      );
      expect(screen.getByLabelText('Start')).toBeTruthy();
      unmount1();

      // a plain node has nothing to date — the section stays off entirely,
      // even on the plan notation
      const { unmount: unmount2 } = render(
        <NodePanel
          model={planModel('service')}
          nodeId="z"
          activePlane={undefined}
          notation="plan"
          onCommand={vi.fn()}
          onClose={noop}
          onDeleted={noop}
        />,
      );
      expect(screen.queryByLabelText('Start')).toBeNull();
      expect(screen.queryByRole('heading', { name: 'Plan' })).toBeNull();
      unmount2();

      // the house rule: a zone that already carries dates keeps its editor
      // even off the plan notation, so switching planes strands nothing
      const { unmount: unmount3 } = render(
        <NodePanel
          model={zone}
          nodeId="z"
          activePlane={undefined}
          onCommand={vi.fn()}
          onClose={noop}
          onDeleted={noop}
        />,
      );
      expect(screen.getByLabelText('Start')).toBeTruthy();
      unmount3();

      // …including a zone whose only date is `end`: half a span is exactly the
      // state the section exists to finish, and it is reachable (clear Start in
      // the inspector), so the rule must read every key it offers
      render(
        <NodePanel
          model={planModel('plan-zone', { end: '2026-03-27' })}
          nodeId="z"
          activePlane={undefined}
          onCommand={vi.fn()}
          onClose={noop}
          onDeleted={noop}
        />,
      );
      expect(screen.getByLabelText('End')).toBeTruthy();
    });

    it('retyping into plan-zone via the Type field batches the retype with seeded dates, so undo reverts both together', () => {
      const onCommand = vi.fn();
      render(
        <NodePanel
          model={planModel('service')}
          nodeId="z"
          activePlane={undefined}
          onCommand={onCommand}
          onClose={noop}
          onDeleted={noop}
          today="2026-05-04"
        />,
      );
      const typeInput = screen.getByLabelText('Type') as HTMLInputElement;
      fireEvent.change(typeInput, { target: { value: 'plan-zone' } });
      fireEvent.blur(typeInput);
      expect(onCommand).toHaveBeenCalledWith({
        type: 'batch',
        commands: [
          { type: 'set-node-details', id: 'z', details: { type: 'plan-zone' } },
          { type: 'set-plan-dates', id: 'z', dates: { start: '2026-05-04', end: '2026-05-17' } },
        ],
      });
    });

    it('retyping with no `today` (e.g. an embedding with nothing plan-shaped to seed) sends the plain retype, unbatched', () => {
      const onCommand = vi.fn();
      render(
        <NodePanel
          model={planModel('service')}
          nodeId="z"
          activePlane={undefined}
          onCommand={onCommand}
          onClose={noop}
          onDeleted={noop}
        />,
      );
      const typeInput = screen.getByLabelText('Type') as HTMLInputElement;
      fireEvent.change(typeInput, { target: { value: 'plan-zone' } });
      fireEvent.blur(typeInput);
      expect(onCommand).toHaveBeenCalledWith({ type: 'set-node-details', id: 'z', details: { type: 'plan-zone' } });
    });
  });

  it('offers Comments and Links on a plain node (unlike Threats, not gated on a notation)', () => {
    render(
      <NodePanel
        model={testModel()}
        nodeId="a"
        activePlane="flow"
        onCommand={vi.fn()}
        onClose={noop}
        onDeleted={noop}
      />,
    );
    expect(screen.getByRole('region', { name: 'Comments' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Links' })).toBeTruthy();
  });

  // What each text box keeps while it is being typed in, and what replaces it:
  // a box follows its own stored value when that changes underneath it (an
  // Undo above all) and keeps an unsaved draft through any other change.
  describe('draft fields', () => {
    const full: DiagramNode = {
      id: 'a',
      name: 'a',
      type: 'service',
      icon: 'server',
      shape: '/library/shapes/person.svg',
      technology: 'Go',
      link: 'https://a',
      description: 'about a',
    };
    const withNode = (node: DiagramNode | undefined): DiagramModel => {
      const base = testModel();
      return { ...base, nodes: node === undefined ? base.nodes.slice(1) : [node, ...base.nodes.slice(1)] };
    };
    const props = (model: DiagramModel): ComponentProps<typeof NodePanel> => ({
      model,
      nodeId: 'a',
      activePlane: 'flow',
      onCommand: vi.fn(),
      onClose: noop,
      onDeleted: noop,
    });
    const FIELDS = [
      ['Name', 'name'],
      ['Type', 'type'],
      ['Icon', 'icon'],
      ['Shape', 'shape'],
      ['Technology', 'technology'],
      ['Link', 'link'],
      ['Description', 'description'],
    ] as const;
    const box = (label: string) => screen.getByLabelText<HTMLInputElement | HTMLTextAreaElement>(label);

    // breaks if a field's resync keys on anything wider than its own stored
    // value (the node, the model), or if it stops following that value
    it.each(FIELDS)('%s keeps a draft through the other fields changing, and takes its own new value', (label, key) => {
      const { rerender } = render(<NodePanel {...props(withNode(full))} />);
      fireEvent.change(box(label), { target: { value: 'typed' } });
      const others = Object.fromEntries(FIELDS.filter(([, k]) => k !== key).map(([, k]) => [k, `${full[k]}-2`]));
      rerender(<NodePanel {...props(withNode({ ...full, ...others }))} />);
      expect(box(label).value).toBe('typed');
      for (const [other, k] of FIELDS) if (k !== key) expect(box(other).value).toBe(`${full[k]}-2`);
      rerender(<NodePanel {...props(withNode({ ...full, ...others, [key]: 'stored' }))} />);
      expect(box(label).value).toBe('stored');
    });

    // breaks if the resync keys on the value as the box shows it ('' for
    // absent) instead of the stored one: absent → '' is a change too
    it('an optional field resyncs when its stored value goes from absent to empty', () => {
      const { description: _d, ...bare } = full;
      const { rerender } = render(<NodePanel {...props(withNode(bare))} />);
      fireEvent.change(box('Description'), { target: { value: 'typed' } });
      rerender(<NodePanel {...props(withNode({ ...bare, description: '' }))} />);
      expect(box('Description').value).toBe('');
    });

    // breaks if the name's resync clears the draft while the node is missing
    // (one more commit) or stops following the name when the node returns
    it('the name leaves its draft alone while the node is missing, and follows it back', () => {
      let commits = 0;
      const ui = (model: DiagramModel) => (
        <Profiler id="panel" onRender={() => commits++}>
          <NodePanel {...props(model)} />
        </Profiler>
      );
      const { rerender } = render(ui(withNode({ id: 'a', name: 'a' })));
      commits = 0;
      rerender(ui(withNode(undefined)));
      expect(screen.getByText('Node not found.')).toBeTruthy();
      expect(commits).toBe(1);
      rerender(ui(withNode({ id: 'a', name: 'back' })));
      expect(box('Name').value).toBe('back');
    });

    // breaks if the position inputs stop re-seeding from a new saved position,
    // or re-seed on a re-render that leaves the coordinates as they were
    it('the position inputs keep a draft until the saved position moves', () => {
      const ui = (saved: { x: number; y: number }) => (
        <NodePanel {...props(withNode(full))} hasSavedPosition savedPosition={saved} />
      );
      const { rerender } = render(ui({ x: 1, y: 2 }));
      fireEvent.change(box('X'), { target: { value: '50' } });
      rerender(ui({ x: 1, y: 2 }));
      expect(box('X').value).toBe('50');
      rerender(ui({ x: 1, y: 3 }));
      expect(box('X').value).toBe('1');
      expect(box('Y').value).toBe('3');
    });

    // breaks if the metadata rows re-seed on a model change that keeps the
    // node's metadata object, or stop re-seeding when it is replaced
    it('the metadata rows keep a draft until the metadata itself changes', () => {
      const metadata = { owner: 'ops' };
      const { rerender } = render(<NodePanel {...props(withNode({ ...full, metadata }))} />);
      fireEvent.change(box('Metadata value 1'), { target: { value: 'typed' } });
      rerender(<NodePanel {...props(withNode({ ...full, name: 'renamed', metadata }))} />);
      expect(box('Metadata value 1').value).toBe('typed');
      rerender(<NodePanel {...props(withNode({ ...full, metadata: { owner: 'dev' } }))} />);
      expect(box('Metadata value 1').value).toBe('dev');
    });

    // breaks if the new-row and add-membership drafts are dropped by a
    // re-render or by a model change
    it('the add-row boxes keep what is typed across model changes', () => {
      const { rerender } = render(<NodePanel {...props(withNode(full))} />);
      fireEvent.change(box('New metadata key'), { target: { value: 'k' } });
      fireEvent.change(box('New metadata value'), { target: { value: 'v' } });
      fireEvent.change(screen.getByLabelText('Add parent'), { target: { value: 'sys' } });
      fireEvent.change(screen.getByLabelText('Add plane'), { target: { value: 'arch' } });
      rerender(<NodePanel {...props(withNode({ ...full, name: 'renamed' }))} />);
      expect(box('New metadata key').value).toBe('k');
      expect(box('New metadata value').value).toBe('v');
      expect((screen.getByLabelText('Add parent') as HTMLSelectElement).value).toBe('sys');
      expect((screen.getByLabelText('Add plane') as HTMLSelectElement).value).toBe('arch');
    });
  });

  // breaks if the name is focused on a re-render too, or not on mount
  it('focuses and selects the name once, when mounted for a just-added node', () => {
    const ui = (name: string) => (
      <NodePanel
        model={{ ...testModel(), nodes: [{ id: 'a', name }, ...testModel().nodes.slice(1)] }}
        nodeId="a"
        activePlane="flow"
        autoFocusName
        onCommand={vi.fn()}
        onClose={noop}
        onDeleted={noop}
      />
    );
    const { rerender } = render(ui('a'));
    const name = screen.getByLabelText<HTMLTextAreaElement>('Name');
    expect(document.activeElement).toBe(name);
    expect([name.selectionStart, name.selectionEnd]).toEqual([0, 1]);
    name.blur();
    rerender(ui('b'));
    expect(document.activeElement).not.toBe(name);
  });

  // breaks if Scope or Hidden here dispatch another command shape
  it('scopes the node to the plane, and hides a shared one there', () => {
    const onCommand = vi.fn();
    const ui = (model: DiagramModel) => (
      <NodePanel model={model} nodeId="a" activePlane="flow" onCommand={onCommand} onClose={noop} onDeleted={noop} />
    );
    const { rerender } = render(ui(testModel()));
    fireEvent.change(screen.getByLabelText('Scope'), { target: { value: 'local' } });
    expect(onCommand).toHaveBeenLastCalledWith({ type: 'set-node-details', id: 'a', details: { plane: 'flow' } });
    fireEvent.click(screen.getByLabelText('Hidden here'));
    expect(onCommand).toHaveBeenLastCalledWith({
      type: 'set-node-plane-hidden',
      nodeId: 'a',
      plane: 'flow',
      hidden: true,
    });
    const local = { ...testModel(), nodes: [{ id: 'a', name: 'a', plane: 'flow' }, ...testModel().nodes.slice(1)] };
    rerender(ui(local));
    expect(screen.queryByLabelText('Hidden here')).toBeNull();
    fireEvent.change(screen.getByLabelText('Scope'), { target: { value: 'shared' } });
    expect(onCommand).toHaveBeenLastCalledWith({ type: 'set-node-details', id: 'a', details: { plane: null } });
  });

  // breaks if Add membership changes its command, or stops resetting its picks
  it('adds a membership on the chosen plane, or untagged on the default, and resets the pickers', () => {
    const onCommand = vi.fn();
    render(
      <NodePanel
        model={testModel()}
        nodeId="a"
        activePlane="flow"
        onCommand={onCommand}
        onClose={noop}
        onDeleted={noop}
      />,
    );
    const add = screen.getByRole('button', { name: 'Add' }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Add parent'), { target: { value: 'sys' } });
    fireEvent.change(screen.getByLabelText('Add plane'), { target: { value: 'arch' } });
    fireEvent.click(add);
    expect(onCommand).toHaveBeenLastCalledWith({ type: 'add-containment', parent: 'sys', child: 'a', plane: 'arch' });
    expect((screen.getByLabelText('Add parent') as HTMLSelectElement).value).toBe('');
    expect((screen.getByLabelText('Add plane') as HTMLSelectElement).value).toBe('');
    fireEvent.change(screen.getByLabelText('Add parent'), { target: { value: 'sys' } });
    fireEvent.click(add);
    expect(onCommand).toHaveBeenLastCalledWith({ type: 'add-containment', parent: 'sys', child: 'a' });
  });
});
