import { describe, expect, it } from 'vitest';
import { model } from '../../builder/index';
import { compileView } from '../../view/compile';
import { planCopyId, planView } from './plan-view';

function fixture(withOps = false) {
  const m = model('t');
  const plan = m.plan();
  const ana = plan.person('ana', 'Ana');
  const ben = plan.person('ben', 'Ben');
  const cleo = plan.person('cleo', 'Cleo');
  const dev = plan.person('dev', 'Dev');
  const payments = plan.team('payments', 'Payments');
  const platform = plan.team('platform', 'Platform');
  const mobile = plan.team('mobile', 'Mobile');
  if (withOps) plan.team('ops', 'Ops');
  payments.member(ana, ben);
  platform.member(ben, cleo);
  mobile.member(dev);
  const checkout = plan.zone('checkout', { start: '2026-01-05', end: '2026-03-13' });
  checkout.zone('cards', { start: '2026-01-05', end: '2026-02-13' }).executor(payments);
  checkout.zone('gateway', { start: '2026-01-19', end: '2026-03-13' }).executor(platform);
  plan.zone('app', { start: '2026-01-12', end: '2026-02-27' }).executor(mobile);
  return m.toJSON();
}

function view(opts: { grouped: boolean; hidden?: Set<string>; controls?: boolean }, ops = false) {
  const json = fixture(ops);
  const compiled = compileView(json, { plane: 'plan', pins: { checkout: 'expanded' } });
  return planView(compiled, json, 'plan', { hidden: new Set(), ...opts });
}

describe('planRoster', () => {
  it('frames each team around its members, ungrouped', () => {
    const v = view({ grouped: false });
    expect(v.roster).toEqual([
      { team: 'payments', members: ['ana', 'ben'] },
      { team: 'platform', members: [planCopyId('platform', 'ben'), 'cleo'] },
      { team: 'mobile', members: ['dev'] },
    ]);
    expect(v.copies?.get(planCopyId('platform', 'ben'))).toBe('ben');
    expect(v.roots.filter((r) => r.id === planCopyId('platform', 'ben'))).toHaveLength(1);
  });

  it('keeps the same frames grouped, beside the lane copies', () => {
    const v = view({ grouped: true });
    expect(v.roster?.map((f) => f.team)).toEqual(['payments', 'platform', 'mobile']);
    expect(v.copies?.get(planCopyId('platform', 'ben'))).toBe('ben');
    expect(v.copies?.get(planCopyId('payments', 'checkout'))).toBe('checkout');
  });

  it('frames a hidden person too (the badge dims; it does not leave)', () => {
    expect(view({ grouped: false, hidden: new Set(['ben']) }).roster?.[1]?.members[0]).toBe(
      planCopyId('platform', 'ben'),
    );
  });

  it('draws frames in a chromeless view', () => {
    expect(view({ grouped: false, controls: false }).roster).toHaveLength(3);
  });

  it('leaves a team with no members as a plain card', () => {
    expect(view({ grouped: false }, true).roster?.map((f) => f.team)).not.toContain('ops');
  });
});
