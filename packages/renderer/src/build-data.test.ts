// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { NotationId, ViewEdge, ViewNode } from '@diagramming/core';
import { createIconRegistry } from '@diagramming/icons';
import {
  buildEdgeData,
  buildEdgeDataCached,
  buildNodeData,
  buildNodeDataCached,
  type EdgeDataContext,
  type NodeDataContext,
} from './build-data';
import { createKindRegistry, createTypeRegistry } from './registry';

const typeRegistry = createTypeRegistry();
const kindRegistry = createKindRegistry();
const icons = createIconRegistry();

const viewNode = (over: Partial<ViewNode> = {}): ViewNode => ({
  id: 'n1',
  node: { id: 'n1', name: 'One', type: 'service', metadata: { framework: 'react', skip: null } },
  state: 'leaf',
  children: [],
  promoted: false,
  sharedMembers: [],
  ...over,
});

const nodeCtx = (over: Partial<NodeDataContext> = {}): NodeDataContext => ({
  metaKeys: ['framework', 'language'],
  hiddenCounts: new Map([['n1', 3]]),
  typeRegistry,
  icons,
  editing: false,
  ...over,
});

const viewEdge = (over: Partial<ViewEdge> = {}): ViewEdge => ({
  id: 'e1',
  from: 'a',
  to: 'b',
  kind: 'sync',
  constituents: [
    { id: 'r1', from: 'a', to: 'b', kind: 'sync', polarity: '+', fromColumn: 'fk_a', toColumn: 'id' },
  ],
  ...over,
});

const edgeCtx = (over: Partial<EdgeDataContext> = {}): EdgeDataContext => ({
  kindRegistry,
  editing: false,
  pinEdgeRel: null,
  pendingAdd: null,
  orthogonal: false,
  routes: new Map(),
  ...over,
});

describe('buildNodeData', () => {
  it('copies the stable fields and the metadata badges', () => {
    const d = buildNodeData(viewNode(), nodeCtx());
    expect(d.label).toBe('One');
    expect(d.state).toBe('leaf');
    expect(d.promoted).toBe(false);
    expect(d.hiddenCount).toBe(3);
    expect(d.metaBadges).toEqual(['react']);
    expect(d.typeRegistry).toBe(typeRegistry);
    expect(d.icons).toBe(icons);
  });

  it('applies optional spreads only when the model carries the field', () => {
    const n = viewNode({
      node: {
        id: 'n1',
        name: 'One',
        type: 'service',
        icon: 'service',
        color: '#f00',
        textColor: '#fff',
        textAlign: 'center',
        fontScale: 'lg',
        rich: [{ text: 'One' }],
      },
    });
    const d = buildNodeData(n, nodeCtx());
    expect(d.typeId).toBe('service');
    expect(d.icon).toBe('service');
    expect(d.color).toBe('#f00');
    expect(d.textColor).toBe('#fff');
    expect(d.textAlign).toBe('center');
    expect(d.fontScale).toBe('lg');
    expect(d.rich).toEqual([{ text: 'One' }]);
    // fields not present stay absent (no undefined noise on the channel)
    expect(d.shape).toBeUndefined();
    expect(d.image).toBeUndefined();
  });

  it('reads the pinned state from the pins map', () => {
    const d = buildNodeData(viewNode(), nodeCtx({ pins: { n1: 'collapsed' } }));
    expect(d.pinned).toBe('collapsed');
    expect(buildNodeData(viewNode(), nodeCtx({ pins: { other: 'collapsed' } })).pinned).toBeUndefined();
  });

  it('wirings onEnterNode only onto non-leaf nodes', () => {
    const enter = () => {};
    expect(buildNodeData(viewNode(), nodeCtx({ onEnterNode: enter })).onEnterNode).toBeUndefined();
    const expanded = buildNodeData(viewNode({ state: 'expanded' }), nodeCtx({ onEnterNode: enter }));
    expect(expanded.onEnterNode).toBe(enter);
  });

  it('marks external stubs', () => {
    expect(buildNodeData(viewNode({ external: 'real-id' }), nodeCtx()).external).toBe(true);
  });

  it('opens the label editor for the targeted node and commits through the host callbacks', () => {
    const onRename = vi.fn();
    const onRich = vi.fn();
    const endLabelEdit = vi.fn();
    const d = buildNodeData(
      viewNode(),
      nodeCtx({ labelEditingId: 'n1', endLabelEdit, onRenameNode: onRename, onSetNodeRich: onRich }),
    );
    expect(d.labelEditing).toBe(true);
    d.onLabelCommit?.(null); // cancelled
    expect(endLabelEdit).toHaveBeenCalledTimes(1);
    expect(onRename).not.toHaveBeenCalled();
    d.onLabelCommit?.('  Renamed  ');
    expect(endLabelEdit).toHaveBeenCalledTimes(2);
    expect(onRename).toHaveBeenCalledWith('n1', 'Renamed');
    // committing the unchanged name is a no-op
    d.onLabelCommit?.('One');
    expect(onRename).toHaveBeenCalledTimes(1);
    // rich commit with empty text is ignored
    d.onRichCommit?.([{ text: '  ' }]);
    expect(onRich).not.toHaveBeenCalled();
    d.onRichCommit?.([{ text: 'Rich' }]);
    expect(onRich).toHaveBeenCalledWith('n1', [{ text: 'Rich' }]);
  });

  it('only opens the label editor for the matching node id', () => {
    const d = buildNodeData(viewNode(), nodeCtx({ labelEditingId: 'other' }));
    expect(d.labelEditing).toBeUndefined();
  });

  it('resize wiring is edit-mode and image-only; assetBase rides along', () => {
    const onResize = vi.fn();
    const img = viewNode({
      node: { id: 'pic', name: 'pic', type: 'image', image: 'abc.png' },
      state: 'leaf',
    });
    const view = buildNodeData(img, nodeCtx({ assetBase: '/api/' }));
    expect(view.image).toBe('abc.png');
    expect(view.assetBase).toBe('/api/');
    expect(view.onResize).toBeUndefined();
    const edit = buildNodeData(img, nodeCtx({ assetBase: '/api/', onResize, editing: true }));
    expect(edit.onResize).toBe(onResize);
  });

  it('does not wire the resize callback for non-image nodes in edit mode', () => {
    const d = buildNodeData(viewNode(), nodeCtx({ onResize: vi.fn(), editing: true }));
    expect(d.onResize).toBeUndefined();
  });

  it('wires onColumnsChange only for edit-mode db-table nodes', () => {
    const onColumnsChange = vi.fn();
    const table = viewNode({
      id: 'tbl',
      node: { id: 'tbl', name: 't', type: 'db-table', columns: [{ name: 'id', pk: true }] },
    });
    const view = buildNodeData(table, nodeCtx({ onSetTableColumns: onColumnsChange }));
    expect(view.columns).toEqual([{ name: 'id', pk: true }]);
    expect(view.onColumnsChange).toBeUndefined();
    const edit = buildNodeData(table, nodeCtx({ onSetTableColumns: onColumnsChange, editing: true }));
    expect(edit.onColumnsChange).toBeDefined();
    edit.onColumnsChange?.([{ name: 'x' }]);
    expect(onColumnsChange).toHaveBeenCalledWith('tbl', [{ name: 'x' }]);
  });

  it('threads the style preset and notation', () => {
    const preset = { id: 'hand-drawn' as const, label: 'hd', rough: { roughness: 1, bowing: 1, strokeWidth: 1, fillStyle: 'solid' as const } };
    const d = buildNodeData(viewNode(), nodeCtx({ stylePreset: preset, notation: 'causal-loop' as NotationId }));
    expect(d.stylePreset).toBe(preset);
    expect(d.notation).toBe('causal-loop');
  });
});

describe('buildEdgeData', () => {
  it('copies the shared fields and optional per-constituent overrides', () => {
    const e = viewEdge({
      label: 'ingress',
      labels: [{ id: 'l1', text: 'ingress' }],
      tint: '#0f0',
      style: { shape: 'straight' },
      polarity: '+',
      delay: true,
    });
    const d = buildEdgeData(e, edgeCtx());
    expect(d.kind).toBe('sync');
    expect(d.constituentCount).toBe(1);
    expect(d.kindRegistry).toBe(kindRegistry);
    expect(d.label).toBe('ingress');
    expect(d.labels).toEqual([{ id: 'l1', text: 'ingress' }]);
    expect(d.tint).toBe('#0f0');
    expect(d.relStyle).toEqual({ shape: 'straight' });
    expect(d.polarity).toBe('+');
    expect(d.delay).toBe(true);
    expect(d.fromColumn).toBe('fk_a');
    expect(d.toColumn).toBe('id');
  });

  it('binds the label CRUD callbacks to the sole relation id in edit mode', () => {
    const onAdd = vi.fn();
    const onEdit = vi.fn();
    const onMove = vi.fn();
    const d = buildEdgeData(viewEdge(), edgeCtx({ editing: true, onAddEdgeLabel: onAdd, onEditEdgeLabel: onEdit, onMoveEdgeLabel: onMove }));
    expect(d.editableLabels).toBe(true);
    d.onAddLabel?.('x', 0.5, 'top');
    expect(onAdd).toHaveBeenCalledWith('r1', 'x', 0.5, 'top');
    d.onEditLabel?.('l1', 'y');
    expect(onEdit).toHaveBeenCalledWith('r1', 'l1', 'y');
    d.onMoveLabel?.('l1', 0.3, 'bottom');
    expect(onMove).toHaveBeenCalledWith('r1', 'l1', 0.3, 'bottom');
  });

  it('does not expose label editing outside edit mode', () => {
    const d = buildEdgeData(viewEdge(), edgeCtx({ onAddEdgeLabel: vi.fn() }));
    expect(d.editableLabels).toBeUndefined();
    expect(d.onAddLabel).toBeUndefined();
  });

  it('wires pin dots to the active sole relation and the side callback', () => {
    const onSetSide = vi.fn();
    const d = buildEdgeData(viewEdge(), edgeCtx({ editing: true, pinEdgeRel: 'r1', onSetEdgeSide: onSetSide }));
    expect(d.pinsActive).toBe(true);
    d.onSetSide?.('from', 'top');
    expect(onSetSide).toHaveBeenCalledWith('r1', 'from', 'top');
    // a different active relation leaves the dots off
    expect(buildEdgeData(viewEdge(), edgeCtx({ editing: true, pinEdgeRel: 'other', onSetEdgeSide: onSetSide })).pinsActive).toBeUndefined();
  });

  it('threads pendingAdd to the requested edge and clears it via the consumed callback', () => {
    const consume = vi.fn();
    const ctx = edgeCtx({ editing: true, pendingAdd: { edgeId: 'e1', x: 5, y: 6 }, onPendingAddConsumed: consume });
    const d = buildEdgeData(viewEdge(), ctx);
    expect(d.pendingAdd).toEqual({ x: 5, y: 6 });
    d.onPendingAddConsumed?.();
    expect(consume).toHaveBeenCalledTimes(1);
    expect(buildEdgeData(viewEdge(), edgeCtx({ editing: true, pendingAdd: { edgeId: 'other', x: 1, y: 2 } })).pendingAdd).toBeUndefined();
  });

  it('applies an orthogonal elk route only for unpinned endpoints', () => {
    const ctx = edgeCtx({
      orthogonal: true,
      pinnedIds: new Set(['zzz']),
      routes: new Map<string, import('./layout').EdgePoint[]>([['e1', [{ x: 0, y: 0 }, { x: 10, y: 10 }]]]),
      editing: false,
    });
    const routed = buildEdgeData(viewEdge(), ctx);
    expect(routed.orthogonal).toBe(true);
    expect(routed.route).toEqual([{ x: 0, y: 0 }, { x: 10, y: 10 }]);
    // source endpoint pinned → falls back to floating
    expect(buildEdgeData(viewEdge(), edgeCtx({ orthogonal: true, pinnedIds: new Set(['b']) })).orthogonal).toBeUndefined();
    // no era of route → no orthogonal flag
    expect(buildEdgeData(viewEdge(), edgeCtx({ orthogonal: true, pinnedIds: undefined, routes: new Map() })).orthogonal).toBeUndefined();
  });
});

describe('cached builder identity', () => {
  it('reuses the data object while ctx inputs are unchanged', () => {
    const n = viewNode();
    const ctx = nodeCtx();
    const first = buildNodeDataCached(n, ctx);
    const second = buildNodeDataCached(n, ctx);
    expect(second).toBe(first);
    // a ctx change (label edit opening) rebuilds
    const editCtx = nodeCtx({ labelEditingId: 'n1' });
    const third = buildNodeDataCached(n, editCtx);
    expect(third).not.toBe(first);
    // ...and the new ctx stays stable for its own subsequent renders
    expect(buildNodeDataCached(n, editCtx)).toBe(third);
  });

  it('reuses the edge data object while ctx inputs are unchanged', () => {
    const e = viewEdge();
    const ctx = edgeCtx({ editing: true });
    const first = buildEdgeDataCached(e, ctx);
    expect(buildEdgeDataCached(e, ctx)).toBe(first);
    const changed = buildEdgeDataCached(e, edgeCtx({ editing: true, pinEdgeRel: 'r1' }));
    expect(changed).not.toBe(first);
  });
});