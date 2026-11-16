// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { SM_REGION_TYPE } from '@diagc/core/internal';
import { renderBody } from './render-body';

describe('RegionBody', () => {
  it('draws no border of its own: the parent draws the dashed separator', () => {
    const c = renderBody({ typeId: SM_REGION_TYPE, label: '', state: 'expanded' });
    const region = c.querySelector<HTMLElement>('.dg-sm-region')!;
    expect(region).not.toBeNull();
    expect(region.getAttribute('style') ?? '').not.toContain('border');
    expect(region.classList.contains('dg-node')).toBe(false);
    expect(region.classList.contains('dg-group')).toBe(false);
  });

  it('draws its name when it has one, and none otherwise', () => {
    const named = renderBody({ typeId: SM_REGION_TYPE, label: 'Payment', state: 'expanded' });
    expect(named.querySelector('.dg-sm-region-name')?.textContent).toBe('Payment');
    const bare = renderBody({ typeId: SM_REGION_TYPE, label: '', state: 'expanded' });
    expect(bare.querySelector('.dg-sm-region-name')).toBeNull();
  });
});
