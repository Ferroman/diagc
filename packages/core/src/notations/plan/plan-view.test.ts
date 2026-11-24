import { describe, expect, it } from 'vitest';
import { model } from '../../builder/index';
import { compileView } from '../../view/compile';
import type { CompiledView, ViewEdge, ViewNode } from '../../view/types';
import { planGraph } from './plan';
import { PLAN_LANE_TYPE, planCopyId, planView, type PlanViewOptions } from './plan-view';
import { planTeams, planTint } from './teams';

const none: ReadonlySet<string> = new Set();

/** Payments (alice) and Platform. `checkout` is shared: Platform builds `ui`,
 * alice (so Payments) builds `api`, and a `freeze` event sits inside it.
 * `search` is Platform's alone, `rollout` both teams', `launch` a top-level
 * event. Arrows: ui -> api and api -> search (no lane holds both), search ->
 * checkout (only Platform holds both), checkout -> rollout (both lanes do). */
function fixture() {
  const m = model('t');
  const p = m.plan();
  const pay = p.team('pay', 'Payments', { color: '#f00' });
  const plat = p.team('plat', 'Platform');
  const alice = p.person('alice', 'Alice');
  pay.member(alice);
  const checkout = p.zone('checkout', { start: '2026-01-05', end: '2026-02-27' });
  const ui = checkout.zone('ui', { start: '2026-01-05', end: '2026-01-30' }).executor(plat);
  const api = checkout.zone('api', { start: '2026-02-02', end: '2026-02-20' }).executor(alice);
  checkout.event('freeze', { at: '2026-02-10' });
  const search = p.zone('search', { start: '2026-01-05', end: '2026-01-16' }).executor(plat);
  const rollout = p.zone('rollout', { start: '2026-03-02', end: '2026-03-13' }).executor(pay).executor(plat);
  p.event('launch', { at: '2026-03-16' });
  m.relate(ui, api, { kind: 'depends' });
  m.relate(search, checkout, { kind: 'depends' });
  m.relate(checkout, rollout, { kind: 'depends' });
  m.relate(api, search, { kind: 'depends' });
  return m.toJSON();
}

const expanded = { checkout: 'expanded' } as const;
const compile = (json: ReturnType<typeof fixture>, pins: Record<string, 'expanded' | 'collapsed'> = expanded) =>
  compileView(json, { plane: 'plan', pins });
const view = (compiled: CompiledView, json: ReturnType<typeof fixture>, opts: PlanViewOptions) =>
  planView(compiled, json, 'plan', opts);

function allIds(nodes: readonly ViewNode[]): string[] {
  return nodes.flatMap((n) => [n.id, ...allIds(n.children)]);
}
const find = (nodes: readonly ViewNode[], id: string): ViewNode | undefined => {
  for (const n of nodes) {
    if (n.id === id) return n;
    const hit = find(n.children, id);
    if (hit !== undefined) return hit;
  }
  return undefined;
};
const ends = (edges: readonly ViewEdge[]) => edges.filter((e) => e.kind === 'depends').map((e) => [e.from, e.to]);
const edgeId = (c: CompiledView, from: string, to: string): string =>
  c.edges.find((e) => e.from === from && e.to === to)!.id;

describe('planView', () => {
  it('ungrouped with nothing hidden, the view comes back untouched', () => {
    const json = fixture();
    const compiled = compile(json);
    expect(view(compiled, json, { grouped: false, hidden: none })).toBe(compiled);
  });

  it('hiding drops the hidden rows and their arrows', () => {
    const json = fixture();
    const v = view(compile(json), json, { grouped: false, hidden: new Set(['plat']) });
    const ids = allIds(v.roots);
    expect(ids).not.toContain('ui');
    expect(ids).not.toContain('search');
    expect(ids).toEqual(expect.arrayContaining(['checkout', 'api', 'freeze', 'rollout', 'launch']));
    expect(ends(v.edges)).toEqual([['checkout', 'rollout']]);
    expect(ends(v.layoutEdges)).toEqual([['checkout', 'rollout']]);
    // folded away, a hidden row no longer resolves to the box that held it
    const folded = compile(json, { checkout: 'collapsed' });
    expect(folded.anchorOf.get('ui')).toBe('checkout');
    expect(view(folded, json, { grouped: false, hidden: new Set(['plat']) }).anchorOf.has('ui')).toBe(false);
    expect(v.edges.some((e) => e.to === 'ui')).toBe(false);
    expect(v.copies).toBeUndefined();
    expect(v.lanes).toBeUndefined();
  });

  it("a shared project is drawn once per lane, each copy keeping that lane's rows", () => {
    const json = fixture();
    const v = view(compile(json), json, { grouped: true, hidden: none });
    const payCo = find(v.roots, planCopyId('pay', 'checkout'))!;
    const platCo = find(v.roots, planCopyId('plat', 'checkout'))!;
    expect(v.copies?.get(payCo.id)).toBe('checkout');
    expect(v.copies?.get(platCo.id)).toBe('checkout');
    expect(payCo.node).toBe(json.nodes.find((n) => n.id === 'checkout'));
    expect(payCo.children.map((c) => c.id)).toEqual([planCopyId('pay', 'api'), planCopyId('pay', 'freeze')]);
    expect(platCo.children.map((c) => c.id)).toEqual([planCopyId('plat', 'ui'), planCopyId('plat', 'freeze')]);
    expect(v.copies?.get(planCopyId('plat', 'freeze'))).toBe('freeze');
    // the real zone no longer appears, and no canvas id repeats
    const ids = allIds(v.roots);
    expect(ids).not.toContain('checkout');
    expect(new Set(ids).size).toBe(ids.length);
    // every zone copy is tinted by planTint, nested ones too
    const graph = planGraph(json, 'plan');
    const input = { model: json, graph, teams: planTeams(json, graph, none) };
    expect(v.tints?.get(payCo.id)).toEqual(planTint(input, 'checkout', 'pay'));
    expect(v.tints?.get(planCopyId('pay', 'api'))).toEqual(planTint(input, 'api', 'pay'));
    expect(v.tints?.has(planCopyId('pay', 'freeze'))).toBe(false);
  });

  it('a folded project stays folded in every lane', () => {
    const json = fixture();
    const v = view(compile(json, { checkout: 'collapsed' }), json, { grouped: true, hidden: none });
    for (const lane of ['pay', 'plat']) {
      const copy = find(v.roots, planCopyId(lane, 'checkout'))!;
      expect(copy.state).toBe('collapsed');
      expect(copy.children).toEqual([]);
    }
  });

  it('an arrow is drawn in each lane holding both ends, otherwise once between first copies', () => {
    const json = fixture();
    const compiled = compile(json);
    const v = view(compiled, json, { grouped: true, hidden: none });
    const c = (lane: string, id: string) => planCopyId(lane, id);
    const expected = [
      [c('plat', 'ui'), c('pay', 'api')],
      [c('plat', 'search'), c('plat', 'checkout')],
      [c('pay', 'checkout'), c('pay', 'rollout')],
      [c('plat', 'checkout'), c('plat', 'rollout')],
      [c('pay', 'api'), c('plat', 'search')],
    ];
    expect(ends(v.edges)).toEqual(expected);
    expect(ends(v.layoutEdges)).toEqual(expected);
    const rollout = edgeId(compiled, 'checkout', 'rollout');
    expect(v.copies?.get(planCopyId('pay', rollout))).toBe(rollout);
    expect(v.copies?.get(planCopyId('plat', rollout))).toBe(rollout);
    const ids = v.edges.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    // an actor's role arrow has one end with no copies: it goes to the first copy
    expect(v.edges.find((e) => e.kind === 'executes' && e.from === 'plat')?.to).toBe(c('plat', 'ui'));
  });

  it('lane headers come in lane order, and top-level events sit apart from the lanes', () => {
    const json = fixture();
    const v = view(compile(json), json, { grouped: true, hidden: none });
    expect(v.lanes?.map((l) => [l.id, l.lane.key, l.zones])).toEqual([
      [planCopyId('pay', ''), 'pay', [planCopyId('pay', 'checkout'), planCopyId('pay', 'rollout')]],
      [
        planCopyId('plat', ''),
        'plat',
        [planCopyId('plat', 'checkout'), planCopyId('plat', 'search'), planCopyId('plat', 'rollout')],
      ],
    ]);
    const header = v.roots.find((r) => r.id === planCopyId('pay', ''))!;
    expect(header.node).toEqual({ id: header.id, type: PLAN_LANE_TYPE, name: 'Payments', color: '#f00' });
    expect(v.topEvents).toEqual(['launch']);
    expect(v.roots.some((r) => r.id === 'launch')).toBe(true);
  });

  it('inside an opened zone there are no lanes, but hiding applies', () => {
    const json = fixture();
    const compiled = compileView(json, { plane: 'plan', root: 'checkout', carry: ['pay', 'plat', 'alice'] });
    const v = view(compiled, json, { grouped: true, opened: true, hidden: new Set(['plat']) });
    const ids = allIds(v.roots);
    expect(ids).toEqual(expect.arrayContaining(['api', 'freeze']));
    expect(ids).not.toContain('ui');
    expect(v.edges.some((e) => e.from === 'ui' || e.to === 'ui')).toBe(false);
    // the stub for the hidden `search` outside the frame goes, with its arrow
    expect(compiled.externals?.has('__ext__:search')).toBe(true);
    expect(v.roots.some((r) => r.external === 'search')).toBe(false);
    expect(v.externals?.has('__ext__:search')).toBe(false);
    expect(ends(v.edges)).toEqual([]);
    expect(v.lanes).toBeUndefined();
    expect(v.copies).toBeUndefined();
  });

  it('actors are never hidden from the view', () => {
    const json = fixture();
    const v = view(compile(json), json, { grouped: false, hidden: new Set(['alice', 'pay', 'plat']) });
    const ids = allIds(v.roots);
    expect(ids).toEqual(expect.arrayContaining(['alice', 'pay', 'plat']));
    expect(ids).not.toContain('api');
    const grouped = view(compile(json), json, { grouped: true, hidden: new Set(['alice']) });
    expect(allIds(grouped.roots)).toContain('alice');
  });
});
