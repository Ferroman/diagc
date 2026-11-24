import { describe, expect, it } from 'vitest';
import {
  LEAF_SIZE,
  PLAN_ZONE_TYPE,
  compileView,
  dayOf,
  model,
  type CompiledView,
  type DiagramModel,
} from '@diagc/core/internal';
import { notationProfile } from '../notations';
import { PLAN_LAYOUT, planLayout, planX } from './plan-layout';

const { DAY, BAR_H, TITLE_H, PAD, ROW_GAP, EVENT, HEADER_H, MONTH_H, WEEK_H, DAY_H, ROSTER_GAP } = PLAN_LAYOUT;

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
  void later;
  void design;
  return m.toJSON();
}

/** zones open, as DiagramView rests them, except the `folded` ones */
function view(m: DiagramModel, folded: readonly string[] = []): CompiledView {
  const pins = Object.fromEntries(
    m.nodes
      .filter((n) => n.type === PLAN_ZONE_TYPE)
      .map((n) => [n.id, folded.includes(n.id) ? ('collapsed' as const) : ('expanded' as const)]),
  );
  return compileView(m, { plane: 'plan', pins });
}

const origin = dayOf('2026-01-01')!;
const days = (a: string, b: string) => dayOf(b)! - dayOf(a)! + 1;

describe('planLayout', () => {
  it('places top-level zones by date on x, stacked by start on y, and locks their x', () => {
    const r = planLayout({ view: view(roadmap()), model: roadmap(), plane: 'plan' });
    const q1 = r.geometry.get('q1')!;
    const later = r.geometry.get('later')!;
    expect(q1.x).toBe(planX(dayOf('2026-01-05')!, origin, DAY));
    expect(q1.width).toBe(days('2026-01-05', '2026-03-27') * DAY);
    expect(q1.y).toBe(0);
    expect(later.x).toBe(planX(dayOf('2026-04-01')!, origin, DAY));
    expect(later.y).toBe(q1.height + ROW_GAP); // q1 starts first, though `later` was declared first
    expect(later.height).toBe(BAR_H);
    expect(r.lockedX).toEqual(new Set(['q1', 'later']));
    expect(r.fixed?.has('q1')).toBe(false);
    expect(r.algorithm).toBe('plan');
    expect(r.routes.size).toBe(0);
    expect(r.labelSpots.size).toBe(0);
  });

  it('gives a titled zone a title strip, one row per child zone in start order, parent-relative x, and PAD below', () => {
    const r = planLayout({ view: view(roadmap()), model: roadmap(), plane: 'plan' });
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
    const r = planLayout({ view: view(m), model: m, plane: 'plan' });
    const build = r.geometry.get('build')!;
    const api = r.geometry.get('api')!;
    const db = r.geometry.get('db')!;
    expect(api).toMatchObject({ x: PAD, y: TITLE_H, width: LEAF_SIZE.width, height: LEAF_SIZE.height });
    expect(db).toMatchObject({ x: PAD + LEAF_SIZE.width + ROW_GAP, y: TITLE_H });
    expect(build.height).toBe(TITLE_H + LEAF_SIZE.height + PAD);
    const m1 = r.geometry.get('m1')!;
    expect(m1).toEqual({
      x: (dayOf('2026-03-02')! - dayOf('2026-02-02')!) * DAY + DAY / 2 - EVENT / 2,
      y: (TITLE_H - EVENT) / 2,
      width: EVENT,
      height: EVENT,
    });
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
    const r = planLayout({ view: view(m.toJSON()), model: m.toJSON(), plane: 'plan' });
    expect(r.geometry.get('api')).toMatchObject({
      x: PAD,
      y: TITLE_H,
      width: LEAF_SIZE.width,
      height: LEAF_SIZE.height,
    });
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
    const r = planLayout({ view: view(m.toJSON()), model: m.toJSON(), plane: 'plan', sizeHints: hints });
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
    const r = planLayout({ view: view(m), model: m, plane: 'plan', positions });
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
    const negative = planLayout({ view: view(m), model: m, plane: 'plan', positions: { api: { x: -50, y: 0 } } });
    expect(negative.geometry.get('api')).toMatchObject({ x: 0, y: TITLE_H });
    const overRight = planLayout({
      view: view(m),
      model: m,
      plane: 'plan',
      positions: { api: { x: width + 1000, y: TITLE_H } },
    });
    expect(overRight.geometry.get('api')).toMatchObject({ x: width - LEAF_SIZE.width, y: TITLE_H });
  });

  it('ignores a saved position for anything but an "other": a nested zone, an event, a person', () => {
    const m = roadmap();
    const plain = planLayout({ view: view(m), model: m, plane: 'plan' });
    const positioned = planLayout({
      view: view(m),
      model: m,
      plane: 'plan',
      positions: {
        design: { x: 999, y: 999 },
        m1: { x: 999, y: 999 },
        alice: { x: 999, y: 999 },
      },
    });
    for (const id of ['design', 'm1', 'alice']) expect(positioned.geometry.get(id)).toEqual(plain.geometry.get(id));
  });

  it('is byte-identical to today when there are no saved child positions', () => {
    const m = roadmap();
    const withoutArg = planLayout({ view: view(m), model: m, plane: 'plan' });
    const withEmptyMap = planLayout({ view: view(m), model: m, plane: 'plan', positions: {} });
    expect(withEmptyMap.geometry).toEqual(withoutArg.geometry);
    expect(withEmptyMap.fixed).toEqual(withoutArg.fixed);
  });

  it('a zone whose only children are events keeps a bare title strip', () => {
    const m = model('e');
    const p = m.plan();
    p.zone('z', { start: '2026-01-01', end: '2026-01-10' }).event('e', { at: '2026-01-03' });
    const r = planLayout({ view: view(m.toJSON()), model: m.toJSON(), plane: 'plan' });
    expect(r.geometry.get('z')!.height).toBe(TITLE_H);
  });

  it('centres root events on the month/week boundary, clear of the week labels, and people in a roster strip above the header', () => {
    expect(HEADER_H).toBe(MONTH_H + WEEK_H + DAY_H);
    const m = roadmap();
    const r = planLayout({ view: view(m), model: m, plane: 'plan' });
    expect(r.geometry.get('kickoff')).toEqual({
      x: planX(dayOf('2026-01-05')!, origin, DAY) + DAY / 2 - EVENT / 2,
      // centred on the line between the month and week bands: centred in the
      // week band, the diamond and its name sat on the W## label
      y: -(DAY_H + WEEK_H) - EVENT / 2,
      width: EVENT,
      height: EVENT,
    });
    const alice = r.geometry.get('alice')!;
    const bob = r.geometry.get('bob')!;
    const rowY = -HEADER_H - ROSTER_GAP - LEAF_SIZE.height;
    // both fit the one row: left to right from the plan's first day (5 Jan,
    // not the 1 Jan origin), roles first (alice owns build), then the rest (bob)
    const first = planX(dayOf('2026-01-05')!, origin, DAY);
    expect(alice).toMatchObject({ x: first, y: rowY, width: LEAF_SIZE.width, height: LEAF_SIZE.height });
    expect(bob).toMatchObject({ x: first + LEAF_SIZE.width + ROSTER_GAP, y: rowY });
    for (const id of ['kickoff', 'alice', 'bob']) expect(r.fixed?.has(id)).toBe(true);
  });

  it('a period sits in the header over its days and takes no row', () => {
    const plan = (withPeriod: boolean) => {
      const m = model('r2');
      const p = m.plan();
      const later = p.zone('later', { name: 'Later', start: '2026-04-01', end: '2026-04-10' });
      p.zone('q1', { name: 'Q1', start: '2026-01-05', end: '2026-03-27' });
      if (withPeriod)
        p.period('freeze', { name: 'Freeze', start: '2026-02-09', end: '2026-02-15', interrupts: [later] });
      return m.toJSON();
    };
    const plain = plan(false);
    const j = plan(true);
    const r = planLayout({ view: view(j), model: j, plane: 'plan' });
    expect(r.geometry.get('freeze')).toEqual({
      x: planX(dayOf('2026-02-09')!, origin, DAY),
      y: -(DAY_H + WEEK_H) - EVENT / 2,
      width: 7 * DAY,
      height: EVENT,
    });
    expect(r.fixed?.has('freeze')).toBe(true);
    // the zones stand where they would without it
    const without = planLayout({ view: view(plain), model: plain, plane: 'plan' });
    expect(r.geometry.get('q1')!.y).toBe(without.geometry.get('q1')!.y);
    expect(r.geometry.get('later')!.y).toBe(without.geometry.get('later')!.y);
  });

  it('wraps the roster into a further row once a card would cross the plan width, stacking rows upward', () => {
    const m = model('w');
    const p = m.plan();
    p.zone('z', { start: '2026-01-01', end: '2026-01-06' }); // 6 days = 120px plan width
    const alice = p.person('alice', 'Alice');
    const bob = p.person('bob', 'Bob');
    const chen = p.person('chen', 'Chen');
    const hints = new Map([alice, bob, chen].map((n) => [n.id, { width: 40, height: 20 }]));
    const r = planLayout({ view: view(m.toJSON()), model: m.toJSON(), plane: 'plan', sizeHints: hints });
    // alice + bob: 40 + 24 + 40 = 104 ≤ 120, same row; + chen: 104 + 24 + 40 = 168 > 120, wraps
    const a = r.geometry.get('alice')!;
    const b = r.geometry.get('bob')!;
    const c = r.geometry.get('chen')!;
    expect(a).toMatchObject({ x: 0 });
    expect(b).toMatchObject({ x: 40 + ROSTER_GAP });
    expect(c).toMatchObject({ x: 0 }); // its own row, back at the plan's first day (= the origin here)
    // chen's row (declared last, wrapped) sits ROSTER_GAP above the header;
    // alice/bob's row sits ROW_GAP above that
    expect(c.y).toBe(-HEADER_H - ROSTER_GAP - 20);
    expect(a.y).toBe(c.y - ROW_GAP - 20);
    expect(b.y).toBe(a.y);
    for (const id of ['alice', 'bob', 'chen']) expect(r.fixed?.has(id)).toBe(true);
  });

  it("starts the roster at a late-in-the-year plan's first day and wraps it against the plan's own width", () => {
    // The origin is 1 January: a plan that opens on 30 November would leave a
    // roster anchored there eleven months of canvas to the left of its chart.
    const m = model('late');
    const p = m.plan();
    p.zone('z', { start: '2026-11-30', end: '2026-12-05' }); // 6 days = 120px plan width
    const alice = p.person('alice', 'Alice');
    const bob = p.person('bob', 'Bob');
    const chen = p.person('chen', 'Chen');
    const hints = new Map([alice, bob, chen].map((n) => [n.id, { width: 40, height: 20 }]));
    const r = planLayout({ view: view(m.toJSON()), model: m.toJSON(), plane: 'plan', sizeHints: hints });
    const first = planX(dayOf('2026-11-30')!, origin, DAY);
    expect(r.geometry.get('alice')).toMatchObject({ x: first });
    expect(r.geometry.get('bob')).toMatchObject({ x: first + 40 + ROSTER_GAP });
    // 104 + 24 + 40 = 168 > 120: chen wraps, though the plan ends 11 months from the origin
    expect(r.geometry.get('chen')).toMatchObject({ x: first });
    expect(r.geometry.get('chen')!.y).toBeGreaterThan(r.geometry.get('alice')!.y);
  });

  it("wraps a dateless plan's roster by count, six to a row", () => {
    const m = model('nodates');
    const p = m.plan();
    const people = Array.from({ length: 7 }, (_, i) => p.person(`p${i}`, `P${i}`));
    void people;
    const r = planLayout({ view: view(m.toJSON()), model: m.toJSON(), plane: 'plan' });
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
    const pins = Object.fromEntries(
      m.nodes.filter((n) => n.type === PLAN_ZONE_TYPE).map((n) => [n.id, 'expanded' as const]),
    );
    const r = planLayout({ view: compileView(m, { plane: 'plan', pins, activeLayers: [] }), model: m, plane: 'plan' });
    expect(r.geometry.has('later')).toBe(false);
    const q1 = r.geometry.get('q1')!;
    // under the chart's first day (the earliest zone starts 5 Jan), not the origin
    expect(r.geometry.get('stray')).toMatchObject({
      x: planX(dayOf('2026-01-05')!, origin, DAY),
      y: q1.y + q1.height + ROW_GAP,
    });
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
    const r = planLayout({ view: view(json), model: json, plane: 'plan' });
    expect(r.geometry.get('bad')).toMatchObject({ x: planX(dayOf('2026-03-02')!, origin, DAY), width: DAY });
    // and it still sorts after `ok`, by its own start rather than the origin
    expect(r.geometry.get('bad')!.y).toBeGreaterThan(r.geometry.get('ok')!.y);
  });

  it("deepens a zone's title band when its name and chips wrap, so its first row starts below them", () => {
    // 11 days = 220px: the name alone wraps, and the two role chips take a line
    // of their own. A first row at the fixed TITLE_H would sit on the title.
    const m = model('wrap');
    const p = m.plan();
    const a = p.person('a', 'Bayu');
    const b = p.person('b', 'Bohdan');
    const wide = p.zone('wide', { name: 'Envoy Gateway v1.9.1 → v1.10.0', start: '2026-11-30', end: '2027-02-10' });
    wide.zone('w1', { name: 'Demo', start: '2026-11-30', end: '2026-12-04' });
    const narrow = p.zone('narrow', { name: 'Envoy Gateway v1.9.1 → v1.10.0', start: '2026-11-30', end: '2026-12-10' });
    narrow.executor(a).checker(b);
    narrow.zone('n1', { name: 'Demo', start: '2026-11-30', end: '2026-12-04' });
    const r = planLayout({ view: view(m.toJSON()), model: m.toJSON(), plane: 'plan' });
    expect(r.geometry.get('w1')!.y).toBe(TITLE_H); // one line, no chips: the band as ever
    const first = r.geometry.get('n1')!;
    expect(first.y).toBeGreaterThan(TITLE_H);
    expect(r.geometry.get('narrow')!.height).toBe(first.y + first.height + PAD);
  });

  describe('a fold', () => {
    /** a (two rows, a1 holding a row of its own) saved at y 100, b saved below it, c saved above it */
    function stacked() {
      const m = model('fold');
      const p = m.plan();
      const a = p.zone('a', { start: '2026-01-05', end: '2026-01-30' });
      a.zone('a1', { start: '2026-01-05', end: '2026-01-16' }).zone('a1x', { start: '2026-01-05', end: '2026-01-09' });
      a.zone('a2', { start: '2026-01-19', end: '2026-01-30' });
      p.zone('b', { start: '2026-02-02', end: '2026-02-06' });
      p.zone('c', { start: '2026-02-09', end: '2026-02-13' });
      return m.toJSON();
    }
    const positions = { c: { x: 0, y: 0 }, a: { x: 0, y: 100 }, b: { x: 0, y: 400 } };
    const heightOfA = (folded: readonly string[]) =>
      planLayout({ view: view(stacked(), folded), model: stacked(), plane: 'plan', positions }).geometry.get('a')!
        .height;

    it('shifts saved top-level zones below a folded one up by the height it gave back', () => {
      const m = stacked();
      const r = planLayout({ view: view(m, ['a']), model: m, plane: 'plan', positions });
      expect(r.geometry.get('a')!.height).toBe(BAR_H);
      expect(r.viewShift?.get('b')).toBe(-(heightOfA([]) - BAR_H));
      expect(r.viewShift?.has('a')).toBe(false);
      expect(r.viewShift?.has('c')).toBe(false); // above the fold: it stays
    });

    it('shifts saved top-level zones below a nested fold', () => {
      const m = stacked();
      const r = planLayout({ view: view(m, ['a1']), model: m, plane: 'plan', positions });
      expect(heightOfA(['a1'])).toBeLessThan(heightOfA([]));
      expect(r.viewShift?.get('b')).toBe(-(heightOfA([]) - heightOfA(['a1'])));
    });

    it('stacks unsaved zones by their open height, and closes the gap through the view shift', () => {
      // so a move committed while folded saves the open-stack y (useCommitMoves
      // takes the shift back off), and unfolding never lands one zone on another
      const m = stacked();
      const r = planLayout({ view: view(m, ['a']), model: m, plane: 'plan' });
      const open = heightOfA([]);
      expect(r.geometry.get('b')!.y).toBe(open + ROW_GAP);
      expect(r.viewShift?.get('b')).toBe(-(open - BAR_H));
      expect(r.viewShift?.get('c')).toBe(-(open - BAR_H));
      expect(r.viewShift?.has('a')).toBe(false);
    });

    it('moves only the zones wholly below a fold: one beside it stays put', () => {
      const m = stacked();
      // b shares a's lane, 10px lower: closing a's gap would lift it into the header
      const beside = { a: { x: 0, y: 0 }, b: { x: 0, y: 10 } };
      const r = planLayout({ view: view(m, ['a']), model: m, plane: 'plan', positions: beside });
      expect(r.viewShift?.has('b') ?? false).toBe(false);
    });

    it('shifts nothing with no fold', () => {
      const m = stacked();
      expect(planLayout({ view: view(m), model: m, plane: 'plan', positions }).viewShift?.size ?? 0).toBe(0);
      expect(planLayout({ view: view(m), model: m, plane: 'plan' }).viewShift?.size ?? 0).toBe(0);
    });
  });

  describe('a zone opened on its own', () => {
    /** a (5–30 Jan) ⊃ a1, a2, event ev; early (Dec 2025) → a1; a2 → late (Feb); alice owns a1 */
    function opened() {
      const m = model('open');
      const p = m.plan();
      const a = p.zone('a', { start: '2026-01-05', end: '2026-01-30' });
      const a1 = a.zone('a1', { start: '2026-01-05', end: '2026-01-09' });
      const a2 = a.zone('a2', { start: '2026-01-19', end: '2026-01-30' });
      a.event('ev', { at: '2026-01-14' });
      const early = p.zone('early', { start: '2025-12-01', end: '2025-12-12' });
      const late = p.zone('late', { start: '2026-02-02', end: '2026-02-06' });
      m.relate(early, a1, { kind: 'sync' });
      m.relate(a2, late, { kind: 'sync' });
      a1.owner(p.person('alice', 'Alice'));
      a.contains(m.node('box', { name: 'Box' })); // free-form, saved below
      const json = m.toJSON();
      const pins = Object.fromEntries(
        json.nodes.filter((n) => n.type === PLAN_ZONE_TYPE).map((n) => [n.id, 'expanded' as const]),
      );
      const carry = notationProfile('plan').drillCarry!(json, 'plan', 'a');
      const v = compileView(json, { plane: 'plan', pins, root: 'a', carry: [...carry] });
      const positions = { box: { x: 40, y: TITLE_H + 10 } };
      return { json, r: planLayout({ view: v, model: json, plane: 'plan', positions, root: 'a' }) };
    }
    const o = dayOf('2025-01-01')!; // the origin: 1 January of the earliest year, which `early` sets

    it("draws the zone's rows at their own dates, stacked from the top", () => {
      const { r } = opened();
      const a1 = r.geometry.get('a1')!;
      expect(a1).toMatchObject({ x: planX(dayOf('2026-01-05')!, o, DAY), y: 0 });
      expect(r.geometry.get('a2')).toMatchObject({ x: planX(dayOf('2026-01-19')!, o, DAY), y: a1.height + ROW_GAP });
    });

    it('draws a free-form child where it sits in the whole view, against the rows', () => {
      const { r } = opened();
      // the zone's interior, translated: x by the zone's start, y by its title band
      expect(r.geometry.get('box')).toMatchObject({ x: planX(dayOf('2026-01-05')!, o, DAY) + 40, y: 10 });
    });

    it("reports the zone's interior origin for each child, so an edit saves what it would in the whole view", () => {
      const { r } = opened();
      const frame = { x: planX(dayOf('2026-01-05')!, o, DAY), y: -TITLE_H };
      for (const id of ['a1', 'a2', 'box', 'ev']) expect(r.savedFrame?.get(id)).toEqual(frame);
      expect(r.savedFrame?.has('alice') ?? false).toBe(false); // the roster is no zone's
      expect(r.viewShift).toBeUndefined();
    });

    it("puts the zone's event in the header, as a top-level one", () => {
      expect(opened().r.geometry.get('ev')).toMatchObject({
        x: planX(dayOf('2026-01-14')!, o, DAY) + DAY / 2 - EVENT / 2,
        y: -(DAY_H + WEEK_H) - EVENT / 2,
      });
    });

    it('lists the actors holding a role in it in the roster, as themselves, from its first day', () => {
      const alice = opened().r.geometry.get('alice')!;
      expect(alice.x).toBe(planX(dayOf('2026-01-05')!, o, DAY));
      expect(alice.y).toBe(-HEADER_H - ROSTER_GAP - alice.height);
    });

    it('marks a zone outside it at the edge its dates lie on', () => {
      const { r } = opened();
      const early = r.geometry.get('__ext__:early')!;
      const late = r.geometry.get('__ext__:late')!;
      expect(early.x + early.width).toBeLessThan(planX(dayOf('2026-01-05')!, o, DAY));
      expect(early.y).toBe(0);
      expect(late.x).toBeGreaterThan(planX(dayOf('2026-01-31')!, o, DAY));
      expect(late.y).toBe(0);
    });
  });

  describe('at another day width', () => {
    const W = 2 * DAY;
    it("at 40 px per day a zone's x and width double and an event stays centred on its day", () => {
      const m = roadmap();
      const r = planLayout({ view: view(m), model: m, plane: 'plan', dayWidth: W });
      const q1 = r.geometry.get('q1')!;
      expect(q1.x).toBe(planX(dayOf('2026-01-05')!, origin, W));
      expect(q1.width).toBe(days('2026-01-05', '2026-03-27') * W);
      expect(r.geometry.get('build')!.x).toBe((dayOf('2026-02-02')! - dayOf('2026-01-05')!) * W);
      expect(r.geometry.get('kickoff')!.x).toBe(planX(dayOf('2026-01-05')!, origin, W) + W / 2 - EVENT / 2);
      expect(r.geometry.get('m1')!.x).toBe((dayOf('2026-03-02')! - dayOf('2026-02-02')!) * W + W / 2 - EVENT / 2);
      // text does not stretch: a row's height is the same at any width
      const at20 = planLayout({ view: view(m), model: m, plane: 'plan' });
      expect(q1.height).toBe(at20.geometry.get('q1')!.height);
    });

    it('a saved free-form child keeps its day at 40 px per day', () => {
      // saved positions are in 20 px-per-day units: x 60 is three days into the bar
      const m = roadmap();
      const positions = { api: { x: 60, y: 300 } };
      const r = planLayout({ view: view(m), model: m, plane: 'plan', positions, dayWidth: W });
      expect(r.geometry.get('api')).toMatchObject({ x: 120, y: 300 });
    });

    it("a period's bracket spans its days at 40 px per day", () => {
      const m = model('p');
      const p = m.plan();
      p.zone('z', { start: '2026-02-01', end: '2026-02-28' });
      p.period('freeze', { start: '2026-02-09', end: '2026-02-15' });
      const j = m.toJSON();
      const r = planLayout({ view: view(j), model: j, plane: 'plan', dayWidth: W });
      expect(r.geometry.get('freeze')).toMatchObject({ x: planX(dayOf('2026-02-09')!, origin, W), width: 7 * W });
    });
  });

  it('draws an empty plan as nothing, with no origin to trip on', () => {
    const m = model('empty');
    m.plan();
    const r = planLayout({ view: view(m.toJSON()), model: m.toJSON(), plane: 'plan' });
    expect(r.geometry.size).toBe(0);
    expect(r.lockedX?.size ?? 0).toBe(0);
  });
});

/** The plan example starter (.diagrams/src/examples/plan/starter.diagram.ts), as
 * a fixture: people, a team, roles, nested rows, a zone event, a top-level one. */
function starter(): DiagramModel {
  const m = model('launch-plan', { name: 'Launch plan' });
  const plan = m.plan();
  const alice = plan.person('alice', 'Alice Ng', { color: '#2f6fed' });
  const bob = plan.person('bob', 'Bob Lee', { color: '#b08ad9' });
  const chen = plan.person('chen', 'Chen Wu', { color: '#3a9d5d' });
  const support = plan.team('support', 'Support team', { color: '#607d8b' });
  const discovery = plan.zone('discovery', { name: 'Discovery', start: '2026-01-05', end: '2026-01-23' });
  discovery.owner(alice).executor(bob);
  const build = plan.zone('build', { name: 'Build', start: '2026-01-26', end: '2026-03-06' });
  build.owner(alice).executor(bob).checker(chen);
  build.zone('api', { name: 'API', start: '2026-01-26', end: '2026-02-13' });
  build.zone('ui', { name: 'UI', start: '2026-02-09', end: '2026-03-06' });
  build.event('code-freeze', { name: 'Code freeze', at: '2026-03-02' });
  plan.zone('rollout', { name: 'Rollout', start: '2026-03-09', end: '2026-03-20' }).owner(chen).executor(support);
  plan.event('launch', { name: 'Launch', at: '2026-03-23' });
  return m.toJSON();
}

/** A layout as text, one line per node in id order, and its sets: compact
 * enough to pin a whole arrangement inline. */
function geometryOf(r: ReturnType<typeof planLayout>): string {
  const lines = [...r.geometry]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, g]) => `${id} ${g.x},${g.y} ${g.width}x${g.height}`);
  const set = (s: ReadonlySet<string> | undefined) => [...(s ?? [])].sort().join(' ');
  const shift = [...(r.viewShift ?? [])].map(([id, dy]) => `${id}:${dy}`).join(' ');
  return [...lines, `fixed ${set(r.fixed)}`, `lockedX ${set(r.lockedX)}`, `viewShift ${shift}`].join('\n');
}

describe('planLayout, pinned', () => {
  it('ungrouped with nothing hidden, the layout is unchanged', () => {
    const m = starter();
    expect(geometryOf(planLayout({ view: view(m), model: m, plane: 'plan' }))).toMatchInlineSnapshot(`
      "alice 80,-178 160x80
      api 0,40 380x40
      bob 264,-178 160x80
      build 500,48 800x140
      chen 448,-178 160x80
      code-freeze 702,12 16x16
      discovery 80,0 380x40
      launch 1622,-60 16x16
      rollout 1340,196 240x40
      support 632,-178 160x80
      ui 280,88 520x40
      fixed alice api bob chen code-freeze launch support ui
      lockedX build discovery rollout
      viewShift "
    `);
    // a fold, a saved y and a stretch: the viewShift and scaling paths too
    const folded = planLayout({
      view: view(m, ['build']),
      model: m,
      plane: 'plan',
      positions: { rollout: { x: 0, y: 400 } },
      dayWidth: 2 * DAY,
    });
    expect(geometryOf(folded)).toMatchInlineSnapshot(`
      "alice 160,-178 160x80
      bob 344,-178 160x80
      build 1000,48 1600x40
      chen 528,-178 160x80
      discovery 160,0 760x40
      launch 3252,-60 16x16
      rollout 2680,196 480x40
      support 712,-178 160x80
      fixed alice bob chen launch support
      lockedX build discovery rollout
      viewShift rollout:-100"
    `);
  });
});
