import { describe, expect, it } from 'vitest';
import { hueInk } from '../canvas/type-hues';
import { asciiFrameVars } from './asciiFrames';
import { isKnownStyle, STYLE_PRESETS, stylePreset } from './stylePresets';

const NEWER = ['soft', 'pastel', 'cards', 'layered', 'neon', 'terminal', 'ascii', 'dos'];

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
  it('ships the presets in menu order', () => {
    expect(STYLE_PRESETS.map((p) => p.id)).toEqual([
      'clean',
      'sketch',
      'hand-drawn',
      'pencil',
      'blueprint',
      'marker',
      'soft',
      'pastel',
      'cards',
      'layered',
      'neon',
      'terminal',
      'ascii',
      'dos',
    ]);
  });
  it('the newer presets are crisp, fonted, and set only --dg-* variables', () => {
    for (const id of NEWER) {
      const p = stylePreset(id);
      expect(p.rough, id).toBeUndefined();
      expect(p.fontFamily, id).toBeDefined();
      expect(
        Object.keys(p.cssVars ?? {}).every((k) => k.startsWith('--dg-')),
        id,
      ).toBe(true);
    }
  });
  it('colours types where the look is built on it, from hex palettes of at least six', () => {
    const palettes = STYLE_PRESETS.filter((p) => p.palette !== undefined).map((p) => p.id);
    expect(palettes).toEqual(['pastel', 'cards', 'neon', 'terminal', 'ascii', 'dos']);
    for (const id of palettes) {
      const palette = stylePreset(id).palette ?? [];
      expect(palette.length, id).toBeGreaterThanOrEqual(6);
      expect(
        palette.every((c) => /^#[0-9a-f]{6}$/.test(c)),
        id,
      ).toBe(true);
    }
  });
  it('the fixed-colour looks paint the whole canvas in both themes, like blueprint', () => {
    const tokens = ['--dg-canvas-bg', '--dg-bg', '--dg-surface', '--dg-text', '--dg-text-muted', '--dg-edge'];
    for (const id of ['neon', 'terminal', 'dos']) {
      for (const k of [...tokens, '--dg-node-fill', '--dg-node-stroke']) {
        expect(stylePreset(id).cssVars?.[k], `${id} ${k}`).toBeDefined();
      }
    }
  });
  it('dos fills boxes with colours that all take black text', () => {
    expect(stylePreset('dos').palette?.every((c) => hueInk(c) === '#000')).toBe(true);
  });
  it('the text looks bend square; ascii also types its lines and frames', () => {
    expect(stylePreset('dos').edges).toEqual({ corner: 0 });
    expect(stylePreset('ascii').edges).toEqual({ corner: 0, dash: { solid: '5 3', dashed: '5 11' }, openArrow: true });
    expect(stylePreset('ascii').cssVars).toMatchObject(asciiFrameVars());
  });
  it('grids: neon draws lines; layered and the screen looks draw none; the rest keep the dots', () => {
    expect(stylePreset('neon').grid).toBe('lines');
    for (const id of ['layered', 'terminal', 'ascii', 'dos']) expect(stylePreset(id).grid, id).toBe('none');
    for (const id of ['clean', 'blueprint', 'soft', 'pastel', 'cards'])
      expect(stylePreset(id).grid, id).toBeUndefined();
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
