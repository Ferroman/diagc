// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DiagramModel } from '@diagc/core';
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

  it('shows the pinned position and commits an edited coordinate as set-position', () => {
    const onCommand = vi.fn();
    render(
      <NodePanel model={testModel()} nodeId="a" activePlane="flow" hasPin pinned={{ x: 40, y: 60 }} onCommand={onCommand} onClose={noop} onDeleted={noop} />,
    );
    const x = screen.getByLabelText('X') as HTMLInputElement;
    expect(x.value).toBe('40');
    expect((screen.getByLabelText('Y') as HTMLInputElement).value).toBe('60');
    fireEvent.change(x, { target: { value: '100' } });
    fireEvent.keyDown(x, { key: 'Enter' });
    expect(onCommand).toHaveBeenCalledWith({ type: 'set-position', nodeId: 'a', x: 100, y: 60, plane: 'flow' });
  });

  it('an unpinned node shows the live position as a placeholder and pins on commit', () => {
    const onCommand = vi.fn();
    render(
      <NodePanel model={testModel()} nodeId="a" activePlane="flow" live={{ x: 12.6, y: 7 }} onCommand={onCommand} onClose={noop} onDeleted={noop} />,
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
    render(<NodePanel model={testModel()} nodeId="a" activePlane="flow" onCommand={onCommand} onClose={noop} onDeleted={noop} />);
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
      render(<NodePanel model={testModel()} nodeId="a" activePlane="flow" onCommand={onCommand} onClose={noop} onDeleted={noop} />);
      fireEvent.click(screen.getByRole('button', { name: 'Delete node' }));
      expect(onCommand).toHaveBeenCalledWith({ type: 'delete-node', id: 'a' });
    });

    it('cascade-deletes a notation container whose children cannot be re-homed', () => {
      const onCommand = vi.fn();
      render(
        <NodePanel model={frameModel()} nodeId="frame" activePlane={undefined} onCommand={onCommand} onClose={noop} onDeleted={noop} />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Delete node' }));
      expect(onCommand).toHaveBeenCalledWith({ type: 'delete-node', id: 'frame', cascade: true });
    });

    it('Ungroup severs only, even on a notation container', () => {
      const onCommand = vi.fn();
      render(
        <NodePanel model={frameModel()} nodeId="frame" activePlane={undefined} onCommand={onCommand} onClose={noop} onDeleted={noop} />,
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
        <NodePanel model={tmModel()} nodeId="p" activePlane={undefined} onCommand={vi.fn()} onClose={noop} onDeleted={noop} />,
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
      fireEvent.click(within(screen.getByRole('region', { name: 'Threats' })).getByRole('button', { name: 'Add threat' }));
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
        <NodePanel model={zone} nodeId="z" activePlane={undefined} notation="plan" onCommand={vi.fn()} onClose={noop} onDeleted={noop} />,
      );
      expect(screen.getByLabelText('Start')).toBeTruthy();
      unmount1();

      // a plain node has nothing to date — the section stays off entirely,
      // even on the plan notation
      const { unmount: unmount2 } = render(
        <NodePanel model={planModel('service')} nodeId="z" activePlane={undefined} notation="plan" onCommand={vi.fn()} onClose={noop} onDeleted={noop} />,
      );
      expect(screen.queryByLabelText('Start')).toBeNull();
      expect(screen.queryByRole('heading', { name: 'Plan' })).toBeNull();
      unmount2();

      // the house rule: a zone that already carries dates keeps its editor
      // even off the plan notation, so switching planes strands nothing
      const { unmount: unmount3 } = render(
        <NodePanel model={zone} nodeId="z" activePlane={undefined} onCommand={vi.fn()} onClose={noop} onDeleted={noop} />,
      );
      expect(screen.getByLabelText('Start')).toBeTruthy();
      unmount3();

      // …including a zone whose only date is `end`: half a span is exactly the
      // state the section exists to finish, and it is reachable (clear Start in
      // the inspector), so the rule must read every key it offers
      render(
        <NodePanel model={planModel('plan-zone', { end: '2026-03-27' })} nodeId="z" activePlane={undefined} onCommand={vi.fn()} onClose={noop} onDeleted={noop} />,
      );
      expect(screen.getByLabelText('End')).toBeTruthy();
    });

    it('retyping into plan-zone via the Type field batches the retype with seeded dates, so undo reverts both together', () => {
      const onCommand = vi.fn();
      render(
        <NodePanel model={planModel('service')} nodeId="z" activePlane={undefined} onCommand={onCommand} onClose={noop} onDeleted={noop} today="2026-05-04" />,
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
        <NodePanel model={planModel('service')} nodeId="z" activePlane={undefined} onCommand={onCommand} onClose={noop} onDeleted={noop} />,
      );
      const typeInput = screen.getByLabelText('Type') as HTMLInputElement;
      fireEvent.change(typeInput, { target: { value: 'plan-zone' } });
      fireEvent.blur(typeInput);
      expect(onCommand).toHaveBeenCalledWith({ type: 'set-node-details', id: 'z', details: { type: 'plan-zone' } });
    });
  });

  it('offers Comments and Links on a plain node (unlike Threats, not gated on a notation)', () => {
    render(
      <NodePanel model={testModel()} nodeId="a" activePlane="flow" onCommand={vi.fn()} onClose={noop} onDeleted={noop} />,
    );
    expect(screen.getByRole('region', { name: 'Comments' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Links' })).toBeTruthy();
  });
});
