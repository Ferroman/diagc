import { model } from '@diagc/core';

const m = model('deployment-starter', { name: 'Two-subnet VPC' });
m.notation('deployment');

const internet = m.node('internet', { name: 'Internet', type: 'deploy-internet' });
const lb = m.node('lb', { name: 'Load balancer', type: 'deploy-load-balancer' });
const app = m.node('app', { name: 'API', type: 'deploy-service', technology: 'Go' });
const db = m.node('db', { name: 'Orders DB', type: 'deploy-database', technology: 'Postgres' });

const pub = m.node('public', { name: 'Public', type: 'deploy-subnet-public' }).contains(lb);
const priv = m.node('private', { name: 'Private', type: 'deploy-subnet-private' }).contains(app, db);
m.node('vpc', { name: 'VPC', type: 'deploy-network' }).contains(pub, priv);

m.relate(internet, lb, { kind: 'network', label: 'HTTPS 443' });
m.relate(lb, app, { kind: 'network', label: 'HTTP 8080' });
m.relate(app, db, { kind: 'network', label: 'TCP 5432' });

export default m;
