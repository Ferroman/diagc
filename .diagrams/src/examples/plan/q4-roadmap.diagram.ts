import { model } from '@diagc/core';

// Two views of one model: the containers on a C4 plane, and WHEN each one
// ships on a plan plane — the same nodes, scheduled inside zones.
const m = model('q4-roadmap', { name: 'Q4 roadmap' });
m.plane('c4', { name: 'Containers', notation: 'c4' });

const shop = m.node('shop', { type: 'c4-system', name: 'Shop' });
const web = m.node('web', { type: 'c4-container-web', name: 'Storefront', technology: 'Next.js' });
const api = m.node('api', { type: 'c4-container-api', name: 'Orders API', technology: 'Go' });
const search = m.node('search', { type: 'c4-container-search', name: 'Search', technology: 'OpenSearch' });
shop.contains(web, api, search);
m.relate(web, api, { kind: 'sync', label: 'orders' }).relate(web, search, { kind: 'sync', label: 'queries' });

const plan = m.plan('plan', { name: 'Q4 plan' });
const dana = plan.person('dana', 'Dana Ortiz', { color: '#2f6fed' });
const eli = plan.person('eli', 'Eli Park', { color: '#b08ad9' });

const q4 = plan.zone('q4', { name: 'Q4', start: '2025-10-01', end: '2025-12-19' }).owner(dana);
q4.zone('search-launch', { name: 'Search launch', start: '2025-10-06', end: '2025-11-07', color: '#b08ad9' })
  .contains(search)
  .executor(eli)
  .checker(dana)
  .link('Design doc', 'https://example.com/docs/search');
q4.zone('checkout-v2', { name: 'Checkout v2', start: '2025-10-27', end: '2025-12-12', color: '#2f6fed' })
  .contains(web, api)
  .executor(dana)
  .event('beta', { name: 'Beta', at: '2025-11-24' });
q4.event('freeze', { name: 'Holiday freeze', at: '2025-12-15' });
plan.event('review', { name: 'Quarter review', at: '2025-12-19' });

export default m;
