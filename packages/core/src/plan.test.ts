import { describe, expect, it } from 'vitest';
import { model } from './builder';
import {
  PLAN_ACTOR_TYPES,
  PLAN_EVENT_TYPE,
  PLAN_ROLES,
  PLAN_ZONE_TYPE,
  atOf,
  dayOf,
  isPlanActor,
  isPlanRole,
  isoOf,
  planGraph,
  planSubtree,
  rolesOf,
  spanOf,
} from './plan';
import type { DiagramNode } from './types';

const zone = (metadata: Record<string, unknown>): DiagramNode => ({ id: 'z', name: 'Z', type: PLAN_ZONE_TYPE, metadata });
const event = (metadata: Record<string, unknown>): DiagramNode => ({ id: 'e', name: 'E', type: PLAN_EVENT_TYPE, metadata });

describe('dayOf / isoOf', () => {
  it('round-trips a real date as UTC days since the epoch', () => {
    expect(dayOf('1970-01-01')).toBe(0);
    expect(dayOf('1970-01-02')).toBe(1);
    expect(isoOf(dayOf('2026-03-01')!)).toBe('2026-03-01');
    // a leap day is a real day; the day after it is 1 March
    expect(isoOf(dayOf('2024-02-29')! + 1)).toBe('2024-03-01');
  });
  it('rejects anything that is not a real YYYY-MM-DD', () => {
    for (const bad of ['2026-02-30', '2026-1-5', '20260105', '', 5, null, undefined, 'tomorrow']) {
      expect(dayOf(bad)).toBeUndefined();
    }
  });
});

describe('spanOf / atOf', () => {
  it('reads a zone span from metadata, inclusive ends as day numbers', () => {
    expect(spanOf(zone({ start: '2026-01-05', end: '2026-01-09' }))).toEqual({ start: dayOf('2026-01-05'), end: dayOf('2026-01-09') });
  });
  it('is undefined for a non-zone, a missing or bad date, or end before start', () => {
    expect(spanOf({ ...zone({ start: '2026-01-05', end: '2026-01-09' }), type: 'service' })).toBeUndefined();
    expect(spanOf(zone({ start: '2026-01-05' }))).toBeUndefined();
    expect(spanOf(zone({ start: '2026-01-05', end: 'soon' }))).toBeUndefined();
    expect(spanOf(zone({ start: '2026-01-09', end: '2026-01-05' }))).toBeUndefined();
  });
  it('reads an event date; undefined for a non-event or a bad date', () => {
    expect(atOf(event({ at: '2026-01-07' }))).toBe(dayOf('2026-01-07'));
    expect(atOf({ ...event({ at: '2026-01-07' }), type: PLAN_ZONE_TYPE })).toBeUndefined();
    expect(atOf(event({ at: '2026-13-07' }))).toBeUndefined();
  });
});

describe('roles', () => {
  it('knows the three role kinds and nothing else', () => {
    expect(PLAN_ROLES).toEqual(['owns', 'executes', 'checks']);
    expect(isPlanRole('owns')).toBe(true);
    expect(isPlanRole('sync')).toBe(false);
  });
  it('rolesOf lists people per role in declaration order, only for relations INTO the zone', () => {
    const m = model('p');
    const z = m.node('z', { type: PLAN_ZONE_TYPE, metadata: { start: '2026-01-05', end: '2026-01-09' } });
    const other = m.node('other', { type: PLAN_ZONE_TYPE, metadata: { start: '2026-01-05', end: '2026-01-09' } });
    const a = m.node('alice', { type: 'person' });
    const b = m.node('bob', { type: 'person' });
    m.relate(b, z, { kind: 'executes' }).relate(a, z, { kind: 'owns' }).relate(a, z, { kind: 'executes' });
    m.relate(a, other, { kind: 'checks' }).relate(z, other, { kind: 'sync' });
    expect(rolesOf(m.toJSON(), 'z')).toEqual({ owns: ['alice'], executes: ['bob', 'alice'], checks: [] });
    expect(rolesOf(m.toJSON(), 'other')).toEqual({ owns: [], executes: [], checks: ['alice'] });
  });
});

describe('isPlanActor', () => {
  it('is a person or a team, never a zone, an event or an untyped/other node', () => {
    expect(PLAN_ACTOR_TYPES).toEqual(new Set(['person', 'team']));
    expect(isPlanActor({ id: 'a', name: 'A', type: 'person' })).toBe(true);
    expect(isPlanActor({ id: 't', name: 'T', type: 'team' })).toBe(true);
    expect(isPlanActor(zone({ start: '2026-01-05', end: '2026-01-09' }))).toBe(false);
    expect(isPlanActor(event({ at: '2026-01-05' }))).toBe(false);
    expect(isPlanActor({ id: 's', name: 'S', type: 'service' })).toBe(false);
    expect(isPlanActor({ id: 'u', name: 'U' })).toBe(false);
  });
});

describe('planGraph', () => {
  /** plan plane 'plan': Q1 ⊃ (design, build ⊃ (m1 event, api)), root event kickoff; api is a shared node */
  function fixture() {
    const m = model('roadmap');
    m.plane('arch').plane('plan', { notation: 'plan' });
    const api = m.node('api', { type: 'service' });
    const q1 = m.node('q1', { type: PLAN_ZONE_TYPE, plane: 'plan', metadata: { start: '2026-01-05', end: '2026-03-27' } });
    const design = m.node('design', { type: PLAN_ZONE_TYPE, plane: 'plan', metadata: { start: '2026-01-05', end: '2026-01-30' } });
    const build = m.node('build', { type: PLAN_ZONE_TYPE, plane: 'plan', metadata: { start: '2026-02-02', end: '2026-03-27' } });
    const m1 = m.node('m1', { type: PLAN_EVENT_TYPE, plane: 'plan', metadata: { at: '2026-03-02' } });
    const kickoff = m.node('kickoff', { type: PLAN_EVENT_TYPE, plane: 'plan', metadata: { at: '2025-12-15' } });
    const alice = m.node('alice', { type: 'person', plane: 'plan' });
    q1.contains(design, build, { plane: 'plan' });
    build.contains(m1, api, { plane: 'plan' });
    m.relate(alice, build, { kind: 'owns' }).relate(alice, q1, { kind: 'checks' });
    void kickoff;
    return m.toJSON();
  }

  it('lists zones, events and actors in declaration order, deduplicated', () => {
    const g = planGraph(fixture(), 'plan');
    expect(g.zones).toEqual(['q1', 'design', 'build']);
    expect(g.events).toEqual(['m1', 'kickoff']);
    expect(g.actors).toEqual(['alice']);
  });
  it('maps each node to its zone parent and each zone to its split children', () => {
    const g = planGraph(fixture(), 'plan');
    expect(g.parent.get('design')).toBe('q1');
    expect(g.parent.get('m1')).toBe('build');
    expect(g.parent.get('api')).toBe('build');
    expect(g.parent.has('q1')).toBe(false);
    expect(g.children.get('q1')).toEqual({ zones: ['design', 'build'], events: [], others: [] });
    expect(g.children.get('build')).toEqual({ zones: [], events: ['m1'], others: ['api'] });
    expect(g.children.get('design')).toEqual({ zones: [], events: [], others: [] });
  });
  it("picks a DAG child's parent by containment-edge order, not by zone-declaration order", () => {
    // `a` is declared before `b`, but the `b -> shared` edge is added before
    // `a -> shared`: the edge order must win (the same rule boundaryOf uses),
    // so the parent is `b` even though `a` comes first among `zones`.
    const m = model('dag');
    const a = m.node('a', { type: PLAN_ZONE_TYPE, metadata: { start: '2026-01-01', end: '2026-01-10' } });
    const b = m.node('b', { type: PLAN_ZONE_TYPE, metadata: { start: '2026-01-01', end: '2026-01-10' } });
    const shared = m.node('shared', { type: PLAN_EVENT_TYPE, metadata: { at: '2026-01-05' } });
    b.contains(shared);
    a.contains(shared);
    const g = planGraph(m.toJSON());
    expect(g.parent.get('shared')).toBe('b');
  });
  it('lists a DAG child under its resolved parent only — never under a zone `parent` did not pick', () => {
    // same fixture as the test above: `b -> shared` is declared before
    // `a -> shared`, so `parent` resolves `shared` to `b`; `children` must
    // agree, or the layout would schedule `shared` in both zones at once.
    const m = model('dag');
    const a = m.node('a', { type: PLAN_ZONE_TYPE, metadata: { start: '2026-01-01', end: '2026-01-10' } });
    const b = m.node('b', { type: PLAN_ZONE_TYPE, metadata: { start: '2026-01-01', end: '2026-01-10' } });
    const shared = m.node('shared', { type: PLAN_EVENT_TYPE, metadata: { at: '2026-01-05' } });
    b.contains(shared);
    a.contains(shared);
    const g = planGraph(m.toJSON());
    expect(g.children.get('b')).toEqual({ zones: [], events: ['shared'], others: [] });
    expect(g.children.get('a')).toEqual({ zones: [], events: [], others: [] });
  });
  it('spans the earliest to the latest date and sets the origin to 1 January of the first year', () => {
    const g = planGraph(fixture(), 'plan');
    expect(g.range).toEqual({ start: dayOf('2025-12-15'), end: dayOf('2026-03-27') });
    expect(g.origin).toBe(dayOf('2025-01-01'));
  });
  it('is empty, with no range or origin, on a plane without plan nodes', () => {
    const g = planGraph(fixture(), 'arch');
    expect(g.zones).toEqual([]);
    expect(g.events).toEqual([]);
    expect(g.range).toBeUndefined();
    expect(g.origin).toBeUndefined();
  });
  it('honours containmentOf: a plane borrowing the plan plane sees the same graph', () => {
    const m = fixture();
    m.planes.push({ id: 'mirror', name: 'Mirror', containmentOf: 'plan', notation: 'plan' });
    expect(planGraph(m, 'mirror').children.get('q1')).toEqual(planGraph(m, 'plan').children.get('q1'));
  });
  it('planSubtree is the zone plus every descendant zone and event, never a borrowed node', () => {
    const g = planGraph(fixture(), 'plan');
    expect(planSubtree(g, 'q1')).toEqual(['q1', 'design', 'build', 'm1']);
    expect(planSubtree(g, 'build')).toEqual(['build', 'm1']);
    expect(planSubtree(g, 'm1')).toEqual(['m1']);
  });
});
