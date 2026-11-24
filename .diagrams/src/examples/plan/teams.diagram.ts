import { model } from '@diagc/core';

// Copy this file, rename the teams and people, and move the dates. Press "Group by team"
// on the page to draw one lane per team.
const m = model('teams-plan', { name: 'Plan by team' });
const plan = m.plan();

const ana = plan.person('ana', 'Ana Silva', { color: '#2f6fed' });
const ben = plan.person('ben', 'Ben Okafor', { color: '#b08ad9' });
const cleo = plan.person('cleo', 'Cleo Brandt', { color: '#3a9d5d' });
const dev = plan.person('dev', 'Dev Rao', { color: '#d9822b' });

// Ben is in two teams, so his work shows in both lanes.
const payments = plan.team('payments', 'Payments', { color: '#2f6fed' });
const platform = plan.team('platform', 'Platform', { color: '#3a9d5d' });
const mobile = plan.team('mobile', 'Mobile', { color: '#b08ad9' });
payments.member(ana, ben);
platform.member(ben, cleo);
mobile.member(dev);

// No executor of its own: it shows in every lane that works inside it, with only that lane's rows.
const checkout = plan.zone('checkout', { name: 'Checkout v2', start: '2026-01-05', end: '2026-03-13', color: '#607d8b' });
checkout.owner(ana);
const cards = checkout.zone('cards', { name: 'Card payments', start: '2026-01-05', end: '2026-02-13' });
cards.executor(payments).checker(cleo);
const gateway = checkout.zone('gateway', { name: 'Gateway migration', start: '2026-01-19', end: '2026-03-13' });
gateway.executor(platform);
checkout.event('go-live', { name: 'Go live', at: '2026-03-13' });

plan.zone('app', { name: 'App redesign', start: '2026-01-12', end: '2026-02-27', color: '#b08ad9' }).owner(dev).executor(mobile);

// Nobody executes it, so it lands in Unassigned.
plan.zone('audit', { name: 'Security audit', start: '2026-02-16', end: '2026-03-06', color: '#d9822b' }).owner(cleo);

export default m;
