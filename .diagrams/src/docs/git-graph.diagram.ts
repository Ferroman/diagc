import { model } from '@diagc/core';

// The branching-strategy example from the how-to: a release line (Master), a
// hotfix, release candidates with their fixes, a nightly integration lane, two
// feature teams and a development lane. Lanes are declared top-to-bottom.
const m = model('docs-git-graph', { name: 'Branching strategy' });
const g = m.gitGraph();

const master = g.branch('master', { name: 'Master', color: '#7ba7d9' });
const hotfix = g.branch('hotfix', { name: 'Hotfix', color: '#d9534f' });
const release = g.branch('release', { name: 'Release', color: '#e0a030' });
const fixes = g.branch('release-fixes', { name: 'Release Fixes', color: '#e0a030' });
const nightly = g.branch('nightly', { name: 'Nightly', color: '#7bbf7b' });
const team1 = g.branch('team1', { name: 'Feature team 1', color: '#b08ad9' });
const team2 = g.branch('team2', { name: 'Feature team 2', color: '#b08ad9' });
const dev = g.branch('dev', { name: 'Development', color: '#8a8f96' });

// 1.0 and the first nightly
const v10 = master.commit('1.0');
const n1 = nightly.commit({ from: v10 });

// feature team 1 works with development, lands in nightly
const t1a = team1.commit({ from: n1 });
const d1 = dev.commit({ from: t1a });
const d2 = dev.commit();
const t1b = team1.merge(d2);
nightly.commit(); // n2
nightly.merge(t1b);

// feature team 2, same dance, lands in nightly
const t2a = team2.commit({ from: n1 });
const d3 = dev.commit({ from: t2a });
const d4 = dev.commit();
const t2b = team2.merge(d4);
const d5 = dev.commit({ from: t2b });
const t2c = team2.merge(d5);
const n4 = nightly.merge(t2c);

// release candidates: fixes branch off each RC and merge into the next
const rc1 = release.commit({ tag: 'RC1', from: n4 });
const f1 = fixes.commit({ from: rc1 });
const f2 = fixes.commit();
const rc2 = release.merge(f2, { tag: 'RC2' });
const f3 = fixes.commit({ from: rc2 });
const rc3 = release.merge(f3, { tag: 'RC3' });

// 2.0 ships; nightly takes it back; teams start over
const v20 = master.merge(rc3, { tag: '2.0' });
const n5 = nightly.merge(v20);
team1.commit({ from: n5 });
const t2d = team2.commit({ from: n5 });
dev.commit({ from: t2d });

// a hotfix on 2.0 becomes 2.1, which nightly also takes
const hf = hotfix.commit({ from: v20 });
const v21 = master.merge(hf, { tag: '2.1' });
const n6 = nightly.merge(v21);

// the phases the history went through: frames across every lane, each spanning
// the columns of the commits it names
g.stage('development', { name: 'Development', from: n1, to: n4, color: '#7bbf7b' });
g.stage('stabilisation', { name: 'Release candidates', from: rc1, to: rc3, color: '#e0a030' });
g.stage('production', { name: 'Production', from: v20, to: n6, color: '#7ba7d9' });

export default m;
