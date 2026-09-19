// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DiagramModel } from '@diagramming/core';
import { EdgePanel } from './EdgePanel';

function testModel(): DiagramModel {
  return {
    version: 1,
    id: 'draft',
    name: 'draft',
    nodes: [
      { id: 'a', name: 'A', type: 'service' },
      { id: 'b', name: 'B', type: 'service' },
    ],
    containment: [],
    relations: [
      { id: 'a->b#0', from: 'a', to: 'b', kind: 'sync' },
      { id: 'a->b#1', from: 'a', to: 'b', kind: 'async', label: 'events' },
    ],
    layers: [{ id: 'ops', name: 'Ops' }],
    planes: [],
  };
}

function noop() {
  /* intentionally empty */
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('EdgePanel', () => {
  it('commits a kind change on Enter as update-relation (single constituent)', () => {
    const onCommand = vi.fn();
    render(<EdgePanel model={testModel()} constituentIds={['a->b#0']} onCommand={onCommand} onClose={noop} />);
    const kind = screen.getByLabelText('Kind');
    fireEvent.change(kind, { target: { value: 'writes' } });
    fireEvent.keyDown(kind, { key: 'Enter' });
    expect(onCommand).toHaveBeenCalledWith({ type: 'update-relation', id: 'a->b#0', patch: { kind: 'writes' } });
  });

  it('reassigns the layer as update-relation (single constituent)', () => {
    const onCommand = vi.fn();
    render(<EdgePanel model={testModel()} constituentIds={['a->b#0']} onCommand={onCommand} onClose={noop} />);
    fireEvent.change(screen.getByLabelText('Layer'), { target: { value: 'ops' } });
    expect(onCommand).toHaveBeenCalledWith({ type: 'update-relation', id: 'a->b#0', patch: { layer: 'ops' } });
  });

  it('commits style changes immediately, merging into the existing style', () => {
    const onCommand = vi.fn();
    const m = testModel();
    m.relations[0]!.style = { color: '#ff0000' };
    render(<EdgePanel model={m} constituentIds={['a->b#0']} onCommand={onCommand} onClose={noop} />);
    fireEvent.click(within(screen.getByRole('group', { name: 'Shape' })).getByRole('button', { name: 'straight' }));
    expect(onCommand).toHaveBeenCalledWith({
      type: 'update-relation',
      id: 'a->b#0',
      patch: { style: { color: '#ff0000', shape: 'straight' } },
    });
    fireEvent.click(within(screen.getByRole('group', { name: 'Arrow end' })).getByRole('button', { name: 'none' }));
    expect(onCommand).toHaveBeenCalledWith({
      type: 'update-relation',
      id: 'a->b#0',
      patch: { style: { color: '#ff0000', end: 'none' } },
    });
  });

  it('clearing the last style field drops the style object entirely', () => {
    const onCommand = vi.fn();
    const m = testModel();
    m.relations[0]!.style = { width: 4 };
    render(<EdgePanel model={m} constituentIds={['a->b#0']} onCommand={onCommand} onClose={noop} />);
    fireEvent.click(within(screen.getByRole('group', { name: 'Thickness' })).getByRole('button', { name: 'default' }));
    expect(onCommand).toHaveBeenCalledWith({ type: 'update-relation', id: 'a->b#0', patch: { style: null } });
  });

  it('deletes the relation after confirm as delete-relation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onCommand = vi.fn();
    const onClose = vi.fn();
    render(<EdgePanel model={testModel()} constituentIds={['a->b#0']} onCommand={onCommand} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /delete relation/i }));
    // the confirm goes through the async host dialog, so the command lands a tick later
    await waitFor(() => expect(onCommand).toHaveBeenCalledWith({ type: 'delete-relation', id: 'a->b#0' }));
  });

  it('sets polarity as update-relation, and clears it back to null', () => {
    const onCommand = vi.fn();
    render(
      <EdgePanel
        model={testModel()}
        constituentIds={['a->b#0']}
        onCommand={onCommand}
        onClose={noop}
        notation="causal-loop"
      />,
    );
    fireEvent.click(within(screen.getByRole('group', { name: 'Polarity' })).getByRole('button', { name: '+' }));
    expect(onCommand).toHaveBeenCalledWith({
      type: 'update-relation',
      id: 'a->b#0',
      patch: { polarity: '+' },
    });
    fireEvent.click(within(screen.getByRole('group', { name: 'Polarity' })).getByRole('button', { name: '∅' }));
    expect(onCommand).toHaveBeenCalledWith({
      type: 'update-relation',
      id: 'a->b#0',
      patch: { polarity: null },
    });
    // the '−' button DISPLAYS U+2212 but must STORE ASCII '-' (the model's Polarity type)
    fireEvent.click(within(screen.getByRole('group', { name: 'Polarity' })).getByRole('button', { name: '−' }));
    expect(onCommand).toHaveBeenCalledWith({
      type: 'update-relation',
      id: 'a->b#0',
      patch: { polarity: '-' },
    });
  });

  it('sets delay as update-relation, and clears it back to null', () => {
    const onCommand = vi.fn();
    render(
      <EdgePanel
        model={testModel()}
        constituentIds={['a->b#0']}
        onCommand={onCommand}
        onClose={noop}
        notation="causal-loop"
      />,
    );
    fireEvent.click(within(screen.getByRole('group', { name: 'Delay' })).getByRole('button', { name: '‖' }));
    expect(onCommand).toHaveBeenCalledWith({
      type: 'update-relation',
      id: 'a->b#0',
      patch: { delay: true },
    });
    fireEvent.click(within(screen.getByRole('group', { name: 'Delay' })).getByRole('button', { name: '·' }));
    expect(onCommand).toHaveBeenCalledWith({
      type: 'update-relation',
      id: 'a->b#0',
      patch: { delay: null },
    });
  });

  it('commits curvature into style', () => {
    const onCommand = vi.fn();
    render(
      <EdgePanel
        model={testModel()}
        constituentIds={['a->b#0']}
        onCommand={onCommand}
        onClose={noop}
        notation="causal-loop"
      />,
    );
    fireEvent.click(within(screen.getByRole('group', { name: 'Curvature' })).getByRole('button', { name: '0.8' }));
    expect(onCommand).toHaveBeenCalledWith({
      type: 'update-relation',
      id: 'a->b#0',
      patch: { style: { curvature: 0.8 } },
    });
  });

  it('flips the bow side into style (left → right)', () => {
    const onCommand = vi.fn();
    render(
      <EdgePanel
        model={testModel()}
        constituentIds={['a->b#0']}
        onCommand={onCommand}
        onClose={noop}
        notation="causal-loop"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /flip curve/i }));
    expect(onCommand).toHaveBeenCalledWith({
      type: 'update-relation',
      id: 'a->b#0',
      patch: { style: { bow: 'right' } },
    });
  });

  it('toggles the bow flip back off, dropping the style when it was the only field', () => {
    const onCommand = vi.fn();
    const m = testModel();
    m.relations[0]!.style = { bow: 'right' };
    render(
      <EdgePanel
        model={m}
        constituentIds={['a->b#0']}
        onCommand={onCommand}
        onClose={noop}
        notation="causal-loop"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /flip curve/i }));
    expect(onCommand).toHaveBeenCalledWith({ type: 'update-relation', id: 'a->b#0', patch: { style: null } });
  });

  it('lists parallel relations and edits the one clicked through', () => {
    const onCommand = vi.fn();
    render(
      <EdgePanel model={testModel()} constituentIds={['a->b#0', 'a->b#1']} onCommand={onCommand} onClose={noop} />,
    );
    // Aggregated edge with two constituents renders a list, not a form.
    expect(screen.queryByLabelText('Kind')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /edit relation a->b#1/i }));
    const kind = screen.getByLabelText<HTMLInputElement>('Kind');
    expect(kind.value).toBe('async');
    fireEvent.change(kind, { target: { value: 'flow' } });
    fireEvent.keyDown(kind, { key: 'Enter' });
    expect(onCommand).toHaveBeenCalledWith({ type: 'update-relation', id: 'a->b#1', patch: { kind: 'flow' } });
  });

  it('adds a label via Add label, committing the typed text on Enter', () => {
    const onCommand = vi.fn();
    // a->b#0 carries no labels, so Add label opens a fresh row
    render(<EdgePanel model={testModel()} constituentIds={['a->b#0']} onCommand={onCommand} onClose={noop} />);
    fireEvent.click(screen.getByRole('button', { name: /add label/i }));
    const input = screen.getByLabelText('New label text');
    fireEvent.change(input, { target: { value: 'ack' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommand).toHaveBeenCalledWith({
      type: 'update-relation',
      id: 'a->b#0',
      patch: { labels: [{ id: 'l1', text: 'ack', t: 0.5, side: 'center' }] },
    });
  });

  it('shows a legacy `label` as a row and edits its text (upgrading to labels)', () => {
    const onCommand = vi.fn();
    // a->b#1 carries a legacy `label: 'events'`
    render(<EdgePanel model={testModel()} constituentIds={['a->b#1']} onCommand={onCommand} onClose={noop} />);
    const input = screen.getByLabelText<HTMLInputElement>('Label 1 text');
    expect(input.value).toBe('events');
    fireEvent.change(input, { target: { value: 'renamed' } });
    fireEvent.blur(input);
    expect(onCommand).toHaveBeenCalledWith({
      type: 'update-relation',
      id: 'a->b#1',
      patch: { labels: [{ id: 'legacy', text: 'renamed', t: 0.5, side: 'center' }] },
    });
  });

  it('retargets a label side to bottom via its toggle', () => {
    const onCommand = vi.fn();
    render(<EdgePanel model={testModel()} constituentIds={['a->b#1']} onCommand={onCommand} onClose={noop} />);
    fireEvent.click(within(screen.getByRole('group', { name: 'Label 1 side' })).getByRole('button', { name: 'bottom' }));
    expect(onCommand).toHaveBeenCalledWith({
      type: 'update-relation',
      id: 'a->b#1',
      patch: { labels: [{ id: 'legacy', text: 'events', t: 0.5, side: 'bottom' }] },
    });
  });

  it('removes the only label, clearing labels to null', () => {
    const onCommand = vi.fn();
    render(<EdgePanel model={testModel()} constituentIds={['a->b#1']} onCommand={onCommand} onClose={noop} />);
    fireEvent.click(screen.getByRole('button', { name: /remove label 1/i }));
    expect(onCommand).toHaveBeenCalledWith({ type: 'update-relation', id: 'a->b#1', patch: { labels: null } });
  });

  it('shows CLD controls (Polarity/Delay/Curvature/Flip curve) only on a causal-loop plane', () => {
    const onCommand = vi.fn();
    const { rerender } = render(
      <EdgePanel
        model={testModel()}
        constituentIds={['a->b#0']}
        onCommand={onCommand}
        onClose={noop}
        notation="causal-loop"
      />,
    );
    expect(screen.getByRole('group', { name: 'Polarity' })).toBeDefined();
    expect(screen.getByRole('group', { name: 'Delay' })).toBeDefined();
    expect(screen.getByRole('group', { name: 'Curvature' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Flip curve' })).toBeDefined();

    rerender(<EdgePanel model={testModel()} constituentIds={['a->b#0']} onCommand={onCommand} onClose={noop} />);
    expect(screen.queryByRole('group', { name: 'Polarity' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Delay' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Curvature' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Flip curve' })).toBeNull();
    // always-on controls stay regardless of notation
    expect(screen.getByLabelText('Kind')).toBeDefined();
    expect(screen.getByRole('group', { name: 'Shape' })).toBeDefined();
    // hiding the CLD controls must not clear their underlying data
    expect(onCommand).not.toHaveBeenCalled();
  });

  describe('threats', () => {
    // Two boundaries on the default plane with one node each, and a flow
    // between them — the crossing the section reports is derived from this
    // containment, never authored.
    function dfd(): DiagramModel {
      return {
        version: 1,
        id: 'draft',
        name: 'draft',
        nodes: [
          { id: 'dmz', name: 'DMZ', type: 'tm-boundary' },
          { id: 'backend', name: 'Backend', type: 'tm-boundary' },
          { id: 'api', name: 'API', type: 'tm-process' },
          { id: 'db', name: 'DB', type: 'tm-store' },
        ],
        containment: [
          { parent: 'dmz', child: 'api' },
          { parent: 'backend', child: 'db' },
        ],
        relations: [{ id: 'api->db#0', from: 'api', to: 'db', kind: 'data-flow' }],
        layers: [],
        planes: [],
      };
    }

    it('offers the section on a threat-model plane, categories led by the ones a flow invites', () => {
      render(
        <EdgePanel
          model={dfd()}
          constituentIds={['api->db#0']}
          onCommand={vi.fn()}
          onClose={noop}
          notation="threat-model"
        />,
      );
      const first = (screen.getByLabelText('New threat category') as HTMLSelectElement).options[0];
      expect(first?.textContent).toBe('T · Tampering'); // a data flow takes T, I, D
    });

    it('names the boundaries the flow crosses on the active plane', () => {
      render(
        <EdgePanel
          model={dfd()}
          constituentIds={['api->db#0']}
          onCommand={vi.fn()}
          onClose={noop}
          notation="threat-model"
          activePlane={undefined}
        />,
      );
      expect(screen.getByText('Crosses: DMZ → Backend')).toBeTruthy();
    });

    it('says nothing about crossings for a flow inside one boundary', () => {
      const m = dfd();
      m.containment[1] = { parent: 'dmz', child: 'db' };
      render(
        <EdgePanel model={m} constituentIds={['api->db#0']} onCommand={vi.fn()} onClose={noop} notation="threat-model" />,
      );
      expect(screen.queryByText(/^Crosses:/)).toBeNull();
    });

    it('stays out of the way off the notation, unless the relation already carries threats', () => {
      const { unmount } = render(
        <EdgePanel model={dfd()} constituentIds={['api->db#0']} onCommand={vi.fn()} onClose={noop} />,
      );
      expect(screen.queryByRole('region', { name: 'Threats' })).toBeNull();
      unmount();

      const m = dfd();
      m.relations[0]!.threats = [{ id: 't1', category: 'T', title: 'Replayed write' }];
      render(<EdgePanel model={m} constituentIds={['api->db#0']} onCommand={vi.fn()} onClose={noop} />);
      expect(screen.getByLabelText('Threat t1 title')).toBeTruthy();
    });

    it('keeps the list view of a merged edge threat-free; the section is per relation', () => {
      const m = dfd();
      m.relations.push({ id: 'api->db#1', from: 'api', to: 'db', kind: 'data-flow' });
      render(
        <EdgePanel
          model={m}
          constituentIds={['api->db#0', 'api->db#1']}
          onCommand={vi.fn()}
          onClose={noop}
          notation="threat-model"
        />,
      );
      expect(screen.queryByRole('region', { name: 'Threats' })).toBeNull();

      fireEvent.click(screen.getByRole('button', { name: 'Edit relation api->db#1' }));
      expect(screen.getByRole('region', { name: 'Threats' })).toBeTruthy();
    });

    it('targets the relation it is editing', () => {
      const onCommand = vi.fn();
      render(
        <EdgePanel
          model={dfd()}
          constituentIds={['api->db#0']}
          onCommand={onCommand}
          onClose={noop}
          notation="threat-model"
        />,
      );
      fireEvent.change(screen.getByLabelText('New threat'), { target: { value: 'Tampered payload' } });
      fireEvent.click(screen.getByRole('button', { name: 'Add threat' }));
      expect(onCommand).toHaveBeenCalledWith({
        type: 'add-threat',
        target: { relation: 'api->db#0' },
        threat: { id: 't1', category: 'T', title: 'Tampered payload' },
      });
    });
  });
});
