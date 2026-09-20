import { describe, expect, it } from 'vitest';
import { model, type LayoutOverlay } from '@diagc/core';
import { mergePreview, withLayoutPreview } from './layoutPreview';

function makeModel() {
  const m = model('p');
  m.node('a', { type: 'service' });
  m.plane('alt', { name: 'Alt' });
  return m.toJSON();
}

describe('mergePreview', () => {
  it('merges a patch into one plane, leaving others alone', () => {
    const out = mergePreview({ other: { algorithm: 'force' } }, 'alt', { algorithm: 'stress' });
    expect(out['alt']).toEqual({ algorithm: 'stress' });
    expect(out['other']).toEqual({ algorithm: 'force' });
  });

  it('accumulates successive patches', () => {
    const first = mergePreview({}, 'alt', { algorithm: 'force' });
    expect(mergePreview(first, 'alt', { spacing: 24 })).toEqual({ alt: { algorithm: 'force', spacing: 24 } });
  });

  it('an undefined field clears it, and an emptied plane drops out entirely', () => {
    const withAlg = mergePreview({}, 'alt', { algorithm: 'force' });
    expect(mergePreview(withAlg, 'alt', { algorithm: undefined })).toEqual({});
  });
});

describe('withLayoutPreview', () => {
  const saved: LayoutOverlay = { version: 1, planes: {}, settings: { alt: { direction: 'DOWN' } } };

  it('returns the same object reference when there is no preview (elk must not re-run)', () => {
    expect(withLayoutPreview(saved, makeModel(), 'alt', {})).toBe(saved);
    expect(withLayoutPreview(saved, makeModel(), 'alt', { alt: {} })).toBe(saved);
  });

  it('overlays the preview on top of the sidecar rather than replacing it', () => {
    const out = withLayoutPreview(saved, makeModel(), 'alt', { alt: { algorithm: 'force' } });
    expect(out!.settings!['alt']).toEqual({ direction: 'DOWN', algorithm: 'force' });
  });

  it('the preview WINS on a field the sidecar also sets', () => {
    // Spread order, not composition: `saved` pins direction: DOWN, so if the
    // sidecar spread last the picker would be inert on exactly the diagrams
    // that hand-wrote a setting. Same field on both sides is the only way to
    // observe it — the test above sets two different ones.
    const out = withLayoutPreview(saved, makeModel(), 'alt', { alt: { direction: 'UP' } });
    expect(out!.settings!['alt']).toEqual({ direction: 'UP' });
  });

  it('synthesises an overlay when the diagram has no sidecar at all', () => {
    const out = withLayoutPreview(undefined, makeModel(), 'alt', { alt: { algorithm: 'force' } });
    expect(out).toEqual({ version: 1, planes: {}, settings: { alt: { algorithm: 'force' } } });
  });

  it('passes the layout straight through with no model', () => {
    expect(withLayoutPreview(saved, undefined, 'alt', { alt: { algorithm: 'force' } })).toBe(saved);
  });
});
