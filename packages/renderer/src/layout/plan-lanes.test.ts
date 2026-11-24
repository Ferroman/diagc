import { describe, expect, it } from 'vitest';
import {
  PLAN_ZONE_TYPE,
  compileView,
  dayOf,
  model,
  planCopyId,
  planView,
  type CompiledView,
  type DiagramModel,
  type Point,
} from '@diagc/core/internal';
import { PLAN_LAYOUT, planLayout, planX } from './plan-layout';

const { DAY, BAR_H, TITLE_H, PAD, ROW_GAP, LANE_H } = PLAN_LAYOUT;

/** Payments (alice) and Platform. `checkout` is shared: Platform builds `ui`,
 * alice (so Payments) builds `api`, and a `freeze` event sits inside it.
 * `search` is Platform's alone, `rollout` both teams', `launch` a top-level
 * event. Starts: checkout, then search, then rollout. */
function teams(): DiagramModel {
  const m = model('t');
  const p = m.plan();
  const pay = p.team('pay', 'Payments', { color: '#f00' });
  const plat = p.team('plat', 'Platform');
  const alice = p.person('alice', 'Alice');
  pay.member(alice);
  const checkout = p.zone('checkout', { name: 'Checkout', start: '2026-01-05', end: '2026-02-27' });
  checkout.zone('ui', { name: 'UI', start: '2026-01-05', end: '2026-01-30' }).executor(plat);
  checkout.zone('api', { name: 'API', start: '2026-02-02', end: '2026-02-20' }).executor(alice);
  checkout.event('freeze', { name: 'Freeze', at: '2026-02-10' });
  p.zone('search', { name: 'Search', start: '2026-01-12', end: '2026-01-23' }).executor(plat);
  p.zone('rollout', { name: 'Rollout', start: '2026-03-02', end: '2026-03-13' }).executor(pay).executor(plat);
  p.event('launch', { name: 'Launch', at: '2026-03-16' });
  return m.toJSON();
}

/** zones open, as DiagramView rests them, then grouped into lanes */
function grouped(m: DiagramModel): CompiledView {
  const pins = Object.fromEntries(
    m.nodes.filter((n) => n.type === PLAN_ZONE_TYPE).map((n) => [n.id, 'expanded' as const]),
  );
  return planView(compileView(m, { plane: 'plan', pins }), m, 'plan', { grouped: true, hidden: new Set() });
}

function lay(m: DiagramModel, positions?: Record<string, Point>) {
  const v = grouped(m);
  return { v, r: planLayout({ view: v, model: m, plane: 'plan', ...(positions ? { positions } : {}) }) };
}

const origin = dayOf('2026-01-01')!;
const pay = (id: string) => planCopyId('pay', id);
const plat = (id: string) => planCopyId('plat', id);

describe('plan lanes', () => {
  it('lanes stack under their headers, each copy in its lane', () => {
    const m = teams();
    const { r } = lay(m);
    const g = (id: string) => r.geometry.get(id)!;
    const start = dayOf('2026-01-05')!;
    const width = (dayOf('2026-03-16')! + 1 - start) * DAY;
    // the top-level event keeps its place in the header band, above the lanes
    expect(g('launch').y).toBeLessThan(0);
    expect(g(pay(''))).toEqual({ x: planX(start, origin, DAY), y: 0, width, height: LANE_H });
    let y = LANE_H + ROW_GAP;
    for (const id of [pay('checkout'), pay('rollout')]) {
      expect(g(id).y).toBe(y);
      y += g(id).height + ROW_GAP;
    }
    expect(g(plat(''))).toEqual({ x: planX(start, origin, DAY), y, width, height: LANE_H });
    y += LANE_H + ROW_GAP;
    for (const id of [plat('checkout'), plat('search'), plat('rollout')]) {
      expect(g(id).y).toBe(y);
      y += g(id).height + ROW_GAP;
    }
    // laid where they are: no saved position moves a copy or a header
    for (const id of [pay(''), pay('checkout'), pay('rollout'), plat(''), plat('search')]) {
      expect(r.fixed?.has(id)).toBe(true);
      expect(r.lockedX?.has(id) ?? false).toBe(false);
    }
    // the real zones are not drawn: only their copies are in the view
    expect(r.geometry.has('checkout')).toBe(false);
  });

  it('a lane keeps the ungrouped order of its bars', () => {
    const m = teams();
    const order = (positions?: Record<string, Point>) => {
      const { r } = lay(m, positions);
      return [plat('checkout'), plat('search'), plat('rollout')].sort(
        (a, b) => r.geometry.get(a)!.y - r.geometry.get(b)!.y,
      );
    };
    expect(order()).toEqual([plat('checkout'), plat('search'), plat('rollout')]);
    // dragged below rollout in the ungrouped chart, search sits below it in its lane too
    expect(order({ search: { x: 0, y: 900 } })).toEqual([plat('checkout'), plat('rollout'), plat('search')]);
  });

  it("a copy's rows are its own lane's rows", () => {
    const m = teams();
    const { r } = lay(m);
    const g = (id: string) => r.geometry.get(id);
    // Payments' checkout holds api only, Platform's ui only; the event is in both
    expect(g(pay('api'))).toMatchObject({ x: (dayOf('2026-02-02')! - dayOf('2026-01-05')!) * DAY, y: TITLE_H });
    expect(g(pay('ui'))).toBeUndefined();
    expect(g(plat('ui'))).toMatchObject({ x: 0, y: TITLE_H });
    expect(g(plat('api'))).toBeUndefined();
    for (const id of [pay('freeze'), plat('freeze')]) expect(g(id)).toBeDefined();
    expect(g(pay('checkout'))!.height).toBe(TITLE_H + BAR_H + PAD);
    expect(g(plat('checkout'))!.height).toBe(TITLE_H + BAR_H + PAD);
    for (const id of [pay('api'), plat('ui'), pay('freeze')]) expect(r.fixed?.has(id)).toBe(true);
  });

  it('copies of one zone share its x', () => {
    const m = teams();
    const { r } = lay(m);
    const x = (id: string) => r.geometry.get(id)!.x;
    expect(x(pay('checkout'))).toBe(planX(dayOf('2026-01-05')!, origin, DAY));
    expect(x(plat('checkout'))).toBe(x(pay('checkout')));
    expect(x(pay('rollout'))).toBe(planX(dayOf('2026-03-02')!, origin, DAY));
    expect(x(plat('rollout'))).toBe(x(pay('rollout')));
    expect(x(pay('freeze'))).toBe(x(plat('freeze')));
  });
});
