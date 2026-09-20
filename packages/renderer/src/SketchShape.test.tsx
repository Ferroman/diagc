// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SketchShape } from './SketchShape';
import { STYLE_PRESETS, stylePreset } from './stylePresets';

const HATCHED = STYLE_PRESETS.filter((p) => p.rough !== undefined && p.rough.fillStyle !== 'solid');

const draw = (presetId: string, extra: Partial<Parameters<typeof SketchShape>[0]> = {}) =>
  render(<SketchShape id="n1" kind="box" width={160} height={80} preset={stylePreset(presetId)} {...extra} />).container;

describe('SketchShape', () => {
  it('has hatched presets to guard (or the cases below prove nothing)', () => {
    expect(HATCHED.map((p) => p.id)).toEqual(expect.arrayContaining(['hand-drawn', 'pencil', 'marker']));
  });

  it('draws the preset fill on a leaf: a solid polygon for sketch, no hatch', () => {
    const c = draw('sketch');
    expect(c.querySelector('.dg-sketch-fill')).not.toBeNull();
    expect(c.querySelector('.dg-sketch-hatch')).toBeNull();
    expect(c.querySelector('.dg-sketch-stroke')).not.toBeNull();
  });

  it.each(HATCHED.map((p) => p.id))('%s: a hatched leaf stands on an opaque base, under the hatch', (id) => {
    const c = draw(id);
    const fill = c.querySelector('.dg-sketch-fill');
    const hatch = c.querySelector('.dg-sketch-hatch');
    expect(fill).not.toBeNull();
    expect(hatch).not.toBeNull();
    // painted in document order: the base must come first or it covers the hatch
    expect(fill!.compareDocumentPosition(hatch!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it.each(HATCHED.map((p) => p.id))('%s: hatch lines are softened — the label on top of them has to win', (id) => {
    const hatch = draw(id).querySelector('.dg-sketch-hatch') as SVGPathElement;
    const opacity = Number(hatch.style.opacity);
    expect(opacity).toBeGreaterThan(0);
    expect(opacity).toBeLessThanOrEqual(0.5);
  });

  it.each(HATCHED.map((p) => p.id))('%s: a wash is a solid polygon and never hatch lines', (id) => {
    const c = draw(id, { width: 600, height: 400, fill: 'wash' });
    expect(c.querySelector('.dg-sketch-hatch')).toBeNull();
    expect(c.querySelector('.dg-sketch-fill')).not.toBeNull();
    expect(c.querySelector('.dg-sketch-stroke')).not.toBeNull();
  });

  it.each(['sketch', 'marker'])('%s: fill "none" draws the outline alone', (id) => {
    const c = draw(id, { fill: 'none', color: '#2563eb' });
    expect(c.querySelector('.dg-sketch-fill')).toBeNull();
    expect(c.querySelector('.dg-sketch-hatch')).toBeNull();
    expect(c.querySelector('.dg-sketch-stroke')).not.toBeNull();
  });

  it('tints a coloured hatched leaf: base by the fill mix, lines by the stroke mix', () => {
    const c = draw('marker', { color: '#2563eb' });
    const mix = stylePreset('marker').colorMix!;
    expect((c.querySelector('.dg-sketch-fill') as SVGPathElement).style.fill).toContain(`${mix.fill}%`);
    expect((c.querySelector('.dg-sketch-hatch') as SVGPathElement).style.stroke).toContain(`${mix.stroke}%`);
  });

  it('renders nothing for a crisp preset', () => {
    expect(draw('clean').querySelector('svg')).toBeNull();
    expect(draw('blueprint').querySelector('svg')).toBeNull();
  });
});
