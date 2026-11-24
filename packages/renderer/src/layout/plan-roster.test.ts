import { describe, expect, it } from 'vitest';
import {
  PLAN_UNASSIGNED,
  compileView,
  model,
  planCopyId,
  planView,
  type BoxSize,
  type CompiledView,
  type DiagramModel,
} from '@diagc/core/internal';
import type { NodeGeometry } from './layout';
import { estimateBoxSize } from './box-size';
import { PLAN_LAYOUT, planLayout } from './plan-layout';
import { EYE_W, rosterOrder } from './plan-roster';

const { FRAME_PAD, FRAME_HEADER, HEADER_H } = PLAN_LAYOUT;

/** examples/plan/teams: Payments {ana, ben}, Platform {ben, cleo}, Mobile {dev},
 * an unowned zone (Unassigned); and when asked for, `eve` in no team and `ops`, a
 * team with nobody in it */
function teams(withEve = false, withOps = false): DiagramModel {
  const m = model('teams-plan');
  const p = m.plan();
  const ana = p.person('ana', 'Ana Silva');
  const ben = p.person('ben', 'Ben Okafor');
  const cleo = p.person('cleo', 'Cleo Brandt');
  const dev = p.person('dev', 'Dev Rao');
  if (withEve) p.person('eve', 'Eve Moss');
  const payments = p.team('payments', 'Payments');
  const platform = p.team('platform', 'Platform');
  const mobile = p.team('mobile', 'Mobile');
  if (withOps) p.team('ops', 'Ops');
  payments.member(ana, ben);
  platform.member(ben, cleo);
  mobile.member(dev);
  const checkout = p.zone('checkout', { name: 'Checkout v2', start: '2026-01-05', end: '2026-03-13' });
  checkout.owner(ana);
  checkout.zone('cards', { name: 'Card payments', start: '2026-01-05', end: '2026-02-13' }).executor(payments);
  checkout.zone('gateway', { name: 'Gateway', start: '2026-01-19', end: '2026-03-13' }).executor(platform);
  p.zone('app', { name: 'App', start: '2026-01-12', end: '2026-02-27' }).owner(dev).executor(mobile);
  p.zone('audit', { name: 'Audit', start: '2026-02-16', end: '2026-03-06' }).owner(cleo);
  return m.toJSON();
}

function planOf(m: DiagramModel, grouped: boolean): CompiledView {
  const pins = Object.fromEntries(m.nodes.map((n) => [n.id, 'expanded' as const]));
  return planView(compileView(m, { plane: 'plan', pins }), m, 'plan', { grouped, hidden: new Set() });
}

function lay(m: DiagramModel, grouped: boolean, sizeHints?: ReadonlyMap<string, BoxSize>) {
  const view = planOf(m, grouped);
  const geometry = planLayout({ view, model: m, plane: 'plan', ...(sizeHints ? { sizeHints } : {}) }).geometry;
  return { view, g: (id: string): NodeGeometry => geometry.get(id)! };
}

/** `inner` sits in `outer`'s body: below its header row, inside its padding */
const inFrame = (outer: NodeGeometry, inner: NodeGeometry): boolean =>
  inner.x >= outer.x + FRAME_PAD &&
  inner.x + inner.width <= outer.x + outer.width - FRAME_PAD &&
  inner.y >= outer.y + FRAME_HEADER &&
  inner.y + inner.height <= outer.y + outer.height - FRAME_PAD;

const overlap = (a: NodeGeometry, b: NodeGeometry): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** `a` is read after `b`: in a later (lower) roster row, or further right in the same one */
const readsAfter = (a: NodeGeometry, b: NodeGeometry): boolean =>
  b.y + b.height <= a.y || (a.y < b.y + b.height && b.y < a.y + a.height && b.x + b.width <= a.x);

/** a roster's units: each frame, and each card in none */
function units(view: CompiledView, ids: readonly string[]): string[] {
  const framed = new Set((view.roster ?? []).flatMap((f) => f.members));
  return ids.filter((id) => !framed.has(id));
}

describe('the roster frames', () => {
  for (const grouped of [false, true]) {
    describe(grouped ? 'grouped' : 'ungrouped', () => {
      it('draws each team as a frame around its members, a copy where a person is in a second team', () => {
        const { g } = lay(teams(), grouped);
        expect(inFrame(g('payments'), g('ana'))).toBe(true);
        expect(inFrame(g('payments'), g('ben'))).toBe(true);
        expect(inFrame(g('platform'), g(planCopyId('platform', 'ben')))).toBe(true);
        expect(inFrame(g('platform'), g('cleo'))).toBe(true);
        expect(inFrame(g('mobile'), g('dev'))).toBe(true);
        // a member is in its own frame only
        expect(overlap(g('platform'), g('ana'))).toBe(false);
        expect(overlap(g('payments'), g('cleo'))).toBe(false);
      });

      it('no two units overlap, and no two badges in a frame', () => {
        const { view, g } = lay(teams(true), grouped);
        const all = ['payments', 'platform', 'mobile', 'eve', PLAN_UNASSIGNED];
        for (const a of units(view, all))
          for (const b of units(view, all)) if (a !== b) expect(overlap(g(a), g(b)), `${a} / ${b}`).toBe(false);
        for (const f of view.roster!)
          for (const a of f.members)
            for (const b of f.members) if (a !== b) expect(overlap(g(a), g(b)), `${a} / ${b}`).toBe(false);
      });

      it('a person in no team stands in no frame, after every frame', () => {
        const { g } = lay(teams(true), grouped);
        for (const team of ['payments', 'platform', 'mobile']) {
          expect(overlap(g(team), g('eve'))).toBe(false);
          expect(readsAfter(g('eve'), g(team)), team).toBe(true);
        }
      });

      it('Unassigned closes the last roster row, rightmost', () => {
        const { view, g } = lay(teams(true), grouped);
        const u = g(PLAN_UNASSIGNED);
        for (const id of units(view, ['payments', 'platform', 'mobile', 'eve'])) {
          expect(readsAfter(u, g(id)), id).toBe(true);
          // nothing is on a row below it
          expect(g(id).y).toBeLessThan(u.y + u.height);
        }
      });
    });
  }

  it('a team with no member here is a plain card, not a frame', () => {
    const { view, g } = lay(teams(false, true), false);
    expect(view.roster!.map((f) => f.team)).not.toContain('ops');
    // a card, as tall as it draws (as a badge is), among the loose cards after the frames
    expect(g('ops')).toMatchObject({ width: 160, height: g('ana').height });
    expect(g('ana').height).toBeLessThan(80);
    expect(readsAfter(g('ops'), g('mobile'))).toBe(true);
  });

  it('a team wider than the chart wraps its members inside its frame, clear of the row above and the header', () => {
    const m = model('wide');
    const p = m.plan();
    p.zone('z', { start: '2026-01-01', end: '2026-01-15' }); // 15 days = 300px of chart
    const first = p.team('first', 'First');
    first.member(p.person('solo', 'Solo'));
    const big = p.team('big', 'Big');
    const people = Array.from({ length: 8 }, (_, i) => p.person(`m${i}`, `M${i}`));
    big.member(...people);
    const j = m.toJSON();
    const hints = new Map([...people.map((n) => n.id), 'solo'].map((id) => [id, { width: 100, height: 40 }]));
    const { view, g } = lay(j, false, hints);
    const frame = g('big');
    // two badges a row: 10 + 100 + 24 + 100 + 10 = 244 fits the 300px chart,
    // a third does not, so the eight stand in four rows
    for (const id of people.map((n) => n.id)) expect(inFrame(frame, g(id)), id).toBe(true);
    expect(new Set(people.map((n) => g(n.id).y)).size).toBe(4);
    expect(frame.width).toBeLessThanOrEqual(300);
    // the first frame is on the row above, and does not touch it
    expect(overlap(g('first'), frame)).toBe(false);
    expect(g('first').y + g('first').height).toBeLessThanOrEqual(frame.y);
    // nothing in the roster reaches down into the chart's header
    const roster = [...view.roots.map((r) => r.id)].filter((id) => id !== 'z');
    for (const id of roster) expect(g(id).y + g(id).height, id).toBeLessThanOrEqual(-HEADER_H);
  });

  describe('a long-named badge', () => {
    const NAME = 'Jonathan Whitfield-B'; // 20 characters, past the 160px floor
    function longNamed(): DiagramModel {
      const m = model('long');
      const p = m.plan();
      p.zone('z', { start: '2026-01-05', end: '2026-03-27' });
      const jo = p.person('jo', NAME);
      p.team('t', 'Team').member(jo, p.person('al', 'Al'));
      return m.toJSON();
    }
    const layLong = (chromeless: boolean) => {
      const m = longNamed();
      const view = planOf(m, false);
      const geometry = planLayout({ view, model: m, plane: 'plan', chromeless }).geometry;
      const drawn = estimateBoxSize({
        name: NAME,
        hasIcon: true,
        shape: 'pill',
        subtitle: m.nodes.find((n) => n.id === 'jo')!.type!,
      });
      return { g: (id: string): NodeGeometry => geometry.get(id)!, drawn };
    };

    it('has room for its eye on the title row, inside its frame', () => {
      const { g, drawn } = layLong(false);
      expect(drawn.width).toBeGreaterThan(160);
      expect(g('jo').width).toBeGreaterThanOrEqual(drawn.width + EYE_W);
      expect(inFrame(g('t'), g('jo'))).toBe(true);
      expect(overlap(g('jo'), g('al'))).toBe(false);
    });

    it('chromeless (no eye drawn), is sized as its title row alone', () => {
      const { g, drawn } = layLong(true);
      expect(g('jo').width).toBe(drawn.width);
      expect(inFrame(g('t'), g('jo'))).toBe(true);
    });
  });

  it('a frame wraps against the count, with nothing dated to measure it by', () => {
    const m = model('nodates');
    const p = m.plan();
    const big = p.team('big', 'Big');
    const people = Array.from({ length: 8 }, (_, i) => p.person(`m${i}`, `M${i}`));
    big.member(...people);
    const { g } = lay(m.toJSON(), false);
    for (const id of people.map((n) => n.id)) expect(inFrame(g('big'), g(id)), id).toBe(true);
    // six to a row, as the roster's own rows
    expect(new Set(people.map((n) => g(n.id).y)).size).toBe(2);
  });
});

describe('rosterOrder', () => {
  /** Payments (alice, bob), Platform (bob too), carol and Ops in none, and a
   * zone nobody holds. Role holders come first in the ungrouped roster. */
  function roster(): DiagramModel {
    const m = model('r');
    const p = m.plan();
    const ops = p.team('ops', 'Ops');
    const pay = p.team('pay', 'Payments');
    const plat = p.team('plat', 'Platform');
    const alice = p.person('alice', 'Alice');
    const bob = p.person('bob', 'Bob');
    const carol = p.person('carol', 'Carol');
    pay.member(alice, bob);
    plat.member(bob);
    p.zone('a', { start: '2026-01-05', end: '2026-01-16' }).executor(carol).executor(plat);
    p.zone('b', { start: '2026-01-19', end: '2026-01-30' }).executor(alice);
    p.zone('loose', { start: '2026-02-02', end: '2026-02-13' });
    void ops;
    return m.toJSON();
  }
  const unitsOf = (grouped: boolean) => {
    const m = roster();
    const view = planOf(m, grouped);
    // the actors as placeRoster hands them over: role holders first, then the rest
    const ids = ['carol', 'plat', 'alice', 'pay', 'ops', 'bob', planCopyId('plat', 'bob'), PLAN_UNASSIGNED];
    return rosterOrder(
      m,
      grouped,
      view.roster,
    )(ids).map((u) => ('frame' in u ? `${u.frame.team}{${u.frame.members.join(',')}}` : u.card));
  };

  it('ungrouped: the frames in model order, then the rest as they arrive, then Unassigned', () => {
    const copy = planCopyId('plat', 'bob');
    expect(unitsOf(false)).toEqual(['pay{alice,bob}', `plat{${copy}}`, 'carol', 'ops', PLAN_UNASSIGNED]);
  });

  it('grouped: a team nobody is in comes ahead of the people in no team, as the lanes run', () => {
    const copy = planCopyId('plat', 'bob');
    expect(unitsOf(true)).toEqual(['pay{alice,bob}', `plat{${copy}}`, 'ops', 'carol', PLAN_UNASSIGNED]);
  });
});
