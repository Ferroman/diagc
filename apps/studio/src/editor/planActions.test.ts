import { describe, expect, it } from 'vitest';
import { dayOf, isoOf, model, type DiagramModel, type EditorCommand } from '@diagc/core';
import { PLAN_LAYOUT, planX } from '@diagc/renderer';
import { addEvent, addPerson, addZone, planMoves, planResize, seedDates, setRole, ZONE_DAYS } from './planActions';

const { DAY } = PLAN_LAYOUT;
const d = (iso: string) => dayOf(iso)!;
const shift = (iso: string, days: number) => isoOf(d(iso) + days);

/** q1 (Jan 5 – Mar 27) ⊃ design (Jan 5 – Jan 30), build (Feb 2 – Mar 27) ⊃ m1 (Mar 2); solo (Apr 1 – Apr 10), childless; root event kickoff (Jan 5); alice owns build */
function roadmap(): DiagramModel {
  const m = model('r');
  const p = m.plan();
  const q1 = p.zone('q1', { start: '2026-01-05', end: '2026-03-27' });
  q1.zone('design', { start: '2026-01-05', end: '2026-01-30' });
  const build = q1.zone('build', { start: '2026-02-02', end: '2026-03-27' });
  build.event('m1', { at: '2026-03-02' });
  p.zone('solo', { start: '2026-04-01', end: '2026-04-10' });
  p.event('kickoff', { at: '2026-01-05' });
  const alice = p.person('alice', 'Alice');
  build.owner(alice);
  return m.toJSON();
}
const origin = d('2026-01-01');
const commands = (c: EditorCommand | undefined): EditorCommand[] => (c === undefined ? [] : c.type === 'batch' ? c.commands : [c]);
const dates = (c: EditorCommand | undefined) => commands(c).filter((x) => x.type === 'set-plan-dates');

describe('planMoves', () => {
  it('rounds a top-level zone\'s dx to days, shifts its subtree, and writes back the derived x with a clamped y', () => {
    const c = planMoves(roadmap(), 'plan', { q1: { x: 999, y: -30 } }, { q1: { dx: 7 * DAY + 6, dy: -30 } });
    expect(dates(c)).toEqual([
      { type: 'set-plan-dates', id: 'q1', dates: { start: shift('2026-01-05', 7), end: shift('2026-03-27', 7) } },
      { type: 'set-plan-dates', id: 'design', dates: { start: shift('2026-01-05', 7), end: shift('2026-01-30', 7) } },
      { type: 'set-plan-dates', id: 'build', dates: { start: shift('2026-02-02', 7), end: shift('2026-03-27', 7) } },
      { type: 'set-plan-dates', id: 'm1', dates: { at: shift('2026-03-02', 7) } },
    ]);
    expect(commands(c)).toContainEqual({ type: 'set-position', nodeId: 'q1', x: planX(d('2026-01-05') + 7, origin), y: 0, plane: 'plan' });
  });
  it('a vertical move of a top-level zone changes no dates but still saves y', () => {
    const c = planMoves(roadmap(), 'plan', { q1: { x: 0, y: 120 } }, { q1: { dx: 3, dy: 120 } });
    expect(dates(c)).toEqual([]);
    expect(commands(c)).toEqual([{ type: 'set-position', nodeId: 'q1', x: planX(d('2026-01-05'), origin), y: 120, plane: 'plan' }]);
  });
  it('clamps a nested zone inside its parent and saves no position for it', () => {
    // design may move right by at most 56 days (Jan 30 → Mar 27); ask for 70
    const c = planMoves(roadmap(), 'plan', { design: { x: 0, y: 0 } }, { design: { dx: 70 * DAY, dy: 0 } });
    expect(commands(c)).toEqual([{ type: 'set-plan-dates', id: 'design', dates: { start: shift('2026-01-05', 56), end: '2026-03-27' } }]);
    // and left: never before the parent's start
    const back = planMoves(roadmap(), 'plan', { build: { x: 0, y: 0 } }, { build: { dx: -100 * DAY, dy: 0 } });
    expect(dates(back)[0]).toEqual({ type: 'set-plan-dates', id: 'build', dates: { start: '2026-01-05', end: shift('2026-03-27', -28) } });
    expect(dates(back)[1]).toEqual({ type: 'set-plan-dates', id: 'm1', dates: { at: shift('2026-03-02', -28) } });
  });
  it('moves a root event by days, a nested event within its zone, and ignores people and sub-day nudges', () => {
    // `alice` is in the gesture on purpose: planLayout marks the roster `fixed`
    // so she is never dragged, but the contract is planMoves' own — a person
    // yields nothing here whatever the layout decides
    const c = planMoves(roadmap(), 'plan', { kickoff: { x: 0, y: 0 }, m1: { x: 0, y: 0 }, alice: { x: 5, y: 5 } }, { kickoff: { dx: -2 * DAY, dy: 0 }, m1: { dx: 60 * DAY, dy: 0 }, alice: { dx: 50, dy: 50 } });
    expect(commands(c)).toEqual([
      { type: 'set-plan-dates', id: 'kickoff', dates: { at: '2026-01-03' } },
      { type: 'set-plan-dates', id: 'm1', dates: { at: '2026-03-27' } },
    ]);
    expect(planMoves(roadmap(), 'plan', { kickoff: { x: 0, y: 0 } }, { kickoff: { dx: DAY / 3, dy: 0 } })).toBeUndefined();
  });
  it('a stray — a node the plane shows but no zone holds — keeps the spot it was dropped on', () => {
    // planLayout parks a stray under the chart WITHOUT marking it `fixed`, so
    // it is the one non-zone, non-event box a plan plane lets you drag. With no
    // command of its own the drop snapped back on the next arrange.
    const m = roadmap();
    m.nodes.push({ id: 'stray', name: 'Stray', type: 'service', plane: 'plan' });
    const c = planMoves(m, 'plan', { stray: { x: 40, y: 300 } }, { stray: { dx: 40, dy: 300 } });
    expect(commands(c)).toEqual([{ type: 'set-position', nodeId: 'stray', x: 40, y: 300, plane: 'plan' }]);
  });
  it('a nested zone under a parent with unusable dates still saves no position', () => {
    // `outer === undefined` read as "top-level", but a broken parent makes it
    // undefined too — and the position written for the child was inert noise
    // in the layout file. The plan graph's parent map is the honest test.
    const m = roadmap();
    m.nodes.find((n) => n.id === 'q1')!.metadata!.end = '2025-01-01';
    const c = planMoves(m, 'plan', { design: { x: 0, y: 0 } }, { design: { dx: DAY, dy: 0 } });
    expect(commands(c).some((x) => x.type === 'set-position')).toBe(false);
    expect(dates(c)).toEqual([{ type: 'set-plan-dates', id: 'design', dates: { start: shift('2026-01-05', 1), end: shift('2026-01-30', 1) } }]);
  });
  it('a child inside a moved parent takes the parent\'s shift, never its own', () => {
    // q1 moves 1 day; build (a child, in the same gesture) reports -3 of its own —
    // negative, so the clamp toward q1's END (0 days of slack that way) cannot
    // swallow it the way a positive delta would; only the shifted-guard stops it
    const c = planMoves(
      roadmap(),
      'plan',
      { q1: { x: 0, y: 0 }, build: { x: 0, y: 0 } },
      { q1: { dx: DAY, dy: 0 }, build: { dx: -3 * DAY, dy: 0 } },
    );
    expect(dates(c).filter((x) => x.type === 'set-plan-dates' && x.id === 'build')).toEqual([
      { type: 'set-plan-dates', id: 'build', dates: { start: shift('2026-02-02', 1), end: shift('2026-03-27', 1) } },
    ]);
    expect(dates(c)).toContainEqual({ type: 'set-plan-dates', id: 'm1', dates: { at: shift('2026-03-02', 1) } });
  });
  it('a sub-day nudge on a nested zone is undefined, not an empty batch', () => {
    expect(planMoves(roadmap(), 'plan', { design: { x: 0, y: 0 } }, { design: { dx: DAY / 4, dy: 0 } })).toBeUndefined();
  });
});

describe('planResize', () => {
  it('right handle: end follows the width, inclusive', () => {
    const c = planResize(roadmap(), 'plan', 'design', 0, 30 * DAY);
    expect(c).toEqual({ type: 'set-plan-dates', id: 'design', dates: { end: shift('2026-01-05', 29) } });
  });
  it('left handle: start follows x, parent-relative for a nested zone, absolute for a root', () => {
    expect(planResize(roadmap(), 'plan', 'build', 21 * DAY, 100)).toEqual({ type: 'set-plan-dates', id: 'build', dates: { start: shift('2026-01-05', 21) } });
    expect(planResize(roadmap(), 'plan', 'solo', planX(d('2026-04-03'), origin), 100)).toEqual({ type: 'set-plan-dates', id: 'solo', dates: { start: '2026-04-03' } });
  });
  it('clamps to the parent and to the children, and is a no-op when nothing changes', () => {
    // design's right edge cannot pass q1's end
    expect(planResize(roadmap(), 'plan', 'design', 0, 200 * DAY)).toEqual({ type: 'set-plan-dates', id: 'design', dates: { end: '2026-03-27' } });
    // build's left edge cannot pass m1 (Mar 2) — nor q1's start
    expect(planResize(roadmap(), 'plan', 'build', 80 * DAY, 10)).toEqual({ type: 'set-plan-dates', id: 'build', dates: { start: '2026-03-02' } });
    expect(planResize(roadmap(), 'plan', 'build', -50 * DAY, 10)).toEqual({ type: 'set-plan-dates', id: 'build', dates: { start: '2026-01-05' } });
    // q1's left edge is pinned by design's start (Jan 5) and its right edge by build's end (Mar 27): both already at the clamp
    expect(planResize(roadmap(), 'plan', 'q1', planX(d('2026-01-12'), origin), 100)).toBeUndefined();
    expect(planResize(roadmap(), 'plan', 'q1', planX(d('2026-01-05'), origin), 10 * DAY)).toBeUndefined();
    // build already ends at q1's end: stretching it further changes nothing
    expect(planResize(roadmap(), 'plan', 'build', 28 * DAY, 200 * DAY)).toBeUndefined();
    expect(planResize(roadmap(), 'plan', 'design', 0, 26 * DAY)).toBeUndefined();
    expect(planResize(roadmap(), 'plan', 'alice', 0, 300)).toBeUndefined();
  });
});

describe('quick-adds', () => {
  it('addZone: two weeks from today at the top level, or from the selected zone\'s start nested under it', () => {
    const top = addZone(roadmap(), 'plan', { today: '2026-05-04' });
    expect(top.id).toBe('zone');
    expect(top.command).toEqual({ type: 'add-node', node: { id: 'zone', name: 'Zone', type: 'plan-zone', plane: 'plan', metadata: { start: '2026-05-04', end: shift('2026-05-04', ZONE_DAYS - 1) } } });
    const nested = addZone(roadmap(), 'plan', { selected: 'build', today: '2026-05-04' });
    expect(nested.command).toEqual({ type: 'add-node', node: { id: 'zone', name: 'Zone', type: 'plan-zone', plane: 'plan', metadata: { start: '2026-02-02', end: shift('2026-02-02', ZONE_DAYS - 1) } }, parent: { id: 'build', plane: 'plan' } });
    // clamped to the parent's end
    const tight = addZone(roadmap(), 'plan', { selected: 'design', today: '2026-05-04' });
    expect((tight.command as unknown as { node: { metadata: { end: string } } }).node.metadata.end).toBe(shift('2026-01-05', ZONE_DAYS - 1));
    const m = roadmap();
    m.nodes.push({ id: 'zone', name: 'taken', type: 'service' });
    expect(addZone(m, 'plan', { today: '2026-05-04' }).id).toBe('zone-2');
  });
  it('addEvent: today, clamped into the selected zone; addPerson: a slug id', () => {
    expect(addEvent(roadmap(), 'plan', { today: '2026-05-04' }).command).toEqual({ type: 'add-node', node: { id: 'event', name: 'Event', type: 'plan-event', plane: 'plan', metadata: { at: '2026-05-04' } } });
    expect(addEvent(roadmap(), 'plan', { selected: 'design', today: '2026-05-04' }).command).toEqual({ type: 'add-node', node: { id: 'event', name: 'Event', type: 'plan-event', plane: 'plan', metadata: { at: '2026-01-30' } }, parent: { id: 'design', plane: 'plan' } });
    expect(addPerson(roadmap(), 'plan', 'Bob Lee')).toEqual({ id: 'bob-lee', command: { type: 'add-node', node: { id: 'bob-lee', name: 'Bob Lee', type: 'person', plane: 'plan' } } });
  });
  it('setRole replaces the role\'s relation, or removes it', () => {
    const m = roadmap();
    m.nodes.push({ id: 'bob', name: 'Bob', type: 'person' });
    expect(setRole(m, 'build', 'owns', 'bob')).toEqual({ type: 'batch', commands: [{ type: 'delete-relation', id: 'alice->build#0' }, { type: 'add-relation', from: 'bob', to: 'build', opts: { kind: 'owns' } }] });
    expect(setRole(m, 'build', 'checks', 'bob')).toEqual({ type: 'batch', commands: [{ type: 'add-relation', from: 'bob', to: 'build', opts: { kind: 'checks' } }] });
    expect(setRole(m, 'build', 'owns', null)).toEqual({ type: 'batch', commands: [{ type: 'delete-relation', id: 'alice->build#0' }] });
  });
  it('seedDates: the pointer\'s day for a drop, the parent\'s start when nested, today otherwise', () => {
    const m = roadmap();
    expect(seedDates(m, 'plan', 'plan-zone', { x: planX(d('2026-02-10'), origin) + 3 }, '2026-05-04')).toEqual({ start: '2026-02-10', end: shift('2026-02-10', ZONE_DAYS - 1) });
    expect(seedDates(m, 'plan', 'plan-event', { x: planX(d('2026-02-10'), origin) + DAY - 1 }, '2026-05-04')).toEqual({ at: '2026-02-10' });
    expect(seedDates(m, 'plan', 'plan-zone', { parentId: 'design' }, '2026-05-04')).toEqual({ start: '2026-01-05', end: '2026-01-18' });
    expect(seedDates(m, 'plan', 'plan-event', {}, '2026-05-04')).toEqual({ at: '2026-05-04' });
    const empty = model('e');
    empty.plan();
    expect(seedDates(empty.toJSON(), 'plan', 'plan-zone', { x: 500 }, '2026-05-04')).toEqual({ start: '2026-05-04', end: shift('2026-05-04', ZONE_DAYS - 1) });
    expect(seedDates(m, 'plan', 'service', { x: 5 }, '2026-05-04')).toBeUndefined();
  });
});
