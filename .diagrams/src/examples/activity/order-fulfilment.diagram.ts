import { model } from '@diagc/core';

const m = model('ex-activity-order-fulfilment', { name: 'Order fulfilment' });

// Lanes are drawn in declaration order, so they read top to bottom in the order
// the parcel is handed on: service, warehouse, carrier.
const act = m.activity('fulfilment', { name: 'Fulfilment' });
const service = act.lane('order-service', { name: 'Order service', color: '#4f83cc' });
const warehouse = act.lane('warehouse', { name: 'Warehouse', color: '#e2a33c' });
const carrier = act.lane('carrier', { name: 'Carrier', color: '#5fa88a' });

const start = service.start();
const paid = service.receive('payment-captured', 'Payment captured');
const reserve = service.action('reserve-stock', 'Reserve stock');

// The whole of the warehouse's work is interruptible, fork and join included:
// a cancellation that arrives before the parcel reaches the dock stops both
// branches. Once it is on the dock, cancelling costs a return — hence the note.
const picking = warehouse.region('cancellable', 'Cancellable');
const fork = picking.bar('fork');
const pack = picking.action('pack-order', 'Pick and pack the order');
const label = picking.action('print-label', 'Print the shipping label');
const join = picking.bar('join');
const cancelReq = picking.receive('cancel-request', 'Cancellation requested', { color: '#d9534f' });
const toDock = warehouse.action('to-dock', 'Move it to the dock');
const restock = warehouse.action('restock', 'Return the items to stock', { color: '#d9534f' });
const cancelled = warehouse.end('cancelled');
const cutoff = warehouse.note('cutoff', 'After this, cancelling means a return');

const collect = carrier.action('collect', 'Collect from the dock');
const tracking = carrier.object('tracking', 'Tracking number');
const trackingLink = carrier.send('tracking-link', 'Send the tracking link');
const end = carrier.end();

act
  .flow(start, paid)
  .flow(paid, reserve)
  .flow(reserve, fork)
  // Picking and paperwork run side by side; the join waits for both.
  .flow(fork, pack)
  .flow(fork, label)
  .flow(pack, join)
  .flow(label, join)
  .flow(join, toDock)
  .flow(toDock, collect)
  // The link is waiting for nothing but the tracking number, so the object
  // carries the flow instead of travelling beside a control arrow.
  .objectFlow(collect, tracking)
  .objectFlow(tracking, trackingLink)
  .flow(trackingLink, end)
  .interrupt(cancelReq, restock)
  .flow(restock, cancelled)
  .noteLink(cutoff, toDock);

// Declared, so the key starts shown and travels into the PNG. Without this line it
// is still one click away on the page: these shapes carry no words of their own.
m.legend();

export default m;
