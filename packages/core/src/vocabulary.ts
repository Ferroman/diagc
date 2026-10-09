import { GIT_STAGE_TYPE } from './notations/git-graph/git-graph';
import type { BUILTIN_NOTATIONS } from './types';
import { ACTIVITY_TYPES } from './activity/activity';

/**
 * The node types and relation kinds the renderer draws with a style of its own.
 * Both fields stay free-form in the model — an unknown id draws as the plain box
 * or line, never fails — so these lists only feed the lint (`unknown-type`,
 * `unknown-kind`), where an id the renderer does not know is usually a typo.
 * Kept in core because the CLI cannot reach the renderer; a renderer test holds
 * the registry to them.
 */
export const NODE_TYPES: readonly string[] = [
  'system',
  'platform',
  'service',
  'database',
  'aws-rds',
  'table',
  'db-table',
  'queue',
  'infra',
  'person',
  'team',
  'comment',
  'c4-person',
  'c4-person-external',
  'c4-system',
  'c4-system-external',
  'c4-enterprise-boundary',
  'c4-system-boundary',
  'c4-group',
  'c4-container',
  'c4-container-external',
  'c4-container-web',
  'c4-container-spa',
  'c4-container-mobile',
  'c4-container-desktop',
  'c4-container-api',
  'c4-container-function',
  'c4-container-cli',
  'c4-container-db',
  'c4-container-blob',
  'c4-container-search',
  'c4-container-queue',
  'c4-container-boundary',
  'c4-component',
  'c4-component-external',
  'c4-component-db',
  'c4-component-queue',
  'c4-deployment-node',
  'c4-infrastructure-node',
  'c4-container-instance',
  'c4-class',
  'c4-interface',
  'c4-enum',
  'aws-group',
  'aws-account',
  'aws-cloud',
  'aws-vpc',
  'aws-region',
  'aws-auto-scaling-group',
  'aws-az',
  'aws-subnet-public',
  'aws-subnet-private',
  ...ACTIVITY_TYPES,
  'so-decision',
  'so-consequence-positive',
  'so-consequence-negative',
  'so-consequence-neutral',
  'fb-effect',
  'fb-category',
  'fb-cause',
  'deploy-environment',
  'deploy-region',
  'deploy-zone',
  'deploy-network',
  'deploy-subnet-public',
  'deploy-subnet-private',
  'deploy-cluster',
  'deploy-host',
  'deploy-service',
  'deploy-database',
  'deploy-queue',
  'deploy-storage',
  'deploy-load-balancer',
  'deploy-gateway',
  'deploy-firewall',
  'deploy-internet',
  'tm-entity',
  'tm-process',
  'tm-store',
  'tm-boundary',
  'plan-zone',
  'plan-event',
];

/** Kinds registered with no style of their own (`network`, `influence`) are still
 * the documented vocabulary of their notation, so they are listed here. */
export const RELATION_KINDS: readonly string[] = [
  'sync',
  'async',
  'reads',
  'writes',
  'hosted-on',
  'flow',
  'mixed',
  'fk',
  'control',
  'object-flow',
  'interrupt',
  'note-link',
  'leads-to',
  'cause-of',
  'data-flow',
  'owns',
  'executes',
  'checks',
  'network',
  'influence',
];

/** What a notation adds on top of the shared lists; known only where the diagram
 * (or one of its planes) uses that notation. */
export const NOTATION_NODE_TYPES: Partial<Record<(typeof BUILTIN_NOTATIONS)[number], readonly string[]>> = {
  'git-graph': ['commit', 'branch', GIT_STAGE_TYPE],
};

export const NOTATION_RELATION_KINDS: Partial<Record<(typeof BUILTIN_NOTATIONS)[number], readonly string[]>> = {
  'git-graph': ['commit', 'branch', 'merge'],
};
