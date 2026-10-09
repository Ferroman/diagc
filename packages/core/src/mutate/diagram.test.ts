import { describe, expect, it } from 'vitest';
import { model } from '../builder';
import { setDiagramLegend, setDiagramNotation, setDiagramStyle } from './diagram';
import { CommandError } from '../command-error';
import type { DiagramModel } from '../types';

describe('setDiagramStyle', () => {
  const base: DiagramModel = {
    version: 1,
    id: 'm',
    name: 'M',
    nodes: [],
    containment: [],
    relations: [],
    layers: [],
    planes: [],
  };
  it('pins a style id on the model', () => {
    expect(setDiagramStyle(base, 'hand-drawn').style).toBe('hand-drawn');
  });
  it('clearing with null removes the field entirely', () => {
    const cleared = setDiagramStyle(setDiagramStyle(base, 'sketch'), null);
    expect('style' in cleared).toBe(false);
  });
  it('does not mutate the input model', () => {
    setDiagramStyle(base, 'sketch');
    expect(base.style).toBeUndefined();
  });
});

describe('setDiagramNotation', () => {
  const base: DiagramModel = {
    version: 1,
    id: 'm',
    name: 'M',
    nodes: [],
    containment: [],
    relations: [],
    layers: [],
    planes: [],
  };
  it('pins a notation id on the model', () => {
    expect(setDiagramNotation(base, 'c4').notation).toBe('c4');
  });
  it('clearing with null removes the field entirely', () => {
    const cleared = setDiagramNotation(setDiagramNotation(base, 'c4'), null);
    expect('notation' in cleared).toBe(false);
  });
  it('does not mutate the input model', () => {
    setDiagramNotation(base, 'c4');
    expect(base.notation).toBeUndefined();
  });
  it('rejects an unknown notation id', () => {
    expect(() => setDiagramNotation(base, 'freeform')).toThrow(CommandError);
  });
  it('replaces an existing notation with a different valid one', () => {
    const withC4 = setDiagramNotation(base, 'c4');
    const replaced = setDiagramNotation(withC4, 'causal-loop');
    expect(replaced.notation).toBe('causal-loop');
  });
  it('setting the same notation again is a no-op that preserves identity', () => {
    const withLoop = setDiagramNotation(base, 'causal-loop');
    expect(setDiagramNotation(withLoop, 'causal-loop')).toBe(withLoop);
  });
  it('clearing an already-cleared model is a no-op that preserves identity', () => {
    expect(setDiagramNotation(base, null)).toBe(base);
  });
});

describe('setDiagramLegend', () => {
  const base = () => {
    const m = model('d');
    m.node('a');
    return m.toJSON();
  };

  it('adds a legend', () => {
    expect(setDiagramLegend(base(), {}).legend).toEqual({});
  });

  it('removes the field entirely when cleared', () => {
    const withLegend = setDiagramLegend(base(), { title: 'Key' });
    const cleared = setDiagramLegend(withLegend, null);
    expect('legend' in cleared).toBe(false);
  });
});
