// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { model } from '@diagc/core/internal';
import { notationProfile } from '../notations';
import { createTypeRegistry } from '../registry';
import { useCompiledView, type CompiledViewInput } from './useCompiledView';

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
