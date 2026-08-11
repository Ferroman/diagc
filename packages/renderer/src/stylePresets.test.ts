import { describe, expect, it } from 'vitest';
import { isKnownStyle, STYLE_PRESETS, stylePreset } from './stylePresets';

describe('stylePreset registry', () => {
  it('resolves every registered preset by id, and ids are unique', () => {
    for (const p of STYLE_PRESETS) expect(stylePreset(p.id)).toBe(p);
    expect(new Set(STYLE_PRESETS.map((p) => p.id)).size).toBe(STYLE_PRESETS.length);
  });
  it('falls back to clean for unknown or absent ids', () => {
    expect(stylePreset('no-such-style').id).toBe('clean');
    expect(stylePreset(undefined).id).toBe('clean');
    expect(stylePreset('clean').rough).toBeUndefined();
  });
  it('ships the six specified presets', () => {
    expect(STYLE_PRESETS.map((p) => p.id)).toEqual(['clean', 'sketch', 'hand-drawn', 'pencil', 'blueprint', 'marker']);
  });
  it('sketch reproduces the legacy rough options and tint exactly', () => {
    const s = stylePreset('sketch');
    expect(s.rough).toEqual({ roughness: 1.15, bowing: 1, strokeWidth: 1.5, fillStyle: 'solid' });
    expect(s.colorMix).toEqual({ fill: 14, stroke: 100 });
    expect(s.fontFamily).toBe("'Kalam', system-ui, sans-serif");
  });
  it('hand-drawn is a rough hachure preset with rounded corners and a handwriting font', () => {
    const h = stylePreset('hand-drawn');
    expect(h.rough?.fillStyle).toBe('hachure');
    expect(h.cornerRadius).toBeGreaterThan(0);
    expect(h.fontFamily).toContain('Caveat');
  });
  it('pencil is an accurate hachure preset: far less wobble than hand-drawn', () => {
    const p = stylePreset('pencil');
    const h = stylePreset('hand-drawn');
    expect(p.rough?.fillStyle).toBe('hachure');
    expect(p.rough!.roughness).toBeLessThan(h.rough!.roughness / 2);
    expect(p.rough!.bowing).toBeLessThan(h.rough!.bowing / 2);
    expect(p.cornerRadius).toBeGreaterThan(0);
    expect(p.fontFamily).toContain('Caveat');
  });
  it('blueprint is crisp (no rough) and repaints the canvas via css vars', () => {
    const b = stylePreset('blueprint');
    expect(b.rough).toBeUndefined();
    expect(b.cssVars?.['--dg-canvas-bg']).toBeDefined();
    expect(Object.keys(b.cssVars ?? {}).every((k) => k.startsWith('--dg-'))).toBe(true);
  });
  it('isKnownStyle matches the registry only', () => {
    expect(isKnownStyle('marker')).toBe(true);
    expect(isKnownStyle('no-such-style')).toBe(false);
    expect(isKnownStyle(undefined)).toBe(false);
  });
});
