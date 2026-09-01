// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { model, type DiagramModel } from '@diagramming/core';
import { LayersPlanesPanel } from './LayersPlanesPanel';

function testModel(): DiagramModel {
  return {
    version: 1,
    id: 'draft',
    name: 'draft',
    nodes: [],
    containment: [],
    relations: [],
    layers: [{ id: 'ops', name: 'Ops' }],
    planes: [
      { id: 'arch', name: 'Architecture' },
      { id: 'flow', name: 'Flow' },
    ],
  };
}

function twoLayerModel(): DiagramModel {
  return {
    ...testModel(),
    layers: [
      { id: 'ops', name: 'Ops' },
      { id: 'net', name: 'Net' },
    ],
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('LayersPlanesPanel', () => {
  it('adds a layer with a slug id derived from the name', () => {
    const onCommand = vi.fn();
    render(<LayersPlanesPanel model={testModel()} onCommand={onCommand} />);
    fireEvent.change(screen.getByLabelText('New layer name'), { target: { value: 'Security Zone' } });
    fireEvent.click(screen.getByRole('button', { name: /add layer/i }));
    expect(onCommand).toHaveBeenCalledWith({
      type: 'upsert-layer',
      layer: { id: 'security-zone', name: 'Security Zone' },
    });
  });

  it('sets a layer tint as upsert-layer', () => {
    const onCommand = vi.fn();
    render(<LayersPlanesPanel model={testModel()} onCommand={onCommand} />);
    fireEvent.change(screen.getByLabelText('Layer tint ops'), { target: { value: '#ff0000' } });
    expect(onCommand).toHaveBeenCalledWith({
      type: 'upsert-layer',
      layer: { id: 'ops', name: 'Ops', tint: '#ff0000' },
    });
  });

  it('borrows containment via upsert-plane with containmentOf', () => {
    const onCommand = vi.fn();
    render(<LayersPlanesPanel model={testModel()} onCommand={onCommand} />);
    fireEvent.change(screen.getByLabelText('Containment of Flow'), { target: { value: 'arch' } });
    expect(onCommand).toHaveBeenCalledWith({
      type: 'upsert-plane',
      plane: { id: 'flow', name: 'Flow', containmentOf: 'arch' },
    });
  });

  it('deletes a plane after confirm as delete-plane', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onCommand = vi.fn();
    render(<LayersPlanesPanel model={testModel()} onCommand={onCommand} />);
    fireEvent.click(screen.getByRole('button', { name: /remove plane flow/i }));
    expect(onCommand).toHaveBeenCalledWith({ type: 'delete-plane', id: 'flow' });
  });

  it('sets a plane notation via upsert-plane', () => {
    const onCommand = vi.fn();
    render(<LayersPlanesPanel model={testModel()} onCommand={onCommand} />);
    fireEvent.change(screen.getByLabelText('Notation Flow'), { target: { value: 'causal-loop' } });
    expect(onCommand).toHaveBeenCalledWith({
      type: 'upsert-plane',
      plane: { id: 'flow', name: 'Flow', notation: 'causal-loop' },
    });
  });

  it('seeds the notation select from an already-set plane', () => {
    const onCommand = vi.fn();
    const m = testModel();
    m.planes[1] = { ...m.planes[1]!, notation: 'causal-loop' };
    render(<LayersPlanesPanel model={m} onCommand={onCommand} />);
    expect(screen.getByLabelText<HTMLSelectElement>('Notation Flow').value).toBe('causal-loop');
  });

  it('clears the notation by selecting default look', () => {
    const onCommand = vi.fn();
    const m = testModel();
    m.planes[1] = { ...m.planes[1]!, notation: 'causal-loop' };
    render(<LayersPlanesPanel model={m} onCommand={onCommand} />);
    fireEvent.change(screen.getByLabelText('Notation Flow'), { target: { value: '' } });
    expect(onCommand).toHaveBeenCalledWith({
      type: 'upsert-plane',
      plane: { id: 'flow', name: 'Flow' },
    });
  });

  it('picks a layer as the pen (draw target) via onActivateLayer', () => {
    const onActivateLayer = vi.fn();
    render(
      <LayersPlanesPanel
        model={testModel()}
        onCommand={vi.fn()}
        activeLayer={null}
        onActivateLayer={onActivateLayer}
      />,
    );
    // base sheet is the checked draw target initially
    expect(screen.getByLabelText<HTMLInputElement>('Draw on base sheet').checked).toBe(true);
    fireEvent.click(screen.getByLabelText('Draw on Ops'));
    expect(onActivateLayer).toHaveBeenCalledWith('ops');
  });

  it('drops the pen back to the base sheet', () => {
    const onActivateLayer = vi.fn();
    render(
      <LayersPlanesPanel
        model={testModel()}
        onCommand={vi.fn()}
        activeLayer="ops"
        onActivateLayer={onActivateLayer}
      />,
    );
    expect(screen.getByLabelText<HTMLInputElement>('Draw on Ops').checked).toBe(true);
    fireEvent.click(screen.getByLabelText('Draw on base sheet'));
    expect(onActivateLayer).toHaveBeenCalledWith(null);
  });

  it('omits the draw picker when no pen handler is wired (view-only render)', () => {
    render(<LayersPlanesPanel model={testModel()} onCommand={vi.fn()} />);
    expect(screen.queryByLabelText('Draw on base sheet')).toBeNull();
  });

  it('view mode shows the plane switcher and calls onSelectPlane', () => {
    const onSelectPlane = vi.fn();
    render(
      <LayersPlanesPanel
        model={testModel()}
        onCommand={() => {}}
        mode="view"
        activePlane={undefined}
        onSelectPlane={onSelectPlane}
      />,
    );
    screen.getByRole('button', { name: 'Flow' }).click();
    expect(onSelectPlane).toHaveBeenCalledWith('flow');
  });

  it('view mode lists layers as visibility toggles reflecting activeLayers', () => {
    const onToggleLayer = vi.fn();
    render(
      <LayersPlanesPanel
        model={testModel()}
        onCommand={() => {}}
        mode="view"
        activeLayers={['ops']}
        onToggleLayer={onToggleLayer}
      />,
    );
    const ops = screen.getByRole('button', { name: 'Ops' });
    expect(ops.className).toContain('active');
    ops.click();
    expect(onToggleLayer).toHaveBeenCalledWith('ops');
  });

  it('view mode hides the layer editor and planes management', () => {
    render(<LayersPlanesPanel model={testModel()} onCommand={() => {}} mode="view" />);
    expect(screen.queryByRole('button', { name: /add layer/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /add plane/i })).toBeNull();
    expect(screen.queryByLabelText('Draw on base sheet')).toBeNull();
  });

  it('ctrl-click toggles selection on a layer row', () => {
    render(<LayersPlanesPanel model={twoLayerModel()} onCommand={vi.fn()} onMergeLayers={vi.fn()} />);
    const row = screen.getByLabelText('Layer name ops').closest('.lp-row')!;
    expect(row.className).not.toContain('selected');
    fireEvent.click(row, { ctrlKey: true });
    expect(row.className).toContain('selected');
    fireEvent.click(row, { ctrlKey: true });
    expect(row.className).not.toContain('selected');
  });

  it('disables Merge into when nothing is selected', () => {
    render(<LayersPlanesPanel model={twoLayerModel()} onCommand={vi.fn()} onMergeLayers={vi.fn()} />);
    const btn = screen.getByRole('button', { name: /merge selected layers/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('keeps Merge into enabled when every layer is selected (base is still a target)', () => {
    render(<LayersPlanesPanel model={twoLayerModel()} onCommand={vi.fn()} onMergeLayers={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('Layer name ops').closest('.lp-row')!, { ctrlKey: true });
    fireEvent.click(screen.getByLabelText('Layer name net').closest('.lp-row')!, { ctrlKey: true });
    const btn = screen.getByRole('button', { name: /merge selected layers/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it('merges the selection into a chosen target and clears the selection', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onMergeLayers = vi.fn();
    render(<LayersPlanesPanel model={twoLayerModel()} onCommand={vi.fn()} onMergeLayers={onMergeLayers} />);
    const opsRow = screen.getByLabelText('Layer name ops').closest('.lp-row')!;
    fireEvent.click(opsRow, { ctrlKey: true });
    fireEvent.click(screen.getByRole('button', { name: /merge selected layers/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Merge into Net' }));
    expect(onMergeLayers).toHaveBeenCalledWith(['ops'], 'net');
    expect(opsRow.className).not.toContain('selected');
  });

  it('does not merge when the confirm is cancelled', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const onMergeLayers = vi.fn();
    render(<LayersPlanesPanel model={twoLayerModel()} onCommand={vi.fn()} onMergeLayers={onMergeLayers} />);
    fireEvent.click(screen.getByLabelText('Layer name ops').closest('.lp-row')!, { ctrlKey: true });
    fireEvent.click(screen.getByRole('button', { name: /merge selected layers/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Merge into Net' }));
    expect(onMergeLayers).not.toHaveBeenCalled();
  });

  it('merges the selection into the base sheet', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onMergeLayers = vi.fn();
    render(<LayersPlanesPanel model={twoLayerModel()} onCommand={vi.fn()} onMergeLayers={onMergeLayers} />);
    fireEvent.click(screen.getByLabelText('Layer name ops').closest('.lp-row')!, { ctrlKey: true });
    fireEvent.click(screen.getByRole('button', { name: /merge selected layers/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Merge into base sheet' }));
    expect(onMergeLayers).toHaveBeenCalledWith(['ops'], undefined);
  });

  it('deletes a layer with a destructive confirm', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onCommand = vi.fn();
    render(<LayersPlanesPanel model={twoLayerModel()} onCommand={onCommand} onMergeLayers={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /remove layer ops/i }));
    expect(confirmSpy).toHaveBeenCalledWith("Delete layer 'Ops' and everything on it?");
    expect(onCommand).toHaveBeenCalledWith({ type: 'delete-layer', id: 'ops' });
  });

  it('edit mode renders a per-layer visibility eye reflecting activeLayers', () => {
    const onToggleLayer = vi.fn();
    render(
      <LayersPlanesPanel
        model={twoLayerModel()}
        onCommand={vi.fn()}
        onMergeLayers={vi.fn()}
        activeLayers={['ops']}
        onToggleLayer={onToggleLayer}
      />,
    );
    const opsEye = screen.getByRole('button', { name: 'Toggle visibility of Ops' });
    const netEye = screen.getByRole('button', { name: 'Toggle visibility of Net' });
    expect(opsEye.getAttribute('aria-pressed')).toBe('true'); // ops visible
    expect(netEye.getAttribute('aria-pressed')).toBe('false'); // net hidden
    fireEvent.click(netEye);
    expect(onToggleLayer).toHaveBeenCalledWith('net');
  });

  it('does not render the edit-mode eye in view mode (chips handle visibility)', () => {
    render(
      <LayersPlanesPanel
        model={twoLayerModel()}
        onCommand={vi.fn()}
        mode="view"
        activeLayers={[]}
        onToggleLayer={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Toggle visibility of Ops' })).toBeNull();
  });

  it('declares and clears a legend from edit mode', () => {
    const onCommand = vi.fn();
    const m = model('d');
    m.node('a');
    render(<LayersPlanesPanel model={m.toJSON()} onCommand={onCommand} mode="edit" />);

    const box = screen.getByRole('checkbox', { name: 'Legend' });
    expect((box as HTMLInputElement).checked).toBe(false);
    fireEvent.click(box);
    expect(onCommand).toHaveBeenCalledWith({ type: 'set-diagram-legend', legend: {} });
  });

  it('clears an existing legend', () => {
    const onCommand = vi.fn();
    const m = model('d');
    m.node('a');
    m.legend({ title: 'Key' });
    render(<LayersPlanesPanel model={m.toJSON()} onCommand={onCommand} mode="edit" />);

    const box = screen.getByRole('checkbox', { name: 'Legend' });
    expect((box as HTMLInputElement).checked).toBe(true);
    fireEvent.click(box);
    expect(onCommand).toHaveBeenCalledWith({ type: 'set-diagram-legend', legend: null });
  });

  it('offers no legend checkbox in view mode', () => {
    const m = model('d');
    m.node('a');
    render(<LayersPlanesPanel model={m.toJSON()} onCommand={vi.fn()} mode="view" />);
    expect(screen.queryByRole('checkbox', { name: 'Legend' })).toBeNull();
  });

  it('the Notation select pins the model notation and clearing removes it', () => {
    const onCommand = vi.fn();
    const m = model('d');
    m.node('a');
    render(<LayersPlanesPanel model={m.toJSON()} onCommand={onCommand} mode="edit" />);

    const select = screen.getByLabelText('Notation') as HTMLSelectElement;
    expect(select.value).toBe('');
    fireEvent.change(select, { target: { value: 'c4' } });
    expect(onCommand).toHaveBeenCalledWith({ type: 'set-diagram-notation', notation: 'c4' });

    fireEvent.change(select, { target: { value: '' } });
    expect(onCommand).toHaveBeenCalledWith({ type: 'set-diagram-notation', notation: null });
  });
});
