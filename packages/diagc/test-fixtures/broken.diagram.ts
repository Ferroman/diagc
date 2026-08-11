import { model } from '@diagramming/core';

const m = model('broken');
const a = m.node('a', { type: 't' });
const b = m.node('b', { type: 't' });
a.contains(b);
b.contains(a);

export default m;
