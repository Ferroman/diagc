import { model } from '@diagramming/core';

const m = model('docs-activity', { name: 'Order processing' });
const act = m.activity('actors', { name: 'Actors' });
const orders = act.lane('orders', { name: 'Orders', color: '#f6d55c' });
const accounting = act.lane('accounting', { name: 'Accounting', color: '#3caea3' });
const customer = act.lane('customer', { name: 'Customer', color: '#b39ddb' });

const start = customer.start();
const submit = customer.action('submit-order', 'Submit order');
const region = orders.region('cancelable');
const cancelReq = region.receive('cancel-request', 'Order cancel request', { color: '#e57373' });
const receive = region.action('receive-order', 'Receive order');
const accepted = region.decision('accepted');
const fill = region.action('fill-order', 'Fill order');
const fork = region.bar('fork');
const prepare = region.action('prepare-shipment', 'Prepare shipment');
const join = orders.bar('join');
const ship = orders.action('ship-order', 'Ship order');
const close = orders.action('close-order', 'Close order');
const cancel = orders.action('cancel-order', 'Cancel order', { color: '#e57373' });
const end = orders.end();
const invoice = accounting.object('invoice', 'Invoice');
const sendInvoice = accounting.action('send-invoice', 'Send invoice');
const accept = accounting.action('accept-payment', 'Accept payment');
const pay = customer.action('send-payment', 'Send payment');

act
  .flow(start, submit)
  .flow(submit, receive)
  .flow(receive, accepted)
  .flow(accepted, fill, '[order accepted]')
  .flow(fill, fork)
  .flow(fork, prepare)
  .flow(fork, sendInvoice)
  .flow(prepare, join)
  .flow(join, ship)
  .flow(ship, close)
  .flow(close, end)
  .objectFlow(sendInvoice, invoice)
  .objectFlow(invoice, pay)
  .flow(pay, accept)
  .flow(accept, join)
  .interrupt(cancelReq, cancel)
  .flow(cancel, end);

export default m.toJSON();
