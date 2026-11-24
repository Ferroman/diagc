import { describe, expect, it } from 'vitest';
import { model } from '../../builder/index';
import { dayOf, planGraph } from './plan';
import { PLAN_UNASSIGNED, planTeams, planTint, teamsOf } from './teams';

const D = (iso: string): number => dayOf(iso)!;
const none: ReadonlySet<string> = new Set();

/** pay and plat teams; alice in pay, bob in both, carol in none, dave in plat. */
function fixture() {
  const m = model('t');
  const p = m.plan();
  const pay = p.team('pay', 'Payments', { color: '#f00' });
  const plat = p.team('plat', 'Platform');
  const alice = p.person('alice', 'Alice');
  const bob = p.person('bob', 'Bob');
  const carol = p.person('carol', 'Carol Diaz');
  const dave = p.person('dave', 'Dave');
  pay.member(alice, bob);
  plat.member(bob, dave);
  return { m, p, pay, plat, alice, bob, carol, dave };
}
const run = (m: ReturnType<typeof model>, hidden: ReadonlySet<string> = none) => {
  const json = m.toJSON();
  const graph = planGraph(json);
  return { json, graph, teams: planTeams(json, graph, hidden) };
};

describe('teamsOf', () => {
  it('lists only team targets of member-of, in order, once', () => {
    const { m, bob } = fixture();
    expect(teamsOf(m.toJSON(), bob.id)).toEqual(['pay', 'plat']);
    expect(teamsOf(m.toJSON(), 'carol')).toEqual([]);
  });
});

describe('planTeams', () => {
  it('a zone belongs to its executor team and to the teams of its executor people', () => {
    const { m, p, pay, alice } = fixture();
    p.zone('a', { start: '2026-01-05', end: '2026-01-09' }).executor(pay);
    p.zone('b', { start: '2026-01-05', end: '2026-01-09' }).executor(alice);
    const { teams } = run(m);
    expect(teams.laneKeysOf.get('a')).toEqual(['pay']);
    expect(teams.laneKeysOf.get('b')).toEqual(['pay']);
  });

  it('a person in no team is a lane of their own', () => {
    const { m, p, carol } = fixture();
    p.zone('a', { start: '2026-01-05', end: '2026-01-09' }).executor(carol);
    const { teams } = run(m);
    expect(teams.lanes).toEqual([{ key: 'carol', kind: 'person', name: 'Carol Diaz' }]);
  });

  it("a nested zone with no executor takes its parent's groups; with no executor above it, Unassigned", () => {
    const { m, p, pay } = fixture();
    const top = p.zone('top', { start: '2026-01-05', end: '2026-01-30' }).executor(pay);
    top.zone('inner', { start: '2026-01-05', end: '2026-01-09' });
    p.zone('loose', { start: '2026-01-05', end: '2026-01-09' }).zone('deep', {
      start: '2026-01-05',
      end: '2026-01-06',
    });
    const { teams } = run(m);
    expect(teams.laneKeysOf.get('inner')).toEqual(['pay']);
    expect(teams.laneKeysOf.get('deep')).toEqual([PLAN_UNASSIGNED]);
    expect(teams.lanes.at(-1)).toEqual({ key: PLAN_UNASSIGNED, kind: 'unassigned', name: 'Unassigned' });
  });

  it('a project appears in every lane that works anywhere inside it', () => {
    const { m, p, pay, plat } = fixture();
    const co = p.zone('checkout', { start: '2026-01-05', end: '2026-02-27' }).executor(pay);
    co.zone('ui', { start: '2026-01-05', end: '2026-01-30' }).executor(plat);
    co.zone('api', { start: '2026-02-02', end: '2026-02-27' }).executor(pay);
    const { teams } = run(m);
    expect(teams.laneKeysOf.get('checkout')).toEqual(['pay', 'plat']);
  });

  it('owners and checkers place nothing', () => {
    const { m, p, pay, alice } = fixture();
    p.zone('a', { start: '2026-01-05', end: '2026-01-09' }).owner(pay).checker(alice);
    const { teams } = run(m);
    expect(teams.laneKeysOf.get('a')).toEqual([PLAN_UNASSIGNED]);
  });

  it('hiding a team removes its lane and its work', () => {
    const { m, p, pay, plat } = fixture();
    p.zone('a', { start: '2026-01-05', end: '2026-01-09' }).executor(pay);
    p.zone('b', { start: '2026-01-05', end: '2026-01-09' }).executor(plat);
    const { teams } = run(m, new Set(['pay']));
    expect(teams.lanes.map((l) => l.key)).toEqual(['plat']);
    expect(teams.hiddenZones.has('a')).toBe(true);
    expect(teams.laneKeysOf.has('a')).toBe(false);
    expect(teams.laneKeysOf.get('b')).toEqual(['plat']);
  });

  it('a person in two teams keeps their work in the visible team', () => {
    const { m, p, bob } = fixture();
    p.zone('a', { start: '2026-01-05', end: '2026-01-09' }).executor(bob);
    const { teams } = run(m, new Set(['pay']));
    expect(teams.laneKeysOf.get('a')).toEqual(['plat']);
  });

  it('a hidden person removes the groups that came through them', () => {
    const { m, p, alice, pay } = fixture();
    p.zone('a', { start: '2026-01-05', end: '2026-01-09' }).executor(alice).executor(pay);
    const { teams } = run(m, new Set(['alice']));
    expect(teams.laneKeysOf.get('a')).toEqual(['pay']);
  });

  it('a zone whose executors are all hidden is hidden, not inherited', () => {
    const { m, p, pay, dave } = fixture();
    const co = p.zone('checkout', { start: '2026-01-05', end: '2026-02-27' }).executor(pay);
    co.zone('infra', { start: '2026-01-05', end: '2026-01-30' }).executor(dave);
    const { teams } = run(m, new Set(['dave']));
    expect(teams.hiddenZones.has('infra')).toBe(true);
    expect(teams.laneKeysOf.get('checkout')).toEqual(['pay']);
  });

  it('a project disappears once nothing visible is inside it', () => {
    const { m, p, pay } = fixture();
    const co = p.zone('checkout', { start: '2026-01-05', end: '2026-02-27' }).executor(pay);
    co.zone('api', { start: '2026-02-02', end: '2026-02-27' }).executor(pay);
    const { teams } = run(m, new Set(['pay']));
    expect(teams.hiddenZones.has('checkout')).toBe(true);
    expect(teams.hiddenZones.has('api')).toBe(true);
  });

  it('Unassigned can be hidden', () => {
    const { m, p, pay } = fixture();
    p.zone('a', { start: '2026-01-05', end: '2026-01-09' }).executor(pay);
    p.zone('b', { start: '2026-01-05', end: '2026-01-09' });
    const { teams } = run(m, new Set([PLAN_UNASSIGNED]));
    expect(teams.lanes.map((l) => l.key)).toEqual(['pay']);
    expect(teams.hiddenZones.has('b')).toBe(true);
  });

  it('it knows there is unassigned work even when Unassigned is hidden', () => {
    const { m, p, pay } = fixture();
    p.zone('a', { start: '2026-01-05', end: '2026-01-09' }).executor(pay);
    expect(run(m).teams.hasUnassigned).toBe(false);
    p.zone('b', { start: '2026-01-05', end: '2026-01-09' });
    expect(run(m, new Set([PLAN_UNASSIGNED])).teams.hasUnassigned).toBe(true);
  });

  it('lanes come in team order, then people, then Unassigned, and empty lanes are left out', () => {
    const { m, p, plat, carol, dave } = fixture();
    p.zone('a', { start: '2026-01-05', end: '2026-01-09' }).executor(carol);
    p.zone('b', { start: '2026-01-05', end: '2026-01-09' });
    p.zone('c', { start: '2026-01-05', end: '2026-01-09' }).executor(plat).executor(dave);
    const { teams } = run(m);
    expect(teams.lanes.map((l) => l.key)).toEqual(['plat', 'carol', PLAN_UNASSIGNED]);
    expect(teams.lanes[0]).toMatchObject({ kind: 'team', name: 'Platform' });
    const { teams: t2 } = run(fixtureWithColor());
    expect(t2.lanes[0]).toMatchObject({ key: 'pay', color: '#f00' });
  });
});

function fixtureWithColor() {
  const { m, p, pay } = fixture();
  p.zone('a', { start: '2026-01-05', end: '2026-01-09' }).executor(pay);
  return m;
}

describe('planTint', () => {
  it("the tint is the days of that lane's rows, merged", () => {
    const { m, p, pay, plat } = fixture();
    const co = p.zone('checkout', { start: '2026-01-05', end: '2026-03-31' });
    co.zone('a', { start: '2026-01-05', end: '2026-01-16' }).executor(pay);
    co.zone('b', { start: '2026-01-12', end: '2026-01-23' }).executor(pay);
    co.zone('c', { start: '2026-03-02', end: '2026-03-06' }).executor(pay);
    co.zone('d', { start: '2026-02-02', end: '2026-02-06' }).executor(plat);
    const { json, graph, teams } = run(m);
    expect(planTint(json, graph, teams, 'checkout', 'pay')).toEqual([
      { start: D('2026-01-05'), end: D('2026-01-23') },
      { start: D('2026-03-02'), end: D('2026-03-06') },
    ]);
    // adjacent days merge too
    const adj = fixture();
    const z = adj.p.zone('z', { start: '2026-01-05', end: '2026-01-30' });
    z.zone('x', { start: '2026-01-05', end: '2026-01-09' }).executor(adj.pay);
    z.zone('y', { start: '2026-01-10', end: '2026-01-12' }).executor(adj.pay);
    const r = run(adj.m);
    expect(planTint(r.json, r.graph, r.teams, 'z', 'pay')).toEqual([{ start: D('2026-01-05'), end: D('2026-01-12') }]);
  });

  it("the whole bar when the zone itself is that lane's", () => {
    const { m, p, pay } = fixture();
    const co = p.zone('checkout', { start: '2026-01-05', end: '2026-03-31' }).executor(pay);
    co.zone('a', { start: '2026-01-05', end: '2026-01-16' });
    const { json, graph, teams } = run(m);
    expect(planTint(json, graph, teams, 'checkout', 'pay')).toEqual([{ start: D('2026-01-05'), end: D('2026-03-31') }]);
  });
});
