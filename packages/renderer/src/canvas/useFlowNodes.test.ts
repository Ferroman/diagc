// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Node } from '@xyflow/react';
import { compileView, model, type DiagramModel, type ViewNode } from '@diagc/core/internal';
import { createIconRegistry } from '@diagc/icons';
import type { NodeGeometry } from '../layout/layout';
import { notationProfile } from '../notations';
import { createTypeRegistry } from '../registry';
import { stylePreset } from '../sketch/stylePresets';
import { useFlowNodes, type FlowNodesInput } from './useFlowNodes';

/** a system holding a service, and a top-level client */
function nested(): DiagramModel {
  const m = model('flow-nodes');
  const sys = m.node('sys', { type: 'system' });
  sys.contains(m.node('api', { type: 'service' }));
  m.node('client', { type: 'service' });
  return m.toJSON();
}

const profile = notationProfile(undefined);
const typeRegistry = createTypeRegistry(profile.typeStyles);
const icons = createIconRegistry();
const preset = stylePreset(undefined);

/** every box the view draws, laid out in a row */
function geometryOf(roots: ViewNode[]): Map<string, NodeGeometry> {
  const out = new Map<string, NodeGeometry>();
  const walk = (n: ViewNode) => {
    out.set(n.id, { x: out.size * 200, y: 0, width: 160, height: 60 });
    n.children.forEach(walk);
  };
  roots.forEach(walk);
  return out;
}

type Flat = Partial<Omit<FlowNodesInput, 'layout'>> & Partial<FlowNodesInput['layout']>;

/** the hook's input, the layout's two fields written flat */
function input({ arrangedGeometry, fixed, ...over }: Flat = {}): FlowNodesInput {
  const json = over.props?.model ?? nested();
  const compiled = over.compiled ?? compileView(json, { pins: { sys: 'expanded' } });
  return {
    props: { model: json },
    editing: false,
    edit: undefined,
    notation: { profile, typeRegistry, nodeColors: undefined, nodeChips: undefined },
    icons,
    preset,
    hues: undefined,
    compiled,
    layout: {
      arrangedGeometry: arrangedGeometry === undefined ? geometryOf(compiled.roots) : arrangedGeometry,
      fixed: fixed ?? new Set(),
    },
    hiddenCounts: new Map(),
    metaKeys: [],
    labelEdit: null,
    setLabelEdit: vi.fn(),
    enterNode: vi.fn(),
    noteNodes: [],
    ...over,
  };
}

describe('useFlowNodes', () => {
  it('derives a node per laid-out box, each parent before its children', () => {
    const { result } = renderHook(() => useFlowNodes(input()));
    expect(result.current.derivedNodes.map((n) => [n.id, n.parentId])).toEqual([
      ['sys', undefined],
      ['api', 'sys'],
      ['client', undefined],
    ]);
  });

  it('draws nothing before the layout lands, and skips a box it has not placed', () => {
    expect(renderHook(() => useFlowNodes(input({ arrangedGeometry: null }))).result.current.allNodes).toEqual([]);
    const base = input();
    const partial = new Map(base.layout.arrangedGeometry);
    partial.delete('client');
    const { result } = renderHook(() =>
      useFlowNodes({ ...base, layout: { ...base.layout, arrangedGeometry: partial } }),
    );
    expect(result.current.derivedNodes.map((n) => n.id)).toEqual(['sys', 'api']);
  });

  it('puts the notes after every box', () => {
    const note: Node = { id: 'note:node:api', position: { x: 0, y: 0 }, data: {}, parentId: 'sys' };
    const { result } = renderHook(() => useFlowNodes(input({ noteNodes: [note] })));
    expect(result.current.allNodes.map((n) => n.id)).toEqual(['sys', 'api', 'client', 'note:node:api']);
    expect(result.current.derivedNodes.map((n) => n.id)).not.toContain('note:node:api');
  });

  it('marks a changed box, and a folded box holding a change as inside, but never an open one', () => {
    const json = nested();
    const diffMarks = { nodes: { api: 'changed' as const }, relations: {} };
    const open = renderHook(() => useFlowNodes(input({ props: { model: json, diffMarks } }))).result.current;
    const classOf = (nodes: Node[], id: string) => nodes.find((n) => n.id === id)?.className;
    expect(classOf(open.allNodes, 'api')).toBe('dg-diff-changed');
    expect(classOf(open.allNodes, 'sys')).toBeUndefined();
    const compiled = compileView(json, {});
    const folded = renderHook(() =>
      useFlowNodes(
        input({ props: { model: json, diffMarks }, compiled, arrangedGeometry: geometryOf(compiled.roots) }),
      ),
    ).result.current;
    expect(classOf(folded.allNodes, 'sys')).toBe('dg-diff-inside');
  });

  it('keeps every data object while an input the data does not read changes', () => {
    const base = input();
    const { result, rerender } = renderHook(
      (labelEdit: FlowNodesInput['labelEdit']) => useFlowNodes({ ...base, labelEdit }),
      {
        initialProps: { kind: 'node', id: 'api' },
      },
    );
    const before = result.current.derivedNodes.map((n) => n.data);
    rerender({ kind: 'node', id: 'api' });
    expect(result.current.derivedNodes.map((n) => n.data)).toEqual(before);
    result.current.derivedNodes.forEach((n, i) => expect(n.data).toBe(before[i]));
  });

  it('keeps allNodesRef and rfNodesRef current every render', () => {
    const { result } = renderHook(() => useFlowNodes(input()));
    expect(result.current.allNodesRef.current).toBe(result.current.allNodes);
    expect(result.current.rfNodesRef.current).toBe(result.current.rfNodes);
  });
});
