import { describe, expect, it } from 'vitest';
import { pruneToModel, syncReducer, type SeenKey } from './view-sync';
import type { DiagramModel } from '@diagc/core';

const model = (id: string, nodeIds: string[]): DiagramModel => ({
  version: 1,
  id,
  name: id,
  nodes: nodeIds.map((n) => ({ id: n, name: n })),
  containment: [],
  relations: [],
  layers: [],
  planes: [],
});

// The snapshot shape useDrillNavigation builds off its inputs each render.
const key = (m: DiagramModel, plane?: string, enteredPath?: string[]): SeenKey => ({
  modelId: m.id,
  model: m,
  plane,
  enteredPathProp: enteredPath,
});

describe('syncReducer', () => {
  const a = model('a', ['x']);

  it('classifies a model switch (highest precedence)', () => {
    const prev = { seen: key(a), transition: 'none' as const };
    const next = syncReducer(prev, { type: 'sync', next: key(model('b', ['x']), 'p2') });
    expect(next.transition).toBe('model-switch');
  });

  it('classifies a plane switch when the model id is unchanged', () => {
    const prev = { seen: key(a, 'p1'), transition: 'none' as const };
    expect(syncReducer(prev, { type: 'sync', next: key(a, 'p2') }).transition).toBe('plane-switch');
  });

  it('classifies an edit: same id, new model object', () => {
    const edited = model('a', ['x', 'y']);
    const prev = { seen: key(a, 'p1'), transition: 'none' as const };
    expect(syncReducer(prev, { type: 'sync', next: key(edited, 'p1') }).transition).toBe('model-edit');
  });

  it('classifies an enteredPath prop change, and no-ops on identical keys', () => {
    const path = ['x'];
    const prev = { seen: key(a, 'p1'), transition: 'none' as const };
    expect(syncReducer(prev, { type: 'sync', next: key(a, 'p1', path) }).transition).toBe('entered-path');
    const seen = key(a, 'p1', path);
    expect(syncReducer({ seen, transition: 'none' }, { type: 'sync', next: seen }).transition).toBe('none');
  });
});

describe('pruneToModel', () => {
  const m = model('a', ['root', 'mid']);
  it('keeps a fully-known path', () => {
    expect(pruneToModel(['root', 'mid'], m)).toEqual(['root', 'mid']);
  });
  it('cuts at the first unknown id', () => {
    expect(pruneToModel(['root', 'gone', 'mid'], m)).toEqual(['root']);
  });
});
