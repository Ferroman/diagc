// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import type { Node, ReactFlowInstance } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import { compileView, model, planCopyId, planView, PLAN_UNASSIGNED } from '@diagc/core/internal';
import { NOTATION_PROFILES } from '../notations';
import type { NodeGeometry } from '../layout/layout';
import { useLayoutApi } from './useLayoutApi';
import type { LayoutApi } from './view-types';

describe('useLayoutApi at 80 px a day', () => {
  // what the studio saves from (Freeze layout, Re-layout, a toolbar add at the
  // centre, a card dropped into a box) comes out in 20 px-a-day units
  function api() {
    const layoutApiRef = { current: null as LayoutApi | null };
    const wrapper = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 600 }) } as HTMLDivElement;
    const reactFlow = {
      screenToFlowPosition: (p: { x: number; y: number }) => ({ x: p.x * 2, y: p.y }),
      getInternalNode: () => ({
        internals: { positionAbsolute: { x: 800, y: 10 } },
        measured: { width: 400, height: 40 },
      }),
    } as unknown as ReactFlowInstance;
    renderHook(() =>
      useLayoutApi({
        layoutApiRef,
        reactFlow,
        rfNodesRef: { current: [{ id: 'a', position: { x: 400, y: 30 }, data: {} } as Node] },
        compiledRef: { current: compileView(model('m').toJSON(), {}) },
        geometryRef: { current: new Map<string, NodeGeometry>([['a', { x: 400, y: 30, width: 100, height: 40 }]]) },
        wrapperRef: { current: wrapper },
        strokesRef: { current: [] },
        viewShiftRef: { current: new Map() },
        savedFrameRef: { current: new Map() },
        scaleRef: { current: 4 },
        legendReserveRef: { current: null },
        inertRef: { current: undefined },
      }),
    );
    return layoutApiRef.current!;
  }
  it('snapshots and auto positions', () => {
    expect(api().snapshotPositions()).toEqual({ a: { x: 100, y: 30 } });
    expect(api().autoPositions()).toEqual({ a: { x: 100, y: 30 } });
  });
  it('the viewport centre and a box: x and width', () => {
    expect(api().viewportCenter()).toEqual({ x: 250, y: 300 });
    expect(api().nodeBounds('a')).toEqual({ x: 200, y: 10, width: 100, height: 40 });
  });
});

describe('useLayoutApi on a plan grouped by team, or hiding', () => {
  // Freeze layout and Re-layout write what these return straight into the
  // saved layout: model ids only, and no y for a row the view stacks itself
  function plan() {
    const m = model('p');
    const p = m.plan();
    const pay = p.team('pay', 'Payments');
    const plat = p.team('plat', 'Platform');
    const co = p.zone('checkout', { start: '2026-01-05', end: '2026-02-27' });
    co.zone('api', { start: '2026-01-05', end: '2026-01-30' }).executor(pay);
    co.zone('ui', { start: '2026-02-02', end: '2026-02-20' }).executor(plat);
    p.zone('loose', { start: '2026-03-02', end: '2026-03-13' });
    return m.toJSON();
  }
  function api(grouped: boolean, hidden: ReadonlySet<string>) {
    const json = plan();
    // a plan zone rests open (the profile's restsOpen), as the canvas compiles it
    const open = { pins: { checkout: 'expanded' as const } };
    const compiled = planView(compileView(json, { plane: 'plan', ...open }), json, 'plan', { grouped, hidden });
    const ids: string[] = [];
    const walk = (n: { id: string; children: readonly { id: string; children: never[] }[] }): void => {
      ids.push(n.id);
      n.children.forEach(walk as never);
    };
    compiled.roots.forEach(walk as never);
    const at = (i: number) => ({ x: 20 * i, y: 10 * i, width: 100, height: 40 });
    const layoutApiRef = { current: null as LayoutApi | null };
    renderHook(() =>
      useLayoutApi({
        layoutApiRef,
        reactFlow: {} as ReactFlowInstance,
        rfNodesRef: { current: ids.map((id, i) => ({ id, position: at(i), data: {} }) as Node) },
        compiledRef: { current: compiled },
        geometryRef: { current: new Map<string, NodeGeometry>(ids.map((id, i) => [id, at(i)])) },
        wrapperRef: { current: null },
        strokesRef: { current: [] },
        viewShiftRef: { current: new Map() },
        savedFrameRef: { current: new Map() },
        legendReserveRef: { current: null },
        inertRef: { current: NOTATION_PROFILES.plan.node?.inert },
      }),
    );
    return { json, compiled, api: layoutApiRef.current! };
  }
  for (const [name, grouped, hidden] of [
    ['grouped', true, new Set<string>()],
    ['ungrouped, a team hidden', false, new Set(['pay'])],
  ] as const) {
    it(`${name}: snapshot and auto positions name model nodes, and no top-level row`, () => {
      const { json, compiled, api: a } = api(grouped, hidden);
      expect(compiled.roots.some((r) => r.id === PLAN_UNASSIGNED)).toBe(true);
      const modelIds = new Set(json.nodes.map((n) => n.id));
      for (const out of [a.snapshotPositions(), a.autoPositions()]) {
        expect(Object.keys(out).filter((id) => !modelIds.has(id))).toEqual([]);
        expect(out).not.toHaveProperty('checkout');
        expect(out).not.toHaveProperty('loose');
        expect(out).toHaveProperty('ui');
      }
    });
  }
  it('grouped: what is inside a row is its first copy', () => {
    const { api: a, compiled } = api(true, new Set());
    const first = [...(compiled.copies ?? [])].find(([, id]) => id === 'ui')![0];
    expect(first).toBe(planCopyId('plat', 'ui'));
    expect(a.autoPositions()['ui']).toEqual(a.snapshotPositions()['ui']);
  });
});
