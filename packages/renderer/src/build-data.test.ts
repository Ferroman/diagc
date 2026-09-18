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
  routes: new Map(),
  laidAt: new Map(),
  labelSpots: new Map(),
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

  it('resize wiring is edit-mode and image-only; assetBase and libraryBase ride along', () => {
    const onResize = vi.fn();
    const img = viewNode({
      node: { id: 'pic', name: 'pic', type: 'image', image: 'abc.png' },
      state: 'leaf',
    });
    const view = buildNodeData(img, nodeCtx({ assetBase: '/api/', libraryBase: 'app://lib/' }));
    expect(view.image).toBe('abc.png');
    expect(view.assetBase).toBe('/api/');
    expect(view.libraryBase).toBe('app://lib/');
    expect(view.onResize).toBeUndefined();
    const edit = buildNodeData(img, nodeCtx({ assetBase: '/api/', onResize, editing: true }));
    expect(edit.onResize).toBe(onResize);
    // absent libraryBase stays absent (no undefined noise on the channel)
    expect(edit.libraryBase).toBeUndefined();
  });

  it('spreads libraryBase onto the shape branch too, same as assetBase', () => {
    const person = viewNode({
      node: { id: 'p', name: 'Actor', type: 'c4-person', shape: '/library/shapes/person.svg' },
    });
    const view = buildNodeData(person, nodeCtx({ assetBase: '/api/', libraryBase: 'app://lib/' }));
    expect(view.shape).toBe('/library/shapes/person.svg');
    expect(view.assetBase).toBe('/api/');
    expect(view.libraryBase).toBe('app://lib/');
  });

  it('carries link + onOpenLink only when the node has a link', () => {
    const onOpenLink = vi.fn();
    const linked = viewNode({ node: { id: 'n1', name: 'One', type: 'service', link: '[[Note]]' } });
    const withHost = buildNodeData(linked, nodeCtx({ onOpenLink }));
    expect(withHost.link).toBe('[[Note]]');
    expect(withHost.onOpenLink).toBe(onOpenLink);

    // link present but ctx carries no host callback: link rides alone
    const noHost = buildNodeData(linked, nodeCtx());
    expect(noHost.link).toBe('[[Note]]');
    expect(noHost.onOpenLink).toBeUndefined();

    // no link on the node: neither field rides along, even with onOpenLink in ctx
    const plain = buildNodeData(viewNode(), nodeCtx({ onOpenLink }));
    expect(plain.link).toBeUndefined();
    expect(plain.onOpenLink).toBeUndefined();
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

  it('a notation colour map beats the type convention but not the node colour', () => {
    const nodeColors = new Map([['n1', '#lane']]);
    expect(buildNodeData(viewNode(), nodeCtx({ nodeColors, typeColors: { '*': '#type' } })).color).toBe('#lane');
    expect(
      buildNodeData(viewNode({ node: { id: 'n1', name: 'One', type: 't', color: '#own' } }), nodeCtx({ nodeColors })).color,
    ).toBe('#own');
    expect(
      buildNodeData(viewNode({ id: 'other', node: { id: 'other', name: 'o', type: 't' } }), nodeCtx({ nodeColors, typeColors: { '*': '#type' } }))
        .color,
    ).toBe('#type');
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

  it('hands a routed plane\'s edge its route, corner, label spot and where its endpoints were laid', () => {
    const route = [{ x: 0, y: 0 }, { x: 10, y: 10 }];
    const ctx = edgeCtx({
      routing: { corner: 28 },
      routes: new Map([['e1', route]]),
      laidAt: new Map([['a', { x: 1, y: 2 }], ['b', { x: 3, y: 4 }]]),
      labelSpots: new Map([['e1', { x: 5, y: 5 }]]),
    });
    const routed = buildEdgeData(viewEdge(), ctx);
    expect(routed.route).toBe(route);
    expect(routed.routeCorner).toBe(28);
    // the edge decides at draw time whether the route still stands (DiagramEdge)
    expect(routed.routeFrom).toEqual({ x: 1, y: 2 });
    expect(routed.routeTo).toEqual({ x: 3, y: 4 });
    expect(routed.labelSpot).toEqual({ x: 5, y: 5 });
  });

  it('carries no route on a floating plane, without one for the edge, or for an endpoint the layout never placed', () => {
    const route = [{ x: 0, y: 0 }, { x: 10, y: 10 }];
    const laidAt = new Map([['a', { x: 1, y: 2 }], ['b', { x: 3, y: 4 }]]);
    expect(buildEdgeData(viewEdge(), edgeCtx({ routes: new Map([['e1', route]]), laidAt })).route).toBeUndefined();
    expect(buildEdgeData(viewEdge(), edgeCtx({ routing: { corner: 8 }, laidAt })).route).toBeUndefined();
    expect(
      buildEdgeData(viewEdge(), edgeCtx({ routing: { corner: 8 }, routes: new Map([['e1', route]]), laidAt: new Map([['a', { x: 1, y: 2 }]]) })).route,
    ).toBeUndefined();
  });

  it('lays a slid placement over a sole relation\'s own label position', () => {
    const labels = [{ id: 'legacy', text: 'calls', t: 0.5, side: 'center' as const }, { id: 'l2', text: 'x' }];
    const moved = buildEdgeData(viewEdge({ labels }), edgeCtx({ labelMoves: { r1: { legacy: { t: 0.2, side: 'top' }, l2: { t: 0.9 } } } }));
    expect(moved.labels).toEqual([
      { id: 'legacy', text: 'calls', t: 0.2, side: 'top' },
      { id: 'l2', text: 'x', t: 0.9 },
    ]);
    // another relation's moves leave this edge's array alone (cache-friendly)
    expect(buildEdgeData(viewEdge({ labels }), edgeCtx({ labelMoves: { other: { legacy: { t: 0.1 } } } })).labels).toBe(labels);
  });

  it('view mode makes labels movable only where the host listens for the move', () => {
    expect(buildEdgeData(viewEdge(), edgeCtx()).movableLabels).toBeUndefined();
    const onViewMoveEdgeLabel = vi.fn();
    const d = buildEdgeData(viewEdge(), edgeCtx({ onViewMoveEdgeLabel }));
    expect(d.movableLabels).toBe(true);
    expect(d.editableLabels).toBeUndefined();
    d.onMoveLabel?.('legacy', 0.3, 'top');
    expect(onViewMoveEdgeLabel).toHaveBeenCalledWith('r1', 'legacy', 0.3, 'top');
    // editing owns label moves itself
    expect(buildEdgeData(viewEdge(), edgeCtx({ editing: true, onViewMoveEdgeLabel })).movableLabels).toBeUndefined();
  });

  it('threads the notation colour for the edge id', () => {
    expect(buildEdgeData(viewEdge(), edgeCtx({ edgeColors: new Map([['e1', '#lane']]) })).notationColor).toBe('#lane');
    expect(buildEdgeData(viewEdge(), edgeCtx()).notationColor).toBeUndefined();
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
    // a libraryBase-only change also busts the cache (sameNodeCtx compares it)
    const libCtx = nodeCtx({ libraryBase: 'app://lib/' });
    expect(buildNodeDataCached(n, libCtx)).not.toBe(third);
    // an onOpenLink-only change also busts the cache (sameNodeCtx compares it)
    const linkCtx = nodeCtx({ onOpenLink: () => {} });
    expect(buildNodeDataCached(n, linkCtx)).not.toBe(third);
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
describe('buildNodeData: typeColors fallback', () => {
  it("uses the type's colour when the node declares none", () => {
    const d = buildNodeData(viewNode(), nodeCtx({ typeColors: { service: '#1565c0' } }));
    expect(d.color).toBe('#1565c0');
  });

  it("falls back to '*' for a type with no entry", () => {
    const d = buildNodeData(viewNode(), nodeCtx({ typeColors: { 'c4-person': '#c62828', '*': '#1565c0' } }));
    expect(d.color).toBe('#1565c0');
  });

  it("lets the node's own colour win", () => {
    const n = viewNode({ node: { id: 'n1', name: 'One', type: 'service', color: '#00ff00' } });
    const d = buildNodeData(n, nodeCtx({ typeColors: { service: '#1565c0', '*': '#111111' } }));
    expect(d.color).toBe('#00ff00');
  });

  it('leaves an untyped node alone when there is no fallback', () => {
    const n = viewNode({ node: { id: 'n1', name: 'One' } });
    const d = buildNodeData(n, nodeCtx({ typeColors: { service: '#1565c0' } }));
    expect(d.color).toBeUndefined();
  });
});
