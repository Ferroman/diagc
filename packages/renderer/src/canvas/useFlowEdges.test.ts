// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { compileView, model, type DiagramModel } from '@diagc/core/internal';
import { notationProfile } from '../notations';
import { createKindRegistry } from '../registry';
import { stylePreset } from '../sketch/stylePresets';
import { useFlowEdges, type FlowEdgesInput } from './useFlowEdges';

/** two services and the one relation between them */
function pair(): DiagramModel {
  const m = model('flow-edges');
  m.relate(m.node('a', { type: 'service' }), m.node('b', { type: 'service' }), { kind: 'sync', label: 'calls' });
  return m.toJSON();
}

const profile = notationProfile(undefined);

function input(over: Partial<FlowEdgesInput> = {}): FlowEdgesInput {
  const json = over.props?.model ?? pair();
  return {
    props: { model: json },
    editing: true,
    edit: { onSetEdgeSide: vi.fn() },
    notation: { profile, kindRegistry: createKindRegistry(profile.kindStyles) },
    preset: stylePreset(undefined),
    compiled: compileView(json, {}),
    layout: {
      placedGeometry: new Map(),
      routing: undefined,
      routes: new Map(),
      laidAt: new Map(),
      labelSpots: new Map(),
    },
    moves: { labelMoves: undefined, moveViewLabel: vi.fn() },
    ...over,
  };
}

const dataOf = (edges: { data?: Record<string, unknown> }[]) => edges[0]!.data!;

describe('useFlowEdges', () => {
  it('draws nothing before the layout has placed the boxes', () => {
    const { result } = renderHook(() => useFlowEdges(input({ layout: { ...input().layout, placedGeometry: null } })));
    expect(result.current.rfEdges).toEqual([]);
  });

  it('offers a reconnect on a sole relation while editing only', () => {
    expect(renderHook(() => useFlowEdges(input())).result.current.rfEdges[0]?.reconnectable).toBe(true);
    const view = renderHook(() => useFlowEdges(input({ editing: false }))).result.current.rfEdges[0];
    expect(view?.reconnectable).toBe(false);
  });

  it("stamps React Flow's own selection on, and keeps the same edges for a change that selects nothing new", () => {
    const { result } = renderHook(() => useFlowEdges(input()));
    const id = result.current.rfEdges[0]!.id;
    act(() => result.current.onEdgesChange([{ type: 'select', id, selected: true }]));
    expect(result.current.rfEdges[0]?.selected).toBe(true);
    const selected = result.current.rfEdges;
    act(() => result.current.onEdgesChange([{ type: 'select', id, selected: true }]));
    expect(result.current.rfEdges).toBe(selected);
    act(() => result.current.onEdgesChange([{ type: 'select', id, selected: false }]));
    expect(result.current.rfEdges[0]?.selected).toBeUndefined();
  });

  it("shows a relation's fixed-side dots once a click names it", () => {
    const { result } = renderHook(() => useFlowEdges(input()));
    expect(dataOf(result.current.rfEdges)['fixedSideDotsShown']).toBeUndefined();
    const relation = pair().relations[0]!.id;
    act(() => result.current.setFixedSideRelation(relation));
    expect(dataOf(result.current.rfEdges)['fixedSideDotsShown']).toBe(true);
  });

  it('opens the add-label editor at the asked point, and closes it once the edge has taken it', () => {
    const { result } = renderHook(() => useFlowEdges(input()));
    const edgeId = result.current.rfEdges[0]!.id;
    act(() => result.current.setAddLabelAt({ edgeId, x: 12, y: 34 }));
    const data = dataOf(result.current.rfEdges);
    expect(data['pendingAdd']).toEqual({ x: 12, y: 34 });
    act(() => (data['onPendingAddConsumed'] as () => void)());
    expect(dataOf(result.current.rfEdges)['pendingAdd']).toBeUndefined();
  });

  it('lets a label slide in view mode only for a host that listens', () => {
    const moveViewLabel = vi.fn();
    const quiet = renderHook(() =>
      useFlowEdges(input({ editing: false, moves: { labelMoves: undefined, moveViewLabel } })),
    );
    expect(dataOf(quiet.result.current.rfEdges)['onMoveLabel']).toBeUndefined();
    const json = pair();
    const listening = renderHook(() =>
      useFlowEdges(
        input({
          editing: false,
          moves: { labelMoves: undefined, moveViewLabel },
          props: { model: json, onViewLabelMovesChange: vi.fn() },
        }),
      ),
    );
    (dataOf(listening.result.current.rfEdges)['onMoveLabel'] as (l: string, t: number, s: string) => void)(
      'l1',
      0.4,
      'top',
    );
    expect(moveViewLabel).toHaveBeenCalledWith(json.relations[0]!.id, 'l1', 0.4, 'top');
  });

  it('marks an edge whose relation the diff changed', () => {
    const json = pair();
    const diffMarks = { nodes: {}, relations: { [json.relations[0]!.id]: 'added' as const } };
    const { result } = renderHook(() => useFlowEdges(input({ props: { model: json, diffMarks } })));
    expect(result.current.rfEdges[0]?.className).toBe('dg-diff-added');
  });
});
