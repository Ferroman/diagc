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

  it("lets the host's registries win over the notation's", () => {
    const typeRegistry = createTypeRegistry();
    const kindRegistry = createKindRegistry();
    const { result } = renderHook(() => useNotation({ model: threatModel(), typeRegistry, kindRegistry }));
    expect(result.current.typeRegistry).toBe(typeRegistry);
    expect(result.current.kindRegistry).toBe(kindRegistry);
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
