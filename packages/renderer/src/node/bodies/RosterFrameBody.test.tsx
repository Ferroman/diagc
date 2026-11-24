// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';
import { createIconRegistry } from '@diagc/icons';
import { createTypeRegistry } from '../../registry';
import { stylePreset } from '../../sketch/stylePresets';
import { DiagramNode, type DiagramNodeData } from '../DiagramNode';

function frame(partial: Partial<DiagramNodeData> = {}, framed = true): HTMLElement {
  const data: DiagramNodeData = {
    label: 'Payments',
    state: 'leaf',
    promoted: false,
    sharedMembers: [],
    hiddenCount: 0,
    typeRegistry: createTypeRegistry(),
    icons: createIconRegistry(),
    typeId: 'team',
    notation: 'plan',
    ...(framed ? { rosterFrame: true as const } : {}),
    actorEye: { hidden: false, toggle: vi.fn() },
    ...partial,
  };
  const { container } = render(
    <ReactFlowProvider>
      <DiagramNode id="payments" data={data} width={364} height={122} />
    </ReactFlowProvider>,
  );
  return container.firstElementChild as HTMLElement;
}

describe('RosterFrameBody', () => {
  it("heads the frame with the team's icon, name and eye, and no type line", () => {
    const el = frame();
    expect(el.className).toContain('dg-roster-frame');
    const header = el.querySelector('.dg-roster-frame-header')!;
    expect(header.querySelector('.dg-icon')).not.toBeNull();
    expect(header.querySelector('.dg-label')?.textContent).toBe('Payments');
    expect(header.querySelector('[data-testid="eye-chip"]')).not.toBeNull();
    expect(el.querySelector('.dg-type')).toBeNull();
    expect(el.textContent).not.toContain('team');
  });

  it("is edged and washed in the team's colour", () => {
    expect(frame({ color: '#2f6fed' }).style.getPropertyValue('--dg-frame')).toBe('#2f6fed');
    expect(frame().style.getPropertyValue('--dg-frame')).toBe('');
  });

  it('dims while the team is hidden', () => {
    expect(frame({ actorEye: { hidden: true, toggle: vi.fn() } }).className).toContain('dg-actor-hidden');
    expect(frame().className).not.toContain('dg-actor-hidden');
  });

  it('draws a rounded sketch outline under a rough look, in the team colour', () => {
    const el = frame({ color: '#2f6fed', stylePreset: stylePreset('sketch') });
    expect(el.querySelector('.dg-sketch-shape')).not.toBeNull();
    expect(el.querySelector<SVGPathElement>('.dg-sketch-fill')?.style.fill).toContain('#2f6fed');
    // the look draws the edge: no crisp tint inline under it
    expect(el.style.getPropertyValue('--dg-frame')).toBe('');
  });

  it('a team card that heads no frame stays a card', () => {
    const el = frame({}, false);
    expect(el.className).not.toContain('dg-roster-frame');
  });
});
