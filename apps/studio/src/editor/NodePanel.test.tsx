// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DiagramModel } from '@diagramming/core';
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
      <NodePanel
        model={model}
        nodeId="a"
        activePlane="flow"
        onCommand={onCommand}
        onClose={noop}
        onDeleted={noop}
      />,
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
      <NodePanel
        model={renamed}
        nodeId="a"
        activePlane="flow"
        onCommand={onCommand}
        onClose={noop}
        onDeleted={noop}
      />,
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
      nodes: base.nodes.map((n) =>
        n.id === 'a' ? { ...n, metadata: { owner: 'platform-team', tier: 'gold' } } : n,
      ),
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

  it('clears a pinned position for the active plane when pinned', () => {
    const onCommand = vi.fn();
    render(
      <NodePanel
        model={testModel()}
        nodeId="a"
        activePlane="flow"
        hasPin
        onCommand={onCommand}
        onClose={noop}
        onDeleted={noop}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /clear pinned position/i }));
    expect(onCommand).toHaveBeenCalledWith({ type: 'clear-position', nodeId: 'a', plane: 'flow' });
  });

  it('hides the clear-pin button when the node is not pinned', () => {
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

  it('hides the Scope and Hidden-here controls on a borrowed-containment plane', () => {
    // A borrowing plane's membership resolves to its base plane, so editing
    // plane-scoped membership there would write to the wrong plane id and
    // silently vanish the node — Stage 1 disables the controls entirely.
    const base = testModel();
    const model: DiagramModel = {
      ...base,
      planes: [...base.planes, { id: 'borrow', name: 'Borrow', containmentOf: 'arch' }],
    };
    render(
      <NodePanel model={model} nodeId="a" activePlane="borrow" onCommand={vi.fn()} onClose={noop} onDeleted={noop} />,
    );
    expect(screen.queryByLabelText('Scope')).toBeNull();
    expect(screen.queryByLabelText('Hidden here')).toBeNull();
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
    render(
      <NodePanel model={m} nodeId="a" activePlane="flow" onCommand={onCommand} onClose={noop} onDeleted={noop} />,
    );
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
    render(<NodePanel model={testModel()} nodeId="a" activePlane="flow" onCommand={onCommand} onClose={noop} onDeleted={noop} />);
    fireEvent.click(screen.getByRole('button', { name: 'Center' }));
    expect(onCommand).toHaveBeenCalledWith({ type: 'set-node-details', id: 'a', details: { textAlign: 'center' } });
  });
  it('sets font size to large', () => {
    const onCommand = vi.fn();
    render(<NodePanel model={testModel()} nodeId="a" activePlane="flow" onCommand={onCommand} onClose={noop} onDeleted={noop} />);
    fireEvent.click(screen.getByRole('button', { name: 'Large' }));
    expect(onCommand).toHaveBeenCalledWith({ type: 'set-node-details', id: 'a', details: { fontScale: 'lg' } });
  });
});
