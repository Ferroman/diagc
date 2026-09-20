import { model } from '@diagc/core';

const m = model('sample');
const db = m.node('db', { type: 'database' });
const api = m.node('api', { type: 'service' });
m.node('backend', { type: 'system' }).contains(api, db);
m.relate(api, db, { kind: 'reads' });

export default m;
