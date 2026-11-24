// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GIT_NOTATION, model } from '@diagc/core/internal';
import { notationProfile } from '../notations';
import { createTypeRegistry } from '../registry';
import { restingPins, useCompiledView, type CompiledViewInput } from './useCompiledView';

const plain = notationProfile(undefined);

type Flat = Partial<Omit<CompiledViewInput, 'props'>> & CompiledViewInput['props'];

/** the hook's input, written flat: the props it reads beside what other hooks hand it */
function input({ model, plane, pins, activeLayers, ...over }: Flat): CompiledViewInput {
  return {
    props: { model, plane, pins, activeLayers },
    profile: plain,
    typeRegistry: createTypeRegistry(plain.typeStyles),
    focus: [],
    drillRoot: undefined,
    visibleRef: { current: [] },
    ...over,
  };
}

/** a system holding a service, and a top-level client using it */
function nested() {
  const m = model('nested');
  const sys = m.node('sys', { type: 'system' });
  const api = m.node('api', { type: 'service' });
  const client = m.node('client', { type: 'service' });
  sys.contains(api);
  m.relate(client, api, { kind: 'sync' });
  return m.toJSON();
}

describe('useCompiledView', () => {
  it('folds what is not pinned, and opens what is', () => {
    const json = nested();
    const folded = renderHook(() => useCompiledView(input({ model: json }))).result.current.compiled;
    expect(folded.roots.find((r) => r.id === 'sys')?.state).toBe('collapsed');
    const open = renderHook(() => useCompiledView(input({ model: json, pins: { sys: 'expanded' } }))).result.current
      .compiled;
    expect(open.roots.find((r) => r.id === 'sys')?.state).toBe('expanded');
  });

  it('holds open a container the notation never folds, over a pin that says otherwise', () => {
    const m = model('tm');
    const tm = m.threatModel();
    tm.boundary('dmz', 'DMZ').contains(tm.process('web', 'Web app'));
    const profile = notationProfile('threat-model');
    const { result } = renderHook(() =>
      useCompiledView(
        input({
          model: m.toJSON(),
          pins: { dmz: 'collapsed' },
          profile,
          typeRegistry: createTypeRegistry(profile.typeStyles),
        }),
      ),
    );
    expect(result.current.compiled.roots[0]?.state).toBe('expanded');
  });

  describe('a container that rests open (a plan zone)', () => {
    const planProfile = notationProfile('plan');
    const planTypes = createTypeRegistry(planProfile.typeStyles);
    /** zone a holding row a1, zone b, and b depending on a1 */
    function plan() {
      const m = model('plan');
      const p = m.plan();
      const a = p.zone('a', { start: '2026-01-05', end: '2026-01-30' });
      const a1 = a.zone('a1', { start: '2026-01-05', end: '2026-01-09' });
      const b = p.zone('b', { start: '2026-02-02', end: '2026-02-06' });
      m.relate(b, a1, { kind: 'sync' });
      return m.toJSON();
    }

    it('is open with no pin, folded under a collapsed one; an always-expanded one ignores the pin', () => {
      const json = plan();
      expect(restingPins(json, planProfile, planTypes, undefined)).toEqual({
        a: 'expanded',
        a1: 'expanded',
        b: 'expanded',
      });
      expect(restingPins(json, planProfile, planTypes, { a: 'collapsed' })).toMatchObject({
        a: 'collapsed',
        a1: 'expanded',
      });
      const git = notationProfile(GIT_NOTATION);
      const g = model('g');
      g.node('main', { type: 'branch' });
      const gitJson = g.toJSON();
      expect(restingPins(gitJson, git, createTypeRegistry(git.typeStyles), { main: 'collapsed' })).toEqual({
        main: 'expanded',
      });
    });

    it('hands the same pins back when the notation adds nothing', () => {
      const pins = { sys: 'collapsed' as const };
      expect(restingPins(nested(), plain, createTypeRegistry(plain.typeStyles), pins)).toBe(pins);
    });

    it("carries the opened zone's people in as themselves, not as stubs", () => {
      const m = model('own');
      const p = m.plan();
      p.zone('a', { start: '2026-01-05', end: '2026-01-30' })
        .owner(p.person('alice', 'Alice'))
        .zone('a1', { start: '2026-01-05', end: '2026-01-09' });
      const { result } = renderHook(() =>
        useCompiledView(
          input({ model: m.toJSON(), plane: 'plan', profile: planProfile, typeRegistry: planTypes, drillRoot: 'a' }),
        ),
      );
      const ids = result.current.compiled.roots.map((r) => r.id);
      expect(ids).toContain('alice');
      expect(ids).not.toContain('__ext__:alice');
    });

    it('carries in a person with no role yet, so one added inside an opened zone shows there', () => {
      const m = model('pool');
      const p = m.plan();
      p.zone('a', { start: '2026-01-05', end: '2026-01-30' }).zone('a1', { start: '2026-01-05', end: '2026-01-09' });
      p.person('dana', 'Dana');
      const { result } = renderHook(() =>
        useCompiledView(
          input({ model: m.toJSON(), plane: 'plan', profile: planProfile, typeRegistry: planTypes, drillRoot: 'a' }),
        ),
      );
      expect(result.current.compiled.roots.map((r) => r.id)).toContain('dana');
    });

    it("a dependency into a folded zone's row draws to the zone", () => {
      const { result } = renderHook(() =>
        useCompiledView(
          input({
            model: plan(),
            plane: 'plan',
            pins: { a: 'collapsed' },
            profile: planProfile,
            typeRegistry: planTypes,
          }),
        ),
      );
      const { compiled } = result.current;
      const a = compiled.roots.find((r) => r.id === 'a')!;
      expect(a.state).toBe('collapsed');
      expect(a.children).toEqual([]);
      expect(compiled.edges.map((e) => [e.from, e.to])).toEqual([['b', 'a']]);
    });
  });

  describe("the plan's team lanes", () => {
    const planProfile = notationProfile('plan');
    const planTypes = createTypeRegistry(planProfile.typeStyles);
    /** zone a (Payments) holding a1, and a2 bo builds; zone b, bo's */
    function teams() {
      const m = model('teams');
      const p = m.plan();
      const pay = p.team('pay', 'Payments');
      const bo = p.person('bo', 'Bo');
      const a = p.zone('a', { start: '2026-01-05', end: '2026-01-30' }).executor(pay);
      a.zone('a1', { start: '2026-01-05', end: '2026-01-09' });
      a.zone('a2', { start: '2026-01-12', end: '2026-01-16' }).executor(bo);
      p.zone('b', { start: '2026-02-02', end: '2026-02-06' }).executor(bo);
      return m.toJSON();
    }
    const plan = (over: Partial<Flat> = {}) =>
      input({ model: teams(), plane: 'plan', profile: planProfile, typeRegistry: planTypes, ...over });

    it('draws ungrouped with nothing hidden unless asked', () => {
      const { result } = renderHook(() => useCompiledView(plan()));
      expect(result.current.compiled.lanes).toBeUndefined();
      expect(result.current.compiled.roots.map((r) => r.id)).toEqual(expect.arrayContaining(['a', 'b']));
    });

    it('groups into lanes and hides, once per input', () => {
      const args = plan({ grouping: { grouped: true, hidden: new Set(['bo']) } });
      const { result, rerender } = renderHook(() => useCompiledView(args));
      const first = result.current.compiled;
      expect(first.lanes?.map((l) => l.lane.key)).toEqual(['pay']);
      expect(first.copies?.size).toBeGreaterThan(0);
      rerender();
      expect(result.current.compiled).toBe(first);
    });

    it('draws no lanes inside an opened zone; hiding still applies there', () => {
      const grouping = { grouped: true, hidden: new Set(['bo']) };
      const { result } = renderHook(() => useCompiledView(plan({ grouping, drillRoot: 'a' })));
      expect(result.current.compiled.lanes).toBeUndefined();
      const ids = result.current.compiled.roots.map((r) => r.id);
      expect(ids).toContain('a1');
      expect(ids).not.toContain('a2');
    });
  });

  it('keeps a hidden relation kind off the drawn edges, never off the layout edges', () => {
    const json = nested();
    const profile = { ...plain, edge: { ...plain.edge, hidden: (kind: string | undefined) => kind === 'sync' } };
    const { result } = renderHook(() => useCompiledView(input({ model: json, pins: { sys: 'expanded' }, profile })));
    expect(result.current.compiled.edges).toEqual([]);
    expect(result.current.compiled.layoutEdges.length).toBe(1);
  });

  it('compiles from the drill root, not the focus', () => {
    const { result } = renderHook(() =>
      useCompiledView(input({ model: nested(), drillRoot: 'sys', focus: ['client'] })),
    );
    expect(result.current.compiled.roots.map((r) => r.id)).toContain('api');
  });

  it('records what is on screen for the plane-switch mapping, and keeps compiledRef current', () => {
    const visibleRef = { current: [] as string[] };
    const json = nested();
    const { result, rerender } = renderHook((pins: Flat['pins']) =>
      useCompiledView(input({ model: json, pins, visibleRef })),
    );
    expect(visibleRef.current.sort()).toEqual(['client', 'sys']);
    rerender({ sys: 'expanded' });
    expect(visibleRef.current.sort()).toEqual(['api', 'client', 'sys']);
    expect(result.current.compiledRef.current).toBe(result.current.compiled);
  });
});
