// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import {
  TM_BOUNDARY_TYPE,
  TM_ENTITY_TYPE,
  TM_FLOW_KIND,
  TM_NOTATION,
  TM_PROCESS_TYPE,
  TM_STORE_TYPE,
  type DiagramModel,
} from '@diagramming/core';
import type { DiagramSelection } from '@diagramming/renderer';
import { ThreatModelPanel } from './ThreatModelPanel';

// core's own fixture (threat-model.test.ts), built by hand for the same reason:
// the panel's two lists have to line up with the derivations' tests, so they
// read the same model. `user->web#0` crosses into the DMZ carrying a threat;
// `web->db#0` crosses DMZ → Backend carrying none.
const base = (): DiagramModel => ({
  version: 1,
  id: 'tm',
  name: 'tm',
  notation: TM_NOTATION,
  nodes: [
    { id: 'user', name: 'Customer', type: TM_ENTITY_TYPE },
    {
      id: 'web',
      name: 'Web app',
      type: TM_PROCESS_TYPE,
      threats: [
        { id: 't1', category: 'E', title: 'Admin route open' },
        { id: 't2', category: 'S', title: 'Weak session', status: 'mitigated' },
      ],
    },
    { id: 'db', name: 'Orders DB', type: TM_STORE_TYPE },
    { id: 'dmz', name: 'DMZ', type: TM_BOUNDARY_TYPE },
    { id: 'backend', name: 'Backend', type: TM_BOUNDARY_TYPE },
  ],
  containment: [
    { parent: 'dmz', child: 'web' },
    { parent: 'backend', child: 'db' },
  ],
  relations: [
    {
      id: 'user->web#0',
      from: 'user',
      to: 'web',
      kind: TM_FLOW_KIND,
      label: 'HTTPS',
      threats: [{ id: 't1', category: 'T', title: 'MITM', severity: 'high' }],
    },
    { id: 'web->db#0', from: 'web', to: 'db', kind: TM_FLOW_KIND },
  ],
  layers: [],
  planes: [],
});

const empty = (): DiagramModel => ({
  version: 1,
  id: 'tm',
  name: 'tm',
  notation: TM_NOTATION,
  nodes: [],
  containment: [],
  relations: [],
  layers: [],
  planes: [],
});

function setup(m: DiagramModel, plane?: string) {
  const onSelect = vi.fn<(s: DiagramSelection) => void>();
  render(<ThreatModelPanel model={m} {...(plane !== undefined ? { plane } : {})} onSelect={onSelect} />);
  return { onSelect };
}

// No @testing-library/jest-dom in this repo (see ThreatsSection.test.tsx), so
// text is read off the elements directly.
const section = (name: string) => within(screen.getByRole('region', { name }));
const rowNames = (name: string) => section(name).queryAllByRole('button').map((b) => b.textContent);

describe('ThreatModelPanel', () => {
  it('reviews only the boundary crossings that carry no threat, over the boundaries they cross', () => {
    const { onSelect } = setup(base());
    expect(screen.getByRole('complementary', { name: 'Threat model' })).toBeTruthy();
    const buttons = section('Crossings to review').getAllByRole('button');
    expect(buttons).toHaveLength(1); // user->web#0 already has one, so it is not up for review
    expect(buttons[0]?.textContent).toContain('Web app → Orders DB');
    expect(buttons[0]?.textContent).toContain('DMZ ⇢ Backend');
    fireEvent.click(buttons[0] as HTMLElement);
    expect(onSelect).toHaveBeenCalledWith({ kind: 'edge', id: 'web->db#0' });
  });

  it('reads an end that sits in no boundary as "outside"', () => {
    const m = base();
    delete m.relations[0]!.threats;
    setup(m);
    const row = section('Crossings to review')
      .getAllByRole('button')
      .find((b) => b.textContent?.includes('Customer → Web app') === true);
    expect(row?.textContent).toContain('outside ⇢ DMZ');
  });

  it('hints instead of listing once every crossing carries a threat', () => {
    const m = base();
    m.relations[1]!.threats = [{ id: 't1', category: 'I', title: 'Plain text' }];
    setup(m);
    expect(rowNames('Crossings to review')).toEqual([]);
    expect(screen.getByText('Every boundary-crossing flow has at least one threat.')).toBeTruthy();
  });

  it('reviews the crossings of the viewed plane, not of the first-declared one', () => {
    const m = base();
    m.planes = [
      { id: 'arch', name: 'Arch' },
      { id: 'threats', name: 'Threats', notation: TM_NOTATION },
    ];
    // the untagged edges belong to the first-declared plane, so the threats
    // plane needs both: on it, Backend holds the two ends and nothing crosses
    m.containment.push({ parent: 'backend', child: 'web', plane: 'threats' }, { parent: 'backend', child: 'db', plane: 'threats' });
    setup(m, 'threats');
    expect(rowNames('Crossings to review')).toEqual([]);
  });

  it('groups the register by element, open against total, each threat spelled out', () => {
    const { onSelect } = setup(base());
    const register = section('Register');
    const groups = register.getAllByRole('button');
    // nodes before relations, each in declaration order (threatRegister)
    expect(groups.map((b) => b.textContent)).toEqual(['Web app 1 / 2', 'Customer → Web app (HTTPS) 1 / 1']);
    expect(register.getByText('[E] Admin route open · open')).toBeTruthy(); // no severity, unset status reads open
    expect(register.getByText('[S] Weak session · mitigated')).toBeTruthy();
    expect(register.getByText('[T] MITM · high · open')).toBeTruthy();
    fireEvent.click(groups[0] as HTMLElement);
    expect(onSelect).toHaveBeenCalledWith({ kind: 'node', id: 'web' });
    fireEvent.click(groups[1] as HTMLElement);
    expect(onSelect).toHaveBeenCalledWith({ kind: 'edge', id: 'user->web#0' });
  });

  it('points at the Threats section while the register is empty', () => {
    setup(empty());
    expect(rowNames('Register')).toEqual([]);
    expect(screen.getByText('Select an element and add a threat in the Threats section.')).toBeTruthy();
  });

  it('lists the threat and notation issues, selecting the node or the flow behind each', () => {
    const m = base();
    m.nodes[1]!.threats = [{ id: 't1', category: 'E', title: '' }];
    m.relations.push({ id: 'dmz->db#0', from: 'dmz', to: 'db', kind: TM_FLOW_KIND });
    const { onSelect } = setup(m);
    const issues = within(screen.getByRole('list', { name: 'Issues' }));
    fireEvent.click(issues.getByRole('button', { name: /has no title/ }));
    expect(onSelect).toHaveBeenCalledWith({ kind: 'node', id: 'web' });
    fireEvent.click(issues.getByRole('button', { name: /touches the trust boundary/ }));
    expect(onSelect).toHaveBeenCalledWith({ kind: 'edge', id: 'dmz->db#0' });
  });

  it('keeps the issues list out of the way while the model is sound', () => {
    setup(base());
    expect(screen.queryByRole('list', { name: 'Issues' })).toBeNull();
  });
});
