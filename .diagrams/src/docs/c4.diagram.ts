import { model } from '@diagc/core';

// The canonical C4 "Internet Banking System" picture, kept small: a person and
// two systems at context level, with the primary system's containers drilled
// in below it (double-click Internet Banking System in the studio/page). See
// docs/how-to/draw-a-c4-diagram.md.
const m = model('docs-c4', { name: 'Internet banking system' });
m.notation('c4');

const customer = m.node('customer', { type: 'c4-person', name: 'Personal Banking Customer' });
const banking = m.node('banking', { type: 'c4-system', name: 'Internet Banking System' });
const mail = m.node('mail', { type: 'c4-system-external', name: 'E-mail System' });

const web = m.node('web', { type: 'c4-container-web', name: 'Web Application', technology: 'Java, Spring MVC' });
const api = m.node('api', { type: 'c4-container-api', name: 'API Application', technology: 'Java, Spring Boot' });
const db = m.node('db', { type: 'c4-container-db', name: 'Database', technology: 'PostgreSQL' });

banking.contains(web, api, db);

m.relate(customer, web, { kind: 'sync', label: 'Uses [HTTPS]' });
m.relate(web, api, { kind: 'sync', label: 'Calls [JSON/HTTPS]' });
m.relate(api, db, { kind: 'reads', label: 'Reads and writes [SQL]' });
m.relate(api, mail, { kind: 'async', label: 'Sends e-mail using [SMTP]' });

export default m;
