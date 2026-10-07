import type { Library, LibraryEntry } from './types';

/** a dropped zone is an empty box, big enough to nest things into */
const ZONE_SIZE = { width: 320, height: 220 };

const entry = (
  id: string,
  name: string,
  keywords: string[],
  size?: { width: number; height: number },
): LibraryEntry => ({
  id,
  category: 'deployment',
  name,
  keywords: [...keywords, 'deployment', 'infrastructure'],
  template: { type: id, ...(size ?? {}) },
});

/** The deployment stencils: zones first (outermost to innermost), then what
 * runs inside them. Draw with the `deployment` notation for zone colours. */
export const DEPLOYMENT_PACK: Library = {
  categories: [{ id: 'deployment', name: 'Deployment', builtin: true }],
  entries: [
    entry('deploy-environment', 'Environment', ['production', 'staging', 'stage'], ZONE_SIZE),
    entry('deploy-region', 'Region', ['data centre', 'data center', 'location', 'cloud'], ZONE_SIZE),
    entry('deploy-zone', 'Availability zone', ['az', 'zone', 'failure domain', 'rack'], ZONE_SIZE),
    entry('deploy-network', 'Network', ['vpc', 'vnet', 'lan', 'cidr'], ZONE_SIZE),
    entry('deploy-subnet-public', 'Public subnet', ['subnet', 'dmz', 'public', 'internet-facing'], ZONE_SIZE),
    entry('deploy-subnet-private', 'Private subnet', ['subnet', 'private', 'internal'], ZONE_SIZE),
    entry('deploy-cluster', 'Cluster', ['kubernetes', 'k8s', 'ecs', 'nomad', 'auto scaling group'], ZONE_SIZE),
    entry('deploy-host', 'Host', ['server', 'vm', 'machine', 'instance', 'node']),
    entry('deploy-service', 'Service', ['app', 'process', 'container', 'pod', 'workload']),
    entry('deploy-database', 'Database', ['db', 'sql', 'postgres', 'mysql', 'rds']),
    entry('deploy-queue', 'Queue', ['broker', 'kafka', 'sqs', 'rabbitmq', 'events']),
    entry('deploy-storage', 'Storage', ['bucket', 's3', 'blob', 'disk', 'volume']),
    entry('deploy-load-balancer', 'Load balancer', ['lb', 'alb', 'nlb', 'proxy', 'ingress']),
    entry('deploy-gateway', 'Gateway', ['api gateway', 'nat', 'vpn', 'egress']),
    entry('deploy-firewall', 'Firewall', ['waf', 'security group', 'acl']),
    entry('deploy-internet', 'External network', ['internet', 'public', 'users', 'wan']),
  ],
};
