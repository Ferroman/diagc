import { model } from '@diagc/core';

// Same scope, same pay, Fridays off. The first-order optimism is the easy part
// of a four-day week; the diagram is for what the second- and third-order
// branches do to client work and on-call coverage.
const m = model('ex-second-order-four-day-week', { name: 'Moving to a four-day work week' });
const so = m.secondOrder();

const fourDayWeek = so.decision('four-day-week', 'Move to a four-day work week', {
  description: 'Same scope, same pay — Fridays off starting next quarter.',
});

const lessBurnout = fourDayWeek.then('less-burnout', 'Engineers report less burnout', {
  valence: '+',
  label: 'quarterly survey',
  description: 'Self-reported burnout score drops two points in the first survey.',
});
const squeezedClients = fourDayWeek.then('squeezed-clients', 'Client calls compress into four days', {
  valence: '-',
  label: 'fewer meeting slots',
});
const flexFridays = fourDayWeek.then('flex-fridays', 'Some teams keep an optional Friday catch-up', {
  valence: '0',
  label: 'opt-in rota',
});

const lowerAttrition = lessBurnout.then('lower-attrition', 'Fewer engineers leave', {
  valence: '+',
  label: 'exit interviews',
  description: 'Voluntary attrition falls from 18% to 11% year over year.',
});
const thursdayCrunch = squeezedClients.then('thursday-crunch', 'Thursday evenings run long', {
  valence: '-',
  label: 'tickets pile up',
});
const adHocCoverage = flexFridays.then('ad-hoc-coverage', 'Friday on-call coverage gets improvised', {
  valence: '0',
  label: 'rota gaps',
});

lowerAttrition.then('stronger-pipeline', 'Recruiting pitch gets stronger', {
  valence: '+',
  label: 'offer-accept rate up',
  description: 'Candidates hear about the schedule from referrals.',
});
const burnoutReturns = thursdayCrunch.then('burnout-returns', 'Burnout creeps back on the days that remain', {
  valence: '-',
  label: 'crunch persists',
});
// two unrelated problems — overrun calls, thin Friday cover — compound into the same fatigue
adHocCoverage.leadsTo(burnoutReturns, { label: 'thin coverage adds strain' });

export default m;
