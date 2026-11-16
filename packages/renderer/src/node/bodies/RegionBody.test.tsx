// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { SM_REGION_TYPE } from '@diagc/core/internal';
import { renderBody } from './render-body';

describe('RegionBody', () => {
  it('draws no border of its own', () => {
    const c = renderBody({ typeId: SM_REGION_TYPE, label: '', state: 'expanded' });
    const region = c.querySelector<HTMLElement>('.dg-sm-region')!;
    expect(region).not.toBeNull();
    expect(region.getAttribute('style') ?? '').not.toContain('border');
    expect(region.classList.contains('dg-node')).toBe(false);
    expect(region.classList.contains('dg-group')).toBe(false);
  });

  it('draws the dashed edge it shares with the region before it, and none when it is first', () => {
    const below = renderBody({ typeId: SM_REGION_TYPE, label: '', state: 'expanded', regionSeparator: 'top' });
    expect(below.querySelector('.dg-sm-region')!.classList.contains('dg-sm-region-sep-top')).toBe(true);
    const beside = renderBody({ typeId: SM_REGION_TYPE, label: '', state: 'expanded', regionSeparator: 'left' });
    expect(beside.querySelector('.dg-sm-region')!.classList.contains('dg-sm-region-sep-left')).toBe(true);
    const first = renderBody({ typeId: SM_REGION_TYPE, label: '', state: 'expanded' });
    expect(first.querySelector('.dg-sm-region')!.className).not.toContain('sep');
  });

  it('draws its name when it has one, and none otherwise', () => {
    const named = renderBody({ typeId: SM_REGION_TYPE, label: 'Payment', state: 'expanded' });
    expect(named.querySelector('.dg-sm-region-name')?.textContent).toBe('Payment');
    const bare = renderBody({ typeId: SM_REGION_TYPE, label: '', state: 'expanded' });
    expect(bare.querySelector('.dg-sm-region-name')).toBeNull();
  });
});
