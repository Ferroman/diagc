// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PLAN_LANE_TYPE } from '@diagc/core/internal';
import { createIconRegistry } from '@diagc/icons';
import { createTypeRegistry } from '../../registry';
import type { DiagramNodeData } from '../DiagramNode';
import { PlanLaneBody } from './PlanLaneBody';
import type { BodyProps } from './types';

function header(partial: Partial<DiagramNodeData>): HTMLElement {
  const data: DiagramNodeData = {
    label: 'Payments',
    state: 'leaf',
    promoted: false,
    sharedMembers: [],
    hiddenCount: 0,
    typeRegistry: createTypeRegistry(),
    icons: createIconRegistry(),
    typeId: PLAN_LANE_TYPE,
    ...partial,
  };
  const props = { id: 'h', data, selected: false, width: 400, height: 24 } as unknown as BodyProps;
  return render(<PlanLaneBody {...props} />).container.querySelector('.dg-plan-lane') as HTMLElement;
}

describe('PlanLaneBody', () => {
  it('names the team beside a swatch of its colour', () => {
    const el = header({ color: '#f00' });
    expect(el.querySelector('.dg-plan-lane-name')?.textContent).toBe('Payments');
    expect(el.querySelector('.dg-plan-lane-swatch')).not.toBeNull();
    expect(el.style.getPropertyValue('--dg-lane')).toBe('#f00');
  });

  it('a team without a colour keeps the muted default', () => {
    expect(header({}).style.getPropertyValue('--dg-lane')).toBe('');
  });
});
