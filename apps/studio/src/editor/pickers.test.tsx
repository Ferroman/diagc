// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ColorRow, PRESET_COLORS, SHADE_PALETTE } from './pickers';

describe('SHADE_PALETTE', () => {
  it('has 7 hues, each with a light/base/dark triple', () => {
    expect(SHADE_PALETTE).toHaveLength(7);
    for (const hue of SHADE_PALETTE) expect(hue).toHaveLength(3);
  });

  it('keeps the original 7 presets as the base (middle) shade', () => {
    expect(SHADE_PALETTE.map((h) => h[1])).toEqual(PRESET_COLORS);
  });

  it('uses distinct hexes across all 21 shades', () => {
    const all = SHADE_PALETTE.flat();
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('ColorRow', () => {
  const swatches = () => screen.queryAllByRole('button').filter((b) => b.className.includes('swatch') && !b.className.includes('current'));
  const openPalette = () => fireEvent.click(screen.getByRole('button', { name: 'Color palette' }));

  it('is one line until the palette is opened, then shows every shade', () => {
    render(<ColorRow value="" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Auto color' })).toBeTruthy();
    expect(swatches()).toHaveLength(0);
    openPalette();
    expect(screen.getByRole('button', { name: 'Color palette' }).getAttribute('aria-expanded')).toBe('true');
    expect(swatches()).toHaveLength(SHADE_PALETTE.flat().length);
  });

  it('folds the palette away again once a shade is picked', () => {
    render(<ColorRow value="" onChange={vi.fn()} />);
    openPalette();
    fireEvent.click(screen.getByRole('button', { name: `Color ${SHADE_PALETTE[1]![1]!}` }));
    expect(swatches()).toHaveLength(0);
  });

  it('shows the current colour on the palette button', () => {
    render(<ColorRow value="#123456" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Color palette' }).style.background).toBe('rgb(18, 52, 86)');
  });

  it('commits a lighter shade when its swatch is clicked', () => {
    const onChange = vi.fn();
    const light = SHADE_PALETTE[0]![0]!; // lightest red
    render(<ColorRow value="" onChange={onChange} />);
    openPalette();
    fireEvent.click(screen.getByRole('button', { name: `Color ${light}` }));
    expect(onChange).toHaveBeenCalledWith(light);
  });

  it('commits a darker shade when its swatch is clicked', () => {
    const onChange = vi.fn();
    const dark = SHADE_PALETTE[4]![2]!; // darkest blue
    render(<ColorRow value="" onChange={onChange} />);
    openPalette();
    fireEvent.click(screen.getByRole('button', { name: `Color ${dark}` }));
    expect(onChange).toHaveBeenCalledWith(dark);
  });

  it('marks the swatch matching the current value active', () => {
    const dark = SHADE_PALETTE[4]![2]!;
    render(<ColorRow value={dark} onChange={vi.fn()} />);
    openPalette();
    expect(screen.getByRole('button', { name: `Color ${dark}` }).className).toContain('active');
  });
});
