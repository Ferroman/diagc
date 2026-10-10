import { describe, expect, it } from 'vitest';
import { notationProfile } from '../notations';
import { createKindRegistry } from '../registry';
import type { DiagramEdgeData } from './DiagramEdge';
import { edgeStroke, strokeStyle } from './edge-stroke';

const data = (partial: Partial<DiagramEdgeData>): DiagramEdgeData => ({
  kind: 'reads',
  constituentCount: 1,
  kindRegistry: createKindRegistry(),
  ...partial,
});
const plain = notationProfile(undefined);
const causal = notationProfile('causal-loop');

describe('edgeStroke', () => {
  it.each([
    ['the default', {}, 'var(--dg-edge)'],
    ['the sign, where the notation colours by it', { polarity: '+' as const }, 'var(--dg-polarity-positive)'],
    ['a notation colour over the sign', { polarity: '+' as const, notationColor: '#0a0' }, '#0a0'],
    ['a layer tint over a notation colour', { notationColor: '#0a0', tint: '#00a' }, '#00a'],
    ['the relation’s own colour over everything', { tint: '#00a', relStyle: { color: '#a00' } }, '#a00'],
  ])('strokes with %s', (_name, partial, stroke) => {
    expect(edgeStroke('e1', data(partial), causal).stroke).toBe(stroke);
  });

  it('reports the sign’s colour only where the notation colours by sign', () => {
    expect(edgeStroke('e1', data({ polarity: '-' }), causal).polarityColor).toBe('var(--dg-polarity-negative)');
    expect(edgeStroke('e1', data({ polarity: '-' }), plain).polarityColor).toBeUndefined();
  });

  it('takes the width from the relation, then the kind, then 1.5', () => {
    expect(edgeStroke('e1', data({}), plain).strokeWidth).toBe(1.5);
    expect(edgeStroke('e1', data({ kind: 'writes' }), plain).strokeWidth).toBe(2.5);
    expect(edgeStroke('e1', data({ kind: 'writes', relStyle: { width: 4 } }), plain).strokeWidth).toBe(4);
  });

  it.each([
    ['solid', {}, undefined],
    ['dashed by its kind', { kind: 'async' }, '6 4'],
    ['dotted, spaced by the width', { relStyle: { line: 'dotted' as const, width: 3 } }, '0.1 9'],
    ['dotted and thin, spaced at least 5', { relStyle: { line: 'dotted' as const } }, '0.1 5'],
    ['solid but animated', { kind: 'flow' }, '6 4'],
  ])('dashes a line that is %s', (_name, partial, dashArray) => {
    expect(edgeStroke('e1', data(partial), plain).dashArray).toBe(dashArray);
  });

  it('ends in an arrow by default, under an id safe for svg', () => {
    const { end, start, markerSize } = edgeStroke('a=>b:x', data({}), plain);
    expect(end).toMatchObject({ id: 'dg-end-a__b_x', style: 'arrow' });
    expect(start).toBeUndefined();
    expect(markerSize).toBe(13);
  });

  it('marks both ends where the kind says so, and neither for none or an unknown style', () => {
    const fk = edgeStroke('e1', data({ kind: 'fk' }), plain);
    expect([fk.start?.id, fk.start?.style, fk.end?.style]).toEqual(['dg-start-e1', 'crowsfoot', 'one']);
    expect(edgeStroke('e1', data({ kind: 'note-link' }), plain).end).toBeUndefined();
    expect(edgeStroke('e1', data({ relStyle: { end: 'no-such' as 'arrow' } }), plain).end).toBeUndefined();
  });

  it('draws with the defaults when the edge has no data', () => {
    const look = edgeStroke('e1', undefined, plain);
    expect([look.stroke, look.strokeWidth, look.line, look.end?.style]).toEqual([
      'var(--dg-edge)',
      1.5,
      'solid',
      'arrow',
    ]);
  });
});

describe('strokeStyle', () => {
  it('lists the dash, the round cap and the animation after the colour and width, each only when it applies', () => {
    const style = strokeStyle(edgeStroke('e1', data({ kind: 'flow', relStyle: { line: 'dotted' } }), plain));
    // key order is the order of the serialized style attribute
    expect(Object.keys(style)).toEqual(['stroke', 'strokeWidth', 'strokeDasharray', 'strokeLinecap', 'animation']);
    expect(Object.keys(strokeStyle(edgeStroke('e1', data({}), plain)))).toEqual(['stroke', 'strokeWidth']);
  });
});
