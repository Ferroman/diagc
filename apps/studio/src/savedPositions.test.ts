import { describe, expect, it } from 'vitest';
import { model, type LayoutOverlay } from '@diagramming/core';
import { unfoldedOf, withSavedPositions, withPlaneManual } from './savedPositions';

function makeModel() {
  const m = model('p');
  m.node('a', { type: 'service' });
  m.node('b', { type: 'service' });
  m.plane('alt', { name: 'Alt' });
  return m.toJSON();
}

describe('withSavedPositions', () => {
  const saved: LayoutOverlay = {
    version: 1,
    planes: { alt: { a: { x: 1, y: 2 } } },
    settings: { alt: { direction: 'DOWN' } },
  };

  it('merges the moved nodes into the plane, leaving untouched ones alone', () => {
    const out = withSavedPositions(saved, makeModel(), 'alt', { b: { x: 30, y: 40 } });
    expect(out.planes['alt']).toEqual({ a: { x: 1, y: 2 }, b: { x: 30, y: 40 } });
  });

  it('a re-drag of an already-saved node overwrites that entry', () => {
    const out = withSavedPositions(saved, makeModel(), 'alt', { a: { x: 9, y: 9 } });
    expect(out.planes['alt']).toEqual({ a: { x: 9, y: 9 } });
  });

  it('keeps every other field of the overlay, so saving positions never drops settings', () => {
    // The overlay also carries layout settings, sizes and the manual set. A save
    // that rebuilt the object from scratch would silently discard a diagram's
    // hand-written algorithm choice.
    const out = withSavedPositions(saved, makeModel(), 'alt', { b: { x: 3, y: 4 } });
    expect(out.settings).toEqual({ alt: { direction: 'DOWN' } });
    expect(out.version).toBe(1);
  });

  it('leaves other planes untouched', () => {
    const two: LayoutOverlay = { version: 1, planes: { alt: {}, default: { a: { x: 5, y: 5 } } } };
    const out = withSavedPositions(two, makeModel(), 'alt', { b: { x: 1, y: 1 } });
    expect(out.planes['default']).toEqual({ a: { x: 5, y: 5 } });
  });

  it('synthesises an overlay when the diagram has no sidecar yet', () => {
    // The case that matters for a TS-authored diagram: there is no layout file
    // until the first save writes one. A plane-less model resolves to 'default'.
    const plain = model('plain');
    plain.node('a', { type: 'service' });
    const out = withSavedPositions(undefined, plain.toJSON(), undefined, { a: { x: 7, y: 8 } });
    expect(out).toEqual({ version: 1, planes: { default: { a: { x: 7, y: 8 } } } });
  });

  it('resolves an absent plane the way the compiler does — the first declared one', () => {
    // Not 'default': layoutPlaneKey defers to resolveContainmentPlane, so a model
    // that declares planes keys under its first, exactly as compileView renders it.
    const out = withSavedPositions(undefined, makeModel(), undefined, { a: { x: 7, y: 8 } });
    expect(Object.keys(out.planes)).toEqual(['alt']);
  });

  it('keys the plane the same way the persisted settings do', () => {
    const out = withSavedPositions(undefined, makeModel(), 'alt', { a: { x: 0, y: 0 } });
    expect(Object.keys(out.planes)).toEqual(['alt']);
  });
});

describe('saving which boxes are open', () => {
  const saved: LayoutOverlay = { version: 1, planes: {}, unfolded: { alt: ['old'], other: ['kept'] } };

  it('unfoldedOf lists the expanded pins, sorted; a collapsed pin is the rest state and is not saved', () => {
    expect(unfoldedOf({ z: 'expanded', a: 'expanded', shut: 'collapsed' })).toEqual(['a', 'z']);
  });

  it('replaces the plane\'s list with what is open now, leaving other planes alone', () => {
    const out = withSavedPositions(saved, makeModel(), 'alt', {}, ['b', 'a']);
    expect(out.unfolded).toEqual({ alt: ['a', 'b'], other: ['kept'] });
  });

  it('nothing open drops the plane\'s list; omitted leaves it alone', () => {
    expect(withSavedPositions(saved, makeModel(), 'alt', {}, []).unfolded).toEqual({ other: ['kept'] });
    expect(withSavedPositions(saved, makeModel(), 'alt', {}).unfolded).toEqual(saved.unfolded);
  });

  it('a freeze carries it too; a thaw never touches it', () => {
    expect(withPlaneManual(saved, makeModel(), 'alt', {}, ['a']).unfolded).toEqual({ alt: ['a'], other: ['kept'] });
    expect(withPlaneManual(saved, makeModel(), 'alt', null).unfolded).toEqual(saved.unfolded);
  });
});

describe('saving slid edge labels', () => {
  const saved: LayoutOverlay = { version: 1, planes: {}, edgeLabels: { alt: { r1: { legacy: { t: 0.1 } } } } };

  it('merges the moves into the plane, keeping placements saved earlier', () => {
    const out = withSavedPositions(saved, makeModel(), 'alt', {}, undefined, { r2: { legacy: { t: 0.7, side: 'top' } } });
    expect(out.edgeLabels).toEqual({ alt: { r1: { legacy: { t: 0.1 } }, r2: { legacy: { t: 0.7, side: 'top' } } } });
  });

  it('saving only folds or labels leaves no empty position bucket behind', () => {
    expect(withSavedPositions({ version: 1, planes: {} }, makeModel(), 'alt', {}, ['a']).planes).toEqual({});
  });

  it('no moves leaves the overlay without the field it never had', () => {
    expect('edgeLabels' in withSavedPositions({ version: 1, planes: {} }, makeModel(), 'alt', { a: { x: 1, y: 1 } })).toBe(false);
  });

  it('a freeze carries them too', () => {
    const out = withPlaneManual(saved, makeModel(), 'alt', {}, undefined, { r1: { legacy: { t: 0.9 } } });
    expect(out.edgeLabels?.['alt']?.['r1']).toEqual({ legacy: { t: 0.9 } });
  });
});

describe('withPlaneManual', () => {
  const saved: LayoutOverlay = {
    version: 1,
    planes: { alt: { a: { x: 1, y: 2 } } },
    settings: { alt: { direction: 'DOWN' } },
  };

  it('pins the snapshot over existing positions and sets the flag for the plane', () => {
    const out = withPlaneManual(saved, makeModel(), 'alt', { a: { x: 5, y: 6 }, b: { x: 7, y: 8 } });
    expect(out.planes['alt']).toEqual({ a: { x: 5, y: 6 }, b: { x: 7, y: 8 } });
    expect(out.manual).toEqual({ alt: true });
  });

  it('clearing the flag keeps every position and drops an emptied manual map', () => {
    const frozen = withPlaneManual(saved, makeModel(), 'alt', { b: { x: 7, y: 8 } });
    const out = withPlaneManual(frozen, makeModel(), 'alt', null);
    expect(out.manual).toBeUndefined();
    expect(out.planes['alt']).toEqual({ a: { x: 1, y: 2 }, b: { x: 7, y: 8 } });
  });

  it('clearing one plane leaves another plane frozen', () => {
    const two: LayoutOverlay = { version: 1, planes: {}, manual: { alt: true, default: true } };
    expect(withPlaneManual(two, makeModel(), 'alt', null).manual).toEqual({ default: true });
  });

  it('never touches settings, sizes or export', () => {
    const rich: LayoutOverlay = { ...saved, sizes: { a: { w: 64, h: 64 } }, export: { collapsed: ['a'] } };
    const out = withPlaneManual(rich, makeModel(), 'alt', { a: { x: 0, y: 0 } });
    expect(out.settings).toEqual({ alt: { direction: 'DOWN' } });
    expect(out.sizes).toEqual({ a: { w: 64, h: 64 } });
    expect(out.export).toEqual({ collapsed: ['a'] });
  });

  it('synthesises an overlay for a diagram with no sidecar yet', () => {
    const plain = model('plain');
    plain.node('a', { type: 'service' });
    const out = withPlaneManual(undefined, plain.toJSON(), undefined, { a: { x: 7, y: 8 } });
    expect(out).toEqual({ version: 1, planes: { default: { a: { x: 7, y: 8 } } }, manual: { default: true } });
  });
});
