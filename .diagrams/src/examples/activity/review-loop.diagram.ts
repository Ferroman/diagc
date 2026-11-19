import { model } from '@diagc/core';

// A change goes round until the reviewer accepts it: a flow that goes back, two
// checks side by side, and names long enough to wrap.
const m = model('review-loop', { name: 'Review loop' });

const act = m.activity('review', { name: 'Review of a change' });
const author = act.lane('author', { name: 'Author', color: '#e07a5f' });
const reviewer = act.lane('reviewer', { name: 'Reviewer', color: '#3d85c6' });

const start = author.start();
const write = author.action('write', 'Write the change');
const merge = author.action('merge', 'Merge the change');
const end = author.end();

const fork = reviewer.bar('fork');
const read = reviewer.action('read', 'Read every line of the change against what it says it does');
const run = reviewer.action('run', 'Run the tests');
const join = reviewer.bar('join');
const verdict = reviewer.decision('verdict');
const comment = reviewer.action('comment', 'Say what must change, and why');

act
  .flow(start, write)
  .flow(write, fork)
  .flow(fork, read)
  .flow(fork, run)
  .flow(read, join)
  .flow(run, join)
  .flow(join, verdict)
  .flow(verdict, merge, '[accepted]')
  .flow(verdict, comment, '[rejected]')
  .flow(comment, write)
  .flow(merge, end);

export default m;
