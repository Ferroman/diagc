import { describe, expect, it } from 'vitest';
import { DEFAULT_KIND_STYLES, DEFAULT_TYPE_STYLES, type ShapeId } from '../../../renderer/src/registry';
import { KIND_LOOKS, kindLook, neverFolds, subtitleOf, TYPE_LOOKS, typeLook, type TextShape } from './vocabulary';

// The CLI cannot import the renderer, so the text renderer keeps its own table of how
// each type and kind looks; these tests hold the two together. The map from the
// renderer's shapes to the few a terminal can draw is the test's to own: it is the
// one place the correspondence is written down.
const TEXT_SHAPE: Record<ShapeId, TextShape> = {
  box: 'box',
  rounded: 'rounded',
  pill: 'rounded',
  person: 'rounded',
  bubble: 'rounded',
  ellipse: 'rounded',
  circle: 'rounded',
  cylinder: 'cylinder',
  store: 'cylinder',
  hexagon: 'hexagon',
  diamond: 'diamond',
  'start-dot': 'dot',
  'end-bullseye': 'dot',
  bar: 'bar',
  note: 'note',
  table: 'table',
  'send-signal': 'box',
  'receive-signal': 'box',
};

describe('the type table', () => {
  it('has an entry for every type the renderer styles, and no other', () => {
    expect(Object.keys(TYPE_LOOKS)).toEqual(Object.keys(DEFAULT_TYPE_STYLES));
  });

  it("agrees with the renderer's shape, subtitle, dash and folding per type", () => {
    for (const [type, style] of Object.entries(DEFAULT_TYPE_STYLES)) {
      const look = TYPE_LOOKS[type]!;
      expect({ type, shape: look.shape, label: look.label, dashed: look.dashed, neverFolds: look.neverFolds }).toEqual({
        type,
        shape: TEXT_SHAPE[style.shape],
        label: style.label,
        dashed: style.dashed,
        neverFolds: style.alwaysExpanded,
      });
    }
  });

  it('draws an unknown or missing type as a plain box', () => {
    expect(typeLook('no-such-type', undefined)).toEqual({ shape: 'box' });
    expect(typeLook(undefined, undefined)).toEqual({ shape: 'box' });
  });

  it("takes a notation's own looks over the shared table", () => {
    expect(typeLook('commit', 'git-graph').shape).toBe('dot');
    expect(typeLook('commit', undefined).shape).toBe('box');
  });
});

describe('the kind table', () => {
  it('has an entry for every kind the renderer styles, and no other', () => {
    expect(Object.keys(KIND_LOOKS)).toEqual(Object.keys(DEFAULT_KIND_STYLES));
  });

  it("agrees with the renderer's dash, weight and end markers per kind", () => {
    for (const [kind, style] of Object.entries(DEFAULT_KIND_STYLES)) {
      const look = KIND_LOOKS[kind]!;
      const line = style.dashed === true ? 'dashed' : (style.width ?? 0) >= 2.5 ? 'heavy' : 'solid';
      const end = style.endMarker === 'none' ? 'none' : style.endMarker === 'one' ? 'one' : 'arrow';
      const start = style.startMarker === 'crowsfoot' ? 'many' : undefined;
      expect({ kind, ...look }).toEqual({ kind, line, end, ...(start !== undefined ? { start } : {}) });
    }
  });

  it("lets a relation's own style override its kind", () => {
    expect(kindLook({ kind: 'sync', style: { line: 'dotted' } }, undefined).line).toBe('dashed');
    expect(kindLook({ kind: 'sync', style: { line: 'dashed' } }, undefined).line).toBe('dashed');
    expect(kindLook({ kind: 'sync', style: { width: 3 } }, undefined).line).toBe('heavy');
    expect(kindLook({ kind: 'sync', style: { end: 'diamond' } }, undefined).end).toBe('diamond');
    expect(kindLook({ kind: 'note-link' }, undefined).end).toBe('none');
    expect(kindLook({ kind: 'whatever' }, undefined)).toEqual({ line: 'solid', end: 'arrow' });
  });

  it('draws git links as the git notation does: dashed, without heads', () => {
    expect(kindLook({ kind: 'commit' }, 'git-graph')).toEqual({ line: 'dashed', end: 'none' });
  });
});

describe('subtitleOf', () => {
  it("is the type's label, with the technology inside its brackets", () => {
    expect(subtitleOf({ id: 'a', name: 'A', type: 'c4-container', technology: 'Go' }, undefined)).toBe(
      '[Container: Go]',
    );
    expect(subtitleOf({ id: 'a', name: 'A', type: 'c4-system' }, undefined)).toBe('[Software System]');
  });

  it('is the raw type id for a type without a label, as the renderer prints it', () => {
    expect(subtitleOf({ id: 'a', name: 'A', type: 'service' }, undefined)).toBe('service');
    expect(subtitleOf({ id: 'a', name: 'A', type: 'service', technology: 'Go' }, undefined)).toBe('service: Go');
  });

  it('is empty for what the renderer draws as its own body: activity chrome, a git commit', () => {
    expect(subtitleOf({ id: 'l', name: 'L', type: 'activity-lane' }, undefined)).toBe('');
    expect(subtitleOf({ id: 'f', name: 'F', type: 'activity-frame' }, undefined)).toBe('');
    expect(subtitleOf({ id: 'c', name: 'C', type: 'commit' }, 'git-graph')).toBe('');
    expect(subtitleOf({ id: 'b', name: 'B', type: 'branch' }, 'git-graph')).toBe('');
  });

  it('is empty for a glyph type, and for a node with no type', () => {
    expect(subtitleOf({ id: 'a', name: 'A', type: 'activity-action', technology: 'x' }, undefined)).toBe('');
    expect(subtitleOf({ id: 'a', name: 'A' }, undefined)).toBe('');
  });
});

describe('neverFolds', () => {
  it('holds for the registry types that never fold', () => {
    expect(neverFolds({ id: 'f', name: 'F', type: 'activity-frame' }, undefined)).toBe(true);
    expect(neverFolds({ id: 'b', name: 'B', type: 'tm-boundary' }, undefined)).toBe(true);
    expect(neverFolds({ id: 's', name: 'S', type: 'system' }, undefined)).toBe(false);
  });

  it("holds for a notation's lanes only under that notation", () => {
    expect(neverFolds({ id: 'b', name: 'B', type: 'branch' }, 'git-graph')).toBe(true);
    expect(neverFolds({ id: 'b', name: 'B', type: 'branch' }, undefined)).toBe(false);
    expect(neverFolds({ id: 'z', name: 'Z', type: 'plan-zone' }, 'plan')).toBe(true);
  });
});
