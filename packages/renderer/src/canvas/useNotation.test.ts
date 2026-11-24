// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { model } from '@diagc/core/internal';
import { createKindRegistry, createTypeRegistry } from '../registry';
import { useNotation } from './useNotation';

function threatModel() {
  const m = model('tm');
  const tm = m.threatModel();
  tm.boundary('dmz', 'DMZ').contains(tm.process('web', 'Web app'));
  return m.toJSON();
}

describe('useNotation', () => {
  it('holds a container the notation never folds out of the drill, and nothing else', () => {
    const { result } = renderHook(() => useNotation({ model: threatModel(), notation: 'threat-model' }));
    expect(result.current.isAlwaysExpanded('dmz')).toBe(true);
    expect(result.current.isAlwaysExpanded('web')).toBe(false);
    expect(result.current.isAlwaysExpanded('nowhere')).toBe(false);
  });

  it('lets a plan zone fold and open: it rests open, it is not pinned', () => {
    const m = model('plan');
    m.plan()
      .zone('z', { start: '2026-01-05', end: '2026-01-30' })
      .zone('row', { start: '2026-01-05', end: '2026-01-09' });
    const { result } = renderHook(() => useNotation({ model: m.toJSON(), notation: 'plan', plane: 'plan' }));
    // false is what puts the fold and enter chips back, and lets a drill in
    expect(result.current.isAlwaysExpanded('z')).toBe(false);
  });

  it("lets the host's registries win over the notation's", () => {
    const typeRegistry = createTypeRegistry();
    const kindRegistry = createKindRegistry();
    const { result } = renderHook(() => useNotation({ model: threatModel(), typeRegistry, kindRegistry }));
    expect(result.current.typeRegistry).toBe(typeRegistry);
    expect(result.current.kindRegistry).toBe(kindRegistry);
  });

  it("measures and draws a plan's chips without a hidden actor's", () => {
    const m = model('plan');
    const p = m.plan();
    // five days: room for the name alone, not for it and two chips
    p.zone('z', { name: 'Ship', start: '2026-01-05', end: '2026-01-09' })
      .owner(p.person('ana', 'Ana'))
      .executor(p.person('bo', 'Bo'));
    const json = m.toJSON();
    const props = { model: json, notation: 'plan' as const, plane: 'plan' };
    const hidden = new Set(['ana', 'bo']);
    const all = renderHook(() => useNotation(props)).result.current;
    const some = renderHook(() => useNotation(props, undefined, hidden)).result.current;
    expect(all.nodeChips?.get('z')).toHaveLength(2);
    expect(some.nodeChips?.has('z')).toBe(false);
    // two chips put the name beside the bar; without them it fits inside
    expect(all.labelSides?.has('z')).toBe(true);
    expect(some.labelSides?.has('z')).toBe(false);
  });

  it('derives the same registries and maps again only when their inputs change', () => {
    const json = threatModel();
    const { result, rerender } = renderHook(() => useNotation({ model: json, notation: 'threat-model' }));
    const first = result.current;
    rerender();
    expect(result.current.typeRegistry).toBe(first.typeRegistry);
    expect(result.current.isAlwaysExpanded).toBe(first.isAlwaysExpanded);
    expect(result.current.nodeColors).toBe(first.nodeColors);
  });
});
