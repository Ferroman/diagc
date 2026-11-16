// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { SM_MACHINE_TYPE } from '@diagc/core/internal';
import { renderBody } from './render-body';

describe('MachineFrameBody', () => {
  it('draws the frame with a name tab reading "sm <name>"', () => {
    const c = renderBody({ typeId: SM_MACHINE_TYPE, label: 'Order', state: 'expanded' });
    expect(c.querySelector('.dg-sm-machine')).not.toBeNull();
    expect(c.querySelector('.dg-sm-machine-tab')?.textContent).toBe('sm Order');
  });

  it('takes its colour as the frame accent only', () => {
    const c = renderBody({ typeId: SM_MACHINE_TYPE, label: 'Order', state: 'expanded', color: '#336699' });
    const frame = c.querySelector<HTMLElement>('.dg-sm-machine')!;
    expect(frame.style.getPropertyValue('--dg-sm-accent')).toBe('#336699');
  });
});
