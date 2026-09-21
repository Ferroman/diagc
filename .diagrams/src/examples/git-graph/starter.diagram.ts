import { model } from '@diagc/core';

// Copy this file, rename the branches and the tag, and grow your own history.
const m = model('dark-mode-toggle', { name: 'Dark mode toggle' });
const g = m.gitGraph();

const main = g.branch('main', { name: 'main', color: '#2f6fed' });
const feature = g.branch('dark-mode', { name: 'dark-mode', color: '#b08ad9' });

const base = main.commit();
feature.commit({ from: base });
const latest = feature.commit();
main.merge(latest, { tag: 'v3.2.0' });

export default m;
