import type { DiagramNode } from './types';

/** The notation id a plane (or the model) declares to be drawn as a deployment
 * diagram: where software runs, and the networks and zones around it. */
export const DEPLOY_NOTATION = 'deployment' as const;

/** Zones: containers whose boundary IS the information — what a box sits inside
 * (a private subnet, an availability zone) says how it is reached and what it
 * fails with. Outermost first, which is also the order they usually nest in. */
export const DEPLOY_ZONE_TYPES = [
  'deploy-environment',
  'deploy-region',
  'deploy-zone',
  'deploy-network',
  'deploy-subnet-public',
  'deploy-subnet-private',
  'deploy-cluster',
  'deploy-host',
] as const;

/** What runs, stores or routes inside the zones. `deploy-host` is a zone too:
 * a machine with its workloads drawn inside, or a leaf when they are not. */
export const DEPLOY_NODE_TYPES = [
  'deploy-service',
  'deploy-database',
  'deploy-queue',
  'deploy-storage',
  'deploy-load-balancer',
  'deploy-gateway',
  'deploy-firewall',
  'deploy-internet',
] as const;

export type DeployZoneType = (typeof DEPLOY_ZONE_TYPES)[number];
export type DeployNodeType = (typeof DEPLOY_NODE_TYPES)[number];

export const DEPLOY_TYPES: ReadonlySet<string> = new Set<string>([...DEPLOY_ZONE_TYPES, ...DEPLOY_NODE_TYPES]);
const ZONES: ReadonlySet<string> = new Set<string>(DEPLOY_ZONE_TYPES);

export const isDeploymentNode = (n: DiagramNode): boolean => n.type !== undefined && DEPLOY_TYPES.has(n.type);
export const isDeployZone = (n: DiagramNode): boolean => n.type !== undefined && ZONES.has(n.type);
