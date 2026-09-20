import { model } from '../builder';
import type { DiagramModel } from '../types';

/** Test-only fixture (originally mirrored .diagrams/src/examples/acme.diagram.ts; the demo
 * has since evolved — this stays frozen as the view-compiler acceptance topology). */
export function acmeModel(): DiagramModel {
  const m = model('acme', { name: 'Acme SaaS' });
  m.layer('hosting', { name: 'Hosting', tint: '#7c3aed' });
  m.layer('data-flow', { name: 'Data flow', tint: '#0ea5e9' });

  const platform = m.node('platform', { type: 'platform' });
  const comms = m.node('communication', { type: 'system' });
  const identity = m.node('identity', { type: 'system' });
  const billing = m.node('billing', { type: 'system' });
  platform.contains(comms, identity, billing);

  const mail = m.node('mail-svc', { type: 'service' });
  const push = m.node('push-svc', { type: 'service' });
  const perms = m.node('permission-svc', { type: 'service' });
  const invoicing = m.node('invoicing-svc', { type: 'service' });
  const pg = m.node('shared-postgres', { type: 'database', icon: 'postgres' });
  const users = m.node('users-table', { type: 'table' });
  const invoices = m.node('invoices-table', { type: 'table' });
  pg.contains(users, invoices);
  comms.contains(mail, push);
  identity.contains(perms, pg);
  billing.contains(invoicing, pg);

  m.relate(mail, perms, { kind: 'sync', label: 'authz check' });
  m.relate(mail, users, { kind: 'reads' });
  m.relate(push, users, { kind: 'reads' });
  m.relate(invoicing, invoices, { kind: 'writes' });
  m.relate(invoicing, perms, { kind: 'async', label: 'billing events' });

  const k8s = m.node('k8s-cluster', { type: 'infra' });
  m.relate(mail, k8s, { kind: 'hosted-on', layer: 'hosting' });
  m.relate(push, k8s, { kind: 'hosted-on', layer: 'hosting' });
  m.relate(invoicing, k8s, { kind: 'hosted-on', layer: 'hosting' });
  m.relate(users, invoices, { kind: 'flow', layer: 'data-flow' });

  return m.toJSON();
}
