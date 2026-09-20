// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { model } from '@diagc/core';
import { showsThreatTable, ThreatTable } from './ThreatTable';

/**
 * A minimal STRIDE data-flow diagram: one trust boundary, one element outside it
 * and one inside, and a flow that crosses — the shape the Crosses column exists
 * for. Three threats, one of them mitigated, so the summary has something to count.
 */
const tm = () => {
  const b = model('shop');
  const t = b.threatModel();
  const dmz = t.boundary('dmz', 'DMZ');
  const user = t.entity('user', 'User');
  const api = t.process('api', 'API');
  dmz.contains(api);
  user.threat({
    category: 'S',
    title: 'Credential stuffing',
    severity: 'high',
    status: 'mitigated',
    mitigation: 'Rate limit + MFA',
  });
  api.threat({ category: 'E', title: 'Admin route unguarded', severity: 'critical' });
  t.flow(user, api, 'login').threat({ category: 'T', title: 'MITM' });
  return b.toJSON();
};

/** Same elements, but the boundary containment lives on a SECOND plane — which
 * flows cross a boundary is a fact about the plane being drawn (see crossings). */
const planed = () => {
  const b = model('planed');
  b.plane('arch', { name: 'Architecture' });
  const t = b.threatModel({ plane: 'tm', name: 'Threat model' });
  const dmz = t.boundary('dmz', 'DMZ');
  const user = t.entity('user', 'User');
  const api = t.process('api', 'API');
  dmz.contains(api, { plane: 'tm' });
  t.flow(user, api, 'login').threat({ category: 'T', title: 'MITM' });
  return b.toJSON();
};

const rows = (container: HTMLElement) => [...container.querySelectorAll('tbody tr')];
const cells = (row: Element) => [...row.querySelectorAll('td')].map((td) => td.textContent);

describe('ThreatTable', () => {
  it('opens on the whole register, one row per threat, under the seven review columns', () => {
    const { container } = render(<ThreatTable model={tm()} />);
    // `open` because a published page's reader should not have to discover that
    // the register is there; it is the point of a threat model.
    expect(container.querySelector('details')?.hasAttribute('open')).toBe(true);
    expect(screen.getByText('Threats: 2 open of 3')).toBeDefined();
    expect([...container.querySelectorAll('thead th')].map((th) => th.textContent)).toEqual([
      'Element',
      'Crosses',
      'STRIDE',
      'Threat',
      'Severity',
      'Status',
      'Mitigation',
    ]);
    expect(rows(container)).toHaveLength(3);
    // Register order: nodes first, then relations, each in declaration order.
    expect(cells(rows(container)[0]!)).toEqual([
      'User',
      '',
      'S · Spoofing',
      'Credential stuffing',
      'high',
      'mitigated',
      'Rate limit + MFA',
    ]);
    expect(screen.getByRole('table', { name: 'Threat register' })).toBeDefined();
  });

  it('leaves the Crosses cell empty for a node and names both boundaries for a crossing flow', () => {
    const { container } = render(<ThreatTable model={tm()} />);
    expect(cells(rows(container)[1]!)[1]).toBe(''); // a node sits somewhere, it crosses nothing
    const flow = rows(container)[2]!;
    // The flow reads between its ends, the Crosses cell between the boundaries
    // those ends sit in — and an end inside no boundary is 'outside'.
    expect(cells(flow)[0]).toBe('User → API (login)');
    expect(cells(flow)[1]).toBe('outside ⇢ DMZ');
  });

  it('reads an unrated, untouched threat as — and open, and spells the STRIDE letter out', () => {
    const { container } = render(<ThreatTable model={tm()} />);
    // An unset status IS open (isOpen), so it reads as the word it means rather
    // than as a blank a reader would have to interpret.
    expect(cells(rows(container)[2]!)).toEqual(['User → API (login)', 'outside ⇢ DMZ', 'T · Tampering', 'MITM', '—', 'open', '']);
  });

  it('follows the viewed plane when it decides what a flow crosses', () => {
    const m = planed();
    const onArch = render(<ThreatTable model={m} />); // no plane = the first one
    // The boundary containment belongs to the 'tm' plane, so on the architecture
    // view the same flow crosses nothing.
    expect(cells(rows(onArch.container)[0]!)[1]).toBe('');
    onArch.unmount();
    const onTm = render(<ThreatTable model={m} plane="tm" />);
    expect(cells(rows(onTm.container)[0]!)[1]).toBe('outside ⇢ DMZ');
  });
});

describe('showsThreatTable', () => {
  it('is for interactive pages of a model that has threats', () => {
    expect(showsThreatTable(tm(), false)).toBe(true);
  });
  it('stays out of an export render', () => {
    // The PNG is a screenshot of the canvas; a table under it would be measured
    // into the frame and baked into the image.
    expect(showsThreatTable(tm(), true)).toBe(false);
  });
  it('costs nothing on a diagram that carries no threats', () => {
    const b = model('plain');
    b.node('a', { name: 'Alpha' });
    expect(showsThreatTable(b.toJSON(), false)).toBe(false);
  });
});
