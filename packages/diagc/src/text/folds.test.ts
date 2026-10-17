import { describe, expect, it } from 'vitest';
import type { DiagramModel, LayoutOverlay } from '@diagc/core/internal';
import { depthPins, exportPins, readerPins, withNeverFolds } from './folds';

// a ⊃ b ⊃ c, and a lone d
const model: DiagramModel = {
  version: 1,
  id: 'm',
  name: 'm',
  nodes: [
    { id: 'a', name: 'A' },
    { id: 'b', name: 'B' },
    { id: 'c', name: 'C' },
    { id: 'd', name: 'D' },
  ],
  containment: [
    { parent: 'a', child: 'b' },
    { parent: 'b', child: 'c' },
  ],
  relations: [],
  layers: [],
  planes: [],
};
const overlay = (extra: Partial<LayoutOverlay>): LayoutOverlay => ({ version: 1, planes: {}, ...extra });

describe('exportPins', () => {
  it('opens every container, as the PNG export does', () => {
    expect(exportPins(model, undefined)).toEqual({ a: 'expanded', b: 'expanded' });
  });

  it('keeps folded what the layout folds for the export', () => {
    expect(exportPins(model, overlay({ export: { collapsed: ['b'] } }))).toEqual({ a: 'expanded', b: 'collapsed' });
  });
});

describe('depthPins', () => {
  it('opens the containers above the depth and folds the rest', () => {
    expect(depthPins(model, undefined, 0)).toEqual({ a: 'collapsed', b: 'collapsed' });
    expect(depthPins(model, undefined, 1)).toEqual({ a: 'expanded', b: 'collapsed' });
    expect(depthPins(model, undefined, 5)).toEqual({ a: 'expanded', b: 'expanded' });
  });

  it('measures depth by the shallowest way down', () => {
    // c holds e, and sits two steps down through a ⊃ b but one step down through d
    const shared: DiagramModel = {
      ...model,
      nodes: [...model.nodes, { id: 'e', name: 'E' }],
      containment: [...model.containment, { parent: 'c', child: 'e' }, { parent: 'd', child: 'c' }],
    };
    expect(depthPins(shared, undefined, 2)).toEqual({ a: 'expanded', b: 'expanded', c: 'expanded', d: 'expanded' });
  });
});

describe('readerPins', () => {
  it('opens what the layout saved as unfolded, as the published page does', () => {
    expect(readerPins(model, overlay({ unfolded: { default: ['a'] } }), undefined)).toEqual({ a: 'expanded' });
    expect(readerPins(model, undefined, undefined)).toEqual({});
  });
});

describe('withNeverFolds', () => {
  it('pins open the containers that never fold, over what the pins say', () => {
    const lanes = {
      ...model,
      nodes: model.nodes.map((n) => (n.id === 'a' ? { ...n, type: 'activity-lane' } : n)),
    };
    expect(withNeverFolds(lanes, { a: 'collapsed', b: 'collapsed' }, undefined)).toEqual({
      a: 'expanded',
      b: 'collapsed',
    });
  });

  it('leaves the pins alone when nothing never folds', () => {
    const pins = { a: 'collapsed' as const };
    expect(withNeverFolds(model, pins, undefined)).toBe(pins);
  });

  it('pins only containers: a lone lane has nothing to open', () => {
    const lone = { ...model, nodes: model.nodes.map((n) => (n.id === 'd' ? { ...n, type: 'activity-lane' } : n)) };
    expect(withNeverFolds(lone, {}, undefined)).toEqual({});
  });
});
