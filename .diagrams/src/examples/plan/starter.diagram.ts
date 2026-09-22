import { model } from '@diagc/core';

// Copy this file, rename the zones and the people, and move the dates.
const m = model('launch-plan', { name: 'Launch plan' });
const plan = m.plan();

const alice = plan.person('alice', 'Alice Ng', { color: '#2f6fed' });
const bob = plan.person('bob', 'Bob Lee', { color: '#b08ad9' });
const chen = plan.person('chen', 'Chen Wu', { color: '#3a9d5d' });

const discovery = plan.zone('discovery', { name: 'Discovery', start: '2026-01-05', end: '2026-01-23', color: '#b08ad9' });
discovery.owner(alice).executor(bob);

const build = plan.zone('build', { name: 'Build', start: '2026-01-26', end: '2026-03-06', color: '#2f6fed' });
build.owner(alice).executor(bob).checker(chen);
build.zone('api', { name: 'API', start: '2026-01-26', end: '2026-02-13' });
build.zone('ui', { name: 'UI', start: '2026-02-09', end: '2026-03-06' });
build.event('code-freeze', { name: 'Code freeze', at: '2026-03-02' });
build.comment('UI started a week late; the freeze holds', { by: 'Alice Ng', at: '2026-02-16' });
build.link('Tracker', 'https://example.com/board/launch');

plan.zone('rollout', { name: 'Rollout', start: '2026-03-09', end: '2026-03-20', color: '#3a9d5d' }).owner(chen);
plan.event('launch', { name: 'Launch', at: '2026-03-23' });

export default m;
