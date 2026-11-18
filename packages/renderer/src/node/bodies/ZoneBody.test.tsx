// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { SM_ZONE_TYPE } from '@diagc/core/internal';
import { renderBody } from './render-body';

describe('ZoneBody', () => {
  it('is an area of its own, neither a state box nor a group', () => {
    const c = renderBody({ typeId: SM_ZONE_TYPE, label: '1. Agree', state: 'expanded' });
    const zone = c.querySelector<HTMLElement>('.dg-sm-zone')!;
    expect(zone).not.toBeNull();
    expect(zone.classList.contains('dg-node')).toBe(false);
    expect(zone.classList.contains('dg-group')).toBe(false);
    expect(zone.classList.contains('dg-sm-state')).toBe(false);
  });

  it('draws its title, and the note under it only when it has one', () => {
    const noted = renderBody({
      typeId: SM_ZONE_TYPE,
      label: '1. Agree',
      state: 'expanded',
      zoneNote: 'Both sides confirm the transfer',
    });
    expect(noted.querySelector('.dg-sm-zone-title')?.textContent).toBe('1. Agree');
    expect(noted.querySelector('.dg-sm-zone-note')?.textContent).toBe('Both sides confirm the transfer');
    const bare = renderBody({ typeId: SM_ZONE_TYPE, label: '1. Agree', state: 'expanded' });
    expect(bare.querySelector('.dg-sm-zone-note')).toBeNull();
  });

  it('hands its colour to the wash and the title, and sets none without one', () => {
    const tinted = renderBody({ typeId: SM_ZONE_TYPE, label: 'Z', state: 'expanded', color: 'var(--dg-sm-zone2)' });
    expect(tinted.querySelector<HTMLElement>('.dg-sm-zone')!.style.getPropertyValue('--dg-sm-zone')).toBe(
      'var(--dg-sm-zone2)',
    );
    const plain = renderBody({ typeId: SM_ZONE_TYPE, label: 'Z', state: 'expanded' });
    expect(plain.querySelector<HTMLElement>('.dg-sm-zone')!.getAttribute('style')).toBeNull();
  });

  it('is still a zone when it holds nothing yet', () => {
    const c = renderBody({ typeId: SM_ZONE_TYPE, label: 'Z', state: 'leaf' });
    expect(c.querySelector('.dg-sm-zone')).not.toBeNull();
  });
});
