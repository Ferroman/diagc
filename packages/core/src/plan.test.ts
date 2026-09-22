import { describe, expect, it } from 'vitest';
import { model } from './builder';
import {
  PLAN_EVENT_TYPE,
  PLAN_ROLES,
  PLAN_ZONE_TYPE,
  atOf,
  dayOf,
  isPlanRole,
  isoOf,
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
    const z = m.node('z', { type: PLAN_ZONE_TYPE });
    const other = m.node('other', { type: PLAN_ZONE_TYPE });
    const a = m.node('alice', { type: 'person' });
    const b = m.node('bob', { type: 'person' });
    m.relate(b, z, { kind: 'executes' }).relate(a, z, { kind: 'owns' }).relate(a, z, { kind: 'executes' });
    m.relate(a, other, { kind: 'checks' }).relate(z, other, { kind: 'sync' });
    expect(rolesOf(m.toJSON(), 'z')).toEqual({ owns: ['alice'], executes: ['bob', 'alice'], checks: [] });
    expect(rolesOf(m.toJSON(), 'other')).toEqual({ owns: [], executes: [], checks: ['alice'] });
  });
});
