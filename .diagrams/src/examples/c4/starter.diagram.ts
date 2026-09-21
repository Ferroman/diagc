import { model } from '@diagc/core';

// A C4 starter: one person, one system, two containers. The notation is what
// paints the solid fills and the [Type: technology] subtitles.
const m = model('expense-claims', { name: 'Expense claims' });
m.notation('c4');

const employee = m.node('employee', { type: 'c4-person', name: 'Employee' });
const claims = m.node('claims', { type: 'c4-system', name: 'Expense Claims' });

const web = m.node('web', { type: 'c4-container-web', name: 'Web Application', technology: 'TypeScript, Next.js' });
const db = m.node('db', { type: 'c4-container-db', name: 'Claims Database', technology: 'PostgreSQL 16' });

claims.contains(web, db);

m.relate(employee, web, { kind: 'sync', label: 'Submits claims [HTTPS]' });
m.relate(web, db, { kind: 'reads', label: 'Stores claims [SQL/TCP]' });

export default m;
