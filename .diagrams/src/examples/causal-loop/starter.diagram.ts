import { model } from '@diagc/core';

const m = model('word-of-mouth-growth', { name: 'Word-of-mouth growth' });
m.notation('causal-loop');

const users = m.node('users', { name: 'Active users' });
const word = m.node('word-of-mouth', { name: 'Word of mouth' });
const signups = m.node('signups', { name: 'New sign-ups' });

// Every link is '+', so nothing cancels and the loop reinforces: the renderer
// badges it R.
m.relate(users, word, { kind: 'influence', polarity: '+' });
m.relate(word, signups, { kind: 'influence', polarity: '+' });
m.relate(signups, users, { kind: 'influence', polarity: '+' });

export default m;
