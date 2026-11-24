import { describe, expect, it } from 'vitest';
import { model } from '@diagc/core/internal';
import { PLAN_LAYOUT } from './plan-layout';
import { planLabelSides, planStripes } from './plan-marks';

const { DAY } = PLAN_LAYOUT;

describe('planLabelSides', () => {
  it('draws the name of a bar too short for it beside the bar, on the side its parent has room', () => {
    const m = model('short');
    const p = m.plan();
    const parent = p.zone('parent', { name: 'Upgrade', start: '2026-11-30', end: '2026-12-31' });
    parent.zone('first-day', { name: 'EU prod', start: '2026-11-30', end: '2026-11-30' });
    parent.zone('last-day', { name: 'EU prod', start: '2026-12-31', end: '2026-12-31' });
    parent.zone('long', { name: 'Dev + demo', start: '2026-12-01', end: '2026-12-20' });
    p.zone('root-day', { name: 'Imlek / CNY (ID 5-6, SG 6-8 Feb)', start: '2027-02-05', end: '2027-02-08' });
    const sides = planLabelSides(m.toJSON(), 'plan', DAY);
    expect(sides.get('first-day')).toBe('right');
    expect(sides.get('last-day')).toBe('left'); // to the right is outside its parent
    expect(sides.get('root-day')).toBe('right'); // nothing to stay inside of
    expect(sides.has('long')).toBe(false); // fits: drawn inside, as ever
    expect(sides.has('parent')).toBe(false); // fits its dates
  });

  it('hangs the name of a bar an arrow leaves on its left, and of one an arrow enters on its right, so the curve never crosses it', () => {
    const m = model('leads');
    const p = m.plan();
    // three weeks of chart before gw and after db
    p.event('kickoff', { name: 'Kickoff', at: '2026-11-09' });
    p.event('done', { name: 'Done', at: '2026-12-31' });
    const gw = p.zone('gw', { name: 'API gateway upgrade', start: '2026-11-30', end: '2026-12-02' });
    // no room on its left inside gw: it hangs out of gw's left wall, over open canvas
    const stage = gw.zone('stage', { name: 'Staging and QA', start: '2026-11-30', end: '2026-11-30' });
    gw.zone('quiet', { name: 'Nothing after', start: '2026-12-01', end: '2026-12-01' });
    const db = p.zone('db', { name: 'Database', start: '2026-12-07', end: '2026-12-08' });
    // no room on its right inside db: it hangs out of db's right wall
    const eu = db.zone('eu', { name: 'EU go-live', start: '2026-12-08', end: '2026-12-08' });
    m.relate(stage, eu, { kind: 'depends' });
    const sides = planLabelSides(m.toJSON(), 'plan', DAY);
    expect(sides.get('stage')).toBe('left');
    // folded, gw stands in for stage at the arrow's start, and db for eu at its end
    expect(sides.get('gw')).toBe('left');
    expect(sides.get('db')).toBe('right');
    expect(sides.get('eu')).toBe('right');
    expect(sides.get('quiet')).toBe('right');
  });

  it('a name that would hang off the start of the chart stays on the right; one off its end, on the left', () => {
    const m = model('edges');
    const p = m.plan();
    const first = p.zone('first', { name: 'API gateway 2.4 to 3.0 upgrade', start: '2026-11-30', end: '2026-12-01' });
    const last = p.zone('last', { name: 'Database 15 to 16 upgrade', start: '2026-12-14', end: '2026-12-15' });
    m.relate(first, last, { kind: 'depends' });
    const sides = planLabelSides(m.toJSON(), 'plan', DAY);
    expect(sides.get('first')).toBe('right');
    expect(sides.get('last')).toBe('left');
  });

  it('a bar an arrow both enters and leaves keeps the usual side', () => {
    const m = model('chain');
    const p = m.plan();
    const a = p.zone('a', { name: 'First step here', start: '2026-11-30', end: '2026-11-30' });
    const parent = p.zone('parent', { name: 'Parent', start: '2026-12-01', end: '2026-12-10' });
    const mid = parent.zone('mid', { name: 'Middle step', start: '2026-12-10', end: '2026-12-10' });
    const c = p.zone('c', { name: 'Last step here', start: '2026-12-14', end: '2026-12-14' });
    m.relate(a, mid, { kind: 'depends' });
    m.relate(mid, c, { kind: 'depends' });
    expect(planLabelSides(m.toJSON(), 'plan', DAY).get('mid')).toBe('left'); // its parent's wall is on the right
  });

  it('a period is no arrow: the bar it interrupts keeps its name where it was', () => {
    const m = model('frozen');
    const p = m.plan();
    p.event('kickoff', { name: 'Kickoff', at: '2026-11-09' });
    const z = p.zone('z', { name: 'Staging and QA', start: '2026-11-30', end: '2026-11-30' });
    p.period('freeze', { start: '2026-11-30', end: '2026-11-30', interrupts: [z] });
    expect(planLabelSides(m.toJSON(), 'plan', DAY).get('z')).toBe('right');
  });

  it('a role is no arrow: an owner leaves the name beside the bar', () => {
    const m = model('roles');
    const p = m.plan();
    const z = p.zone('z', { name: 'Staging and QA', start: '2026-11-30', end: '2026-11-30' });
    z.owner(p.person('ana', 'Ana'));
    expect(planLabelSides(m.toJSON(), 'plan', DAY).get('z')).toBe('right');
  });

  it('gives a zone with rows a side too, for when it is folded into a bar', () => {
    const m = model('folds');
    const p = m.plan();
    // a long name on a three-day zone: open, it titles its band; folded, it is
    // a bar like any other and its name goes beside it
    p.zone('short', { name: 'Kubernetes 1.29 to 1.30', start: '2026-03-02', end: '2026-03-04' }).zone('row', {
      start: '2026-03-02',
      end: '2026-03-03',
    });
    expect(planLabelSides(m.toJSON(), 'plan', DAY).get('short')).toBe('right');
  });
});

describe('planLabelSides at another day width', () => {
  function narrow() {
    const m = model('wide');
    m.plan().zone('stage', { name: 'Staging and QA', start: '2026-11-30', end: '2026-12-02' });
    return m.toJSON();
  }
  it('a name that does not fit three days at 20 px per day fits them at 60', () => {
    const m = narrow();
    expect(planLabelSides(m, 'plan', DAY).get('stage')).toBeDefined();
    expect(planLabelSides(m, 'plan', 3 * DAY).has('stage')).toBe(false);
  });
  it('the cache answers per width', () => {
    const m = narrow();
    const at60 = planLabelSides(m, 'plan', 3 * DAY);
    const at20 = planLabelSides(m, 'plan', DAY);
    expect(at60).not.toBe(at20);
    expect(planLabelSides(m, 'plan', 3 * DAY)).toBe(at60);
  });
});

describe('planStripes', () => {
  it("stripes each interrupted bar over the period's days inside its own, in px from the bar's left edge", () => {
    const m = model('freeze');
    const p = m.plan();
    const temporal = p.zone('temporal', { name: 'Temporal', start: '2026-12-07', end: '2027-01-19' });
    const late = p.zone('late', { name: 'Late', start: '2026-12-28', end: '2027-01-12' });
    const early = p.zone('early', { name: 'Early', start: '2026-11-30', end: '2026-12-11' });
    p.zone('quiet', { name: 'Quiet', start: '2026-12-01', end: '2027-01-30' });
    p.period('freeze', {
      name: 'Holiday change freeze',
      start: '2026-12-21',
      end: '2027-01-03',
      interrupts: [temporal, late, early],
      color: '#999999',
    });
    const stripes = planStripes(m.toJSON(), 'plan', DAY);
    expect(stripes.get('temporal')).toEqual([
      { x: 14 * DAY, width: 14 * DAY, title: 'Holiday change freeze', color: '#999999' },
    ]);
    // starts before the bar: clipped to it
    expect(stripes.get('late')).toEqual([{ x: 0, width: 7 * DAY, title: 'Holiday change freeze', color: '#999999' }]);
    // over before the freeze: nothing to draw
    expect(stripes.has('early')).toBe(false);
    // not interrupted, though the freeze falls in its days
    expect(stripes.has('quiet')).toBe(false);
  });

  it("a stripe's x and width scale with the day width", () => {
    const m = model('freeze40');
    const p = m.plan();
    const z = p.zone('z', { name: 'Z', start: '2026-12-07', end: '2027-01-19' });
    p.period('freeze', { name: 'Freeze', start: '2026-12-21', end: '2027-01-03', interrupts: [z] });
    const json = m.toJSON();
    expect(planStripes(json, 'plan', 2 * DAY).get('z')).toEqual([{ x: 28 * DAY, width: 28 * DAY, title: 'Freeze' }]);
    expect(planStripes(json, 'plan', DAY).get('z')).toEqual([{ x: 14 * DAY, width: 14 * DAY, title: 'Freeze' }]);
  });
});
