import { describe, expect, it } from 'vitest';
import { LEAF_SIZE, PLAN_ZONE_TYPE, compileView, dayOf, model, type CompiledView, type DiagramModel } from '@diagc/core';
import { PLAN_LAYOUT, planLayout, planX } from './plan-layout';

const { DAY, BAR_H, TITLE_H, PAD, ROW_GAP, EVENT, HEADER_H, ROSTER_W, ROSTER_GAP } = PLAN_LAYOUT;

/**
 * plan plane: q1 (Jan 5 – Mar 27) ⊃ design (Jan 5 – Jan 30), build (Feb 2 – Mar 27) ⊃ { m1 event Mar 2, api, db (borrowed) };
 * later (Apr 1 – Apr 10, declared first, starts last); root event kickoff Jan 5; alice owns build; bob is a person root.
 */
function roadmap(): DiagramModel {
  const m = model('r');
  m.plane('arch');
  const api = m.node('api', { type: 'service' });
  const db = m.node('db', { type: 'database' });
  const p = m.plan();
  const later = p.zone('later', { name: 'Later', start: '2026-04-01', end: '2026-04-10' });
  const q1 = p.zone('q1', { name: 'Q1', start: '2026-01-05', end: '2026-03-27' });
  const design = q1.zone('design', { name: 'Design', start: '2026-01-05', end: '2026-01-30' });
  const build = q1.zone('build', { name: 'Build', start: '2026-02-02', end: '2026-03-27' }).contains(api, db);
  build.event('m1', { name: 'M1', at: '2026-03-02' });
  p.event('kickoff', { name: 'Kickoff', at: '2026-01-05' });
  const alice = p.person('alice', 'Alice');
  build.owner(alice);
  p.person('bob', 'Bob');
  void later; void design;
  return m.toJSON();
}

/** zones pinned expanded, as DiagramView does through alwaysExpanded */
function view(m: DiagramModel): CompiledView {
  const pins = Object.fromEntries(m.nodes.filter((n) => n.type === PLAN_ZONE_TYPE).map((n) => [n.id, 'expanded' as const]));
  return compileView(m, { plane: 'plan', pins });
}

const origin = dayOf('2026-01-01')!;
const days = (a: string, b: string) => dayOf(b)! - dayOf(a)! + 1;

describe('planLayout', () => {
  it('places top-level zones by date on x, stacked by start on y, and locks their x', () => {
    const r = planLayout(view(roadmap()), roadmap(), 'plan');
    const q1 = r.geometry.get('q1')!;
    const later = r.geometry.get('later')!;
    expect(q1.x).toBe(planX(dayOf('2026-01-05')!, origin));
    expect(q1.width).toBe(days('2026-01-05', '2026-03-27') * DAY);
    expect(q1.y).toBe(0);
    expect(later.x).toBe(planX(dayOf('2026-04-01')!, origin));
    expect(later.y).toBe(q1.height + ROW_GAP); // q1 starts first, though `later` was declared first
    expect(later.height).toBe(BAR_H);
    expect(r.lockedX).toEqual(new Set(['q1', 'later']));
    expect(r.fixed?.has('q1')).toBe(false);
    expect(r.algorithm).toBe('plan');
    expect(r.routes.size).toBe(0);
    expect(r.labelSpots.size).toBe(0);
  });

  it('gives a titled zone a title strip, one row per child zone in start order, parent-relative x, and PAD below', () => {
    const r = planLayout(view(roadmap()), roadmap(), 'plan');
    const design = r.geometry.get('design')!;
    const build = r.geometry.get('build')!;
    expect(design).toMatchObject({ x: 0, y: TITLE_H, width: days('2026-01-05', '2026-01-30') * DAY, height: BAR_H });
    expect(build.x).toBe((dayOf('2026-02-02')! - dayOf('2026-01-05')!) * DAY);
    expect(build.y).toBe(TITLE_H + BAR_H + ROW_GAP);
    expect(r.geometry.get('q1')!.height).toBe(build.y + build.height + PAD);
    for (const id of ['design', 'build']) expect(r.fixed?.has(id)).toBe(true);
  });

  it('wraps borrowed nodes into rows under the title strip and puts a zone event in the strip', () => {
    const m = roadmap();
    const r = planLayout(view(m), m, 'plan');
    const build = r.geometry.get('build')!;
    const api = r.geometry.get('api')!;
    const db = r.geometry.get('db')!;
    expect(api).toMatchObject({ x: PAD, y: TITLE_H, width: LEAF_SIZE.width, height: LEAF_SIZE.height });
    expect(db).toMatchObject({ x: PAD + LEAF_SIZE.width + ROW_GAP, y: TITLE_H });
    expect(build.height).toBe(TITLE_H + LEAF_SIZE.height + PAD);
    const m1 = r.geometry.get('m1')!;
    expect(m1).toEqual({ x: (dayOf('2026-03-02')! - dayOf('2026-02-02')!) * DAY + DAY / 2 - EVENT / 2, y: (TITLE_H - EVENT) / 2, width: EVENT, height: EVENT });
    for (const id of ['api', 'db', 'm1']) expect(r.fixed?.has(id)).toBe(true);
  });

  it('schedules a node contained by two zones in the FIRST-edge zone only, never both', () => {
    // zoneB.contains(api) is declared before zoneA.contains(api): planGraph now
    // resolves `api` to zoneB alone, so zoneB gets a title strip and a row for
    // it while zoneA — which never actually hosts `api` in the view — stays a
    // bare, childless bar.
    const m = model('dag');
    const p = m.plan();
    const zoneB = p.zone('zoneB', { start: '2026-01-01', end: '2026-01-10' });
    const zoneA = p.zone('zoneA', { start: '2026-02-01', end: '2026-02-10' });
    const api = m.node('api', { type: 'service' });
    zoneB.contains(api);
    zoneA.contains(api);
    const r = planLayout(view(m.toJSON()), m.toJSON(), 'plan');
    expect(r.geometry.get('api')).toMatchObject({ x: PAD, y: TITLE_H, width: LEAF_SIZE.width, height: LEAF_SIZE.height });
    expect(r.geometry.get('zoneB')!.height).toBe(TITLE_H + LEAF_SIZE.height + PAD);
    expect(r.geometry.get('zoneA')!.height).toBe(BAR_H);
  });

  it('wraps a row when the next borrowed node would cross the right padding', () => {
    const m = model('w');
    const p = m.plan();
    const z = p.zone('z', { start: '2026-01-01', end: '2026-01-06' }); // 6 days = 120px wide, 108px inside the right pad
    const nodes = ['a', 'b', 'c'].map((id) => m.node(id, { type: 'service' }));
    z.contains(...nodes);
    const hints = new Map(nodes.map((n) => [n.id, { width: 40, height: 20 }]));
    const r = planLayout(view(m.toJSON()), m.toJSON(), 'plan', hints);
    expect(r.geometry.get('a')).toMatchObject({ x: PAD, y: TITLE_H }); // 12 … 52
    expect(r.geometry.get('b')).toMatchObject({ x: PAD + 40 + ROW_GAP, y: TITLE_H }); // 60 … 100 ≤ 108: same row
    expect(r.geometry.get('c')).toMatchObject({ x: PAD, y: TITLE_H + 20 + ROW_GAP }); // 108 … 148 > 108: next row
    expect(r.geometry.get('z')!.height).toBe(TITLE_H + 20 + ROW_GAP + 20 + PAD);
  });

  it('a zone whose only children are events keeps a bare title strip', () => {
    const m = model('e');
    const p = m.plan();
    p.zone('z', { start: '2026-01-01', end: '2026-01-10' }).event('e', { at: '2026-01-03' });
    const r = planLayout(view(m.toJSON()), m.toJSON(), 'plan');
    expect(r.geometry.get('z')!.height).toBe(TITLE_H);
  });

  it('puts root events on the header baseline and people in a fixed roster column', () => {
    const m = roadmap();
    const r = planLayout(view(m), m, 'plan');
    expect(r.geometry.get('kickoff')).toEqual({ x: planX(dayOf('2026-01-05')!, origin) + DAY / 2 - EVENT / 2, y: -HEADER_H / 2 - EVENT / 2, width: EVENT, height: EVENT });
    const alice = r.geometry.get('alice')!;
    const bob = r.geometry.get('bob')!;
    expect(alice).toMatchObject({ x: -(ROSTER_W + ROSTER_GAP), y: 0, width: LEAF_SIZE.width, height: LEAF_SIZE.height });
    expect(bob).toMatchObject({ x: -(ROSTER_W + ROSTER_GAP), y: alice.height + ROW_GAP }); // roles first, then the rest
    for (const id of ['kickoff', 'alice', 'bob']) expect(r.fixed?.has(id)).toBe(true);
  });

  it('gives no geometry to a node the view does not show, and parks a stray root under the zones', () => {
    // a plane cannot hide a node scoped to it (redundant-hide), so the view
    // drops `later` through a switched-off layer instead — which planGraph
    // (no layer filter) still lists: exactly the mismatch the layout must absorb
    const m = roadmap();
    m.layers.push({ id: 'maybe', name: 'Maybe' });
    m.nodes.find((n) => n.id === 'later')!.layer = 'maybe';
    m.nodes.push({ id: 'stray', name: 'Stray', type: 'service', plane: 'plan' });
    const pins = Object.fromEntries(m.nodes.filter((n) => n.type === PLAN_ZONE_TYPE).map((n) => [n.id, 'expanded' as const]));
    const r = planLayout(compileView(m, { plane: 'plan', pins, activeLayers: [] }), m, 'plan');
    expect(r.geometry.has('later')).toBe(false);
    const q1 = r.geometry.get('q1')!;
    expect(r.geometry.get('stray')).toMatchObject({ x: 0, y: q1.y + q1.height + ROW_GAP });
    expect(r.fixed?.has('stray')).toBe(false);
  });

  it('draws an empty plan as nothing, with no origin to trip on', () => {
    const m = model('empty');
    m.plan();
    const r = planLayout(view(m.toJSON()), m.toJSON(), 'plan');
    expect(r.geometry.size).toBe(0);
    expect(r.lockedX?.size ?? 0).toBe(0);
  });
});
