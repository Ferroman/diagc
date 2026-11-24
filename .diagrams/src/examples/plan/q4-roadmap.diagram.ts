import { model } from '@diagc/core';

// A quarter's roadmap: two projects with their work streams, a dependency, a beta and a
// review, and the days the work stops — Thanksgiving pauses Checkout v2 only, and the
// offsite pauses everyone.
const m = model('q4-roadmap', { name: 'Q4 roadmap' });
const plan = m.plan('plan', { name: 'Q4 plan' });
const dana = plan.person('dana', 'Dana Ortiz', { color: '#2f6fed' });
const eli = plan.person('eli', 'Eli Park', { color: '#b08ad9' });

const q4 = plan.zone('q4', { name: 'Q4', start: '2025-10-01', end: '2025-12-19' }).owner(dana);
const search = q4
  .zone('search-launch', { name: 'Search launch', start: '2025-10-06', end: '2025-11-07', color: '#b08ad9' })
  .executor(eli)
  .checker(dana)
  .link('Design doc', 'https://example.com/docs/search');
search.zone('index', { name: 'Index the catalogue', start: '2025-10-06', end: '2025-10-24' });
search.zone('ranking', { name: 'Ranking', start: '2025-10-20', end: '2025-11-07' });
const checkout = q4
  .zone('checkout-v2', { name: 'Checkout v2', start: '2025-10-27', end: '2025-11-28', color: '#2f6fed' })
  .executor(dana);
checkout.event('beta', { name: 'Beta', at: '2025-11-24' });
const rollout = q4
  .zone('rollout', { name: 'Rollout', start: '2025-12-01', end: '2025-12-12', color: '#3a9d5d' })
  .executor(eli);
// A dependency: Rollout starts when Checkout v2 is done.
m.relate(checkout, rollout, { kind: 'sync', label: 'ships' });

// Days the work stops without moving its dates: hatched on the bar a period pauses, and
// shaded across the whole chart for a period that pauses everyone.
plan.period('thanksgiving', { name: 'Thanksgiving', start: '2025-11-26', end: '2025-11-28' }).interrupts(checkout);
plan.period('offsite', { name: 'Team offsite', start: '2025-10-16', end: '2025-10-17' });
q4.event('freeze', { name: 'Holiday freeze', at: '2025-12-15' });
plan.event('review', { name: 'Quarter review', at: '2025-12-19' });

export default m;
