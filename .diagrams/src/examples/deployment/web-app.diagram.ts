import { model } from '@diagc/core';

// A three-tier web app in one cloud region: public traffic reaches only the
// load balancer, the app servers sit in private subnets in two zones, and the
// database fails over across them.
const m = model('ex-deployment-web-app', { name: 'Web app deployment' });
m.notation('deployment');
m.legend();

const internet = m.node('internet', { name: 'Internet', type: 'deploy-internet' });

const prod = m.node('prod', { name: 'Production', type: 'deploy-environment' });
const region = m.node('region', { name: 'eu-west-1', type: 'deploy-region' });
const vpc = m.node('vpc', { name: 'VPC 10.0.0.0/16', type: 'deploy-network' });

const edge = m.node('public', { name: 'Public 10.0.0.0/24', type: 'deploy-subnet-public' });
const lb = m.node('lb', { name: 'Load balancer', type: 'deploy-load-balancer', technology: 'ALB' });
edge.contains(lb);

function zone(n: 1 | 2, role: 'primary' | 'standby') {
  const az = m.node(`az${n}`, { name: `eu-west-1${n === 1 ? 'a' : 'b'}`, type: 'deploy-zone' });
  const subnet = m.node(`private${n}`, { name: `Private 10.0.${n}0.0/24`, type: 'deploy-subnet-private' });
  const host = m.node(`host${n}`, { name: `app-${n}`, type: 'deploy-host', technology: 'EC2 m7g.large' });
  const app = m.node(`app${n}`, { name: 'Web app', type: 'deploy-service', technology: 'Node.js' });
  const db = m.node(`db${n}`, { name: `Postgres ${role}`, type: 'deploy-database', technology: 'RDS' });
  host.contains(app);
  subnet.contains(host, db);
  az.contains(subnet);
  return { az, app, db };
}
const a = zone(1, 'primary');
const b = zone(2, 'standby');

vpc.contains(edge, a.az, b.az);
region.contains(vpc);
prod.contains(region);

m.relate(internet, lb, { kind: 'network', label: 'HTTPS 443' });
m.relate(lb, a.app, { kind: 'network', label: 'HTTP 8080' });
m.relate(lb, b.app, { kind: 'network', label: 'HTTP 8080' });
m.relate(a.app, a.db, { kind: 'network', label: 'TCP 5432' });
m.relate(b.app, a.db, { kind: 'network', label: 'TCP 5432' });
m.relate(a.db, b.db, { kind: 'network', label: 'replication' });

export default m;
