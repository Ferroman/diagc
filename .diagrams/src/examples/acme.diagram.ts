import { model } from '@diagc/core';

const m = model('acme', { name: 'Acme SaaS' });

m.layer('data-flow', { name: 'Data flow', tint: '#0ea5e9' });

// Planes: alternative containment contexts over the same entities.
m.plane('architecture', { name: 'Architecture' }); // first = default
m.plane('infra', { name: 'Infrastructure' });
m.plane('flow', {
  name: 'Data flow',
  containmentOf: 'architecture',
  layers: ['data-flow'],
  baseRelations: false, // only the flow arrows over the architecture structure
});

const platform = m.node('platform', { type: 'platform', name: 'Acme Platform' });
const comms = m.node('communication', { type: 'system', name: 'Communication' });
const identity = m.node('identity', { type: 'system', name: 'Identity' });
const billing = m.node('billing', { type: 'system', name: 'Billing' });

const mail = m.node('mail-svc', {
  type: 'service',
  description: 'Sends transactional email.',
  metadata: { framework: 'nestjs', language: 'typescript', repo: 'https://github.com/acme/mail-svc' },
});
const push = m.node('push-svc', {
  type: 'service',
  metadata: { language: 'go', repo: 'https://github.com/acme/push-svc' },
});
const perms = m.node('permission-svc', {
  type: 'service',
  metadata: { framework: 'spring', language: 'java', repo: 'https://github.com/acme/permission-svc' },
});
const invoicing = m.node('invoicing-svc', {
  type: 'service',
  metadata: { framework: 'rails', language: 'ruby', repo: 'https://github.com/acme/invoicing-svc' },
});

const rds = m.node('shared-postgres', {
  type: 'aws-rds',
  name: 'Shared RDS',
  description: 'One managed Postgres instance, two owners — the classic shared database.',
  metadata: { tool: 'aws-rds', engine: 'postgres 16' },
});
const users = m.node('users-table', { type: 'table', name: 'users' });
const invoices = m.node('invoices-table', { type: 'table', name: 'invoices' });

// ---- architecture plane: logical structure -------------------------------
platform.contains(comms, identity, billing);
comms.contains(mail, push);
identity.contains(perms, rds); // shared into identity...
billing.contains(invoicing, rds); // ...and billing — marked ⚭ on both
rds.contains(users, invoices);

// ---- infra plane: where things actually run ------------------------------
const aws = m.node('aws-account', {
  type: 'infra',
  icon: 'cloud',
  name: 'AWS account',
  metadata: { tool: 'aws' },
});
const k8s = m.node('k8s-cluster', {
  type: 'infra',
  icon: 'kubernetes',
  name: 'K8s cluster',
  description: 'All Acme services run here; the RDS instance lives beside it in the account.',
  metadata: { tool: 'kubernetes' },
});
aws.contains(k8s, rds, { plane: 'infra' });
k8s.contains(mail, push, perms, invoicing, { plane: 'infra' });
rds.contains(users, invoices, { plane: 'infra' });

// ---- relations (visible wherever both endpoints exist) -------------------
m.relate(mail, perms, {
  kind: 'sync',
  label: 'authz check',
  description: 'Checks the sender is allowed to email this workspace.',
});
m.relate(mail, users, { kind: 'reads' });
m.relate(push, users, { kind: 'reads' });
m.relate(invoicing, invoices, { kind: 'writes' });
m.relate(invoicing, perms, { kind: 'async', label: 'billing events' });

// data-flow overlay: how data actually moves between parts
m.relate(perms, mail, { kind: 'flow', label: 'user invited', layer: 'data-flow' });
m.relate(invoicing, mail, { kind: 'flow', label: 'invoice issued', layer: 'data-flow' });
m.relate(mail, push, { kind: 'flow', label: 'fallback push', layer: 'data-flow' });
m.relate(users, invoices, { kind: 'flow', label: 'user id', layer: 'data-flow' });

export default m;
