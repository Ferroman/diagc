import { describe, expect, it } from 'vitest';
import { LEAF_SIZE, PLAN_ZONE_TYPE, compileView, dayOf, model, type CompiledView, type DiagramModel } from '@diagc/core';
import { PLAN_LAYOUT, planLayout, planX } from './plan-layout';

const { DAY, BAR_H, TITLE_H, PAD, ROW_GAP, EVENT, HEADER_H, ROSTER_GAP } = PLAN_LAYOUT;

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

  it('draws a positioned "other" at its clamped spot, skips its flow slot, and grows the bar to cover it', () => {
    const m = roadmap();
    const width = days('2026-02-02', '2026-03-27') * DAY;
    // x is way past the right wall (clamps to the last column the child fits
    // in), y is well below the title strip (no clamp needed, but deep enough
    // that only the positioned child's bottom, not the flow's, sets the height)
    const positions = { api: { x: width + 500, y: 300 } };
    const r = planLayout(view(m), m, 'plan', undefined, positions);
    const api = r.geometry.get('api')!;
    expect(api).toMatchObject({ x: width - LEAF_SIZE.width, y: 300, width: LEAF_SIZE.width, height: LEAF_SIZE.height });
    // db is the only node left to flow: it takes api's old (first) slot, not a second one
    expect(r.geometry.get('db')).toMatchObject({ x: PAD, y: TITLE_H });
    expect(r.geometry.get('build')!.height).toBe(300 + LEAF_SIZE.height + PAD);
    expect(r.fixed?.has('api')).toBe(true);
  });

  it('clamps a positioned "other" inside the bar: x to [0, width - its width], y to at least the title strip', () => {
    const m = roadmap();
    const width = days('2026-02-02', '2026-03-27') * DAY;
    const negative = planLayout(view(m), m, 'plan', undefined, { api: { x: -50, y: 0 } });
    expect(negative.geometry.get('api')).toMatchObject({ x: 0, y: TITLE_H });
    const overRight = planLayout(view(m), m, 'plan', undefined, { api: { x: width + 1000, y: TITLE_H } });
    expect(overRight.geometry.get('api')).toMatchObject({ x: width - LEAF_SIZE.width, y: TITLE_H });
  });

  it('ignores a saved position for anything but an "other": a nested zone, an event, a person', () => {
    const m = roadmap();
    const plain = planLayout(view(m), m, 'plan');
    const positioned = planLayout(view(m), m, 'plan', undefined, {
      design: { x: 999, y: 999 },
      m1: { x: 999, y: 999 },
      alice: { x: 999, y: 999 },
    });
    for (const id of ['design', 'm1', 'alice']) expect(positioned.geometry.get(id)).toEqual(plain.geometry.get(id));
  });

  it('is byte-identical to today when there are no saved child positions', () => {
    const m = roadmap();
    const withoutArg = planLayout(view(m), m, 'plan');
    const withEmptyMap = planLayout(view(m), m, 'plan', undefined, {});
    expect(withEmptyMap.geometry).toEqual(withoutArg.geometry);
    expect(withEmptyMap.fixed).toEqual(withoutArg.fixed);
  });

  it('a zone whose only children are events keeps a bare title strip', () => {
    const m = model('e');
    const p = m.plan();
    p.zone('z', { start: '2026-01-01', end: '2026-01-10' }).event('e', { at: '2026-01-03' });
    const r = planLayout(view(m.toJSON()), m.toJSON(), 'plan');
    expect(r.geometry.get('z')!.height).toBe(TITLE_H);
  });

  it('puts root events on the header baseline and people in a fixed roster strip above it', () => {
    const m = roadmap();
    const r = planLayout(view(m), m, 'plan');
    expect(r.geometry.get('kickoff')).toEqual({ x: planX(dayOf('2026-01-05')!, origin) + DAY / 2 - EVENT / 2, y: -HEADER_H / 2 - EVENT / 2, width: EVENT, height: EVENT });
    const alice = r.geometry.get('alice')!;
    const bob = r.geometry.get('bob')!;
    const rowY = -HEADER_H - ROSTER_GAP - LEAF_SIZE.height;
    // both fit the one row (the plan is thousands of px wide): left to right
    // from the origin, roles first (alice owns build), then the rest (bob)
    expect(alice).toMatchObject({ x: 0, y: rowY, width: LEAF_SIZE.width, height: LEAF_SIZE.height });
    expect(bob).toMatchObject({ x: LEAF_SIZE.width + ROSTER_GAP, y: rowY });
    for (const id of ['kickoff', 'alice', 'bob']) expect(r.fixed?.has(id)).toBe(true);
  });

  it('wraps the roster into a further row once a card would cross the plan width, stacking rows upward', () => {
    const m = model('w');
    const p = m.plan();
    p.zone('z', { start: '2026-01-01', end: '2026-01-06' }); // 6 days = 120px plan width
    const alice = p.person('alice', 'Alice');
    const bob = p.person('bob', 'Bob');
    const chen = p.person('chen', 'Chen');
    const hints = new Map([alice, bob, chen].map((n) => [n.id, { width: 40, height: 20 }]));
    const r = planLayout(view(m.toJSON()), m.toJSON(), 'plan', hints);
    // alice + bob: 40 + 24 + 40 = 104 ≤ 120, same row; + chen: 104 + 24 + 40 = 168 > 120, wraps
    const a = r.geometry.get('alice')!;
    const b = r.geometry.get('bob')!;
    const c = r.geometry.get('chen')!;
    expect(a).toMatchObject({ x: 0 });
    expect(b).toMatchObject({ x: 40 + ROSTER_GAP });
    expect(c).toMatchObject({ x: 0 }); // its own row, back at the origin
    // chen's row (declared last, wrapped) sits ROSTER_GAP above the header;
    // alice/bob's row sits ROW_GAP above that
    expect(c.y).toBe(-HEADER_H - ROSTER_GAP - 20);
    expect(a.y).toBe(c.y - ROW_GAP - 20);
    expect(b.y).toBe(a.y);
    for (const id of ['alice', 'bob', 'chen']) expect(r.fixed?.has(id)).toBe(true);
  });

  it('wraps a dateless plan\'s roster by count, six to a row', () => {
    const m = model('nodates');
    const p = m.plan();
    const people = Array.from({ length: 7 }, (_, i) => p.person(`p${i}`, `P${i}`));
    void people;
    const r = planLayout(view(m.toJSON()), m.toJSON(), 'plan');
    // the overflow row (just the 7th person) was formed last, so it sits
    // closest to the header; the first six sit one row further up
    const lastRowY = -HEADER_H - ROSTER_GAP - LEAF_SIZE.height;
    expect(r.geometry.get('p6')!.y).toBe(lastRowY);
    expect(r.geometry.get('p6')!.x).toBe(0);
    const firstRowY = lastRowY - ROW_GAP - LEAF_SIZE.height;
    for (let i = 0; i < 6; i++) expect(r.geometry.get(`p${i}`)!.y).toBe(firstRowY);
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

  it('anchors a zone with a reversed span at its own start, one day wide', () => {
    // `end < start` is a validation finding (plan-span) the save reports, and
    // one keystroke in the End field produces it: the bar must stay under the
    // eye that is fixing it, not fly back to the origin.
    const m = model('broken');
    const p = m.plan();
    p.zone('ok', { start: '2026-01-05', end: '2026-01-10' });
    p.zone('bad', { start: '2026-03-02', end: '2026-03-10' });
    // the builder refuses to emit the reversed span, so break it the way the
    // studio does: in the live model, between the keystroke and the save
    const json = m.toJSON();
    json.nodes.find((n) => n.id === 'bad')!.metadata!.end = '2026-02-01';
    const r = planLayout(view(json), json, 'plan');
    expect(r.geometry.get('bad')).toMatchObject({ x: planX(dayOf('2026-03-02')!, origin), width: DAY });
    // and it still sorts after `ok`, by its own start rather than the origin
    expect(r.geometry.get('bad')!.y).toBeGreaterThan(r.geometry.get('ok')!.y);
  });

  it('draws an empty plan as nothing, with no origin to trip on', () => {
    const m = model('empty');
    m.plan();
    const r = planLayout(view(m.toJSON()), m.toJSON(), 'plan');
    expect(r.geometry.size).toBe(0);
    expect(r.lockedX?.size ?? 0).toBe(0);
  });
});
