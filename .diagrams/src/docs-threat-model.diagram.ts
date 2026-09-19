import { model } from '@diagramming/core';

const m = model('docs-threat-model', { name: 'Threat model: online shop checkout' });
const tm = m.threatModel();

const customer = tm.entity('customer', 'Customer');
const payments = tm.entity('payments', 'Payment provider');

const web = tm.process('web', 'Web app');
tm.boundary('edge', 'Internet-facing').contains(web);

const orders = tm.process('orders', 'Order service');
const db = tm.store('db', 'Orders DB');
tm.boundary('backend', 'Backend').contains(orders, db);

tm.flow(customer, web, 'HTTPS: cart, card details')
  .threat({ category: 'S', title: 'Credential stuffing on login', severity: 'high' })
  .threat({
    category: 'I',
    title: 'Card details logged by the CDN',
    severity: 'critical',
    status: 'mitigated',
    mitigation: 'PCI-scoped log scrubbing',
  });

tm.flow(web, orders, 'gRPC: place order').threat({
  category: 'T',
  title: 'Price tampered between web and order service',
  severity: 'high',
});

tm.flow(orders, db, 'SQL: orders');
tm.flow(orders, payments, 'HTTPS: charge');
tm.flow(payments, orders, 'Webhook: payment result').threat({
  category: 'S',
  title: 'Forged payment webhook',
  severity: 'critical',
  status: 'mitigated',
  mitigation: 'HMAC signature check',
});

orders
  .threat({ category: 'E', title: 'Admin refund endpoint lacks role check', severity: 'high' })
  .threat({ category: 'R', title: 'No audit trail for manual refunds', severity: 'medium', status: 'accepted' });

db.threat({ category: 'I', title: 'Backups unencrypted', severity: 'medium' });

export default m;
