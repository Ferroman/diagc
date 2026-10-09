import { describe, expect, it } from 'vitest';
import { model } from '../../builder/index';
import { validate } from '../../validate/index';

describe('plan', () => {
  it('declares the plan plane with the notation, named by default; throws when declared twice', () => {
    const m = model('p');
    m.plan();
    expect(m.toJSON().planes).toEqual([{ id: 'plan', name: 'Plan', notation: 'plan' }]);
    expect(() => m.plan()).toThrow(/already declared/);
    const n = model('n');
    n.plane('arch').plan('schedule', { name: 'Q4' });
    expect(n.toJSON().planes[1]).toEqual({ id: 'schedule', name: 'Q4', notation: 'plan' });
  });

  it('builds zones, nested zones, events, people and roles, scoped to the plane', () => {
    const m = model('roadmap');
    m.plane('arch');
    const api = m.node('api', { type: 'service' });
    const p = m.plan();
    const alice = p.person('alice', 'Alice Ng', { color: '#c33' });
    const q1 = p.zone('q1', { name: 'Q1', start: '2026-01-05', end: '2026-03-27', color: '#2f6fed' });
    const build = q1
      .zone('build', { name: 'Build', start: '2026-02-02', end: '2026-03-27' })
      .contains(api)
      .owner(alice)
      .executor(alice);
    build.event('m1', { name: 'M1', at: '2026-03-02' });
    const kickoff = p.event('kickoff', { name: 'Kickoff', at: '2026-01-05' });
    q1.checker(alice);
    const json = m.toJSON();
    expect(json.nodes.map((n) => [n.id, n.type, n.plane])).toEqual([
      ['api', 'service', undefined],
      ['alice', 'person', 'plan'],
      ['q1', 'plan-zone', 'plan'],
      ['build', 'plan-zone', 'plan'],
      ['m1', 'plan-event', 'plan'],
      ['kickoff', 'plan-event', 'plan'],
    ]);
    expect(json.nodes[2]).toMatchObject({
      name: 'Q1',
      color: '#2f6fed',
      metadata: { start: '2026-01-05', end: '2026-03-27' },
    });
    expect(json.nodes[4]!.metadata).toEqual({ at: '2026-03-02' });
    expect(json.nodes[1]).toMatchObject({ name: 'Alice Ng', color: '#c33' });
    expect(json.containment).toEqual([
      { parent: 'q1', child: 'build', plane: 'plan' },
      { parent: 'build', child: 'api', plane: 'plan' },
      { parent: 'build', child: 'm1', plane: 'plan' },
    ]);
    expect(json.relations).toEqual([
      { id: 'alice->build#0', from: 'alice', to: 'build', kind: 'owns' },
      { id: 'alice->build#1', from: 'alice', to: 'build', kind: 'executes' },
      { id: 'alice->q1#0', from: 'alice', to: 'q1', kind: 'checks' },
    ]);
    expect(kickoff.id).toBe('kickoff');
    expect(validate(json)).toEqual([]);
  });

  it('tags containment with the plan plane even when it is the only plane, and composes with comment()/link()', () => {
    const m = model('solo');
    const p = m.plan();
    const q = p.zone('q', { start: '2026-01-05', end: '2026-01-09' });
    q.event('e', { at: '2026-01-06' });
    q.comment('slipping', { by: 'bf', at: '2026-01-07' }).link('Tracker', 'https://example.test/q');
    const json = m.toJSON();
    expect(json.containment).toEqual([{ parent: 'q', child: 'e', plane: 'plan' }]);
    expect(json.nodes[0]!.comments).toEqual([{ id: 'c1', text: 'slipping', by: 'bf', at: '2026-01-07' }]);
    expect(json.nodes[0]!.links).toEqual([{ label: 'Tracker', url: 'https://example.test/q' }]);
  });

  it("rejects person()'s plane at compile time — a person is always scoped to the plan plane", () => {
    const m = model('guard');
    const p = m.plan();
    // @ts-expect-error — plane is forced to the plan's plane; person() must not accept an override,
    // or `...opts` (which spreads after `plane: this.plane`) would silently win.
    p.person('carol', 'Carol', { plane: 'arch' });
  });

  it('builds a team the same way as a person: scoped to the plane, holds roles', () => {
    const m = model('roadmap');
    const p = m.plan();
    const platform = p.team('platform', 'Platform team', { color: '#c33' });
    const q1 = p.zone('q1', { name: 'Q1', start: '2026-01-05', end: '2026-03-27' }).owner(platform);
    const json = m.toJSON();
    expect(json.nodes.map((n) => [n.id, n.type, n.plane])).toEqual([
      ['platform', 'team', 'plan'],
      ['q1', 'plan-zone', 'plan'],
    ]);
    expect(json.nodes[0]).toMatchObject({ name: 'Platform team', color: '#c33' });
    expect(json.relations).toEqual([{ id: 'platform->q1#0', from: 'platform', to: 'q1', kind: 'owns' }]);
    expect(validate(json)).toEqual([]);
    void q1;
  });

  it("rejects team()'s plane at compile time — a team is always scoped to the plan plane", () => {
    const m = model('guard');
    const p = m.plan();
    // @ts-expect-error — same guard as person(): plane is forced, opts must not accept an override.
    p.team('growth', 'Growth', { plane: 'arch' });
  });
});
