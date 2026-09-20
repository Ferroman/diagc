import { model } from '@diagc/core';

const m = model('docs-second-order', { name: 'Second-order thinking: splitting the monolith' });
const so = m.secondOrder();

const split = so.decision('split', 'Split the monolith into services');

const deploys = split.then('deploys', 'Teams deploy independently', { valence: '+' });
const infra = split.then('infra', 'More infrastructure to run', { valence: '-' });
const contracts = split.then('contracts', 'APIs become contracts', { valence: '0' });

const faster = deploys.then('faster', 'Faster releases', { valence: '+' });
const oncall = infra.then('oncall', 'More on-call load', { valence: '-' });
infra.then('cost', 'Cloud bill goes up', { valence: '-' });
contracts.then('versioning', 'Versioning discipline needed', { valence: '0' });
deploys.leadsTo(oncall);

faster.then('experiments', 'More product experiments', { valence: '+' });
oncall.then('burnout', 'Burnout and attrition', { valence: '-' });
oncall.then('platform', 'A platform team is formed', { valence: '0' });

export default m;
