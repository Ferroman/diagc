import { model } from '@diagc/core';

// A courier app shipping a release every two weeks off a single trunk: cut,
// stabilize, ship, and fold any hotfix back into both the release and main so
// the fix survives the next cut.
const m = model('ex-git-graph-release-train', { name: 'Courier app release train' });
const g = m.gitGraph();

const main = g.branch('main', { name: 'main', color: '#2f6fed' });
const r2410 = g.branch('release-24-10', { name: 'release/24.10', color: '#e08e0b' });
const hotfix = g.branch('hotfix', { name: 'hotfix/24.10.1', color: '#d64545' });
const r2411 = g.branch('release-24-11', { name: 'release/24.11', color: '#12977e' });

// main is always releasable; the train cuts a branch from wherever it sits
const base = main.commit();
const cut1 = r2410.commit({ from: base });
r2410.commit(); // driver-tracking polish before the freeze
const ship1 = r2410.commit({ tag: '24.10.0' });

// a payment-webhook bug surfaces the same day — branch from the shipped tag,
// not from main, so the fix ships without dragging in anything merged since
const fix = hotfix.commit({ from: ship1 });
const patched = r2410.merge(fix, { tag: '24.10.1' });
main.merge(fix); // backport, so the next cut doesn't reintroduce the bug

const freeze = main.commit({ gap: 2 }); // a quiet fortnight over the holidays
const cut2 = r2411.commit({ from: freeze });
r2411.commit(); // offline-mode fix
const ship2 = r2411.commit({ tag: '24.11.0' });

g.stage('train-24-10', { name: '24.10 train', from: cut1, to: patched, color: '#e08e0b' });
g.stage('train-24-11', { name: '24.11 train', from: cut2, to: ship2, color: '#12977e' });

export default m;
