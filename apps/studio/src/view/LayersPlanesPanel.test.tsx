// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { model, type DiagramModel } from '@diagc/core/internal';
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

  it('numbers a taken slug and falls back to the kind for a name with none', () => {
    const onCommand = vi.fn();
    render(<LayersPlanesPanel model={testModel()} onCommand={onCommand} />);
    fireEvent.change(screen.getByLabelText('New layer name'), { target: { value: 'OPS!' } });
    fireEvent.click(screen.getByRole('button', { name: /add layer/i }));
    fireEvent.change(screen.getByLabelText('New plane name'), { target: { value: ' 日本 ' } });
    fireEvent.click(screen.getByRole('button', { name: /add plane/i }));
    expect(onCommand.mock.calls).toEqual([
      [{ type: 'upsert-layer', layer: { id: 'ops-2', name: 'OPS!' } }],
      [{ type: 'upsert-plane', plane: { id: 'plane', name: '日本' } }],
    ]);
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

  it('deletes a plane after confirm as delete-plane', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onCommand = vi.fn();
    render(<LayersPlanesPanel model={testModel()} onCommand={onCommand} />);
    fireEvent.click(screen.getByRole('button', { name: /remove plane flow/i }));
    await waitFor(() => expect(onCommand).toHaveBeenCalledWith({ type: 'delete-plane', id: 'flow' }));
  });

  it('says what goes with a plane before deleting it', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const base = testModel();
    const m: DiagramModel = {
      ...base,
      nodes: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B', plane: 'flow' },
        { id: 'c', name: 'C', plane: 'flow' },
      ],
      relations: [
        { id: 'r1', from: 'a', to: 'b', kind: 'sync' },
        { id: 'r2', from: 'a', to: 'a', kind: 'sync', plane: 'flow' },
        { id: 'r3', from: 'a', to: 'a', kind: 'sync' },
      ],
    };
    render(<LayersPlanesPanel model={m} onCommand={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /remove plane flow/i }));
    await waitFor(() =>
      expect(confirm).toHaveBeenCalledWith("Delete plane 'Flow'? Its 2 nodes and 2 relations go with it."),
    );
    fireEvent.click(screen.getByRole('button', { name: /remove plane architecture/i }));
    await waitFor(() => expect(confirm).toHaveBeenLastCalledWith("Delete plane 'Architecture'?"));
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
      <LayersPlanesPanel model={testModel()} onCommand={vi.fn()} activeLayer="ops" onActivateLayer={onActivateLayer} />,
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

  it('merges the selection into a chosen target and clears the selection', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onMergeLayers = vi.fn();
    render(<LayersPlanesPanel model={twoLayerModel()} onCommand={vi.fn()} onMergeLayers={onMergeLayers} />);
    const opsRow = screen.getByLabelText('Layer name ops').closest('.lp-row')!;
    fireEvent.click(opsRow, { ctrlKey: true });
    fireEvent.click(screen.getByRole('button', { name: /merge selected layers/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Merge into Net' }));
    await waitFor(() => expect(onMergeLayers).toHaveBeenCalledWith(['ops'], 'net'));
    expect(opsRow.className).not.toContain('selected');
  });

  it('does not merge when the confirm is cancelled', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const onMergeLayers = vi.fn();
    render(<LayersPlanesPanel model={twoLayerModel()} onCommand={vi.fn()} onMergeLayers={onMergeLayers} />);
    fireEvent.click(screen.getByLabelText('Layer name ops').closest('.lp-row')!, { ctrlKey: true });
    fireEvent.click(screen.getByRole('button', { name: /merge selected layers/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Merge into Net' }));
    // flush the async dialog before asserting nothing was merged
    await waitFor(() => expect(confirmSpy).toHaveBeenCalled());
    expect(onMergeLayers).not.toHaveBeenCalled();
  });

  it('merges the selection into the base sheet', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onMergeLayers = vi.fn();
    render(<LayersPlanesPanel model={twoLayerModel()} onCommand={vi.fn()} onMergeLayers={onMergeLayers} />);
    fireEvent.click(screen.getByLabelText('Layer name ops').closest('.lp-row')!, { ctrlKey: true });
    fireEvent.click(screen.getByRole('button', { name: /merge selected layers/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Merge into base sheet' }));
    await waitFor(() => expect(onMergeLayers).toHaveBeenCalledWith(['ops'], undefined));
  });

  it('deletes a layer with a destructive confirm', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onCommand = vi.fn();
    render(<LayersPlanesPanel model={twoLayerModel()} onCommand={onCommand} onMergeLayers={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /remove layer ops/i }));
    expect(confirmSpy).toHaveBeenCalledWith("Delete layer 'Ops' and everything on it?");
    await waitFor(() => expect(onCommand).toHaveBeenCalledWith({ type: 'delete-layer', id: 'ops' }));
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

  it('the Notation select sets the model notation and clearing removes it', () => {
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

  it('names the second-order notation properly instead of deriving "Second order"', () => {
    const m = model('d');
    m.node('a');
    render(<LayersPlanesPanel model={m.toJSON()} onCommand={vi.fn()} mode="edit" />);
    expect(screen.getByRole('option', { name: 'Second-order thinking' })).toBeDefined();
  });

  it('names the fishbone notation properly instead of deriving "Fishbone"', () => {
    const m = model('d');
    m.node('a');
    render(<LayersPlanesPanel model={m.toJSON()} onCommand={vi.fn()} mode="edit" />);
    expect(screen.getByRole('option', { name: 'Fishbone (cause and effect)' })).toBeDefined();
  });

  it('names the threat-model notation properly instead of deriving "Threat model"', () => {
    const m = model('d');
    m.node('a');
    render(<LayersPlanesPanel model={m.toJSON()} onCommand={vi.fn()} mode="edit" />);
    const option = screen.getByRole('option', { name: 'Threat model (STRIDE)' }) as HTMLOptionElement;
    expect(option.value).toBe('threat-model');
  });

  it("labels every notation alike in the diagram's select and each plane's", () => {
    // Breaks if a notation's label changes or goes missing from either select.
    render(<LayersPlanesPanel model={testModel()} onCommand={vi.fn()} mode="edit" />);
    const options = (label: string) =>
      [...(screen.getByRole('combobox', { name: label }) as HTMLSelectElement).options].map((o) => [o.value, o.text]);
    const want = [
      ['', 'default look'],
      ['causal-loop', 'Causal loop'],
      ['git-graph', 'Git graph'],
      ['c4', 'C4'],
      ['second-order', 'Second-order thinking'],
      ['fishbone', 'Fishbone (cause and effect)'],
      ['threat-model', 'Threat model (STRIDE)'],
      ['plan', 'Plan (schedule)'],
      ['deployment', 'Deployment'],
    ];
    expect(options('Notation')).toEqual(want);
    expect(options('Notation Flow')).toEqual(want);
  });

  // breaks if a plane row's rename, base-relations toggle or default layers
  // stop committing as upsert-plane with the row's other fields kept
  it('renames a plane, toggles its base relations and its default layers as upsert-plane', () => {
    const onCommand = vi.fn();
    render(<LayersPlanesPanel model={testModel()} onCommand={onCommand} />);
    const name = screen.getByLabelText('Plane name flow');
    fireEvent.change(name, { target: { value: '  ' } });
    fireEvent.blur(name);
    expect(onCommand).not.toHaveBeenCalled();
    expect((name as HTMLInputElement).value).toBe('Flow');
    fireEvent.change(name, { target: { value: 'Runtime' } });
    fireEvent.keyDown(name, { key: 'Enter' });
    expect(onCommand).toHaveBeenLastCalledWith({ type: 'upsert-plane', plane: { id: 'flow', name: 'Runtime' } });
    fireEvent.click(screen.getByLabelText('Base relations in Architecture'));
    expect(onCommand).toHaveBeenLastCalledWith({
      type: 'upsert-plane',
      plane: { id: 'arch', name: 'Architecture', baseRelations: false },
    });
    fireEvent.click(screen.getByLabelText('Layer Ops in Architecture'));
    expect(onCommand).toHaveBeenLastCalledWith({
      type: 'upsert-plane',
      plane: { id: 'arch', name: 'Architecture', layers: ['ops'], baseRelations: false },
    });
  });

  // breaks if the layer rows re-seed on a planes change (or the plane rows on
  // a layers change), losing a name being typed, or stop re-seeding on their own
  it("keeps a typed row name through the other collection's change, and re-seeds on its own", () => {
    const ui = (m: DiagramModel) => <LayersPlanesPanel model={m} onCommand={vi.fn()} />;
    // one base, so each rerender below replaces exactly one collection
    const base = testModel();
    const { rerender } = render(ui(base));
    const box = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
    fireEvent.change(box('Layer name ops'), { target: { value: 'typed layer' } });
    fireEvent.change(box('Plane name flow'), { target: { value: 'typed plane' } });
    fireEvent.change(box('New layer name'), { target: { value: 'new layer' } });
    fireEvent.change(box('New plane name'), { target: { value: 'new plane' } });
    const planes = [...base.planes, { id: 'more', name: 'More' }];
    rerender(ui({ ...base, planes }));
    expect(box('Layer name ops').value).toBe('typed layer');
    expect(box('Plane name flow').value).toBe('Flow');
    fireEvent.change(box('Plane name flow'), { target: { value: 'typed plane' } });
    rerender(ui({ ...base, planes, layers: [{ id: 'ops', name: 'Ops 2' }] }));
    expect(box('Layer name ops').value).toBe('Ops 2');
    expect(box('Plane name flow').value).toBe('typed plane');
    expect(box('New layer name').value).toBe('new layer');
    expect(box('New plane name').value).toBe('new plane');
  });
});
